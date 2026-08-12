import { db } from '../firebase/config';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export interface WhatsAppConfig {
  enabled: boolean;
  provider: 'WHATSAPP_BUSINESS_PLATFORM' | 'META_CLOUD_API' | 'CUSTOM_GATEWAY';
  phoneNumberId: string;
  businessAccountId: string;
  hasAccessToken: boolean;
  accessTokenMasked?: string;
  webhookSecretConfigured: boolean;
  templates: WhatsAppTemplateConfig[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface WhatsAppTemplateConfig {
  id: string;
  name: string;
  purpose: string;
  language: string;
  enabled: boolean;
  whatsappTemplateName: string;
}

export interface EmployeeWhatsAppPreference {
  employeeCode: string;
  optedIn: boolean;
  mobileNumber?: string;
  normalizedMobile?: string;
  updatedAt: string;
  consentTimestamp?: string;
}

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplateConfig[] = [
  {
    id: 'leave_approved_v1',
    name: 'Leave Application Approved',
    purpose: 'Notifies employee when leave request is approved',
    language: 'en_US',
    enabled: true,
    whatsappTemplateName: 'exfin_leave_approved'
  },
  {
    id: 'leave_rejected_v1',
    name: 'Leave Application Rejected',
    purpose: 'Notifies employee when leave request is rejected',
    language: 'en_US',
    enabled: true,
    whatsappTemplateName: 'exfin_leave_rejected'
  },
  {
    id: 'attendance_correction_v1',
    name: 'Attendance Corrected',
    purpose: 'Informs employee of administrative attendance correction',
    language: 'en_US',
    enabled: true,
    whatsappTemplateName: 'exfin_attendance_corrected'
  },
  {
    id: 'device_approval_alert',
    name: 'Device Approval Notification',
    purpose: 'Notifies employee when new device registration is approved',
    language: 'en_US',
    enabled: true,
    whatsappTemplateName: 'exfin_device_approval'
  },
  {
    id: 'urgent_system_alert',
    name: 'Important Announcement Alert',
    purpose: 'Dispatches high priority administrative notifications',
    language: 'en_US',
    enabled: true,
    whatsappTemplateName: 'exfin_urgent_alert'
  }
];

/**
 * Normalizes Indian mobile numbers to standard E.164 format (+91XXXXXXXXXX)
 */
export function normalizeIndianPhoneNumber(phone?: string): string | null {
  if (!phone) return null;
  // Remove spaces, hyphens, parentheses, and non-numeric chars except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.substring(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.substring(1);
  }

  // Pure 10-digit mobile number
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  return null;
}

/**
 * Masks a phone number for privacy (+91 ******3210)
 */
export function maskPhoneNumber(phone?: string): string {
  const norm = normalizeIndianPhoneNumber(phone);
  if (!norm || norm.length < 13) return '+91 ******0000';
  const lastFour = norm.slice(-4);
  return `+91 ******${lastFour}`;
}

/**
 * Fetches global WhatsApp system configuration from Firestore
 */
export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const defaultConfig: WhatsAppConfig = {
    enabled: false,
    provider: 'META_CLOUD_API',
    phoneNumberId: '',
    businessAccountId: '',
    hasAccessToken: false,
    webhookSecretConfigured: false,
    templates: DEFAULT_WHATSAPP_TEMPLATES
  };

  if (!db) return defaultConfig;

  try {
    const snap = await getDoc(doc(db, 'system_config', 'whatsapp'));
    if (snap.exists()) {
      const data = snap.data();
      return {
        enabled: !!data.enabled,
        provider: data.provider || 'META_CLOUD_API',
        phoneNumberId: data.phoneNumberId || '',
        businessAccountId: data.businessAccountId || '',
        hasAccessToken: !!data.hasAccessToken || !!data.accessToken,
        accessTokenMasked: data.accessToken ? 'Configured ✓' : undefined,
        webhookSecretConfigured: !!data.webhookSecretConfigured || !!data.webhookSecret,
        templates: Array.isArray(data.templates) && data.templates.length > 0 ? data.templates : DEFAULT_WHATSAPP_TEMPLATES,
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    console.error('Failed to read WhatsApp config:', err);
  }

  return defaultConfig;
}

/**
 * Saves global WhatsApp system configuration
 */
export async function saveWhatsAppConfig(config: Partial<WhatsAppConfig>, accessTokenSecret?: string): Promise<void> {
  if (!db) return;

  const ref = doc(db, 'system_config', 'whatsapp');
  const payload: any = {
    enabled: config.enabled ?? false,
    provider: config.provider || 'META_CLOUD_API',
    phoneNumberId: config.phoneNumberId || '',
    businessAccountId: config.businessAccountId || '',
    templates: config.templates || DEFAULT_WHATSAPP_TEMPLATES,
    updatedAt: new Date().toISOString(),
    updatedBy: config.updatedBy || 'admin'
  };

  if (accessTokenSecret && accessTokenSecret.trim()) {
    payload.accessToken = accessTokenSecret.trim(); // Stored in server-side Firestore config
    payload.hasAccessToken = true;
  }

  await setDoc(ref, payload, { merge: true });
}

/**
 * Retrieves employee WhatsApp opt-in preference
 */
export async function getEmployeeWhatsAppPreference(employeeCode: string): Promise<EmployeeWhatsAppPreference> {
  const defaultPref: EmployeeWhatsAppPreference = {
    employeeCode,
    optedIn: true, // Default opt-in enabled for official organization updates
    updatedAt: new Date().toISOString()
  };

  if (!db || !employeeCode) return defaultPref;

  try {
    const snap = await getDoc(doc(db, 'whatsapp_preferences', employeeCode));
    if (snap.exists()) {
      const data = snap.data();
      return {
        employeeCode,
        optedIn: data.optedIn !== false,
        mobileNumber: data.mobileNumber,
        normalizedMobile: data.normalizedMobile,
        updatedAt: data.updatedAt || new Date().toISOString(),
        consentTimestamp: data.consentTimestamp
      };
    }
  } catch (err) {
    console.warn('Failed to fetch employee WhatsApp preference:', err);
  }

  return defaultPref;
}

/**
 * Saves or updates employee WhatsApp preference
 */
export async function setEmployeeWhatsAppPreference(
  employeeCode: string,
  optedIn: boolean,
  mobileNumber?: string
): Promise<void> {
  if (!db || !employeeCode) return;

  const normalized = normalizeIndianPhoneNumber(mobileNumber);
  const ref = doc(db, 'whatsapp_preferences', employeeCode);

  const payload: EmployeeWhatsAppPreference = {
    employeeCode,
    optedIn,
    mobileNumber,
    normalizedMobile: normalized || undefined,
    updatedAt: new Date().toISOString(),
    consentTimestamp: new Date().toISOString()
  };

  await setDoc(ref, payload, { merge: true });
}

/**
 * Server-side API communication layer for WhatsApp Business API dispatch
 */
export async function sendWhatsAppTemplateMessage(params: {
  employeeCode: string;
  recipientMobile: string;
  templateId: string;
  templateParams?: Record<string, string>;
}): Promise<{ success: boolean; messageId?: string; status: 'DELIVERED' | 'FAILED' | 'QUEUED'; error?: string }> {
  try {
    const config = await getWhatsAppConfig();
    if (!config.enabled) {
      return { success: false, status: 'FAILED', error: 'WhatsApp integration disabled globally' };
    }

    const normalizedPhone = normalizeIndianPhoneNumber(params.recipientMobile);
    if (!normalizedPhone) {
      return { success: false, status: 'FAILED', error: 'Invalid or missing normalized phone number' };
    }

    // Verify template is configured and enabled
    const templateConfig = config.templates.find(t => t.id === params.templateId);
    if (!templateConfig || !templateConfig.enabled) {
      return { success: false, status: 'FAILED', error: `Template ${params.templateId} not enabled` };
    }

    // Server-side API simulation (Meta Cloud API endpoint structure)
    // In production, backend server processes this with META_CLOUD_API_KEY
    const mockMsgId = `wamid.HBgL${Date.now()}${Math.floor(Math.random() * 10000)}`;

    console.log(`[WhatsApp Business API] Sent template '${templateConfig.whatsappTemplateName}' to ${normalizedPhone} for ${params.employeeCode}`);

    return {
      success: true,
      messageId: mockMsgId,
      status: 'DELIVERED'
    };
  } catch (err: any) {
    console.error('WhatsApp dispatch error:', err);
    return {
      success: false,
      status: 'FAILED',
      error: err.message || 'Network failure during WhatsApp dispatch'
    };
  }
}
