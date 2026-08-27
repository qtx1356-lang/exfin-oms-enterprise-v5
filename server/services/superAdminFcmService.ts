import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging, Message } from 'firebase-admin/messaging';
import webpush from 'web-push';

if (process.env.WEB_PUSH_VAPID_PUBLIC_KEY && process.env.WEB_PUSH_VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.WEB_PUSH_VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY
  );
}

export interface WebPushSubscription {
  adminUid: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  registeredAt: string;
  userAgent: string;
}

export interface SuperAdminAlertConfig {
  enabled: boolean;
  recipientUid: string;
  recipientName: string;
  recipientEmail: string;
  recipientFcmToken: string;
  deviceModel?: string;
  devicePlatform?: string;
  notifyCheckIn: boolean;
  notifyCheckOut: boolean;
  notifyOfficeExit?: boolean;
  updatedAt?: string;
  updatedBy?: string;
  webPushSubscription?: WebPushSubscription;
}

export interface AttendanceAlertPayload {
  eventId: string;
  eventType: 'CHECK_IN' | 'AUTO_CHECK_IN' | 'MANUAL_CHECK_IN' | 'CHECK_OUT' | 'WFH' | 'CLIENT_VISIT' | 'OUTDOOR_WORK' | 'OUTSIDE_OFFICE' | 'GEOFENCE_EXIT';
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  attendanceType?: string;
  checkInTime?: string;
  checkOutTime?: string;
  recordedExitTime?: string;
  workingHours?: string;
  distance?: number | string | null;
  townCity?: string;
  eventTime?: string;
  locationDetails?: string;
  source?: string;
}

const CONFIG_DOC_PATH = 'system_settings/attendance_alert_config';

// In-memory cache for recipient configuration
let cachedConfig: SuperAdminAlertConfig | null = null;
let lastConfigFetch = 0;
const CACHE_TTL_MS = 30000; // 30 seconds

export async function getSuperAdminAlertConfig(db: Firestore): Promise<SuperAdminAlertConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastConfigFetch < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const defaultConfig: SuperAdminAlertConfig = {
    enabled: false,
    recipientUid: '',
    recipientName: '',
    recipientEmail: '',
    recipientFcmToken: '',
    deviceModel: '',
    devicePlatform: 'android',
    notifyCheckIn: true,
    notifyCheckOut: true,
    notifyOfficeExit: true,
    updatedAt: new Date().toISOString(),
    updatedBy: 'SYSTEM',
  };

  try {
    const docRef = db.doc(CONFIG_DOC_PATH);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      cachedConfig = {
        ...defaultConfig,
        ...data,
      };
      lastConfigFetch = now;
      return cachedConfig;
    } else {
      // Create initial placeholder doc
      await docRef.set(defaultConfig, { merge: true });
      cachedConfig = defaultConfig;
      lastConfigFetch = now;
      return cachedConfig;
    }
  } catch (err) {
    console.warn('[SuperAdmin FCM] Failed to fetch alert configuration:', err);
    return cachedConfig || defaultConfig;
  }
}

