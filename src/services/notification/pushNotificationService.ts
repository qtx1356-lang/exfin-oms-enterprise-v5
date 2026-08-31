import { NotificationRecord, NotificationPriority } from '../../types/notification';
import { getNotificationSettings } from './notificationSettings';
import { initializeAlertBaseline } from './alertDeduplication';
import { playAlertSound } from './alertSoundService';

// Keys for persistence
const PROCESSED_NOTIFS_KEY = 'exfin_processed_push_notif_ids';
const DEVICE_TOKEN_KEY = 'exfin_device_fcm_token';

// In-memory set for super fast deduplication
const processedNotifSet = new Set<string>();

// Load previously processed notification IDs
const loadProcessedIds = (): Set<string> => {
  if (processedNotifSet.size > 0) return processedNotifSet;
  try {
    const raw = localStorage.getItem(PROCESSED_NOTIFS_KEY);
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      // Keep only last 200 IDs to avoid unbounded memory growth
      const recent = arr.slice(-200);
      recent.forEach((id) => processedNotifSet.add(id));
    }
  } catch (e) {
    console.warn('Error reading processed notification IDs:', e);
  }
  return processedNotifSet;
};

// Mark a notification ID as processed
export const markNotificationProcessed = (notifId: string): void => {
  if (!notifId) return;
  const set = loadProcessedIds();
  set.add(notifId);
  try {
    const arr = Array.from(set).slice(-200);
    localStorage.setItem(PROCESSED_NOTIFS_KEY, JSON.stringify(arr));
  } catch (e) {}
};

// Check if notification has already been alerted/processed
export const isNotificationProcessed = (notifId: string): boolean => {
  if (!notifId) return true;
  const set = loadProcessedIds();
  return set.has(notifId);
};

// Audio Chime Generator using Web Audio API with priority levels
export const playNotificationChime = (
  priority: 'HIGH' | 'URGENT' | 'NORMAL' | 'LOW' = 'NORMAL'
): void => {
  try {
    playAlertSound(priority);
  } catch (err) {
    // Silent catch
  }
};

// Vibration Trigger - Vibrates for active notifications when setting enabled
export const triggerNotificationVibration = (
  priority: NotificationPriority = 'NORMAL'
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.vibrationEnabled) return;

    // Do NOT vibrate for LOW priority
    if (priority === 'LOW') return;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (priority === 'HIGH' || priority === 'URGENT') {
        navigator.vibrate([250, 100, 250]);
      } else {
        navigator.vibrate([150]);
      }
    }
  } catch (e) {}
};

// Initialize baseline on app startup so historical notifications are recorded as processed silently
export const initializeNotificationBaseline = (
  notifications: NotificationRecord[]
): void => {
  if (!notifications || notifications.length === 0) return;
  initializeAlertBaseline(notifications);
  notifications.forEach((n) => {
    if (n.id) {
      markNotificationProcessed(n.id);
    }
  });
};

// Unified incoming notification processor handling single & summary popups + sound + vibration + deduplication
export const processIncomingNotifications = (
  incomingNotifs: NotificationRecord[],
  onToast: (toastData: any) => void
): void => {
  if (!incomingNotifs || incomingNotifs.length === 0) return;

  // Filter out already processed, system technical, or already read notifications
  const unprocessed = incomingNotifs.filter((n) => {
    if (!n.id) return false;
    if (isNotificationProcessed(n.id)) return false;
    if (isSystemTechnicalNotification(n)) return false;
    if (n.read || (n as any).isRead) return false;
    return true;
  });

  if (unprocessed.length === 0) return;

  // Trigger Real-Time Alert Popup for each new incoming alert
  unprocessed.forEach((item) => {
    markNotificationProcessed(item.id);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('exfin-trigger-alert-popup', {
          detail: item,
        })
      );
    }
  });

  if (unprocessed.length === 1) {
    const item = unprocessed[0];

    onToast({
      mode: 'SINGLE',
      notification: item,
    });
  } else {
    // 2 or more new unread notifications arrived together (e.g. app resume or batch sync)
    const count = unprocessed.length;
    const hasCritical = unprocessed.some(
      (n) => n.priority === 'URGENT' || n.priority === 'HIGH'
    );
    const summaryPriority = hasCritical ? 'HIGH' : 'NORMAL';

    onToast({
      mode: 'SUMMARY',
      count,
      title: count <= 5 ? `🔔 ${count} New Notifications` : `🔔 New Notifications`,
      message: `You have ${count} new notifications.`,
      actionLabel: count <= 5 ? 'View Notifications' : 'View All',
      route: '/notifications',
      priority: summaryPriority,
    });
  }
};

