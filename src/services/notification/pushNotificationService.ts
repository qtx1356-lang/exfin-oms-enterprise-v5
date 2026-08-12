import { db } from '../firebase/config';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { NotificationRecord } from '../../types/notification';
import { getNotificationSettings } from './notificationSettings';

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
    const settings = getNotificationSettings();
    if (!settings.soundEnabled) return;

    // LOW priority is strictly silent
    if (priority === 'LOW') return;

    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (priority === 'HIGH' || priority === 'URGENT') {
      // Two-tone bright chime for HIGH/URGENT (C5 -> G5 -> C6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(783.99, now + 0.12); // G5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1046.5, now + 0.12); // C6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.45);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } else {
      // Soft single subtle tone for NORMAL
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    }
  } catch (err) {
    // Silent catch
  }
};

// Vibration Trigger - Vibrates ONLY for HIGH / URGENT priority
export const triggerNotificationVibration = (
  priority: 'HIGH' | 'URGENT' | 'NORMAL' | 'LOW' = 'NORMAL'
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.vibrationEnabled) return;

    // Do NOT vibrate for LOW or NORMAL priority
    if (priority !== 'HIGH' && priority !== 'URGENT') return;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch (e) {}
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
  if (!employeeCode || !deviceId || !db) return;

  try {
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
  if (!db || !deviceId) return;

  try {
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

// OS Notification Permission Request Flow
export const requestOSNotificationPermission = async (): Promise<boolean> => {
  try {
    // 1. Capacitor Native Push/Local Notifications
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      try {
        const { LocalNotifications } = await import(
          '@capacitor/local-notifications'
        );
        const perm = await LocalNotifications.requestPermissions();
        if (perm.display === 'granted') {
          await LocalNotifications.createChannel({
            id: 'exfin_oms_important',
            name: 'EXFIN OMS Urgent & High Priority Alerts',
            description:
              'Urgent tasks, leave approvals, and critical messages',
            importance: 4,
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

          return true;
        }
      } catch (capErr) {
        console.warn('Capacitor LocalNotifications request warning:', capErr);
      }
    }

    // 2. Web Notification API
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const result = await Notification.requestPermission();
      return result === 'granted';
    }
  } catch (err) {
    console.warn('Error requesting notification permission:', err);
  }
  return false;
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
  onInAppToast: (notif: NotificationRecord) => void
): (() => void) => {
  if (!db || !currentUser || !currentUser.employeeCode) {
    return () => {};
  }

  const empCode = currentUser.employeeCode;
  const startTime = Date.now() - 30000; // Look back up to 30s to catch newly created items

  // Query notifications created specifically for this employee (Identity Isolation)
  const q = query(
    collection(db, 'notifications'),
    where('recipientEmployeeCode', '==', empCode)
  );

  const unsub = onSnapshot(
    q,
    (snapshot) => {
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

          // Mark as processed immediately so duplicate snapshots don't re-trigger
          markNotificationProcessed(notif.id);

          const priority = notif.priority || 'NORMAL';

          // 5. HIGH & URGENT Priority Notifications: Bypass batching, deliver immediately!
          if (priority === 'HIGH' || priority === 'URGENT') {
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
            return;
          }

          // 6. NORMAL & LOW Priority: Add to Smart Summary batch queue (2.0s buffer window)
          pendingBatch.push(notif);

          if (batchTimer) {
            clearTimeout(batchTimer);
          }

          batchTimer = setTimeout(() => {
            flushBatch(onInAppToast);
          }, 2000);
        }
      });
    },
    (err) => {
      console.warn('Real-time push notification listener warning:', err);
    }
  );

  return unsub;
};
