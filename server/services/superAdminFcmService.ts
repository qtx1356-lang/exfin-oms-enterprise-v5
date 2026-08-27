import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getMessaging, Message } from 'firebase-admin/messaging';

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

// In-memory idempotency deduplication set
const recentAlertEventIds = new Map<string, number>();

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
    // 1. Idempotency Deduplication Check
    const eventId = payload.eventId || `att_alert_${payload.employeeCode}_${payload.eventType}_${payload.eventTime || payload.checkInTime || payload.checkOutTime || Date.now()}`;
    const now = Date.now();

    // Clean up old deduplication entries (> 1 hour)
    if (recentAlertEventIds.size > 500) {
      for (const [id, timestamp] of recentAlertEventIds.entries()) {
        if (now - timestamp > 3600000) {
          recentAlertEventIds.delete(id);
        }
      }
    }

    if (recentAlertEventIds.has(eventId)) {
      console.log(`[SuperAdmin FCM] Skipping duplicate alert event ID: ${eventId}`);
      return { success: true, skipped: true, reason: 'Duplicate event ID' };
    }

    // 2. Fetch Config
    const config = await getSuperAdminAlertConfig(db);
    if (!config.enabled) {
      return { success: false, skipped: true, reason: 'Alerts globally disabled' };
    }

    if (!config.recipientFcmToken || config.recipientFcmToken.trim() === '') {
      return { success: false, skipped: true, reason: 'No Super-Admin FCM device token registered' };
    }

    // 3. Check Event Type Filtering
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

    // 4. Construct Clear, Authoritative Push Message
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

    // 5. Send FCM Message to Designated Super-Admin Device
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
    const messageId = await messaging.send(message);

    // Record idempotency
    recentAlertEventIds.set(eventId, now);

    // Record delivery log in Firestore
    try {
      const logRef = db.collection('attendance_alert_logs').doc(eventId);
      await logRef.set({
        eventId,
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: empName,
        recipientUid: config.recipientUid,
        recipientFcmToken: config.recipientFcmToken.slice(0, 10) + '...',
        title,
        body,
        status: 'DELIVERED',
        fcmMessageId: messageId,
        sentAt: new Date().toISOString(),
        serverTimestamp: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (logErr) {
      console.warn('[SuperAdmin FCM] Log save warning:', logErr);
    }

    console.log(`[SuperAdmin FCM] Attendance push sent to Super-Admin device for ${empName} (${payload.eventType}). MessageId: ${messageId}`);
    return { success: true, messageId };
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
    if (!token) {
      const config = await getSuperAdminAlertConfig(db);
      token = config.recipientFcmToken;
    }

    if (!token || token.trim() === '') {
      return { success: false, error: 'No FCM token provided or registered in configuration' };
    }

    const title = testTitle || '⚡ EXFIN OMS — Super-Admin Test Alert';
    const body = testBody || 'Push notifications are actively connected to your Super-Admin Android device.';

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
    const messageId = await messaging.send(message);

    console.log(`[SuperAdmin FCM] Test push sent successfully. MessageId: ${messageId}`);
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[SuperAdmin FCM] Test push error:', err);
    return { success: false, error: err?.message || 'Failed to dispatch FCM test push' };
  }
}