// System technical log filter
export const isSystemTechnicalNotification = (
  notif: Partial<NotificationRecord>
): boolean => {
  if (notif.category === 'SYSTEM') return true;
  const text = `${notif.title || ''} ${notif.message || ''} ${
    notif.type || ''
  }`.toLowerCase();
  const blacklist = [
    'database error',
    'server diagnostic',
    'sync diagnostic',
    'deployment info',
    'admin log',
    'application update diagnostic',
    'firestore error',
    'internal error',
    'stack trace',
    'debug log',
    'schema migration',
  ];
  return blacklist.some((term) => text.includes(term));
};

// Check Category Filter against User Settings
export const isCategoryEnabled = (category?: string): boolean => {
  const settings = getNotificationSettings();
  if (!settings.pushEnabled) return false;

  switch (category) {
    case 'PLANNER':
      return settings.taskNotifs;
    case 'LEAVE':
      return settings.leaveNotifs;
    case 'ATTENDANCE':
      return settings.attendanceNotifs;
    default:
      return settings.teamNotifs;
  }
};

// Device Token Registration & Identity Binding
export const registerEmployeeDeviceToken = async (
  employeeCode: string,
  deviceId: string
): Promise<void> => {
  if (!employeeCode || !deviceId) return;

  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const { getDb } = await import('../firebase/db');
    const db = await getDb();
    if (!db) return;
    // Generate or retrieve device push token
    let token = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (!token) {
      token = `fcm_token_${employeeCode}_${deviceId}_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 9)}`;
      localStorage.setItem(DEVICE_TOKEN_KEY, token);
    }

    const docId = `${employeeCode}_${deviceId}`;
    const tokenRef = doc(db, 'employee_fcm_tokens', docId);

    await setDoc(
      tokenRef,
      {
        employeeCode,
        deviceId,
        token,
        active: true,
        platform:
          (typeof window !== 'undefined' &&
            (window as any).Capacitor?.getPlatform()) ||
          'web',
        lastUpdated: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Could not register employee device token:', err);
  }
};

// Invalidate Device Token when logging out or resetting registration
export const invalidateEmployeeDeviceToken = async (
  employeeCode: string,
  deviceId: string
): Promise<void> => {
  if (!deviceId) return;

  try {
    const { doc, collection, query, where, getDocs, deleteDoc } = await import('firebase/firestore');
    const { getDb } = await import('../firebase/db');
    const db = await getDb();
    if (!db) return;
    localStorage.removeItem(DEVICE_TOKEN_KEY);

    // 1. Delete token by docId if employeeCode is known
    if (employeeCode) {
      const docId = `${employeeCode}_${deviceId}`;
      await deleteDoc(doc(db, 'employee_fcm_tokens', docId)).catch(() => {});
    }

    // 2. Query any remaining tokens bound to this deviceId and invalidate
    const q = query(
      collection(db, 'employee_fcm_tokens'),
      where('deviceId', '==', deviceId)
    );
    const snap = await getDocs(q);
    snap.forEach(async (docSnap) => {
      await deleteDoc(doc(db, 'employee_fcm_tokens', docSnap.id)).catch(() => {});
    });
  } catch (err) {
    console.warn('Failed to invalidate device token on reset:', err);
  }
};

// OS Notification Permission Granular States
export type OSNotificationPermissionState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'not_required';

// Ensure Android 8+ Notification Channels are Created
export const ensureNotificationChannelsCreated = async (): Promise<void> => {
  if (
    typeof window !== 'undefined' &&
    (window as any).Capacitor &&
    (window as any).Capacitor.isNativePlatform &&
    (window as any).Capacitor.isNativePlatform()
  ) {
    try {
      const { LocalNotifications } = await import(
        '@capacitor/local-notifications'
      );
      await LocalNotifications.createChannel({
        id: 'exfin_oms_important',
        name: 'EXFIN OMS Urgent & High Priority Alerts',
        description: 'Urgent tasks, leave approvals, and critical messages',
        importance: 5,
        visibility: 1,
        sound: 'notification.wav',
        vibration: true,
      }).catch(() => {});

      await LocalNotifications.createChannel({
        id: 'exfin_oms_normal',
        name: 'EXFIN OMS Standard Updates',
        description: 'Task progress updates and routine team messages',
        importance: 3,
        visibility: 1,
        vibration: false,
      }).catch(() => {});

      // Add listener to open AlertPopup when native Android notification is tapped
      try {
        LocalNotifications.removeAllListeners().catch(() => {});
        LocalNotifications.addListener(
          'localNotificationActionPerformed',
          (action) => {
            const extra = action.notification?.extra;
            if (extra && extra.notifId) {
              const record: NotificationRecord = {
                id: extra.notifId,
                title: action.notification.title || 'Important Notice',
                message: action.notification.body || '',
                priority: extra.priority || 'HIGH',
                category: extra.category || 'SYSTEM',
                type: extra.entityType || 'SYSTEM_ALERT',
                route: extra.route || '',
                read: false,
                timestamp: new Date().toISOString(),
                recipientUserId: '',
                recipientEmployeeCode: '',
                recipientRole: 'EMPLOYEE',
                createdAtDeviceTime: new Date().toISOString(),
                updatedAtDeviceTime: new Date().toISOString(),
                serverSyncTime: '',
                syncStatus: 'SYNCED',
              };
              window.dispatchEvent(
                new CustomEvent('exfin-trigger-alert-popup', { detail: record })
              );
            }
          }
        ).catch(() => {});
      } catch (listenerErr) {}
    } catch (e) {
      console.warn('Error creating notification channels:', e);
    }
  }
};

// Check Real-Time OS Notification Permission State
export const checkOSNotificationPermission =
  async (): Promise<OSNotificationPermissionState> => {
    try {
      // 1. Capacitor Native Environment (Android / iOS)
      if (
        typeof window !== 'undefined' &&
        (window as any).Capacitor &&
        (window as any).Capacitor.isNativePlatform &&
        (window as any).Capacitor.isNativePlatform()
      ) {
        try {
          const { PushNotifications } = await import(
            '@capacitor/push-notifications'
          );
          const pushStatus = await PushNotifications.checkPermissions();
          if (pushStatus.receive === 'granted') {
            return 'granted';
          } else if (pushStatus.receive === 'denied') {
            return 'denied';
          } else if (
            pushStatus.receive === 'prompt' ||
            pushStatus.receive === 'prompt-with-rationale'
          ) {
            return 'prompt';
          }
        } catch (e) {
          // Fallback to LocalNotifications
        }

        try {
          const { LocalNotifications } = await import(
            '@capacitor/local-notifications'
          );
          const localStatus = await LocalNotifications.checkPermissions();
          if (localStatus.display === 'granted') {
            return 'granted';
          } else if (localStatus.display === 'denied') {
            return 'denied';
          } else if (
            localStatus.display === 'prompt' ||
            localStatus.display === 'prompt-with-rationale'
          ) {
            return 'prompt';
          }
        } catch (e) {
          console.warn('LocalNotifications check warning:', e);
        }
      }

      // 2. Standard Web Notification API
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const perm = Notification.permission;
        if (perm === 'granted') return 'granted';
        if (perm === 'denied') return 'denied';
        if (perm === 'default') return 'prompt';
      }
    } catch (err) {
      console.warn('Error checking OS notification permission:', err);
    }
    return 'prompt';
  };