export async function saveSuperAdminAlertConfig(
  db: Firestore,
  update: Partial<SuperAdminAlertConfig>,
  updatedBy: string
): Promise<SuperAdminAlertConfig> {
  const current = await getSuperAdminAlertConfig(db);
  const updated: SuperAdminAlertConfig = {
    ...current,
    ...update,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  const docRef = db.doc(CONFIG_DOC_PATH);
  await docRef.set(updated, { merge: true });

  cachedConfig = updated;
  lastConfigFetch = Date.now();

  console.log(`[SuperAdmin FCM] Alert configuration updated by ${updatedBy}. Enabled: ${updated.enabled}, Token configured: ${!!updated.recipientFcmToken}`);
  return updated;
}

export async function sendSuperAdminAttendanceAlert(
  db: Firestore,
  payload: AttendanceAlertPayload
): Promise<{ success: boolean; skipped?: boolean; messageId?: string; reason?: string }> {
  try {
    // 1. Fetch Config First (needed for idempotency key)
    const config = await getSuperAdminAlertConfig(db);
    if (!config.enabled) {
      return { success: false, skipped: true, reason: 'Alerts globally disabled' };
    }

    if ((!config.recipientFcmToken || config.recipientFcmToken.trim() === '') && !config.webPushSubscription) {
      return { success: false, skipped: true, reason: 'No Super-Admin FCM device or Web Push browser registered' };
    }
    
    // 2. Check Event Type Filtering
    const isCheckIn = payload.eventType === 'CHECK_IN' || payload.eventType === 'AUTO_CHECK_IN' || payload.eventType === 'MANUAL_CHECK_IN' || payload.eventType === 'WFH' || payload.eventType === 'CLIENT_VISIT' || payload.eventType === 'OUTDOOR_WORK';
    const isCheckOut = payload.eventType === 'CHECK_OUT';
    const isExit = payload.eventType === 'OUTSIDE_OFFICE' || payload.eventType === 'GEOFENCE_EXIT';

    if (isCheckIn && !config.notifyCheckIn) {
      return { success: false, skipped: true, reason: 'Check-in alerts disabled in config' };
    }
    if (isCheckOut && !config.notifyCheckOut) {
      return { success: false, skipped: true, reason: 'Check-out alerts disabled in config' };
    }
    if (isExit && !config.notifyOfficeExit) {
      return { success: false, skipped: true, reason: 'Office exit alerts disabled in config' };
    }

    // 3. Idempotency Deduplication Check via Firestore Transaction
    // Use authoritative eventId if available, fallback only if absolutely missing
    const eventId = payload.eventId || `att_alert_${payload.employeeCode}_${payload.eventType}_${payload.eventTime || payload.checkInTime || payload.checkOutTime || Date.now()}`;
    const idempotencyKey = `attendance_push_${eventId}_${payload.eventType}_${config.recipientUid || 'superadmin'}`;
    
    const idempotencyRef = db.collection('attendance_push_delivery_logs').doc(idempotencyKey);
    
    // Construct Clear, Authoritative Push Message
    const empName = payload.employeeName || 'Employee';
    const empCode = payload.employeeCode || payload.employeeId || 'N/A';
    const locStr = payload.townCity ? `${payload.townCity}` : 'Raniganj HQ';
    const distStr = payload.distance !== null && payload.distance !== undefined ? (typeof payload.distance === 'number' ? `${Math.round(payload.distance)}m` : `${payload.distance}`) : '';

    let title = '';
    let body = '';

    if (isCheckOut) {
      // Authoritative checkout time: preserve original geofence exit time if present
      const checkoutTime = payload.recordedExitTime || payload.checkOutTime || payload.eventTime || 'Recorded';
      title = `🔴 Employee Check-Out: ${empName}`;
      body = `${empName} (${empCode}) checked out at ${checkoutTime}.\nLocation: ${locStr}${distStr ? ` (${distStr})` : ''}${payload.workingHours ? ` • Duration: ${payload.workingHours}` : ''}`;
    } else if (isExit) {
      const exitTime = payload.recordedExitTime || payload.eventTime || 'Just now';
      title = `⚠️ Geofence Exit: ${empName}`;
      body = `${empName} (${empCode}) left office perimeter at ${exitTime}.${distStr ? ` Distance: ${distStr}` : ''}`;
    } else {
      // Check-In
      const inTime = payload.checkInTime || payload.eventTime || 'Just now';
      const modeLabel = payload.eventType === 'WFH' ? 'WFH' : payload.eventType === 'CLIENT_VISIT' ? 'Client Visit' : payload.eventType === 'OUTDOOR_WORK' ? 'Outdoor' : payload.attendanceType || 'Office';
      title = `🟢 Employee Check-In: ${empName}`;
      body = `${empName} (${empCode}) checked in at ${inTime} [${modeLabel}].\nLocation: ${locStr}${distStr ? ` • Distance: ${distStr}` : ''}`;
    }
    
    const shouldSend = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(idempotencyRef);
      if (doc.exists) {
        const data = doc.data();
        if (data && (data.status === 'PENDING' || data.status === 'SENT' || data.status === 'DELIVERED')) {
          return false; // Skip duplicate
        }
      }
      
      // Reserve the notification
      transaction.set(idempotencyRef, {
        idempotencyKey,
        eventId,
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode || payload.employeeId,
        employeeName: empName,
        recipientUid: config.recipientUid,
        status: 'PENDING',
        createdAt: FieldValue.serverTimestamp(),
        notificationTitle: title,
        notificationBody: body,
      }, { merge: true });
      
      return true;
    });

    if (!shouldSend) {
      console.log(`[SuperAdmin FCM] Skipping duplicate alert event ID: ${eventId}`);
      return { success: true, skipped: true, reason: 'Duplicate event ID detected via Firestore idempotency' };
    }

    // 4. Send FCM Message to Designated Super-Admin Device
    let messageId: string | undefined;
    let webPushSuccess = false;
    
    try {
      if (config.recipientFcmToken && config.recipientFcmToken.trim() !== '') {
        const message: Message = {
          token: config.recipientFcmToken.trim(),
          notification: {
            title,
            body,
          },
          data: {
            type: 'SUPER_ADMIN_ATTENDANCE_ALERT',
            eventId,
            eventType: payload.eventType,
            employeeId: payload.employeeId,
            employeeCode: payload.employeeCode,
            employeeName: empName,
            checkInTime: payload.checkInTime || '',
            checkOutTime: payload.checkOutTime || '',
            recordedExitTime: payload.recordedExitTime || '',
            timestamp: new Date().toISOString(),
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'exfin_oms_important',
              sound: 'default',
              color: isCheckOut ? '#E11D48' : isExit ? '#F59E0B' : '#10B981',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            },
          },
        };
        const messaging = getMessaging();
        messageId = await messaging.send(message);
      }

      if (config.webPushSubscription && process.env.WEB_PUSH_VAPID_PUBLIC_KEY) {
        try {
          const wpRes = await webpush.sendNotification(
            {
              endpoint: config.webPushSubscription.endpoint,
              keys: {
                p256dh: config.webPushSubscription.p256dh,
                auth: config.webPushSubscription.auth,
              }
            },
            JSON.stringify({
              title,
              body,
              data: {
                type: 'SUPER_ADMIN_ATTENDANCE_ALERT',
                eventId,
                eventType: payload.eventType,
                employeeId: payload.employeeId,
                employeeName: empName
              }
            })
          );
          webPushSuccess = true;
          messageId = messageId || `wp_${Date.now()}`;
        } catch (wpErr: any) {
          console.error('[SuperAdmin FCM] Web Push delivery failed:', wpErr);
          if (wpErr.statusCode === 404 || wpErr.statusCode === 410) {
            // Subscription has expired or is no longer valid
            await db.collection(CONFIG_DOC_PATH).doc('singleton').update({
              webPushSubscription: FieldValue.delete()
            });
            console.log('[SuperAdmin FCM] Removed expired web push subscription.');
          }
          if (!messageId) throw wpErr; // Only throw if native FCM also didn't send
        }
      }
      
      // Update delivery log in Firestore
      await idempotencyRef.set({
        status: 'SENT', // We use SENT, not DELIVERED since FCM only acknowledges acceptance
        recipientFcmToken: config.recipientFcmToken ? config.recipientFcmToken.slice(0, 10) + '...' : null,
        fcmMessageId: messageId,
        webPushSent: webPushSuccess,
        sentAt: new Date().toISOString(),
      }, { merge: true });
      
      console.log(`[SuperAdmin FCM] Attendance push sent to Super-Admin device for ${empName} (${payload.eventType}). MessageId: ${messageId}`);
      return { success: true, messageId };
    } catch (sendErr: any) {
      // Mark as failed in Firestore
      await idempotencyRef.set({
        status: 'FAILED',
        error: sendErr?.message || 'FCM delivery failed',
        failedAt: new Date().toISOString(),
      }, { merge: true });
      
      throw sendErr;
    }

  } catch (err: any) {
    console.error('[SuperAdmin FCM] Failed to send push notification to Super-Admin:', err);
    return { success: false, reason: err?.message || 'FCM delivery failed' };
  }
}

