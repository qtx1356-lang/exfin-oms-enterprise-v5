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
import { db, auth } from '../firebase/config';
import { NotificationRecord, NotificationType, NotificationCategory, NotificationPriority, parseTimestamp } from '../../types/notification';
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
      const q = query(collection(db, 'notifications'), where('idempotencyKey', '==', key));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const d = docSnap.data() as any;
        return {
          id: docSnap.id,
          ...d,
        } as NotificationRecord;
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
      const docRef = doc(db, 'notifications', newNotif.id);
      const serverNotif = {
        ...newNotif,
        syncStatus: 'SYNCED' as const,
        serverSyncTime: nowIso,
      };
      await setDoc(docRef, serverNotif);
      markNotificationSyncedLocally(newNotif.id, nowIso);
      return serverNotif;
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
} | null | undefined): Promise<NotificationRecord[]> => {
  if (!user || (!user.id && !user.employeeCode)) {
    return [];
  }
  // First, fetch whatever is stored locally
  const localNotifications = getStoredNotifications();
  
  // Filter local based on permissions
  const filterAllowedLocal = (n: NotificationRecord) => {
    // SYSTEM alerts are visible only to ADMIN and SUPER_ADMIN
    if (n.recipientRole === 'SYSTEM' || n.recipientEmployeeCode === 'SYSTEM') {
      return user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';
    }
    
    // Employee can only see own notifications
    if (user.role === 'EMPLOYEE') {
      return n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
    }

    // Team Leader can see own notifications AND team-management notifications for their team
    if (user.role === 'TEAM_LEADER') {
      const isOwn = n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
      const isTeamMgmt = n.recipientTeamLeaderId === user.id || n.recipientTeamLeaderId === user.employeeCode;
      return isOwn || isTeamMgmt;
    }

    // Admins can see ADMIN alerts or system alerts
    if (user.role === 'ADMIN') {
      const isOwn = n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
      const isAdminType = n.recipientRole === 'ADMIN';
      return isOwn || isAdminType;
    }

    // Super Admins can see ADMIN/SUPER_ADMIN alerts or system alerts
    if (user.role === 'SUPER_ADMIN') {
      const isOwn = n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
      const isAdminType = n.recipientRole === 'ADMIN' || n.recipientRole === 'SUPER_ADMIN';
      return isOwn || isAdminType;
    }

    return false;
  };

  const localFiltered = localNotifications.filter(filterAllowedLocal);

  if (!isOnline()) {
    return localFiltered;
  }

  try {
    const fetchedMap = new Map<string, NotificationRecord>();
    const notifCollection = collection(db, 'notifications');
    const queries = [];

    // Query 1: Scoped directly by recipientEmployeeCode
    if (user.employeeCode) {
      queries.push(query(notifCollection, where('recipientEmployeeCode', '==', user.employeeCode), limit(50)));
    }

    // Query 2: Scoped directly by recipientUserId
    if (user.id) {
      queries.push(query(notifCollection, where('recipientUserId', '==', user.id), limit(50)));
    }

    // Query 3: Scoped by recipientRole SYSTEM/public - ONLY for ADMIN and SUPER_ADMIN
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      queries.push(query(notifCollection, where('recipientEmployeeCode', '==', 'SYSTEM'), limit(50)));
    }

    // Query 4: Team-specific notifications for Team Leaders
    if (user.role === 'TEAM_LEADER') {
      queries.push(query(notifCollection, where('recipientTeamLeaderId', '==', user.id), limit(50)));
      if (user.employeeCode) {
        queries.push(query(notifCollection, where('recipientTeamLeaderId', '==', user.employeeCode), limit(50)));
      }
    }

    // Role-based notifications for Admins
    if (user.role === 'ADMIN') {
      queries.push(query(notifCollection, where('recipientRole', '==', 'ADMIN'), limit(50)));
    }

    // Role-based notifications for Super Admins
    if (user.role === 'SUPER_ADMIN') {
      queries.push(query(notifCollection, where('recipientRole', '==', 'ADMIN'), limit(50)));
      queries.push(query(notifCollection, where('recipientRole', '==', 'SUPER_ADMIN'), limit(50)));
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
          isNotificationDeletedLocally(docSnap.id) ||
          getPendingDeletes().includes(docSnap.id);

        if (isDeletedForUser) {
          return;
        }

        const isReadPending = getPendingReads().includes(docSnap.id);
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
        fetchedMap.set(record.id, record);
      });
    });

    const serverNotifs = Array.from(fetchedMap.values());
    if (serverNotifs.length > 0) {
      saveMultipleNotificationsLocally(serverNotifs);
      dispatchNotificationsUpdated();
    }

    // Sync local pending notifications to Firestore
    await syncPendingNotifications();

    // Re-load fully merged list
    const finalLocal = getStoredNotifications();
    return finalLocal.filter(filterAllowedLocal);
  } catch (err) {
    console.error('Error fetching notifications from server:', err);
    return localFiltered;
  }
};