// OS Notification Permission Request Flow
export const requestOSNotificationPermission =
  async (): Promise<OSNotificationPermissionState> => {
    try {
      let granted = false;

      // 1. Capacitor Native Push & Local Notifications
      if (
        typeof window !== 'undefined' &&
        (window as any).Capacitor &&
        (window as any).Capacitor.isNativePlatform &&
        (window as any).Capacitor.isNativePlatform()
      ) {
        try {
          const { PushNotifications } = await import(
            '@capacitor/push-notifications'
          );
          const pushRes = await PushNotifications.requestPermissions();
          if (pushRes.receive === 'granted') {
            granted = true;
            await PushNotifications.register().catch(() => {});
          }
        } catch (pushErr) {
          console.warn('PushNotifications request warning:', pushErr);
        }

        try {
          const { LocalNotifications } = await import(
            '@capacitor/local-notifications'
          );
          const localRes = await LocalNotifications.requestPermissions();
          if (localRes.display === 'granted') {
            granted = true;
          }
        } catch (localErr) {
          console.warn('LocalNotifications request warning:', localErr);
        }

        await ensureNotificationChannelsCreated();

        if (granted) return 'granted';

        return await checkOSNotificationPermission();
      }

      // 2. Standard Web Notification API
      if (typeof window !== 'undefined' && 'Notification' in window) {
        const result = await Notification.requestPermission();
        if (result === 'granted') return 'granted';
        if (result === 'denied') return 'denied';
        return 'prompt';
      }
    } catch (err) {
      console.warn('Error requesting OS notification permission:', err);
    }
    return 'denied';
  };

