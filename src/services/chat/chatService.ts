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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      if (commaIdx !== -1) {
        resolve(result.substring(commaIdx + 1));
      } else {
        resolve(result);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

const attachmentBlobCache = new Map<string, string>();
const pendingAttachmentFetches = new Map<string, Promise<string>>();

export async function getAttachmentBlobUrl(attachment: ChatAttachment): Promise<string> {
  if (attachment.fileUrl && (attachment.fileUrl.startsWith('http://') || attachment.fileUrl.startsWith('https://') || attachment.fileUrl.startsWith('blob:'))) {
    return attachment.fileUrl;
  }

  // Build candidate document IDs (prioritizing att_ prefix if present)
  const candidates: string[] = [];
  if (attachment.fileUrl && attachment.fileUrl.startsWith('att_')) {
    candidates.push(attachment.fileUrl);
  }
  if (attachment.attachmentId && attachment.attachmentId.startsWith('att_') && !candidates.includes(attachment.attachmentId)) {
    candidates.push(attachment.attachmentId);
  }
  if (attachment.attachmentId && !candidates.includes(attachment.attachmentId)) {
    candidates.push(attachment.attachmentId);
  }
  if (attachment.fileUrl && !candidates.includes(attachment.fileUrl)) {
    candidates.push(attachment.fileUrl);
  }

  if (candidates.length === 0) {
    throw new Error('No valid attachment ID specified.');
  }

  // Check memory cache first for any candidate
  for (const cid of candidates) {
    if (attachmentBlobCache.has(cid)) {
      return attachmentBlobCache.get(cid)!;
    }
  }

  const primaryKey = candidates[0];
  if (pendingAttachmentFetches.has(primaryKey)) {
    return pendingAttachmentFetches.get(primaryKey)!;
  }

  console.log(`[ATTACHMENT_DOWNLOAD_START] FILE_NAME="${attachment.fileName}" | SIZE=${attachment.fileSize} | CANDIDATES=${JSON.stringify(candidates)}`);

  const fetchPromise = (async () => {
    let lastError: any = null;

    for (const cid of candidates) {
      try {
        const attDocRef = doc(db, 'chat_attachments', cid);
        const attSnap = await getDoc(attDocRef);

        if (!attSnap.exists()) {
          console.warn(`[ATTACHMENT_DOWNLOAD] METADATA_NOT_FOUND | ATTACHMENT_ID="${cid}"`);
          continue;
        }

        const meta = attSnap.data();
        const totalChunks = meta.totalChunks || 1;

        const chunkPromises = [];
        for (let i = 0; i < totalChunks; i++) {
          const chunkRef = doc(db, 'chat_attachments', cid, 'chunks', `chunk_${i}`);
          chunkPromises.push(getDoc(chunkRef));
        }

        const chunkSnaps = await Promise.all(chunkPromises);
        let fullBase64 = '';
        for (const snap of chunkSnaps) {
          if (!snap.exists()) {
            throw new Error(`Chunk missing at index ${snap.id}`);
          }
          fullBase64 += snap.data().data;
        }

        if (!fullBase64) {
          throw new Error('Attachment payload is empty.');
        }

        const byteCharacters = atob(fullBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const mime = meta.mimeType || attachment.mimeType || 'application/octet-stream';
        const blob = new Blob([byteArray], { type: mime });

        const blobUrl = URL.createObjectURL(blob);
        
        // Cache under all candidate IDs for fast future lookup
        for (const key of candidates) {
          attachmentBlobCache.set(key, blobUrl);
        }

        console.log(`[ATTACHMENT_DOWNLOAD_SUCCESS] ATTACHMENT_ID="${cid}" | FILE_NAME="${attachment.fileName}" | RECONSTRUCTED_BYTES=${blob.size}`);
        pendingAttachmentFetches.delete(primaryKey);
        return blobUrl;
      } catch (err: any) {
        lastError = err;
        console.warn(`[ATTACHMENT_DOWNLOAD_RETRY] Candidate "${cid}" failed:`, err?.message || err);
      }
    }

    pendingAttachmentFetches.delete(primaryKey);
    console.error(`[ATTACHMENT_DOWNLOAD_FAILED] FILE_NAME="${attachment.fileName}" | ERROR="${lastError?.message || String(lastError)}"`);
    throw lastError || new Error('Attachment file could not be retrieved from database.');
  })();

  pendingAttachmentFetches.set(primaryKey, fetchPromise);
  return fetchPromise;
}

export async function downloadOrOpenAttachment(attachment: ChatAttachment, action: 'open' | 'download' = 'open'): Promise<void> {
  try {
    const blobUrl = await getAttachmentBlobUrl(attachment);
    if (action === 'download') {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.fileName || 'attachment';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      window.open(blobUrl, '_blank');
    }
  } catch (err) {
    console.error('Failed to open/download attachment:', err);
    alert('Unable to load attachment file. Please check your connection.');
  }
}

// Upload an attachment using high-performance Firestore Chunked Storage engine
export function uploadAttachment(
  file: File,
  conversationId: string,
  userId: string,
  onProgress: (progress: number) => void,
  onComplete: (downloadUrl: string) => void,
  onError: (error: Error) => void,
  timeoutMs: number = 120000
): () => void {
  let isCancelled = false;
  let timerId: any = null;

  console.log(`[CHAT_UPLOAD] UPLOAD_STARTED | FILE_NAME="${file.name}" | FILE_SIZE=${file.size} | MIME_TYPE="${file.type || 'unknown'}" | CONVERSATION="${conversationId}" | USER="${userId}"`);

  const executeUpload = async () => {
    try {
      if (!navigator.onLine) {
        throw new Error('No internet connection. Please check your network.');
      }

      const validation = validateAttachment(file);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid file format or size.');
      }

      timerId = setTimeout(() => {
        if (!isCancelled) {
          isCancelled = true;
          console.error(`[CHAT_UPLOAD] UPLOAD_TIMEOUT | FILE_NAME="${file.name}" | TIMEOUT_MS=${timeoutMs}`);
          onError(new Error('Upload operation timed out. Please try again.'));
        }
      }, timeoutMs);

      onProgress(5);

      const base64Data = await fileToBase64(file);
      if (isCancelled) return;

      onProgress(15);

      const attachmentId = 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      const CHUNK_SIZE = 500 * 1024; // 500 KB chunk
      const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

      console.log(`[CHAT_UPLOAD] REQUEST_STARTED | ATTACHMENT_ID="${attachmentId}" | TOTAL_CHUNKS=${totalChunks}`);

      const attRef = doc(db, 'chat_attachments', attachmentId);
      await setDoc(attRef, {
        attachmentId,
        conversationId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        totalChunks,
        status: 'uploading'
      });

      if (isCancelled) return;

      for (let i = 0; i < totalChunks; i++) {
        if (isCancelled) return;
        const chunkSlice = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkRef = doc(db, 'chat_attachments', attachmentId, 'chunks', `chunk_${i}`);
        
        await setDoc(chunkRef, { index: i, data: chunkSlice });

        const progressPercent = Math.round(15 + ((i + 1) / totalChunks) * 80);
        console.log(`[CHAT_UPLOAD] UPLOAD_BYTES_SENT | CHUNK=${i + 1}/${totalChunks} (${progressPercent}%)`);
        onProgress(Math.min(95, progressPercent));
      }

      if (isCancelled) return;

      console.log(`[ATTACHMENT_STORAGE_VERIFY] Verifying storage integrity for ATTACHMENT_ID="${attachmentId}"`);
      
      const verifyPromises = [];
      for (let i = 0; i < totalChunks; i++) {
        verifyPromises.push(getDoc(doc(db, 'chat_attachments', attachmentId, 'chunks', `chunk_${i}`)));
      }
      const verifySnaps = await Promise.all(verifyPromises);
      let verifiedBase64 = '';
      for (const snap of verifySnaps) {
        if (!snap.exists() || !snap.data()?.data) {
          console.error(`[ATTACHMENT_STORAGE_VERIFY_FAILED] ATTACHMENT_ID="${attachmentId}" | Chunk missing at index ${snap.id}`);
          throw new Error(`Verification failed: Storage chunk missing.`);
        }
        verifiedBase64 += snap.data().data;
      }

      const decodedLength = atob(verifiedBase64).length;
      if (decodedLength !== file.size) {
        console.error(`[ATTACHMENT_STORAGE_VERIFY_FAILED] ATTACHMENT_ID="${attachmentId}" | Size mismatch: expected ${file.size}, got ${decodedLength}`);
        throw new Error(`Verification failed: Corrupted payload size (${decodedLength} != ${file.size}).`);
      }

      console.log(`[ATTACHMENT_STORAGE_VERIFY_SUCCESS] ATTACHMENT_ID="${attachmentId}" | VERIFIED_FILE_SIZE=${decodedLength} | TOTAL_CHUNKS=${totalChunks}`);

      await updateDoc(attRef, { status: 'completed' });

      onProgress(100);
      if (timerId) clearTimeout(timerId);

      // Cache local blob URL for immediate instant rendering
      const localBlob = new Blob([file], { type: file.type || 'application/octet-stream' });
      const localBlobUrl = URL.createObjectURL(localBlob);
      attachmentBlobCache.set(attachmentId, localBlobUrl);

      console.log(`[ATTACHMENT_UPLOAD_SUCCESS] ATTACHMENT_ID="${attachmentId}" | FILE_NAME="${file.name}" | SIZE=${file.size}`);
      onComplete(attachmentId);
    } catch (err: any) {
      if (timerId) clearTimeout(timerId);
      if (isCancelled) {
        console.log('[CHAT_UPLOAD] UPLOAD_CANCELLED_BY_USER');
        return;
      }
      console.error(`[CHAT_UPLOAD] UPLOAD_FAILED | ERROR="${err?.message || String(err)}"`);
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  executeUpload();

  return () => {
    isCancelled = true;
    if (timerId) clearTimeout(timerId);
    console.log('[CHAT_UPLOAD] UPLOAD_CANCEL_REQUESTED');
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
