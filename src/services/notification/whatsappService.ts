import { API_BASE_URL } from '@/src/utils/apiConfig';
import { auth } from '../firebase/config';
import { AttendanceRecord } from '../../types/attendance';

export interface WhatsAppEventTemplateConfig {
  enabled: boolean;
  templateName: string;
  languageCode: string;
}

export interface WhatsAppClientConfig {
  configured: boolean;
  status: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  maskedPhoneNumberId: string;
  maskedWabaId: string;
  apiVersion: string;
  globalEnabled: boolean;
  recipientMode: 'ADMIN_ONLY' | 'EMPLOYEE_ONLY' | 'BOTH';
  adminRecipients: string[];
  templates: Record<string, string>;
  metaTemplates?: Record<string, WhatsAppEventTemplateConfig>;
  updatedAt?: string;
  updatedBy?: string;
}

export interface WhatsAppDispatchResponse {
  success: boolean;
  results?: Array<{
    recipient: string;
    status: string;
    providerMessageId?: string;
    error?: string;
  }>;
  error?: string;
  idempotent?: boolean;
}

/**
 * Gets currently logged in user's Firebase Auth ID token
 */
async function getIdToken(): Promise<string | null> {
  try {
    if (auth && auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('[WhatsAppClient] Failed to obtain Firebase ID token:', err);
  }
  return null;
}

/**
 * Dispatches WhatsApp attendance notification via secure backend proxy
 * Completely non-blocking: Never throws, fails silently with warning
 */
export async function dispatchAttendanceWhatsApp(
  record: AttendanceRecord,
  eventType: string,
  extra?: {
    customMessage?: string;
    wfhReason?: string;
    workPlan?: string;
    clientName?: string;
    clientLocation?: string;
    purpose?: string;
    outdoorType?: string;
    description?: string;
  }
): Promise<WhatsAppDispatchResponse> {
  if (typeof window === 'undefined' || !navigator.onLine) {
    return { success: false, error: 'Offline - WhatsApp dispatch queued for post-sync' };
  }

  try {
    const token = await getIdToken();
    const eventId = `evt_${record.employeeId}_${record.date}_${eventType}`;

    const payload = {
      eventId,
      eventType,
      employeeId: record.employeeId,
      employeeCode: record.employeeCode || record.employeeId,
      employeeName: record.employeeName,
      attendanceType: record.attendanceType || 'OFFICE',
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      workingHours: record.workingHours,
      distance: record.distance,
      townCity: record.townCity || record.checkInTownCity || 'Raniganj HQ',
      wfhReason: extra?.wfhReason || record.wfhReason,
      workPlan: extra?.workPlan || record.workPlan,
      clientName: extra?.clientName || record.clientName,
      clientLocation: extra?.clientLocation || record.clientLocation,
      purpose: extra?.purpose || record.purpose,
      outdoorType: extra?.outdoorType || record.outdoorType,
      description: extra?.description || record.description,
      customMessage: extra?.customMessage
    };

    const res = await fetch(API_BASE_URL + '/api/notifications/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, ...data };
    } else {
      const errJson = await res.json().catch(() => ({}));
      console.warn('[WhatsAppClient] Dispatch warning:', errJson.error || res.statusText);
      return { success: false, error: errJson.error || 'Server rejected WhatsApp dispatch' };
    }
  } catch (err: any) {
    console.warn('[WhatsAppClient] Non-fatal WhatsApp notification error:', err?.message);
    return { success: false, error: err?.message };
  }
}

/**
 * Super-Admin: Fetches WhatsApp connection status and configuration (no secrets exposed)
 */
export async function getWhatsAppAdminConfig(): Promise<WhatsAppClientConfig> {
  const token = await getIdToken();
  const res = await fetch(API_BASE_URL + '/api/admin/whatsapp/config', {
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    }
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to fetch WhatsApp configuration');
  }

  return await res.json();
}

/**
 * Super-Admin: Saves updated WhatsApp settings (templates, routing, toggles)
 */
export async function saveWhatsAppAdminConfig(update: Partial<WhatsAppClientConfig>): Promise<WhatsAppClientConfig> {
  const token = await getIdToken();
  const res = await fetch(API_BASE_URL + '/api/admin/whatsapp/config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify(update)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to save WhatsApp configuration');
  }

  return await res.json();
}

/**
 * Super-Admin: Sends a live test WhatsApp message via server-side credentials
 */
export async function sendTestWhatsAppMessage(
  recipient: string,
  testMessage?: string,
  options?: {
    type?: 'template' | 'text';
    templateName?: string;
    languageCode?: string;
  }
): Promise<{ success: boolean; message: string; providerMessageId?: string; error?: string }> {
  const token = await getIdToken();
  const res = await fetch(API_BASE_URL + '/api/admin/whatsapp/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      recipient,
      testMessage,
      type: options?.type || 'text',
      templateName: options?.templateName,
      languageCode: options?.languageCode
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Failed to send test WhatsApp message');
  }

  return data;
}
