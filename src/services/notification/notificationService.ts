import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  deleteDoc,
  arrayUnion,
} from 'firebase/firestore';
import { auth, getDb } from '../firebase/config';
import { NotificationRecord, NotificationType, NotificationCategory, NotificationPriority, parseTimestamp, isGreetingNotification } from '../../types/notification';
import {
  getStoredNotifications,
  saveNotificationLocally,
  saveMultipleNotificationsLocally,
  getPendingNotifications,
  markNotificationSyncedLocally,
  removeNotificationLocally,
  isNotificationDeletedLocally,
  getDeletedNotificationIds,
  getPendingDeletes,
  addPendingDelete,
  removePendingDelete,
  getPendingReads,
  addPendingRead,
  removePendingRead,
} from './notificationStorage';

const dispatchNotificationsUpdated = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('exfin-notifications-updated'));
  }
};

enum OperationType {
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
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Notification Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Check if online
const isOnline = (): boolean => {
  return typeof navigator !== 'undefined' && navigator.onLine;
};

/**
 * Generate a deterministic or unique ID for duplicate protection
 */
export const generateNotificationId = (
  type: string,
  recipientCode: string,
  entityId?: string
): string => {
  if (entityId) {
    return `notif_${type}_${recipientCode}_${entityId}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }
  return `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
};

/**
 * Check if a notification already exists for an idempotency key (locally or on server)
 */
export const findNotificationByIdempotencyKey = async (
  key: string
): Promise<NotificationRecord | null> => {
  if (!key) return null;
  const local = getStoredNotifications();
  const foundLocal = local.find(n => n.idempotencyKey === key || n.id === key || n.id === `notif_${key}`);
  if (foundLocal) return foundLocal;

  if (isOnline()) {
    try {
      const activeDb = await getDb();
      if (activeDb) {
        const q = query(collection(activeDb, 'notifications'), where('idempotencyKey', '==', key));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docSnap = snap.docs[0];
          const d = docSnap.data() as any;
          return {
            id: docSnap.id,
            ...d,
          } as NotificationRecord;
        }
      }
    } catch (err) {
      console.warn('Idempotency check query warning:', err);
    }
  }
  return null;
};

/**
 * Create a single notification with duplicate protection and offline-first persistence
 */
export const createNotification = async (
  data: Partial<NotificationRecord>
): Promise<NotificationRecord> => {
  const nowIso = new Date().toISOString();
  
  const recipientCode = data.recipientEmployeeCode || 'SYSTEM';

  if (isGreetingNotification(data)) {
    console.log('[NotificationService] GREETING_NOTIFICATION_IGNORED (Prevented from creation/storage)');
    return {
      id: 'greeting_prevented_' + Math.random().toString(36).substr(2, 9),
      type: 'GREETING',
      category: 'SYSTEM',
      title: data.title || '',
      message: data.message || '',
      recipientUserId: data.recipientUserId || '',
      recipientEmployeeCode: recipientCode,
      recipientRole: 'EMPLOYEE',
      priority: 'LOW',
      read: true,
      isRead: true,
      timestamp: nowIso,
      createdAtDeviceTime: nowIso,
      updatedAtDeviceTime: nowIso,
      serverSyncTime: '',
      syncStatus: 'SYNCED',
    };
  }

  const idempotencyKey = data.idempotencyKey || (data as any).key || `${data.type}_${data.entityId || 'general'}_${recipientCode}`.replace(/[^a-zA-Z0-9_]/g, '_');

  // Check idempotency first
  const existing = await findNotificationByIdempotencyKey(idempotencyKey);
  if (existing) {
    return existing;
  }

  const notifId = data.id || data.notificationId || generateNotificationId(data.type || 'SYSTEM', recipientCode, data.entityId);

  const newNotif: NotificationRecord = {
    id: notifId,
    notificationId: notifId,
    type: data.type || 'SYSTEM_ALERT',
    category: data.category || 'SYSTEM',
    title: data.title || 'System Alert',
    message: data.message || '',
    recipientUserId: data.recipientUserId || '',
    recipientEmployeeCode: recipientCode,
    recipientEmail: data.recipientEmail || '',
    recipientMobile: data.recipientMobile || '',
    recipientRole: data.recipientRole || 'EMPLOYEE',
    recipientTeamLeaderId: data.recipientTeamLeaderId || '',
    priority: data.priority || 'NORMAL',
    route: data.route || '',
    entityId: data.entityId || '',
    relatedRecordId: data.entityId || data.relatedRecordId || '',
    entityType: data.entityType || '',
    read: false,
    isRead: false,
    timestamp: nowIso,
    createdAtDeviceTime: data.createdAtDeviceTime || nowIso,
    updatedAtDeviceTime: nowIso,
    serverSyncTime: '',
    syncStatus: 'PENDING',
    channels: (data as any).channels || ['IN_APP'],
    inAppStatus: data.inAppStatus || 'DELIVERED',
    emailStatus: data.emailStatus || 'NOT_REQUIRED',
    smsStatus: data.smsStatus || 'NOT_REQUIRED',
    pushStatus: data.pushStatus || 'NOT_REQUIRED',
    source: data.source || 'SYSTEM',
    idempotencyKey,
  };

  // Save locally first so it shows up immediately
  saveNotificationLocally(newNotif);
  dispatchNotificationsUpdated();

  if (isOnline()) {
    try {
      const activeDb = await getDb();
      if (activeDb) {
        const docRef = doc(activeDb, 'notifications', newNotif.id);
        const serverNotif = {
          ...newNotif,
          syncStatus: 'SYNCED' as const,
          serverSyncTime: nowIso,
        };
        await setDoc(docRef, serverNotif);
        markNotificationSyncedLocally(newNotif.id, nowIso);
        return serverNotif;
      }
    } catch (err) {
      console.warn('Failed to sync notification to Firestore (retaining locally):', err);
    }
  }

  return newNotif;
};

/**
 * Create multiple notifications in batch
 */
export const createNotifications = async (
  notifsData: Partial<NotificationRecord>[]
): Promise<NotificationRecord[]> => {
  const results: NotificationRecord[] = [];
  for (const data of notifsData) {
    const res = await createNotification(data);
    results.push(res);
  }
  return results;
};

/**
 * Fetch and synchronize notifications scoped strictly by user role and identity
 */
export const getNotificationsForUser = async (user: {
  id: string;
  employeeCode: string;
  role: string;
  teamLeaderId?: string;
  isTeamLeader?: boolean;
} | null | undefined): Promise<NotificationRecord[]> => {
  if (!user || (!user.id && !user.employeeCode)) {
    return [];
  }
  const userScopeKey = user.employeeCode || user.id;

  // First, fetch whatever is stored locally in this user's isolated storage
  const localNotifications = getStoredNotifications(userScopeKey);
  
  // Filter local based on strict identity permissions
  const filterAllowedLocal = (n: NotificationRecord) => isNotificationForUser(n, user);

  const localFiltered = localNotifications.filter(n => filterAllowedLocal(n) && !isGreetingNotification(n));

  if (!isOnline()) {
    return localFiltered;
  }

  try {
    const activeDb = await getDb();
    if (!activeDb) return localFiltered;

    const fetchedMap = new Map<string, NotificationRecord>();
    const notifCollection = collection(activeDb, 'notifications');
    const queries = [];

    // Query 1: Scoped directly by recipientEmployeeCode
    if (user.employeeCode) {
      queries.push(query(notifCollection, where('recipientEmployeeCode', '==', user.employeeCode), limit(50)));
    }

    // Query 2: Scoped directly by recipientUserId
    if (user.id && user.id !== user.employeeCode) {
      queries.push(query(notifCollection, where('recipientUserId', '==', user.id), limit(50)));
    }

    // Query 3: Team-specific notifications for Team Leaders
    if (user.role === 'TEAM_LEADER' || user.isTeamLeader) {
      if (user.id) {
        queries.push(query(notifCollection, where('recipientTeamLeaderId', '==', user.id), limit(50)));
      }
      if (user.employeeCode && user.employeeCode !== user.id) {
        queries.push(query(notifCollection, where('recipientTeamLeaderId', '==', user.employeeCode), limit(50)));
      }
    }

    // Query 4: Role-based notifications ONLY for Admins and Super Admins
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      queries.push(query(notifCollection, where('recipientEmployeeCode', '==', 'SYSTEM'), limit(50)));
      queries.push(query(notifCollection, where('recipientRole', '==', 'ADMIN'), limit(50)));
      if (user.role === 'SUPER_ADMIN') {
        queries.push(query(notifCollection, where('recipientRole', '==', 'SUPER_ADMIN'), limit(50)));
      }
    }

    // Execute queries in parallel and merge
    const snapshots = await Promise.all(queries.map(q => getDocs(q)));
    
    snapshots.forEach((snap) => {
      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        const deletedUserIds: string[] = d.deletedUserIds || [];
        const isDeletedForUser =
          d.deleted === true ||
          deletedUserIds.includes(user.id) ||
          deletedUserIds.includes(user.employeeCode) ||
          isNotificationDeletedLocally(docSnap.id, userScopeKey) ||
          getPendingDeletes(userScopeKey).includes(docSnap.id);

        if (isDeletedForUser) {
          return;
        }

        const isReadPending = getPendingReads(userScopeKey).includes(docSnap.id);
        const recordRead = isReadPending ? true : (d.read || false);

        // Support backward compatibility (timestamp || createdAt) using parseTimestamp helper
        const parsedDate = parseTimestamp(d.timestamp || d.createdAt || d.createdAtDeviceTime);
        const canonicalTime = parsedDate ? parsedDate.toISOString() : '';
        const record: NotificationRecord = {
          id: d.id || docSnap.id,
          type: d.type,
          category: d.category || 'SYSTEM',
          title: d.title || '',
          message: d.message || '',
          recipientUserId: d.recipientUserId || '',
          recipientEmployeeCode: d.recipientEmployeeCode || '',
          recipientRole: d.recipientRole || 'EMPLOYEE',
          recipientTeamLeaderId: d.recipientTeamLeaderId || '',
          priority: d.priority || 'NORMAL',
          route: d.route || '',
          entityId: d.entityId || '',
          entityType: d.entityType || '',
          read: recordRead,
          timestamp: canonicalTime,
          createdAtDeviceTime: d.createdAtDeviceTime || canonicalTime,
          updatedAtDeviceTime: d.updatedAtDeviceTime || canonicalTime,
          serverSyncTime: d.serverSyncTime || '',
          syncStatus: 'SYNCED',
          deleted: d.deleted || false,
          deletedUserIds: deletedUserIds,
        };

        // Strict post-query isolation check
        if (isNotificationForUser(record, user)) {
          fetchedMap.set(record.id, record);
        }
      });
    });

    const serverNotifs = Array.from(fetchedMap.values());
    if (serverNotifs.length > 0) {
      saveMultipleNotificationsLocally(serverNotifs, userScopeKey);
      dispatchNotificationsUpdated();
    }

    // Sync local pending notifications to Firestore
    await syncPendingNotifications(userScopeKey);

    // Re-load fully merged list from isolated storage
    const finalLocal = getStoredNotifications(userScopeKey);
    return finalLocal.filter(n => filterAllowedLocal(n) && !isGreetingNotification(n));
  } catch (err) {
    console.error('Error fetching notifications from server:', err);
    return localFiltered;
  }
};