export const isNotificationForUser = (
  n: NotificationRecord,
  user: { id?: string; employeeCode?: string; role?: string } | null | undefined
): boolean => {
  if (!user) return false;
  const userId = user.id || '';
  const empCode = user.employeeCode || '';
  const userRole = user.role || 'EMPLOYEE';

  if (n.recipientRole === 'SYSTEM' || n.recipientEmployeeCode === 'SYSTEM') {
    return userRole === 'ADMIN' || userRole === 'SUPER_ADMIN';
  }

  if (n.recipientEmployeeCode === 'ALL' || n.recipientUserId === 'ALL' || n.recipientRole === 'ALL') {
    return true;
  }

  if ((userId && n.recipientUserId === userId) || (empCode && n.recipientEmployeeCode === empCode)) {
    return true;
  }

  if (userRole === 'TEAM_LEADER' && ((userId && n.recipientTeamLeaderId === userId) || (empCode && n.recipientTeamLeaderId === empCode))) {
    return true;
  }

  if ((userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') && (n.recipientRole === 'ADMIN' || n.recipientRole === 'SUPER_ADMIN')) {
    return true;
  }

  if (userRole === 'EMPLOYEE' && n.recipientRole === 'EMPLOYEE') {
    return true;
  }

  return false;
};

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (id: string): Promise<void> => {
  const nowIso = new Date().toISOString();
  const local = getStoredNotifications();
  const index = local.findIndex((n) => n.id === id);
  if (index >= 0) {
    local[index].read = true;
    (local[index] as any).isRead = true;
    local[index].updatedAtDeviceTime = nowIso;
    local[index].syncStatus = 'PENDING';
    saveNotificationLocally(local[index]);
    dispatchNotificationsUpdated();
  }

  addPendingRead(id);

  if (isOnline()) {
    try {
      const docRef = doc(db, 'notifications', id);
      await setDoc(docRef, {
        read: true,
        isRead: true,
        updatedAtDeviceTime: nowIso,
        syncStatus: 'SYNCED',
        serverSyncTime: nowIso,
      }, { merge: true });
      markNotificationSyncedLocally(id, nowIso);
      removePendingRead(id);
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
}): Promise<void> => {
  const nowIso = new Date().toISOString();
  const local = getStoredNotifications();
  
  const updatedNotifs: NotificationRecord[] = [];
  
  local.forEach((n) => {
    if (n.deleted || isNotificationDeletedLocally(n.id) || getPendingDeletes().includes(n.id)) return;

    if ((!n.read && !(n as any).isRead) && isNotificationForUser(n, user)) {
      n.read = true;
      (n as any).isRead = true;
      n.updatedAtDeviceTime = nowIso;
      n.syncStatus = 'PENDING';
      updatedNotifs.push(n);
      addPendingRead(n.id);
    }
  });

  if (updatedNotifs.length === 0) return;

  saveMultipleNotificationsLocally(local);
  dispatchNotificationsUpdated();

  if (isOnline()) {
    try {
      const batch = writeBatch(db);
      updatedNotifs.forEach((n) => {
        const ref = doc(db, 'notifications', n.id);
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
        markNotificationSyncedLocally(n.id, nowIso);
        removePendingRead(n.id);
      });
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
} | null | undefined): number => {
  if (!user || (!user.id && !user.employeeCode)) {
    return 0;
  }
  const local = getStoredNotifications();
  return local.filter((n) => {
    if (n.read || (n as any).isRead || getPendingReads().includes(n.id)) return false;
    if (n.deleted || isNotificationDeletedLocally(n.id) || getPendingDeletes().includes(n.id)) return false;
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
  removeNotificationLocally(id);
  addPendingDelete(id);
  dispatchNotificationsUpdated();

  if (isOnline()) {
    try {
      const docRef = doc(db, 'notifications', id);
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
      removePendingDelete(id);
    } catch (err) {
      console.warn('Failed to delete notification on server (queued for retry):', err);
    }
  }
};

/**
 * Synchronize any pending offline notifications
 */
export const syncPendingNotifications = async (): Promise<void> => {
  if (!isOnline()) return;

  const nowIso = new Date().toISOString();

  // 1. Sync pending deletes
  const pendingDeletes = getPendingDeletes();
  if (pendingDeletes.length > 0) {
    try {
      const batch = writeBatch(db);
      const userIdOrCode = auth.currentUser?.uid || 'USER';
      pendingDeletes.forEach((id) => {
        const ref = doc(db, 'notifications', id);
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
          await deleteDoc(doc(db, 'notifications', id));
        } catch {
          // ignore
        }
        removePendingDelete(id);
      }
      console.log(`Synced ${pendingDeletes.length} pending delete(s) successfully.`);
    } catch (err) {
      console.warn('Failed to sync pending deletes:', err);
    }
  }

  // 2. Sync pending reads
  const pendingReads = getPendingReads();
  if (pendingReads.length > 0) {
    try {
      const batch = writeBatch(db);
      pendingReads.forEach((id) => {
        const ref = doc(db, 'notifications', id);
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
        markNotificationSyncedLocally(id, nowIso);
        removePendingRead(id);
      });
      console.log(`Synced ${pendingReads.length} pending read(s) successfully.`);
    } catch (err) {
      console.warn('Failed to sync pending reads:', err);
    }
  }

  // 3. Sync pending creations
  const pending = getPendingNotifications();
  if (pending.length > 0) {
    try {
      const batch = writeBatch(db);
      pending.forEach((n) => {
        const ref = doc(db, 'notifications', n.id);
        batch.set(ref, {
          ...n,
          syncStatus: 'SYNCED',
          serverSyncTime: nowIso,
        });
      });

      await batch.commit();

      pending.forEach((n) => {
        markNotificationSyncedLocally(n.id, nowIso);
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