// Open App Notification Settings in Android Settings
export const openAppNotificationSettings = async (): Promise<boolean> => {
  try {
    if (
      typeof window !== 'undefined' &&
      (window as any).Capacitor &&
      (window as any).Capacitor.isNativePlatform &&
      (window as any).Capacitor.isNativePlatform()
    ) {
      try {
        const cap = (window as any).Capacitor;
        if (
          cap.Plugins &&
          cap.Plugins.App &&
          typeof cap.Plugins.App.openUrl === 'function'
        ) {
          await cap.Plugins.App.openUrl({ url: 'app-settings:' });
          return true;
        }
      } catch (appErr) {
        console.warn('Capacitor openUrl settings warning:', appErr);
      }
    }

    alert(
      'To enable notifications:\n1. Open Android Settings on your device.\n2. Go to Apps -> EXFIN OMS.\n3. Tap Notifications and toggle ON.'
    );
    return false;
  } catch (err) {
    console.warn('Failed to open app notification settings:', err);
    alert('Please open Android Settings -> Apps -> EXFIN OMS -> Notifications.');
    return false;
  }
};

// Send Local Test Push Notification
export const sendLocalTestNotification = async (): Promise<{
  success: boolean;
  message: string;
}> => {
  const permState = await checkOSNotificationPermission();
  if (permState !== 'granted') {
    return {
      success: false,
      message:
        'OS Notification permission is not granted. Please allow notifications first.',
    };
  }

  const testRecord: NotificationRecord = {
    id: `test_notif_${Date.now()}`,
    title: 'EXFIN OMS Test Notification',
    message: 'Push notifications are working correctly.',
    recipientUserId: '',
    recipientEmployeeCode: '',
    recipientRole: 'EMPLOYEE',
    type: 'SYSTEM_ALERT',
    category: 'SYSTEM',
    priority: 'HIGH',
    route: '/notifications',
    read: false,
    timestamp: new Date().toISOString(),
    createdAtDeviceTime: new Date().toISOString(),
    updatedAtDeviceTime: new Date().toISOString(),
    serverSyncTime: '',
    syncStatus: 'SYNCED',
  };

  await triggerOSPushNotification(testRecord);
  playNotificationChime('HIGH');
  triggerNotificationVibration('HIGH');

  return {
    success: true,
    message: 'Test notification delivered successfully!',
  };
};