export const isNotificationForUser = (
  n: NotificationRecord,
  user: { id?: string; employeeCode?: string; role?: string; isTeamLeader?: boolean } | null | undefined
): boolean => {
  if (!user) return false;
  const userId = user.id || '';
  const empCode = user.employeeCode || '';
  const userRole = user.role || 'EMPLOYEE';
  const isTeamLeader = Boolean(user.isTeamLeader || userRole === 'TEAM_LEADER');

  // System & Admin alerts: visible ONLY to Admins / Super Admins
  if (n.recipientRole === 'SYSTEM' || n.recipientEmployeeCode === 'SYSTEM' || n.recipientRole === 'ADMIN' || n.recipientRole === 'SUPER_ADMIN') {
    return userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  }

  // Explicit recipient match (Identity Isolation):
  // Direct match to employeeCode or direct match to userId
  if ((empCode && n.recipientEmployeeCode === empCode) || (userId && n.recipientUserId === userId)) {
    return true;
  }

  // Team Leader specific delegation
  if (isTeamLeader && ((userId && n.recipientTeamLeaderId === userId) || (empCode && n.recipientTeamLeaderId === empCode))) {
    return true;
  }

  // Administrators can view direct assignments
  if ((userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') && ((userId && n.recipientUserId === userId) || (empCode && n.recipientEmployeeCode === empCode))) {
    return true;
  }

  return false;
};

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (id: string, user?: { id?: string; employeeCode?: string }): Promise<void> => {
  const userScopeKey = user ? (user.employeeCode || user.id) : undefined;
  const nowIso = new Date().toISOString();
  const local = getStoredNotifications(userScopeKey);
  const index = local.findIndex((n) => n.id === id);
  if (index >= 0) {
    local[index].read = true;
    (local[index] as any).isRead = true;
    local[index].updatedAtDeviceTime = nowIso;
    local[index].syncStatus = 'PENDING';
    saveNotificationLocally(local[index], userScopeKey);
    dispatchNotificationsUpdated();
  }

  addPendingRead(id, userScopeKey);

  if (isOnline()) {
    try {
      const activeDb = await getDb();
      if (activeDb) {
        const docRef = doc(activeDb, 'notifications', id);
        await setDoc(docRef, {
          read: true,
          isRead: true,
          updatedAtDeviceTime: nowIso,
          syncStatus: 'SYNCED',
          serverSyncTime: nowIso,
        }, { merge: true });
        markNotificationSyncedLocally(id, nowIso, userScopeKey);
        removePendingRead(id, userScopeKey);
      }
    } catch (err) {
      console.warn('Failed to mark read on server, retained locally (queued for retry):', err);
    }
  }
};

/**
 * Mark all notifications as read for current user
 */
export const markAllNotificationsRead = async (user: {
  id?: string;
  employeeCode?: string;
  role?: string;
  isTeamLeader?: boolean;
}): Promise<void> => {
  const userScopeKey = user.employeeCode || user.id;
  const nowIso = new Date().toISOString();
  const local = getStoredNotifications(userScopeKey);
  
  const updatedNotifs: NotificationRecord[] = [];
  
  local.forEach((n) => {
    if (n.deleted || isNotificationDeletedLocally(n.id, userScopeKey) || getPendingDeletes(userScopeKey).includes(n.id)) return;

    if ((!n.read && !(n as any).isRead) && isNotificationForUser(n, user)) {
      n.read = true;
      (n as any).isRead = true;
      n.updatedAtDeviceTime = nowIso;
      n.syncStatus = 'PENDING';
      updatedNotifs.push(n);
      addPendingRead(n.id, userScopeKey);
    }
  });

  if (updatedNotifs.length === 0) return;

  saveMultipleNotificationsLocally(local, userScopeKey);
  dispatchNotificationsUpdated();

  if (isOnline()) {
    try {
      const activeDb = await getDb();
      if (activeDb) {
        const batch = writeBatch(activeDb);
        updatedNotifs.forEach((n) => {
          const ref = doc(activeDb, 'notifications', n.id);
          batch.set(ref, {
            read: true,
            isRead: true,
            updatedAtDeviceTime: nowIso,
            syncStatus: 'SYNCED',
            serverSyncTime: nowIso,
          }, { merge: true });
        });
        await batch.commit();
        updatedNotifs.forEach((n) => {
          markNotificationSyncedLocally(n.id, nowIso, userScopeKey);
          removePendingRead(n.id, userScopeKey);
        });
      }
    } catch (err) {
      console.warn('Failed to batch mark all read on server (queued for retry):', err);
    }
  }
};

/**
 * Get count of unread notifications locally
 */
export const getUnreadNotificationCount = (user: {
  id?: string;
  employeeCode?: string;
  role?: string;
  isTeamLeader?: boolean;
} | null | undefined): number => {
  if (!user || (!user.id && !user.employeeCode)) {
    return 0;
  }
  const userScopeKey = user.employeeCode || user.id;
  const local = getStoredNotifications(userScopeKey);
  return local.filter((n) => {
    if (n.read || (n as any).isRead || getPendingReads(userScopeKey).includes(n.id)) return false;
    if (n.deleted || isNotificationDeletedLocally(n.id, userScopeKey) || getPendingDeletes(userScopeKey).includes(n.id)) return false;
    return isNotificationForUser(n, user);
  }).length;
};

/**
 * Delete / Archive a notification
 */
export const deleteNotification = async (
  id: string,
  user?: { id?: string; employeeCode?: string }
): Promise<void> => {
  const userScopeKey = user ? (user.employeeCode || user.id) : undefined;
  removeNotificationLocally(id, userScopeKey);
  addPendingDelete(id, userScopeKey);
  dispatchNotificationsUpdated();

  if (isOnline()) {
    try {
      const activeDb = await getDb();
      if (activeDb) {
        const docRef = doc(activeDb, 'notifications', id);
        const nowIso = new Date().toISOString();
        const userIdOrCode = user?.id || user?.employeeCode || auth.currentUser?.uid || 'USER';

        await setDoc(
          docRef,
          {
            deleted: true,
            deletedUserIds: arrayUnion(userIdOrCode),
            updatedAtDeviceTime: nowIso,
            serverSyncTime: nowIso,
          },
          { merge: true }
        );

        try {
          await deleteDoc(docRef);
        } catch {
          // Soft delete in Firestore recorded successfully
        }
        removePendingDelete(id, userScopeKey);
      }
    } catch (err) {
      console.warn('Failed to delete notification on server (queued for retry):', err);
    }
  }
};

/**
 * Synchronize any pending offline notifications
 */
export const syncPendingNotifications = async (userId?: string): Promise<void> => {
  if (!isOnline()) return;

  const activeDb = await getDb();
  if (!activeDb) return;

  const nowIso = new Date().toISOString();

  // 1. Sync pending deletes
  const pendingDeletes = getPendingDeletes(userId);
  if (pendingDeletes.length > 0) {
    try {
      const batch = writeBatch(activeDb);
      const userIdOrCode = auth.currentUser?.uid || userId || 'USER';
      pendingDeletes.forEach((id) => {
        const ref = doc(activeDb, 'notifications', id);
        batch.set(
          ref,
          {
            deleted: true,
            deletedUserIds: arrayUnion(userIdOrCode),
            updatedAtDeviceTime: nowIso,
            serverSyncTime: nowIso,
          },
          { merge: true }
        );
      });
      await batch.commit();

      for (const id of pendingDeletes) {
        try {
          await deleteDoc(doc(activeDb, 'notifications', id));
        } catch {
          // ignore
        }
        removePendingDelete(id, userId);
      }
      console.log(`Synced ${pendingDeletes.length} pending delete(s) successfully.`);
    } catch (err) {
      console.warn('Failed to sync pending deletes:', err);
    }
  }

  // 2. Sync pending reads
  const pendingReads = getPendingReads(userId);
  if (pendingReads.length > 0) {
    try {
      const batch = writeBatch(activeDb);
      pendingReads.forEach((id) => {
        const ref = doc(activeDb, 'notifications', id);
        batch.set(
          ref,
          {
            read: true,
            updatedAtDeviceTime: nowIso,
            syncStatus: 'SYNCED',
            serverSyncTime: nowIso,
          },
          { merge: true }
        );
      });
      await batch.commit();

      pendingReads.forEach((id) => {
        markNotificationSyncedLocally(id, nowIso, userId);
        removePendingRead(id, userId);
      });
      console.log(`Synced ${pendingReads.length} pending read(s) successfully.`);
    } catch (err) {
      console.warn('Failed to sync pending reads:', err);
    }
  }

  // 3. Sync pending creations
  const pending = getPendingNotifications(userId);
  if (pending.length > 0) {
    try {
      const batch = writeBatch(activeDb);
      pending.forEach((n) => {
        const ref = doc(activeDb, 'notifications', n.id);
        batch.set(ref, {
          ...n,
          syncStatus: 'SYNCED',
          serverSyncTime: nowIso,
        });
      });

      await batch.commit();

      pending.forEach((n) => {
        markNotificationSyncedLocally(n.id, nowIso, userId);
      });
      console.log(`Synced ${pending.length} pending creation(s) successfully.`);
    } catch (err) {
      console.warn('Failed to sync pending creations:', err);
    }
  }
};

function nowIsoString(): string {
  return new Date().toISOString();
}
