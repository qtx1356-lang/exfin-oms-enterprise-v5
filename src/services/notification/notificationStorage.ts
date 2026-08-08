import { NotificationRecord } from '../../types/notification';

const NOTIFICATIONS_STORAGE_KEY = 'exfin_notifications_v1';

export const getStoredNotifications = (): NotificationRecord[] => {
  try {
    const data = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Failed to parse local notifications:', err);
    return [];
  }
};

export const saveNotificationLocally = (notification: NotificationRecord): void => {
  try {
    const notifications = getStoredNotifications();
    const existingIndex = notifications.findIndex((n) => n.id === notification.id);
    if (existingIndex >= 0) {
      notifications[existingIndex] = notification;
    } else {
      notifications.unshift(notification);
    }
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
  } catch (err) {
    console.error('Failed to save notification locally:', err);
  }
};

export const saveMultipleNotificationsLocally = (newNotifs: NotificationRecord[]): void => {
  try {
    const existing = getStoredNotifications();
    const map = new Map<string, NotificationRecord>();
    
    existing.forEach((n) => map.set(n.id, n));
    
    newNotifs.forEach((n) => {
      const current = map.get(n.id);
      if (!current || current.syncStatus === 'SYNCED' || new Date(n.updatedAtDeviceTime) >= new Date(current.updatedAtDeviceTime)) {
        map.set(n.id, n);
      }
    });

    const merged = Array.from(map.values()).sort(
      (a, b) => new Date(b.timestamp || b.createdAt || b.createdAtDeviceTime).getTime() - new Date(a.timestamp || a.createdAt || a.createdAtDeviceTime).getTime()
    );

    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(merged));
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
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    }
  } catch (err) {
    console.error('Failed to mark notification synced locally:', err);
  }
};

export const removeNotificationLocally = (id: string): void => {
  try {
    const notifications = getStoredNotifications();
    const updated = notifications.filter((n) => n.id !== id);
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to remove notification locally:', err);
  }
};
