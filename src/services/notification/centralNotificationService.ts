import { createNotification } from './notificationService';
import { sendPushNotification } from './pushNotificationService';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { NotificationCategory, NotificationPriority, NotificationRecord, NotificationType } from '../../types/notification';

export interface CentralNotificationPayload {
  employeeCode: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority?: NotificationPriority;
  allowedChannels?: ('IN_APP' | 'PUSH')[];
  entityId?: string;
  entityType?: string;
}

/**
 * Centralized Multi-Channel Notification Router
 * Manages IN_APP and PUSH delivery securely and authoritatively per employee.
 */
export async function sendNotification(payload: CentralNotificationPayload): Promise<NotificationRecord | null> {
  const allowedChannels = payload.allowedChannels || ['IN_APP', 'PUSH'];
  let userId: string | undefined = undefined;

  // 1. Fetch authoritative employee profile to resolve registration ID
  if (db && payload.employeeCode) {
    try {
      const q = query(collection(db, 'registrations'), where('employeeCode', '==', payload.employeeCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        userId = snap.docs[0].id;
      }
    } catch (err) {
      console.warn('Could not resolve employee details for central notification routing:', err);
    }
  }

  const activeChannels: string[] = ['IN_APP'];

  // 2. Process Push Notification channel if specified
  if (allowedChannels.includes('PUSH')) {
    activeChannels.push('PUSH');
    try {
      await sendPushNotification({
        employeeCode: payload.employeeCode,
        title: payload.title,
        body: payload.message,
        data: {
          type: payload.type,
          entityId: payload.entityId,
          entityType: payload.entityType
        }
      });
    } catch (pushErr) {
      console.warn('Push notification delivery failed:', pushErr);
    }
  }

  // 3. Create single authoritative In-App Notification Record
  const notificationRecord = await createNotification({
    recipientEmployeeCode: payload.employeeCode,
    recipientUserId: userId,
    type: payload.type,
    category: payload.category,
    priority: payload.priority || 'NORMAL',
    title: payload.title,
    message: payload.message,
    entityId: payload.entityId,
    entityType: payload.entityType,
    channels: activeChannels
  } as any);

  return notificationRecord;
}
