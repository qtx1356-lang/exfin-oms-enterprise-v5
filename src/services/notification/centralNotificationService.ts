import { createNotification } from './notificationService';
import { sendPushNotification } from './pushNotificationService';
import {
  getWhatsAppConfig,
  getEmployeeWhatsAppPreference,
  normalizeIndianPhoneNumber,
  sendWhatsAppTemplateMessage
} from '../whatsapp/whatsappService';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { NotificationCategory, NotificationPriority, NotificationRecord, NotificationType } from '../../types/notification';

export interface CentralNotificationPayload {
  employeeCode: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  priority?: NotificationPriority;
  allowedChannels?: ('IN_APP' | 'PUSH' | 'WHATSAPP')[];
  whatsappTemplateId?: string;
  templateParams?: Record<string, string>;
  entityId?: string;
  entityType?: string;
}

/**
 * Centralized Multi-Channel Notification Router
 * Manages IN_APP, PUSH, and WHATSAPP delivery securely andauthoritatively per employee.
 */
export async function sendNotification(payload: CentralNotificationPayload): Promise<NotificationRecord | null> {
  const allowedChannels = payload.allowedChannels || ['IN_APP', 'PUSH'];
  let mobileNumber: string | undefined = undefined;
  let userId: string | undefined = undefined;

  // 1. Fetch authoritative employee profile to resolve registration ID & Mobile Number
  if (db && payload.employeeCode) {
    try {
      const q = query(collection(db, 'registrations'), where('employeeCode', '==', payload.employeeCode));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data();
        userId = snap.docs[0].id;
        mobileNumber = data.mobileNumber || data.phone || data.mobile;
      }
    } catch (err) {
      console.warn('Could not resolve employee details for central notification routing:', err);
    }
  }

  let whatsappStatus: 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | undefined = undefined;
  const activeChannels: string[] = ['IN_APP'];

  // 2. Process WhatsApp channel if specified in allowed channels
  if (allowedChannels.includes('WHATSAPP') && payload.whatsappTemplateId) {
    try {
      const waConfig = await getWhatsAppConfig();
      const empPref = await getEmployeeWhatsAppPreference(payload.employeeCode);

      const targetMobile = mobileNumber || empPref.mobileNumber;
      const normalizedPhone = normalizeIndianPhoneNumber(targetMobile);

      if (waConfig.enabled && empPref.optedIn && normalizedPhone) {
        activeChannels.push('WHATSAPP');
        whatsappStatus = 'QUEUED';

        // Dispatch via WhatsApp Business API
        const waResult = await sendWhatsAppTemplateMessage({
          employeeCode: payload.employeeCode,
          recipientMobile: normalizedPhone,
          templateId: payload.whatsappTemplateId,
          templateParams: payload.templateParams
        });

        if (waResult.success) {
          whatsappStatus = waResult.status;
        } else {
          whatsappStatus = 'FAILED';
          console.warn(`WhatsApp dispatch failed for ${payload.employeeCode}:`, waResult.error);
        }
      }
    } catch (waErr) {
      console.error('WhatsApp channel evaluation error:', waErr);
      whatsappStatus = 'FAILED';
    }
  }

  // 3. Process Push Notification channel if specified
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

  // 4. Create single authoritative In-App Notification Record (Unread count = 1)
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
    channels: activeChannels,
    whatsappStatus: whatsappStatus,
    whatsappTemplateId: payload.whatsappTemplateId
  } as any);

  return notificationRecord;
}
