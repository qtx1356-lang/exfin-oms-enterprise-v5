import { createNotification, findNotificationByIdempotencyKey } from './notificationService';
import { sendPushNotification } from './pushNotificationService';
import { dispatchEmailNotification } from './emailService';
import { dispatchSmsNotification } from './smsService';
import { getAdminNotificationMatrix } from './adminNotificationConfig';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { 
  NotificationCategory, 
  NotificationPriority, 
  NotificationRecord, 
  NotificationType,
  ChannelDeliveryStatus
} from '../../types/notification';

export interface CentralNotificationPayload {
  employeeCode: string;
  type: NotificationType | string;
  category: NotificationCategory;
  title: string;
  message: string;
  priority?: NotificationPriority;
  allowedChannels?: ('IN_APP' | 'EMAIL' | 'SMS' | 'PUSH')[];
  entityId?: string;
  entityType?: string;
  recipientEmail?: string;
  recipientMobile?: string;
  source?: string;
}

/**
 * Centralized Multi-Channel Notification Router
 * Manages SINGLE SOURCE OF TRUTH backend notification record with multi-channel delivery tracking.
 */
export async function sendNotification(payload: CentralNotificationPayload): Promise<NotificationRecord | null> {
  const idempotencyKey = `${payload.type}_${payload.entityId || 'general'}_${payload.employeeCode}`.replace(/[^a-zA-Z0-9_]/g, '_');

  // Idempotency check: prevent duplicate notifications for the exact same event
  const existing = await findNotificationByIdempotencyKey(idempotencyKey);
  if (existing) {
    console.log(`[Notification Router] Idempotent hit for key ${idempotencyKey}. Skipping duplicate creation.`);
    return existing;
  }

  // 1. Fetch authoritative recipient profile if not fully passed
  let userId: string | undefined = undefined;
  let email: string | undefined = payload.recipientEmail;
  let mobile: string | undefined = payload.recipientMobile;

  if (db && payload.employeeCode) {
    try {
      const q = query(collection(db, 'registrations'), where('employeeCode', '==', payload.employeeCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const reg = snap.docs[0].data();
        userId = snap.docs[0].id;
        if (!email) email = reg.email || reg.officialEmail;
        if (!mobile) mobile = reg.phone || reg.mobileNumber || reg.whatsappNumber;
      }
    } catch (err) {
      console.warn('Could not resolve employee details for notification routing:', err);
    }
  }

  // 2. Fetch admin configuration matrix to know configured channels for this event
  const matrix = await getAdminNotificationMatrix();
  const config = matrix.find((m) => m.eventType === payload.type || m.category === payload.category);

  const enableInApp = config ? config.inApp : true;
  const enableEmail = config ? config.email : true;
  const enableSms = config ? config.sms : false;
  const enablePush = config ? config.push : true;

  const activeChannels: string[] = ['IN_APP'];
  let inAppStatus: ChannelDeliveryStatus = 'DELIVERED';
  let emailStatus: ChannelDeliveryStatus = 'NOT_REQUIRED';
  let smsStatus: ChannelDeliveryStatus = 'NOT_REQUIRED';
  let pushStatus: ChannelDeliveryStatus = 'NOT_REQUIRED';

  // 3. Email Dispatch (Secondary)
  if (enableEmail && email) {
    activeChannels.push('EMAIL');
    emailStatus = await dispatchEmailNotification({
      recipientEmail: email,
      title: payload.title,
      message: payload.message,
      category: payload.category,
    });
  }

  // 4. SMS Dispatch (For critical notifications)
  if (enableSms && mobile) {
    activeChannels.push('SMS');
    smsStatus = await dispatchSmsNotification({
      recipientMobile: mobile,
      message: `${payload.title}: ${payload.message}`,
    });
  }

  // 5. Android Push Dispatch (Optional / Best effort)
  if (enablePush) {
    activeChannels.push('PUSH');
    try {
      await sendPushNotification({
        employeeCode: payload.employeeCode,
        title: payload.title,
        body: payload.message,
        data: {
          type: payload.type,
          entityId: payload.entityId,
          entityType: payload.entityType,
        },
      });
      pushStatus = 'SENT';
    } catch (pushErr) {
      console.warn('Push notification delivery status update (non-blocking):', pushErr);
      pushStatus = 'BLOCKED';
    }
  }

  // 6. Create SINGLE authoritative Notification Record
  const notificationRecord = await createNotification({
    idempotencyKey,
    recipientEmployeeCode: payload.employeeCode,
    recipientUserId: userId,
    recipientEmail: email,
    recipientMobile: mobile,
    type: payload.type,
    category: payload.category,
    priority: payload.priority || 'NORMAL',
    title: payload.title,
    message: payload.message,
    entityId: payload.entityId,
    entityType: payload.entityType,
    channels: activeChannels,
    inAppStatus,
    emailStatus,
    smsStatus,
    pushStatus,
    source: payload.source || 'SYSTEM',
  } as any);

  return notificationRecord;
}