// Trigger Android / OS Background Push Notification
export const triggerOSPushNotification = async (
  notif: NotificationRecord
): Promise<void> => {
  try {
    const priority = notif.priority || 'NORMAL';

    // Requirement 3: LOW priority is strictly bell/in-app ONLY.
    // Do NOT create OS push notifications or sound/vibration for LOW priority.
    if (priority === 'LOW') {
      return;
    }

    const title = notif.title || 'EXFIN OMS Alert';
    const body = notif.message || '';
    const channelId =
      priority === 'HIGH' || priority === 'URGENT'
        ? 'exfin_oms_important'
        : 'exfin_oms_normal';

    // 1. Try Capacitor LocalNotifications if available
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      try {
        const { LocalNotifications } = await import(
          '@capacitor/local-notifications'
        );
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'granted') {
          const numericId = Math.abs(
            notif.id
              .split('')
              .reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
          ) % 100000;

          await LocalNotifications.schedule({
            notifications: [
              {
                title,
                body,
                id: numericId || Date.now() % 100000,
                schedule: { at: new Date(Date.now() + 100) },
                channelId,
                extra: {
                  route: notif.route,
                  entityType: notif.entityType,
                  entityId: notif.entityId,
                  notifId: notif.id,
                  priority,
                },
              },
            ],
          });
          return;
        }
      } catch (e) {}
    }

    // 2. Try Service Worker Notification
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.showNotification(title, {
          body,
          icon: '/manifest-icon-192.png',
          badge: '/manifest-icon-192.png',
          data: {
            route: notif.route,
            entityType: notif.entityType,
            entityId: notif.entityId,
            notifId: notif.id,
            priority,
          },
          tag: notif.id,
        });
        return;
      }
    }

    // 3. Fallback Web Notification
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      const n = new Notification(title, {
        body,
        icon: '/manifest-icon-192.png',
      });
      n.onclick = () => {
        n.close();
        if (typeof window !== 'undefined' && notif.route) {
          window.location.hash = notif.route;
        }
      };
    }
  } catch (err) {
    console.warn('Failed to trigger OS Push Notification:', err);
  }
};

