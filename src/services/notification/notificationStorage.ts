import { NotificationRecord, parseTimestamp, isGreetingNotification } from '../../types/notification';

export const getStorageKeys = (explicitUserId?: string) => {
  let currentUserId = explicitUserId;
  if (!currentUserId) {
    const cachedReg = localStorage.getItem('cached_registration_data');
    if (cachedReg) {
      try {
        const parsed = JSON.parse(cachedReg);
        currentUserId = parsed.employeeCode || parsed.id || parsed.uid;
      } catch (e) {}
    }
  }
  if (!currentUserId) {
    currentUserId = localStorage.getItem('registrationId') || undefined;
  }
  if (!currentUserId) {
    currentUserId = 'anonymous_session';
  }
  return {
    currentUserId,
    notificationsKey: `exfin_notifications_${currentUserId}_v2`,
    deletedNotificationsKey: `exfin_deleted_notifications_${currentUserId}_v2`,
    pendingDeletesKey: `exfin_pending_deletes_${currentUserId}_v2`,
    pendingReadsKey: `exfin_pending_reads_${currentUserId}_v2`
  };
};

export const clearNotificationStorageForUser = (userId?: string): void => {
  try {
    const keys = getStorageKeys(userId);
    localStorage.removeItem(keys.notificationsKey);
    localStorage.removeItem(keys.deletedNotificationsKey);
    localStorage.removeItem(keys.pendingDeletesKey);
    localStorage.removeItem(keys.pendingReadsKey);
  } catch (err) {
    console.error('Failed to clear local notification storage:', err);
  }
};

export const dispatchNotificationsUpdated = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('exfin-notifications-updated'));
  }
};

export const clearAllLocalNotificationCaches = (): void => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('exfin_notifications_') || key.startsWith('exfin_deleted_notifications_') || key.startsWith('exfin_pending_deletes_') || key.startsWith('exfin_pending_reads_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.error('Failed to purge notification caches:', err);
  }
};

export const getPendingDeletes = (userId?: string): string[] => {
  try {
    const data = localStorage.getItem(getStorageKeys(userId).pendingDeletesKey);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse pending deletes:', err);
    return [];
  }
};

export const addPendingDelete = (id: string, userId?: string): void => {
  try {
    const pending = getPendingDeletes(userId);
    if (!pending.includes(id)) {
      pending.push(id);
      localStorage.setItem(getStorageKeys(userId).pendingDeletesKey, JSON.stringify(pending));
    }
  } catch (err) {
    console.error('Failed to save pending delete:', err);
  }
};

