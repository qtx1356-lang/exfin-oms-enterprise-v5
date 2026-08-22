import { NotificationRecord, parseTimestamp } from '../../types/notification';

const getStorageKeys = () => {
  const currentUserId = localStorage.getItem('registrationId') || localStorage.getItem('deviceId') || 'default';
  return {
    currentUserId,
    notificationsKey: `exfin_notifications_${currentUserId}_v1`,
    deletedNotificationsKey: `exfin_deleted_notifications_${currentUserId}_v1`,
    pendingDeletesKey: `exfin_pending_deletes_${currentUserId}_v1`,
    pendingReadsKey: `exfin_pending_reads_${currentUserId}_v1`
  };
};

export const getPendingDeletes = (): string[] => {
  try {
    const data = localStorage.getItem(getStorageKeys().pendingDeletesKey);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse pending deletes:', err);
    return [];
  }
};

export const addPendingDelete = (id: string): void => {
  try {
    const pending = getPendingDeletes();
    if (!pending.includes(id)) {
      pending.push(id);
      localStorage.setItem(getStorageKeys().pendingDeletesKey, JSON.stringify(pending));
    }
  } catch (err) {
    console.error('Failed to save pending delete:', err);
  }
};

export const removePendingDelete = (id: string): void => {
  try {
    const pending = getPendingDeletes();
    const updated = pending.filter((x) => x !== id);
    localStorage.setItem(getStorageKeys().pendingDeletesKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove pending delete:', err);
  }
};

export const getPendingReads = (): string[] => {
  try {
    const data = localStorage.getItem(getStorageKeys().pendingReadsKey);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse pending reads:', err);
    return [];
  }
};

export const addPendingRead = (id: string): void => {
  try {
    const pending = getPendingReads();
    if (!pending.includes(id)) {
      pending.push(id);
      localStorage.setItem(getStorageKeys().pendingReadsKey, JSON.stringify(pending));
    }
  } catch (err) {
    console.error('Failed to save pending read:', err);
  }
};

export const removePendingRead = (id: string): void => {
  try {
    const pending = getPendingReads();
    const updated = pending.filter((x) => x !== id);
    localStorage.setItem(getStorageKeys().pendingReadsKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove pending read:', err);
  }
};

export const getDeletedNotificationIds = (): string[] => {
  try {
    const data = localStorage.getItem(getStorageKeys().deletedNotificationsKey);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse deleted notification IDs:', err);
    return [];
  }
};

export const addDeletedNotificationId = (id: string): void => {
  try {
    const deleted = getDeletedNotificationIds();
    if (!deleted.includes(id)) {
      deleted.push(id);
      localStorage.setItem(getStorageKeys().deletedNotificationsKey, JSON.stringify(deleted));
    }
  } catch (err) {
    console.error('Failed to save deleted notification ID:', err);
  }
};

export const isNotificationDeletedLocally = (id: string): boolean => {
  const deleted = getDeletedNotificationIds();
  return deleted.includes(id);
};

export const getStoredNotifications = (): NotificationRecord[] => {
  try {
    const data = localStorage.getItem(getStorageKeys().notificationsKey);
    const notifications: NotificationRecord[] = data ? JSON.parse(data) : [];
    const deletedIds = getDeletedNotificationIds();
    return notifications.filter((n) => !deletedIds.includes(n.id) && !n.deleted);
  } catch (err) {
    console.error('Failed to parse local notifications:', err);
    return [];
  }
};

export const saveNotificationLocally = (notification: NotificationRecord): void => {
  try {
    if (isNotificationDeletedLocally(notification.id) || notification.deleted) {
      removeNotificationLocally(notification.id);
      return;
    }
    const notifications = getStoredNotifications();
    const existingIndex = notifications.findIndex((n) => n.id === notification.id);
    if (existingIndex >= 0) {
      notifications[existingIndex] = notification;
    } else {
      notifications.unshift(notification);
    }
    localStorage.setItem(getStorageKeys().notificationsKey, JSON.stringify(notifications));
  } catch (err) {
    console.error('Failed to save notification locally:', err);
  }
};

export const saveMultipleNotificationsLocally = (newNotifs: NotificationRecord[]): void => {
  try {
    const deletedIds = getDeletedNotificationIds();
    const existing = getStoredNotifications();
    const map = new Map<string, NotificationRecord>();
    
    existing.forEach((n) => {
      if (!deletedIds.includes(n.id) && !n.deleted) {
        map.set(n.id, n);
      }
    });
    
    newNotifs.forEach((n) => {
      if (deletedIds.includes(n.id) || n.deleted) {
        map.delete(n.id);
        return;
      }
      const current = map.get(n.id);
      if (!current) {
        map.set(n.id, n);
      } else {
        // If local is PENDING or was marked read locally, preserve the most updated state
        const isLocalNewer = new Date(current.updatedAtDeviceTime) >= new Date(n.updatedAtDeviceTime);
        const mergedRead = current.read || (isLocalNewer ? current.read : n.read);
        const merged: NotificationRecord = {
          ...(isLocalNewer ? current : n),
          read: mergedRead,
          // Keep PENDING syncStatus if local has unsynced changes
          syncStatus: (current.syncStatus === 'PENDING' || n.syncStatus === 'PENDING') ? 'PENDING' : 'SYNCED',
        };
        map.set(n.id, merged);
      }
    });

    const mergedList = Array.from(map.values())
      .filter((n) => !deletedIds.includes(n.id) && !n.deleted)
      .sort((a, b) => {
        const dateA = parseTimestamp(a.timestamp || a.createdAt || a.createdAtDeviceTime);
        const dateB = parseTimestamp(b.timestamp || b.createdAt || b.createdAtDeviceTime);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA;
      });

    localStorage.setItem(getStorageKeys().notificationsKey, JSON.stringify(mergedList));
  } catch (err) {
    console.error('Failed to save multiple notifications locally:', err);
  }
};

export const getPendingNotifications = (): NotificationRecord[] => {
  const notifications = getStoredNotifications();
  return notifications.filter((n) => n.syncStatus === 'PENDING');
};

export const markNotificationSyncedLocally = (id: string, serverSyncTime: string): void => {
  try {
    const notifications = getStoredNotifications();
    const notification = notifications.find((n) => n.id === id);
    if (notification) {
      notification.syncStatus = 'SYNCED';
      notification.serverSyncTime = serverSyncTime;
      localStorage.setItem(getStorageKeys().notificationsKey, JSON.stringify(notifications));
    }
  } catch (err) {
    console.error('Failed to mark notification synced locally:', err);
  }
};

export const removeNotificationLocally = (id: string): void => {
  try {
    addDeletedNotificationId(id);
    const notifications = getStoredNotifications();
    const updated = notifications.filter((n) => n.id !== id);
    localStorage.setItem(getStorageKeys().notificationsKey, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove notification locally:', err);
  }
};

export const removePendingNotification = removeNotificationLocally;