// Convenient wrapper for server/central notification service
export const sendPushNotification = async (payload: {
  employeeCode: string;
  title: string;
  body: string;
  data?: any;
}): Promise<void> => {
  await triggerOSPushNotification({
    id: `push_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: payload.title,
    message: payload.body,
    recipientEmployeeCode: payload.employeeCode,
    recipientUserId: '',
    recipientRole: 'EMPLOYEE',
    type: payload.data?.type || 'SYSTEM_ALERT',
    category: 'SYSTEM',
    priority: 'NORMAL',
    route: '/notifications',
    read: false,
    timestamp: new Date().toISOString(),
    createdAtDeviceTime: new Date().toISOString(),
    updatedAtDeviceTime: new Date().toISOString(),
    serverSyncTime: '',
    syncStatus: 'SYNCED',
  });
};

// Smart Summary Batch Queue for rapid normal/low notifications
let pendingBatch: NotificationRecord[] = [];
let batchTimer: any = null;

const flushBatch = (
  onInAppToast: (notif: NotificationRecord) => void
) => {
  if (pendingBatch.length === 0) return;

  const items = [...pendingBatch];
  pendingBatch = [];
  batchTimer = null;

  if (items.length === 1) {
    const notif = items[0];
    const priority = notif.priority || 'NORMAL';
    const isAppVisible =
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible';

    if (isAppVisible) {
      onInAppToast(notif);
      playNotificationChime(priority);
      triggerNotificationVibration(priority);
    } else {
      triggerOSPushNotification(notif);
      playNotificationChime(priority);
      triggerNotificationVibration(priority);
    }
  } else {
    // Smart Summary: Multiple updates grouped together
    const summaryCount = items.length;
    const firstTitle = items[0]?.title || 'Activity Update';
    const summaryNotif: NotificationRecord = {
      id: `summary_${Date.now()}`,
      type: 'SYSTEM_ALERT',
      category: 'SYSTEM',
      priority: 'NORMAL',
      title: `EXFIN OMS — ${summaryCount} New Updates 🔔`,
      message: `${summaryCount} activity updates received (${firstTitle}, and more).`,
      recipientUserId: items[0]?.recipientUserId || '',
      recipientEmployeeCode: items[0]?.recipientEmployeeCode || '',
      recipientRole: 'EMPLOYEE',
      route: '/notifications',
      read: false,
      timestamp: new Date().toISOString(),
      createdAtDeviceTime: new Date().toISOString(),
      updatedAtDeviceTime: new Date().toISOString(),
      serverSyncTime: '',
      syncStatus: 'SYNCED',
    };

    const isAppVisible =
      typeof document !== 'undefined' &&
      document.visibilityState === 'visible';

    if (isAppVisible) {
      onInAppToast(summaryNotif);
      playNotificationChime('NORMAL'); // soft single tone
    } else {
      triggerOSPushNotification(summaryNotif);
      playNotificationChime('NORMAL');
    }
  }
};

// Main Real-Time Push Notification Engine Listener
export const initRealtimePushListener = (
  currentUser: { id?: string; employeeCode?: string },
  onInAppToast: (toastData: any) => void
): (() => void) => {
  if (!currentUser || !currentUser.employeeCode) {
    return () => {};
  }

  const empCode = currentUser.employeeCode;
  const startTime = Date.now() - 30000; // Look back up to 30s to catch newly created items

  let unsub: (() => void) | null = null;
  let isCancelled = false;

  const startListener = async () => {
    try {
      const { collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getDb } = await import('../firebase/db');
      const db = await getDb();
      
      if (isCancelled || !db) return;

      // Query notifications created specifically for this employee (Identity Isolation)
      const q = query(
        collection(db, 'notifications'),
        where('recipientEmployeeCode', '==', empCode)
      );

      unsub = onSnapshot(
        q,
        (snapshot) => {
          const incoming: NotificationRecord[] = [];

          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' || change.type === 'modified') {
              const docData = change.doc.data();
              const notif: NotificationRecord = {
                id: change.doc.id,
                ...docData,
              } as NotificationRecord;

              // 1. Strict Identity Isolation Check
              if (
                notif.recipientEmployeeCode &&
                notif.recipientEmployeeCode !== empCode
              ) {
                return;
              }

              // 2. Skip system technical logs
              if (isSystemTechnicalNotification(notif)) {
                return;
              }

              // 3. Check duplicate protection
              if (isNotificationProcessed(notif.id)) {
                return;
              }

              // Check timestamp freshness
              const notifTime = new Date(
                notif.timestamp ||
                  notif.createdAt ||
                  notif.createdAtDeviceTime ||
                  Date.now()
              ).getTime();

              // If old notification loaded during initial fetch, mark processed & don't ring
              if (notifTime < startTime) {
                markNotificationProcessed(notif.id);
                return;
              }

              // 4. Check Category user preference settings
              if (!isCategoryEnabled(notif.category)) {
                markNotificationProcessed(notif.id);
                return;
              }

              incoming.push(notif);
            }
          });

          if (incoming.length > 0) {
            processIncomingNotifications(incoming, onInAppToast);
          }
        },
        (err) => {
          console.warn('Real-time push notification listener warning:', err);
        }
      );
    } catch (err) {
      console.warn('Failed to start real-time push listener:', err);
    }
  };

  startListener();

  return () => {
    isCancelled = true;
    if (unsub) unsub();
  };
};