export const removePendingDelete = (id: string, userId?: string): void => {
  try {
    const pending = getPendingDeletes(userId);
    const updated = pending.filter((x) => x !== id);
    localStorage.setItem(getStorageKeys(userId).pendingDeletesKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove pending delete:', err);
  }
};

export const getPendingReads = (userId?: string): string[] => {
  try {
    const data = localStorage.getItem(getStorageKeys(userId).pendingReadsKey);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse pending reads:', err);
    return [];
  }
};

export const addPendingRead = (id: string, userId?: string): void => {
  try {
    const pending = getPendingReads(userId);
    if (!pending.includes(id)) {
      pending.push(id);
      localStorage.setItem(getStorageKeys(userId).pendingReadsKey, JSON.stringify(pending));
    }
  } catch (err) {
    console.error('Failed to save pending read:', err);
  }
};

export const removePendingRead = (id: string, userId?: string): void => {
  try {
    const pending = getPendingReads(userId);
    const updated = pending.filter((x) => x !== id);
    localStorage.setItem(getStorageKeys(userId).pendingReadsKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove pending read:', err);
  }
};

export const getDeletedNotificationIds = (userId?: string): string[] => {
  try {
    const data = localStorage.getItem(getStorageKeys(userId).deletedNotificationsKey);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse deleted notification IDs:', err);
    return [];
  }
};

export const addDeletedNotificationId = (id: string, userId?: string): void => {
  try {
    const deleted = getDeletedNotificationIds(userId);
    if (!deleted.includes(id)) {
      deleted.push(id);
      localStorage.setItem(getStorageKeys(userId).deletedNotificationsKey, JSON.stringify(deleted));
    }
  } catch (err) {
    console.error('Failed to save deleted notification ID:', err);
  }
};

export const isNotificationDeletedLocally = (id: string, userId?: string): boolean => {
  const deleted = getDeletedNotificationIds(userId);
  return deleted.includes(id);
};

export const getStoredNotifications = (userId?: string): NotificationRecord[] => {
  try {
    const data = localStorage.getItem(getStorageKeys(userId).notificationsKey);
    const notifications: NotificationRecord[] = data ? JSON.parse(data) : [];
    const deletedIds = getDeletedNotificationIds(userId);
    const pendingDeletes = getPendingDeletes(userId);
    const pendingReads = getPendingReads(userId);
    return notifications
      .filter((n) => !deletedIds.includes(n.id) && !n.deleted && !pendingDeletes.includes(n.id) && !isGreetingNotification(n))
      .map((n) => {
        if (pendingReads.includes(n.id)) {
          return { ...n, read: true, isRead: true };
        }
        return n;
      });
  } catch (err) {
    console.error('Failed to parse local notifications:', err);
    return [];
  }
};

export const saveNotificationLocally = (notification: NotificationRecord, userId?: string): void => {
  try {
    if (isNotificationDeletedLocally(notification.id, userId) || notification.deleted) {
      removeNotificationLocally(notification.id, userId);
      return;
    }
    const notifications = getStoredNotifications(userId);
    const existingIndex = notifications.findIndex((n) => n.id === notification.id);
    if (existingIndex >= 0) {
      notifications[existingIndex] = notification;
    } else {
      notifications.unshift(notification);
    }
    localStorage.setItem(getStorageKeys(userId).notificationsKey, JSON.stringify(notifications));
  } catch (err) {
    console.error('Failed to save notification locally:', err);
  }
};

export const saveMultipleNotificationsLocally = (newNotifs: NotificationRecord[], userId?: string): void => {
  try {
    const deletedIds = getDeletedNotificationIds(userId);
    const pendingDeletes = getPendingDeletes(userId);
    const pendingReads = getPendingReads(userId);
    const existing = getStoredNotifications(userId);
    const map = new Map<string, NotificationRecord>();
    
    existing.forEach((n) => {
      if (!deletedIds.includes(n.id) && !n.deleted && !pendingDeletes.includes(n.id)) {
        map.set(n.id, n);
      }
    });
    
    newNotifs.forEach((n) => {
      if (deletedIds.includes(n.id) || n.deleted || pendingDeletes.includes(n.id)) {
        map.delete(n.id);
        return;
      }
      const current = map.get(n.id);
      const isReadPending = pendingReads.includes(n.id);
      if (!current) {
        map.set(n.id, {
          ...n,
          read: isReadPending ? true : (n.read || (n as any).isRead || false),
          isRead: isReadPending ? true : (n.read || (n as any).isRead || false),
        });
      } else {
        // If local is PENDING or was marked read locally, preserve the most updated state
        const isLocalNewer = new Date(current.updatedAtDeviceTime) >= new Date(n.updatedAtDeviceTime);
        const mergedRead = current.read || (current as any).isRead || n.read || (n as any).isRead || isReadPending;
        const merged: NotificationRecord = {
          ...(isLocalNewer ? current : n),
          read: mergedRead,
          isRead: mergedRead,
          // Keep PENDING syncStatus if local has unsynced changes
          syncStatus: (current.syncStatus === 'PENDING' || n.syncStatus === 'PENDING') ? 'PENDING' : 'SYNCED',
        };
        map.set(n.id, merged);
      }
    });

    const mergedList = Array.from(map.values())
      .filter((n) => !deletedIds.includes(n.id) && !n.deleted && !pendingDeletes.includes(n.id))
      .sort((a, b) => {
        const dateA = parseTimestamp(a.timestamp || a.createdAt || a.createdAtDeviceTime);
        const dateB = parseTimestamp(b.timestamp || b.createdAt || b.createdAtDeviceTime);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA;
      });

    localStorage.setItem(getStorageKeys(userId).notificationsKey, JSON.stringify(mergedList));
  } catch (err) {
    console.error('Failed to save multiple notifications locally:', err);
  }
};

export const getPendingNotifications = (userId?: string): NotificationRecord[] => {
  const notifications = getStoredNotifications(userId);
  return notifications.filter((n) => n.syncStatus === 'PENDING');
};

export const markNotificationSyncedLocally = (id: string, serverSyncTime: string, userId?: string): void => {
  try {
    const notifications = getStoredNotifications(userId);
    const notification = notifications.find((n) => n.id === id);
    if (notification) {
      notification.syncStatus = 'SYNCED';
      notification.serverSyncTime = serverSyncTime;
      localStorage.setItem(getStorageKeys(userId).notificationsKey, JSON.stringify(notifications));
    }
  } catch (err) {
    console.error('Failed to mark notification synced locally:', err);
  }
};

export const removeNotificationLocally = (id: string, userId?: string): void => {
  try {
    addDeletedNotificationId(id, userId);
    const notifications = getStoredNotifications(userId);
    const updated = notifications.filter((n) => n.id !== id);
    localStorage.setItem(getStorageKeys(userId).notificationsKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove notification locally:', err);
  }
};

export const removePendingNotification = removeNotificationLocally;

