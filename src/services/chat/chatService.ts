import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  limitToLast,
  onSnapshot,
  getDoc,
  getDocs,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { db, auth, storage } from '../firebase/config';
import { ChatConversation, ChatMessage, ChatType, ChatAttachment } from '../../types/chat';
import { ref, uploadBytesResumable, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signInAnonymously } from 'firebase/auth';

export async function ensureFirebaseAuth(): Promise<void> {
  if (!auth) return;
  if (auth.currentUser) return;
  try {
    console.log('[CHAT_UPLOAD] Initializing anonymous auth session for attachment upload...');
    await signInAnonymously(auth);
    console.log('[CHAT_UPLOAD] Anonymous auth session established:', auth.currentUser?.uid);
  } catch (err) {
    console.warn('[CHAT_UPLOAD] Anonymous auth fallback failed (proceeding with request):', err);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Chat Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Create a new chat conversation
export async function createConversation(
  type: ChatType,
  participantIds: string[],
  participantNames: Record<string, string>,
  title?: string
): Promise<string> {
  const path = 'chat_conversations';
  try {
    // Check if a DIRECT chat between these two already exists
    if (type === 'DIRECT' && participantIds.length === 2) {
      const q = query(
        collection(db, path),
        where('type', '==', 'DIRECT'),
        where('participantIds', 'array-contains', participantIds[0])
      );
      const snap = await getDocs(q);
      const match = snap.docs.find(docSnap => {
        const pids = docSnap.data().participantIds as string[];
        return pids.includes(participantIds[1]);
      });
      if (match) {
        return match.id;
      }
    }

    const conversationId = doc(collection(db, path)).id;
    const initialUnread: Record<string, number> = {};
    participantIds.forEach(id => {
      initialUnread[id] = 0;
    });

    const newConversation: ChatConversation = {
      id: conversationId,
      type,
      participantIds,
      participantNames,
      title: title || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCounts: initialUnread,
    };

    await setDoc(doc(db, path, conversationId), newConversation);
    return conversationId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt',
  'jpg', 'jpeg', 'png', 'webp'
];

export const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export function validateAttachment(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File type .${ext || 'unknown'} is not supported. Supported types: PDF, DOC, XLS, TXT, PPT, JPG, PNG, WEBP.`
    };
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of 20 MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`
    };
  }

  return { valid: true };
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Upload an attachment to Firebase Storage with timeout protection, diagnostics & auto-retry
export function uploadAttachment(
  file: File,
  conversationId: string,
  userId: string,
  onProgress: (progress: number) => void,
  onComplete: (downloadUrl: string) => void,
  onError: (error: Error) => void,
  timeoutMs: number = 120000 // 120 seconds default
): () => void {
  let isFinished = false;
  let timerId: any = null;
  let activeTask: any = null;
  let isCancelled = false;

  console.log(`[CHAT_UPLOAD] UPLOAD_STARTED | FILE_NAME="${file.name}" | FILE_SIZE=${file.size} | MIME_TYPE="${file.type || 'unknown'}" | CONVERSATION="${conversationId}" | USER="${userId}"`);

  const cleanup = () => {
    isFinished = true;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const executeUpload = async () => {
    try {
      if (!storage) {
        throw new Error('Firebase Storage is not initialized.');
      }

      // 1. Ensure Auth identity for Firebase Storage
      await ensureFirebaseAuth();

      // 2. Validate attachment format & size
      const validation = validateAttachment(file);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid file.');
      }

      const fileExtension = file.name.split('.').pop() || 'bin';
      const safeName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExtension}`;
      const storagePath = `chat_attachments/${conversationId}/${safeName}`;
      const storageRef = ref(storage, storagePath);

      console.log(`[CHAT_UPLOAD] REQUEST_STARTED | STORAGE_PATH="${storagePath}" | METHOD="POST/PUT (Firebase Storage)"`);

      const fileMetadata = {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          originalName: file.name,
          uploadedBy: userId,
          conversationId
        }
      };

      // Set timeout timer
      timerId = setTimeout(() => {
        if (!isFinished) {
          console.error(`[CHAT_UPLOAD] UPLOAD_TIMEOUT | STORAGE_PATH="${storagePath}" | TIMEOUT_MS=${timeoutMs}`);
          cleanup();
          if (activeTask && typeof activeTask.cancel === 'function') {
            try { activeTask.cancel(); } catch (_) {}
          }
          onError(new Error('Upload timed out. Please check your network connection and try again.'));
        }
      }, timeoutMs);

      // Try upload via uploadBytesResumable
      let uploadSuccess = false;
      let downloadUrl = '';

      try {
        const resumableTask = uploadBytesResumable(storageRef, file, fileMetadata);
        activeTask = resumableTask;

        await new Promise<void>((resolve, reject) => {
          resumableTask.on(
            'state_changed',
            (snapshot) => {
              if (isFinished || isCancelled) return;
              const progress = snapshot.totalBytes > 0 
                ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100 
                : 0;
              console.log(`[CHAT_UPLOAD] UPLOAD_BYTES_SENT | TRANSFERRED=${snapshot.bytesTransferred}/${snapshot.totalBytes} (${progress.toFixed(1)}%)`);
              onProgress(Math.min(100, Math.max(0, progress)));
            },
            (err) => {
              reject(err);
            },
            async () => {
              try {
                downloadUrl = await getDownloadURL(resumableTask.snapshot.ref);
                uploadSuccess = true;
                resolve();
              } catch (urlErr) {
                reject(urlErr);
              }
            }
          );
        });
      } catch (resumableErr: any) {
        if (isCancelled || isFinished) return;
        console.warn('[CHAT_UPLOAD] Resumable upload failed/interrupted, attempting direct atomic upload fallback...', resumableErr?.message || resumableErr);

        // Fallback: Attempt direct uploadBytes (single request)
        try {
          console.log(`[CHAT_UPLOAD] ATTEMPTING_FALLBACK | STORAGE_PATH="${storagePath}" | METHOD="uploadBytes"`);
          onProgress(50);
          const uploadResult = await uploadBytes(storageRef, file, fileMetadata);
          downloadUrl = await getDownloadURL(uploadResult.ref);
          uploadSuccess = true;
          onProgress(100);
        } catch (fallbackErr: any) {
          throw fallbackErr;
        }
      }

      if (!isFinished && !isCancelled && uploadSuccess && downloadUrl) {
        console.log(`[CHAT_UPLOAD] UPLOAD_COMPLETED | STORAGE_PATH="${storagePath}" | URL_GENERATED=true`);
        cleanup();
        onComplete(downloadUrl);
      }
    } catch (err: any) {
      if (isCancelled) {
        console.log('[CHAT_UPLOAD] UPLOAD_CANCELLED_BY_USER');
        return;
      }
      console.error(`[CHAT_UPLOAD] UPLOAD_FAILED | ERROR="${err?.message || String(err)}"`);
      cleanup();
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  executeUpload();

  return () => {
    isCancelled = true;
    console.log('[CHAT_UPLOAD] UPLOAD_CANCEL_REQUESTED');
    cleanup();
    if (activeTask && typeof activeTask.cancel === 'function') {
      try {
        activeTask.cancel();
      } catch (_) {}
    }
  };
}

// Send a chat message in a conversation
export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderName: string,
  senderRole: 'EMPLOYEE' | 'ADMIN' | 'HR' | 'TEAM_LEADER',
  content: string,
  attachment?: ChatAttachment
): Promise<string> {
  const conversationPath = `chat_conversations/${conversationId}`;
  const messagePath = `chat_conversations/${conversationId}/messages`;
  try {
    // 1. Get the conversation details to check participants
    const convDoc = await getDoc(doc(db, 'chat_conversations', conversationId));
    if (!convDoc.exists()) {
      throw new Error('Conversation does not exist');
    }

    const convData = convDoc.data() as ChatConversation;
    const timestampStr = new Date().toISOString();
    const messageId = doc(collection(db, messagePath)).id;

    // 2. Prepare the new message
    const newMessage: ChatMessage = {
      id: messageId,
      senderId,
      senderName,
      senderRole,
      content,
      timestamp: timestampStr,
      ...(attachment ? { attachment } : {})
    };

    // 3. Write message
    await setDoc(doc(db, messagePath, messageId), newMessage);

    // 4. Update the conversation unread counts and last message details
    const updatedUnread = { ...convData.unreadCounts };
    convData.participantIds.forEach(pid => {
      if (pid !== senderId) {
        updatedUnread[pid] = (updatedUnread[pid] || 0) + 1;
      } else {
        updatedUnread[pid] = 0;
      }
    });

    const lastMsgContent = content.trim() || (attachment ? `📄 ${attachment.fileName}` : 'Sent an attachment');

    await updateDoc(doc(db, 'chat_conversations', conversationId), {
      lastMessage: {
        content: lastMsgContent,
        senderId,
        senderName,
        timestamp: timestampStr
      },
      unreadCounts: updatedUnread,
      updatedAt: timestampStr
    });

    return messageId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, messagePath);
  }
}

// Listen to all conversations for a participant
export function listenConversations(
  participantId: string,
  onUpdate: (conversations: ChatConversation[]) => void
): () => void {
  const path = 'chat_conversations';
  try {
    const q1 = query(
      collection(db, path),
      where('participantIds', 'array-contains', participantId)
    );

    return onSnapshot(q1, (snap) => {
      const results: ChatConversation[] = [];
      snap.forEach(d => {
        results.push(d.data() as ChatConversation);
      });
      // Sort client-side by updatedAt descending
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onUpdate(results);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Listen to public ALL_EMPLOYEES conversations
export function listenPublicConversations(
  onUpdate: (conversations: ChatConversation[]) => void
): () => void {
  const path = 'chat_conversations';
  try {
    const q = query(
      collection(db, path),
      where('type', '==', 'ALL_EMPLOYEES')
    );

    return onSnapshot(q, (snap) => {
      const results: ChatConversation[] = [];
      snap.forEach(d => {
        results.push(d.data() as ChatConversation);
      });
      results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      onUpdate(results);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Listen to recent messages within a conversation with pagination limit
export function listenMessages(
  conversationId: string,
  limitCount: number = 50,
  onUpdate: (messages: ChatMessage[]) => void
): () => void {
  const path = `chat_conversations/${conversationId}/messages`;
  try {
    const q = query(
      collection(db, path),
      orderBy('timestamp', 'asc'),
      limitToLast(limitCount)
    );

    return onSnapshot(q, (snap) => {
      const results: ChatMessage[] = [];
      snap.forEach(d => {
        results.push(d.data() as ChatMessage);
      });
      onUpdate(results);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Mark a conversation as read (resets unreadCount for the participant)
export async function markAsRead(conversationId: string, participantId: string): Promise<void> {
  const path = `chat_conversations/${conversationId}`;
  try {
    const docRef = doc(db, 'chat_conversations', conversationId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data() as ChatConversation;
    const currentUnread = data.unreadCounts || {};
    
    if (currentUnread[participantId] && currentUnread[participantId] > 0) {
      const updatedUnread = { ...currentUnread, [participantId]: 0 };
      await updateDoc(docRef, { unreadCounts: updatedUnread });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