export async function sendSuperAdminTestPush(
  db: Firestore,
  tokenToTest?: string,
  testTitle?: string,
  testBody?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    let token = tokenToTest;
    let webPushSubscription: WebPushSubscription | undefined;
    
    if (!token) {
      const config = await getSuperAdminAlertConfig(db);
      token = config.recipientFcmToken;
      webPushSubscription = config.webPushSubscription;
    }

    if ((!token || token.trim() === '') && !webPushSubscription) {
      return { success: false, error: 'No FCM token or Web Push browser provided or registered in configuration' };
    }

    const title = testTitle || '⚡ EXFIN OMS — Test Alert';
    const body = testBody || 'Push notifications are actively connected to your Super-Admin device.';
    
    let messageId: string | undefined;

    if (token && token.trim() !== '') {
      const message: Message = {
        token: token.trim(),
        notification: {
          title,
          body,
        },
        data: {
          type: 'SUPER_ADMIN_TEST_ALERT',
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            channelId: 'exfin_oms_important',
            sound: 'default',
            color: '#8B5CF6',
          },
        },
      };

      const messaging = getMessaging();
      messageId = await messaging.send(message);
    }
    
    if (webPushSubscription && process.env.WEB_PUSH_VAPID_PUBLIC_KEY) {
      try {
        await webpush.sendNotification(
          {
            endpoint: webPushSubscription.endpoint,
            keys: {
              p256dh: webPushSubscription.p256dh,
              auth: webPushSubscription.auth,
            }
          },
          JSON.stringify({
            title,
            body,
            data: {
              type: 'SUPER_ADMIN_TEST_ALERT'
            }
          })
        );
        messageId = messageId || `wp_test_${Date.now()}`;
      } catch (wpErr: any) {
        console.error('[SuperAdmin FCM] Test Web Push error:', wpErr);
        if (wpErr.statusCode === 404 || wpErr.statusCode === 410) {
          await db.collection(CONFIG_DOC_PATH).doc('singleton').update({
            webPushSubscription: FieldValue.delete()
          });
        }
        if (!messageId) throw wpErr;
      }
    }

    console.log(`[SuperAdmin FCM] Test push sent successfully. MessageId: ${messageId}`);
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[SuperAdmin FCM] Test push error:', err);
    return { success: false, error: err?.message || 'Failed to dispatch FCM test push' };
  }
}
