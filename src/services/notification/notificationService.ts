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
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { NotificationRecord, NotificationType, NotificationCategory, NotificationPriority } from '../../types/notification';
import {
  getStoredNotifications,
  saveNotificationLocally,
  saveMultipleNotificationsLocally,
  getPendingNotifications,
  markNotificationSyncedLocally,
  removeNotificationLocally,
} from './notificationStorage';

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
 * Create a single notification with duplicate protection and offline-first persistence
 */
export const createNotification = async (
  data: Partial<NotificationRecord>
): Promise<NotificationRecord> => {
  const nowIso = new Date().toISOString();
  
  const recipientCode = data.recipientEmployeeCode || 'SYSTEM';
  const notifId = data.id || generateNotificationId(data.type || 'SYSTEM', recipientCode, data.entityId);

  const newNotif: NotificationRecord = {
    id: notifId,
    type: data.type || 'SYSTEM_ALERT',
    category: data.category || 'SYSTEM',
    title: data.title || 'System Alert',
    message: data.message || '',
    recipientUserId: data.recipientUserId || '',
    recipientEmployeeCode: recipientCode,
    recipientRole: data.recipientRole || 'EMPLOYEE',
    recipientTeamLeaderId: data.recipientTeamLeaderId || '',
    priority: data.priority || 'NORMAL',
    route: data.route || '',
    entityId: data.entityId || '',
    entityType: data.entityType || '',
    read: false,
    timestamp: nowIso,
    createdAtDeviceTime: data.createdAtDeviceTime || nowIso,
    updatedAtDeviceTime: nowIso,
    serverSyncTime: '',
    syncStatus: 'PENDING',
  };

  // Save locally first so it shows up immediately
  saveNotificationLocally(newNotif);

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
}): Promise<NotificationRecord[]> => {
  // First, fetch whatever is stored locally
  const localNotifications = getStoredNotifications();
  
  // Filter local based on permissions
  const filterAllowedLocal = (n: NotificationRecord) => {
    // SYSTEM alerts are visible to everyone
    if (n.recipientRole === 'SYSTEM' || n.recipientEmployeeCode === 'SYSTEM') return true;
    
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

    // Admins and Super Admins can see ADMIN/SUPER_ADMIN alerts or system alerts
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
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
      queries.push(query(notifCollection, where('recipientEmployeeCode', '==', user.employeeCode)));
    }

    // Query 2: Scoped directly by recipientUserId
    if (user.id) {
      queries.push(query(notifCollection, where('recipientUserId', '==', user.id)));
    }

    // Query 3: Scoped by recipientRole SYSTEM/public
    queries.push(query(notifCollection, where('recipientEmployeeCode', '==', 'SYSTEM')));

    // Query 4: Team-specific notifications for Team Leaders
    if (user.role === 'TEAM_LEADER') {
      queries.push(query(notifCollection, where('recipientTeamLeaderId', '==', user.id)));
      if (user.employeeCode) {
        queries.push(query(notifCollection, where('recipientTeamLeaderId', '==', user.employeeCode)));
      }
    }

    // Query 5: Role-based notifications for Admins / Super Admins
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      queries.push(query(notifCollection, where('recipientRole', '==', 'ADMIN')));
      queries.push(query(notifCollection, where('recipientRole', '==', 'SUPER_ADMIN')));
    }

    // Execute queries in parallel and merge
    const snapshots = await Promise.all(queries.map(q => getDocs(q)));
    
    snapshots.forEach((snap) => {
      snap.forEach((docSnap) => {
        const d = docSnap.data() as any;
        // Support backward compatibility (timestamp || createdAt)
        const canonicalTime = d.timestamp || d.createdAt || nowIsoString();
        const record: NotificationRecord = {
          id: d.id,
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
          read: d.read || false,
          timestamp: canonicalTime,
          createdAtDeviceTime: d.createdAtDeviceTime || canonicalTime,
          updatedAtDeviceTime: d.updatedAtDeviceTime || canonicalTime,
          serverSyncTime: d.serverSyncTime || '',
          syncStatus: 'SYNCED',
        };
        fetchedMap.set(record.id, record);
      });
    });

    const serverNotifs = Array.from(fetchedMap.values());
    if (serverNotifs.length > 0) {
      saveMultipleNotificationsLocally(serverNotifs);
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

/**
 * Mark a single notification as read
 */
export const markNotificationRead = async (id: string): Promise<void> => {
  const nowIso = new Date().toISOString();
  const local = getStoredNotifications();
  const index = local.findIndex((n) => n.id === id);
  if (index >= 0) {
    local[index].read = true;
    local[index].updatedAtDeviceTime = nowIso;
    local[index].syncStatus = 'PENDING';
    saveNotificationLocally(local[index]);
  }

  if (isOnline()) {
    try {
      const docRef = doc(db, 'notifications', id);
      await setDoc(docRef, {
        read: true,
        updatedAtDeviceTime: nowIso,
        syncStatus: 'SYNCED',
        serverSyncTime: nowIso,
      }, { merge: true });
      markNotificationSyncedLocally(id, nowIso);
    } catch (err) {
      console.warn('Failed to mark read on server, retained locally:', err);
    }
  }
};

/**
 * Mark all notifications as read for current user
 */
export const markAllNotificationsRead = async (user: {
  id: string;
  employeeCode: string;
  role: string;
}): Promise<void> => {
  const nowIso = new Date().toISOString();
  const local = getStoredNotifications();
  
  const updatedNotifs: NotificationRecord[] = [];
  
  local.forEach((n) => {
    const isOwn = n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
    const isTLMgmt = user.role === 'TEAM_LEADER' && n.recipientTeamLeaderId === user.id;
    const isAdminType = (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (n.recipientRole === 'ADMIN' || n.recipientRole === 'SUPER_ADMIN');
    
    if (!n.read && (isOwn || isTLMgmt || isAdminType || n.recipientRole === 'SYSTEM')) {
      n.read = true;
      n.updatedAtDeviceTime = nowIso;
      n.syncStatus = 'PENDING';
      updatedNotifs.push(n);
    }
  });

  if (updatedNotifs.length === 0) return;

  saveMultipleNotificationsLocally(local);

  if (isOnline()) {
    try {
      const batch = writeBatch(db);
      updatedNotifs.forEach((n) => {
        const ref = doc(db, 'notifications', n.id);
        batch.update(ref, {
          read: true,
          updatedAtDeviceTime: nowIso,
          syncStatus: 'SYNCED',
          serverSyncTime: nowIso,
        });
      });
      await batch.commit();
      updatedNotifs.forEach((n) => {
        markNotificationSyncedLocally(n.id, nowIso);
      });
    } catch (err) {
      console.warn('Failed to batch mark all read on server:', err);
    }
  }
};

/**
 * Get count of unread notifications locally
 */
export const getUnreadNotificationCount = (user: {
  id: string;
  employeeCode: string;
  role: string;
}): number => {
  const local = getStoredNotifications();
  return local.filter((n) => {
    if (n.read) return false;
    
    if (n.recipientRole === 'SYSTEM' || n.recipientEmployeeCode === 'SYSTEM') return true;
    
    if (user.role === 'EMPLOYEE') {
      return n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
    }

    if (user.role === 'TEAM_LEADER') {
      const isOwn = n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
      const isTeamMgmt = n.recipientTeamLeaderId === user.id || n.recipientTeamLeaderId === user.employeeCode;
      return isOwn || isTeamMgmt;
    }

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      const isOwn = n.recipientUserId === user.id || n.recipientEmployeeCode === user.employeeCode;
      const isAdminType = n.recipientRole === 'ADMIN' || n.recipientRole === 'SUPER_ADMIN';
      return isOwn || isAdminType;
    }

    return false;
  }).length;
};

/**
 * Delete / Archive a notification
 */
export const deleteNotification = async (id: string): Promise<void> => {
  removeNotificationLocally(id);
  if (isOnline()) {
    try {
      const docRef = doc(db, 'notifications', id);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
    }
  }
};

/**
 * Synchronize any pending offline notifications
 */
export const syncPendingNotifications = async (): Promise<void> => {
  const pending = getPendingNotifications();
  if (pending.length === 0) return;

  try {
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    
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
    console.log(`Synced ${pending.length} pending notification(s) successfully.`);
  } catch (err) {
    console.warn('Failed to sync pending notifications:', err);
  }
};

function nowIsoString(): string {
  return new Date().toISOString();
}
