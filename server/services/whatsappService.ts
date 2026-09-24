import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export interface WhatsAppEventTemplateConfig {
  enabled: boolean;
  templateName: string;
  languageCode: string;
}

export interface WhatsAppConfig {
  globalEnabled: boolean;
  recipientMode: 'ADMIN_ONLY' | 'EMPLOYEE_ONLY' | 'BOTH';
  adminRecipients: string[];
  apiVersion: string;
  templates: Record<string, string>; // Preview/text template format
  metaTemplates: Record<string, WhatsAppEventTemplateConfig>; // Meta approved template configurations
  updatedAt?: string;
  updatedBy?: string;
}

export interface WhatsAppNotificationPayload {
  eventId: string;
  eventType: string; // 'AUTO_CHECK_IN' | 'MANUAL_CHECK_IN' | 'CHECK_OUT' | 'WFH' | 'CLIENT_VISIT' | 'OUTDOOR_WORK' | 'LATE_CHECK_IN' | 'OUTSIDE_OFFICE' | 'MISSING_CHECKOUT_REMINDER'
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  employeeMobile?: string;
  whatsappConsent?: string | boolean;
  attendanceType?: string;
  checkInTime?: string;
  checkOutTime?: string;
  workingHours?: string;
  distance?: number | string;
  townCity?: string;
  wfhReason?: string;
  workPlan?: string;
  clientName?: string;
  clientLocation?: string;
  purpose?: string;
  outdoorType?: string;
  description?: string;
  eventTime?: string;
  customMessage?: string;
}

export interface WhatsAppSendResult {
  recipient: string;
  status: 'DELIVERED' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'NOT_REQUIRED' | 'IDEMPOTENT_SKIPPED';
  providerMessageId?: string;
  error?: string;
}

export const ALLOWED_ATTENDANCE_EVENT_TYPES = [
  'AUTO_CHECK_IN',
  'MANUAL_CHECK_IN',
  'CHECK_OUT',
  'WFH',
  'CLIENT_VISIT',
  'OUTDOOR_WORK',
  'LATE_CHECK_IN',
  'OUTSIDE_OFFICE',
  'MISSING_CHECKOUT_REMINDER'
];

export const DEFAULT_META_TEMPLATES: Record<string, WhatsAppEventTemplateConfig> = {
  AUTO_CHECK_IN: { enabled: true, templateName: 'exfin_attendance_checkin', languageCode: 'en' },
  MANUAL_CHECK_IN: { enabled: true, templateName: 'exfin_attendance_checkin', languageCode: 'en' },
  CHECK_OUT: { enabled: true, templateName: 'exfin_attendance_checkout', languageCode: 'en' },
  WFH: { enabled: true, templateName: 'exfin_attendance_wfh', languageCode: 'en' },
  CLIENT_VISIT: { enabled: true, templateName: 'exfin_attendance_client_visit', languageCode: 'en' },
  OUTDOOR_WORK: { enabled: true, templateName: 'exfin_attendance_outdoor', languageCode: 'en' },
  LATE_CHECK_IN: { enabled: true, templateName: 'exfin_attendance_late', languageCode: 'en' },
  OUTSIDE_OFFICE: { enabled: true, templateName: 'exfin_attendance_outside_office', languageCode: 'en' },
  MISSING_CHECKOUT_REMINDER: { enabled: true, templateName: 'exfin_attendance_missing_checkout', languageCode: 'en' }
};

export const DEFAULT_WHATSAPP_TEMPLATES: Record<string, string> = {
  AUTO_CHECK_IN: `Smart Workforce – Auto Check-In\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nMode: {{attendanceType}}\nTime: {{checkInTime}}\nLocation: {{townCity}}\nDistance: {{distance}} m\nStatus: PRESENT`,
  MANUAL_CHECK_IN: `Smart Workforce – Manual Check-In\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nMode: {{attendanceType}}\nTime: {{checkInTime}}\nLocation: {{townCity}}\nDistance: {{distance}} m\nStatus: PRESENT`,
  CHECK_OUT: `Smart Workforce – Checkout\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nMode: {{attendanceType}}\nCheck-in: {{checkInTime}}\nCheck-out: {{checkOutTime}}\nWorking Hours: {{workingHours}}`,
  WFH: `Smart Workforce – Work From Home\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nTime: {{checkInTime}}\nReason: {{wfhReason}}\nWork Plan: {{workPlan}}`,
  CLIENT_VISIT: `Smart Workforce – Client Visit\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nClient: {{clientName}}\nLocation: {{clientLocation}}\nTime: {{checkInTime}}\nPurpose: {{purpose}}`,
  OUTDOOR_WORK: `Smart Workforce – Outdoor Work\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nType: {{outdoorType}}\nTime: {{checkInTime}}\nDescription: {{description}}`,
  LATE_CHECK_IN: `Smart Workforce – Late Check-In Alert\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nTime: {{checkInTime}}\nStatus: LATE`,
  OUTSIDE_OFFICE: `Smart Workforce – Office Exit Alert\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nTime: {{eventTime}}\nLocation: {{townCity}}\nStatus: OUTSIDE_OFFICE`,
  MISSING_CHECKOUT_REMINDER: `Smart Workforce – Missing Checkout Reminder\n\nEmployee: {{employeeName}}\nEmployee Code: {{employeeCode}}\nCheck-in: {{checkInTime}}\nPlease finalize your checkout for today.`,
  GENERAL_ALERT: `Smart Workforce Alert\n\n{{customMessage}}`
};

const CONFIG_DOC_PATH = 'notification_settings/whatsapp_config';
const MATRIX_DOC_PATH = 'notification_settings/admin_matrix_config';

/**
 * Normalizes phone numbers to standard international format (digits only, e.g. 919876543210)
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone || typeof phone !== 'string') return null;

  // Strip all non-digit characters except leading plus if any
  let cleaned = phone.replace(/[^0-9+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Remove leading zeros
  cleaned = cleaned.replace(/^0+/, '');

  // If 10 digits (Standard Indian Mobile without country code), default prefix with 91
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }

  // Valid international phone numbers range between 10 and 15 digits
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return cleaned;
  }

  return null;
}

/**
 * Retrieves WhatsApp credentials from server environment
 */
export function getWhatsAppEnvCredentials() {
  const apiToken = process.env.WHATSAPP_API_TOKEN || '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const defaultAdminMobile = process.env.WHATSAPP_ADMIN_NOTIFICATION_MOBILE || '';

  const isConfigured = Boolean(apiToken && phoneNumberId);

  return {
    apiToken,
    phoneNumberId,
    businessAccountId,
    apiVersion,
    defaultAdminMobile,
    isConfigured
  };
}

/**
 * Loads WhatsApp configuration from Firestore with fallback defaults
 */
export async function getWhatsAppConfig(db: Firestore): Promise<WhatsAppConfig> {
  const envCreds = getWhatsAppEnvCredentials();
  const defaultConfig: WhatsAppConfig = {
    globalEnabled: true,
    recipientMode: 'BOTH',
    adminRecipients: envCreds.defaultAdminMobile ? [envCreds.defaultAdminMobile] : [],
    apiVersion: envCreds.apiVersion,
    templates: DEFAULT_WHATSAPP_TEMPLATES,
    metaTemplates: DEFAULT_META_TEMPLATES
  };

  try {
    const docRef = db.doc(CONFIG_DOC_PATH);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        globalEnabled: data.globalEnabled !== false,
        recipientMode: data.recipientMode || 'BOTH',
        adminRecipients: Array.isArray(data.adminRecipients) ? data.adminRecipients : defaultConfig.adminRecipients,
        apiVersion: data.apiVersion || envCreds.apiVersion,
        templates: {
          ...DEFAULT_WHATSAPP_TEMPLATES,
          ...(data.templates || {})
        },
        metaTemplates: {
          ...DEFAULT_META_TEMPLATES,
          ...(data.metaTemplates || {})
        },
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    console.warn('[WhatsAppService] Failed to fetch config from Firestore, using defaults:', err);
  }

  return defaultConfig;
}

/**
 * Saves WhatsApp configuration to Firestore (Never stores credentials)
 */
export async function saveWhatsAppConfig(
  db: Firestore,
  configUpdate: Partial<WhatsAppConfig>,
  updaterName: string
): Promise<WhatsAppConfig> {
  const current = await getWhatsAppConfig(db);
  const updated: WhatsAppConfig = {
    ...current,
    ...configUpdate,
    templates: {
      ...current.templates,
      ...(configUpdate.templates || {})
    },
    metaTemplates: {
      ...current.metaTemplates,
      ...(configUpdate.metaTemplates || {})
    },
    updatedAt: new Date().toISOString(),
    updatedBy: updaterName || 'SUPER_ADMIN'
  };

  const docRef = db.doc(CONFIG_DOC_PATH);
  await docRef.set(updated, { merge: true });

  return updated;
}

/**
 * Builds Meta-compliant dynamic parameter array from attendance payload
 */
export function buildTemplateParameters(
  eventType: string,
  payload: WhatsAppNotificationPayload
): Array<{ type: 'text'; text: string }> {
  switch (eventType) {
    case 'AUTO_CHECK_IN':
    case 'MANUAL_CHECK_IN':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.employeeCode || payload.employeeId || 'EMP' },
        { type: 'text', text: payload.checkInTime || '--:--' },
        { type: 'text', text: payload.townCity || 'Raniganj HQ' }
      ];
    case 'CHECK_OUT':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.employeeCode || payload.employeeId || 'EMP' },
        { type: 'text', text: payload.checkOutTime || '--:--' },
        { type: 'text', text: payload.workingHours || '--' }
      ];
    case 'WFH':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.checkInTime || '--:--' },
        { type: 'text', text: payload.wfhReason || 'Work From Home' }
      ];
    case 'CLIENT_VISIT':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.clientName || 'Client' },
        { type: 'text', text: payload.clientLocation || 'Site' },
        { type: 'text', text: payload.checkInTime || '--:--' }
      ];
    case 'OUTDOOR_WORK':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.outdoorType || 'Outdoor Assignment' },
        { type: 'text', text: payload.checkInTime || '--:--' },
        { type: 'text', text: payload.description || 'Field Duty' }
      ];
    case 'LATE_CHECK_IN':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.checkInTime || '--:--' }
      ];
    case 'OUTSIDE_OFFICE':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.eventTime || payload.checkInTime || '--:--' },
        { type: 'text', text: payload.townCity || 'Raniganj HQ' }
      ];
    case 'MISSING_CHECKOUT_REMINDER':
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.checkInTime || '--:--' }
      ];
    default:
      return [
        { type: 'text', text: payload.employeeName || 'Employee' },
        { type: 'text', text: payload.checkInTime || payload.eventTime || '--:--' }
      ];
  }
}

/**
 * Renders template variables into fallback text message
 */
export function renderTemplate(template: string, payload: WhatsAppNotificationPayload): string {
  let rendered = template;
  const variables: Record<string, string> = {
    employeeName: payload.employeeName || 'Employee',
    employeeCode: payload.employeeCode || '',
    employeeId: payload.employeeId || '',
    attendanceType: payload.attendanceType || 'OFFICE',
    checkInTime: payload.checkInTime || '--:--',
    checkOutTime: payload.checkOutTime || '--:--',
    workingHours: payload.workingHours || '--',
    distance: payload.distance !== undefined && payload.distance !== null ? String(payload.distance) : '0',
    townCity: payload.townCity || 'Raniganj HQ',
    wfhReason: payload.wfhReason || 'N/A',
    workPlan: payload.workPlan || 'N/A',
    clientName: payload.clientName || 'N/A',
    clientLocation: payload.clientLocation || 'N/A',
    purpose: payload.purpose || 'N/A',
    outdoorType: payload.outdoorType || 'N/A',
    description: payload.description || 'N/A',
    eventTime: payload.eventTime || payload.checkInTime || new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata' }),
    customMessage: payload.customMessage || ''
  };

  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, value);
  }

  return rendered.trim();
}

/**
 * Checks if WhatsApp channel is enabled in Admin Notification Matrix for this event type
 */
export async function isWhatsAppEnabledInMatrix(db: Firestore, eventType: string): Promise<boolean> {
  try {
    const snap = await db.doc(MATRIX_DOC_PATH).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const matrix: any[] = data.matrix || [];
      const item = matrix.find((m: any) => m.eventType === eventType);
      if (item) {
        return item.whatsapp === true;
      }
    }
  } catch (err) {
    console.warn('[WhatsAppService] Error checking matrix config:', err);
  }

  return true;
}

export interface MetaWhatsAppMessageOptions {
  type?: 'template' | 'text';
  templateName?: string;
  languageCode?: string;
  parameters?: Array<{ type: 'text'; text: string }>;
  textBody?: string;
}

/**
 * Sends a message via Meta WhatsApp Cloud API (Template or Text)
 */
export async function sendMetaWhatsAppMessage(
  recipientPhone: string,
  options: MetaWhatsAppMessageOptions | string
): Promise<{ success: boolean; providerMessageId?: string; error?: string }> {
  const env = getWhatsAppEnvCredentials();

  if (!env.isConfigured) {
    return {
      success: false,
      error: 'WhatsApp API credentials not configured in server environment (WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing).'
    };
  }

  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) {
    return {
      success: false,
      error: `Invalid recipient phone number: ${recipientPhone}`
    };
  }

  const endpoint = `https://graph.facebook.com/${env.apiVersion}/${env.phoneNumberId}/messages`;

  // Parse message payload - strict differentiation between template & text
  let bodyPayload: any;
  if (typeof options === 'string') {
    bodyPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: options
      }
    };
  } else if (options.type === 'template') {
    if (!options.templateName || !options.templateName.trim()) {
      return {
        success: false,
        error: 'Meta template name is required when sending template messages. Automated messages will not fall back to free-form text.'
      };
    }
    bodyPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: options.templateName.trim(),
        language: {
          code: options.languageCode || 'en'
        },
        components: options.parameters && options.parameters.length > 0 ? [
          {
            type: 'body',
            parameters: options.parameters
          }
        ] : []
      }
    };
  } else if (options.type === 'text') {
    bodyPayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: options.textBody || 'Smart Workforce Notification'
      }
    };
  } else {
    return {
      success: false,
      error: 'Invalid message options: must specify either template or text type.'
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    const resJson = await response.json().catch(() => ({}));

    if (response.ok && resJson.messages && resJson.messages.length > 0) {
      return {
        success: true,
        providerMessageId: resJson.messages[0].id
      };
    } else {
      const errMsg = resJson.error?.message || `Meta WhatsApp API error (HTTP ${response.status})`;
      console.error('[WhatsAppService] Meta API Error response:', resJson);
      return {
        success: false,
        error: errMsg
      };
    }
  } catch (netErr: any) {
    console.error('[WhatsAppService] Network error calling Meta WhatsApp API:', netErr);
    return {
      success: false,
      error: netErr?.message || 'Network error communicating with WhatsApp Cloud API'
    };
  }
}

/**
 * Atomically reserves a dispatch slot in Firestore transaction.
 * Returns canSend: true ONLY IF this request successfully acquired the initial PENDING lock or a controlled retry.
 */
export async function reserveWhatsAppDispatchSlot(
  db: Firestore,
  idempotencyKey: string,
  payload: WhatsAppNotificationPayload,
  recipient: string
): Promise<{ canSend: boolean; status: string; reason?: string; retryCount?: number }> {
  try {
    const docRef = db.collection('whatsapp_delivery_logs').doc(idempotencyKey);
    const result = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const nowIso = new Date().toISOString();

      if (docSnap.exists) {
        const data = docSnap.data() || {};
        // 1. If already successfully sent, delivered, or determined not configured/required, skip
        if (data.status === 'SENT' || data.status === 'DELIVERED' || data.status === 'NOT_CONFIGURED' || data.status === 'NOT_REQUIRED') {
          return { canSend: false, status: data.status, reason: 'ALREADY_PROCESSED' };
        }

        // 2. If in-flight PENDING for < 60 seconds, prevent duplicate concurrent dispatch
        if (data.status === 'PENDING') {
          const createdAtMs = data.createdAt ? new Date(data.createdAt).getTime() : 0;
          if (Date.now() - createdAtMs < 60000) {
            return { canSend: false, status: 'PENDING', reason: 'IN_FLIGHT' };
          }
        }

        // 3. If FAILED or stale PENDING, allow retry
        const retryCount = (data.retryCount || 0) + 1;
        transaction.set(docRef, {
          ...data,
          status: 'PENDING',
          retryCount,
          updatedAt: nowIso,
          lastAttemptAt: nowIso
        }, { merge: true });

        return { canSend: true, status: 'PENDING', retryCount };
      } else {
        // Initial atomic reservation
        transaction.set(docRef, {
          idempotencyKey,
          eventId: payload.eventId || 'evt',
          eventType: payload.eventType,
          employeeId: payload.employeeId,
          employeeCode: payload.employeeCode,
          employeeName: payload.employeeName,
          recipient,
          status: 'PENDING',
          retryCount: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
          channel: 'WHATSAPP'
        });

        return { canSend: true, status: 'PENDING', retryCount: 0 };
      }
    });

    return result;
  } catch (err) {
    console.error('[WhatsAppService] Error in atomic idempotency reservation:', err);
    // If transaction failed, do not send to prevent duplicates
    return { canSend: false, status: 'ERROR', reason: 'TRANSACTION_FAILED' };
  }
}

/**
 * Finalizes delivery log entry in Firestore after Meta API response
 */
export async function finalizeWhatsAppDeliveryLog(
  db: Firestore,
  idempotencyKey: string,
  data: {
    eventId: string;
    eventType: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    recipient: string;
    status: 'DELIVERED' | 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'NOT_REQUIRED';
    templateName?: string;
    providerMessageId?: string;
    messagePreview: string;
    errorCode?: string;
    errorMessage?: string;
  }
) {
  try {
    const nowIso = new Date().toISOString();
    const docRef = db.collection('whatsapp_delivery_logs').doc(idempotencyKey);
    await docRef.set({
      idempotencyKey,
      ...data,
      channel: 'WHATSAPP',
      updatedAt: nowIso,
      sentAt: data.status === 'SENT' || data.status === 'DELIVERED' ? nowIso : null,
      serverTimestamp: FieldValue.serverTimestamp()
    }, { merge: true });

    // Mirror to central notifications collection for unified view
    const notifId = `notif_wa_${idempotencyKey.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const notifRef = db.collection('notifications').doc(notifId);
    await notifRef.set({
      id: notifId,
      notificationId: notifId,
      type: data.eventType,
      category: 'ATTENDANCE',
      title: `WhatsApp: ${data.eventType.replace(/_/g, ' ')}`,
      message: data.messagePreview,
      recipientUserId: data.employeeId,
      recipientEmployeeCode: data.employeeCode,
      recipientMobile: data.recipient,
      recipientRole: 'EMPLOYEE',
      priority: 'NORMAL',
      read: true,
      channels: ['WHATSAPP'],
      whatsappStatus: data.status,
      timestamp: nowIso,
      createdAtDeviceTime: nowIso,
      updatedAtDeviceTime: nowIso,
      serverSyncTime: nowIso,
      syncStatus: 'SYNCED',
      idempotencyKey
    }, { merge: true });
  } catch (err) {
    console.warn('[WhatsAppService] Failed to finalize delivery log in Firestore:', err);
  }
}

/**
 * Comprehensive Dispatcher: Dispatches WhatsApp attendance notifications to configured recipients with atomic idempotency & templates
 */
export async function dispatchWhatsAppAttendanceNotification(
  db: Firestore,
  payload: WhatsAppNotificationPayload
): Promise<WhatsAppSendResult[]> {
  const results: WhatsAppSendResult[] = [];
  const env = getWhatsAppEnvCredentials();

  // 1. Fetch Config
  const config = await getWhatsAppConfig(db);

  // Check global toggle
  if (!config.globalEnabled) {
    console.log('[WhatsAppService] Global WhatsApp notifications are OFF. Skipping dispatch.');
    return [{ recipient: 'GLOBAL', status: 'NOT_REQUIRED', error: 'WhatsApp notifications disabled globally by Super-Admin' }];
  }

  // Check Matrix toggle
  const isMatrixEnabled = await isWhatsAppEnabledInMatrix(db, payload.eventType);
  if (!isMatrixEnabled) {
    console.log(`[WhatsAppService] WhatsApp is disabled in matrix for eventType: ${payload.eventType}. Skipping.`);
    return [{ recipient: 'MATRIX', status: 'NOT_REQUIRED', error: `WhatsApp disabled for ${payload.eventType}` }];
  }

  // 2. Check Meta Template Configuration (Automated attendance events NEVER fall back to free-form text)
  const metaTemplateConfig = config.metaTemplates?.[payload.eventType] || DEFAULT_META_TEMPLATES[payload.eventType];
  const isTemplateConfigured = Boolean(
    metaTemplateConfig &&
    metaTemplateConfig.enabled !== false &&
    metaTemplateConfig.templateName &&
    metaTemplateConfig.templateName.trim().length > 0
  );

  // 3. Resolve Target Recipient Numbers & Opt-in
  interface RecipientTarget {
    phone: string;
    isEmployee: boolean;
  }
  const targets: RecipientTarget[] = [];

  // Employee Phone Handling
  if (config.recipientMode === 'EMPLOYEE_ONLY' || config.recipientMode === 'BOTH') {
    let empPhone = payload.employeeMobile;
    let isOptedIn = payload.whatsappConsent === 'OPTED_IN' || payload.whatsappConsent === true;

    // Lookup authoritative employee registration
    if (payload.employeeCode || payload.employeeId) {
      try {
        let regSnap: any = null;
        if (payload.employeeId) {
          const doc = await db.collection('registrations').doc(payload.employeeId).get();
          if (doc.exists) regSnap = doc;
        }
        if (!regSnap && payload.employeeCode) {
          const querySnap = await db.collection('registrations').where('employeeCode', '==', payload.employeeCode).limit(1).get();
          if (!querySnap.empty) regSnap = querySnap.docs[0];
        }

        if (regSnap && regSnap.exists) {
          const regData = regSnap.data() || {};
          if (!empPhone) {
            empPhone = regData.phone || regData.mobileNumber || regData.whatsappNumber || regData.mobile;
          }
          const consent = regData.whatsappConsent || regData.whatsappOptIn;
          isOptedIn = consent === 'OPTED_IN' || consent === true;
        }
      } catch (err) {
        console.warn('[WhatsAppService] Could not lookup registration opt-in:', err);
      }
    }

    if (empPhone) {
      const normalized = normalizePhoneNumber(empPhone);
      if (normalized) {
        if (isOptedIn) {
          targets.push({ phone: normalized, isEmployee: true });
        } else {
          console.log(`[WhatsAppService] Employee ${payload.employeeCode} has not opted in (OPTED_OUT/UNKNOWN). Skipping.`);
          results.push({ recipient: normalized, status: 'NOT_REQUIRED', error: 'EMPLOYEE_NOT_OPTED_IN' });
        }
      }
    }
  }

  // Admin / HR Phones (Organizational routing)
  if (config.recipientMode === 'ADMIN_ONLY' || config.recipientMode === 'BOTH') {
    for (const adminMobile of config.adminRecipients) {
      const normalized = normalizePhoneNumber(adminMobile);
      if (normalized && !targets.some((t) => t.phone === normalized)) {
        targets.push({ phone: normalized, isEmployee: false });
      }
    }
  }

  if (targets.length === 0) {
    if (results.length === 0) {
      results.push({ recipient: 'NONE', status: 'NOT_REQUIRED', error: 'No eligible recipients found' });
    }
    return results;
  }

  // 4. Validate Template Configuration (Strict Meta Compliance - NO Free-Form Fallback)
  if (!isTemplateConfigured) {
    const diagnosticReason = !metaTemplateConfig || !metaTemplateConfig.templateName || !metaTemplateConfig.templateName.trim()
      ? `WhatsApp template not configured for event type '${payload.eventType}'. Automated attendance notifications require an approved Meta template and will not fall back to free-form text.`
      : `WhatsApp template '${metaTemplateConfig.templateName}' is disabled for event type '${payload.eventType}'. Automated attendance notifications will not fall back to free-form text.`;

    console.warn(`[WhatsAppService] ${diagnosticReason}`);

    // Record NOT_CONFIGURED status for all targeted recipients
    for (const target of targets) {
      const phone = target.phone;
      const rawKey = `wa_${payload.eventId || 'evt'}_${payload.eventType}_${phone}`;
      const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '_');

      await finalizeWhatsAppDeliveryLog(db, idempotencyKey, {
        eventId: payload.eventId || 'evt',
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: 'NOT_CONFIGURED',
        templateName: metaTemplateConfig?.templateName || undefined,
        messagePreview: 'Notification skipped: WhatsApp template not configured or disabled',
        errorMessage: diagnosticReason
      });

      results.push({
        recipient: phone,
        status: 'NOT_CONFIGURED',
        error: diagnosticReason
      });
    }

    return results;
  }

  // 5. Check Provider API Credentials
  if (!env.isConfigured) {
    const diagnosticReason = 'WhatsApp API credentials not configured in server environment (WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing)';
    console.warn(`[WhatsAppService] ${diagnosticReason}`);

    for (const target of targets) {
      const phone = target.phone;
      const rawKey = `wa_${payload.eventId || 'evt'}_${payload.eventType}_${phone}`;
      const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '_');

      await finalizeWhatsAppDeliveryLog(db, idempotencyKey, {
        eventId: payload.eventId || 'evt',
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: 'NOT_CONFIGURED',
        templateName: metaTemplateConfig.templateName,
        messagePreview: 'Notification skipped: WhatsApp credentials not configured in environment',
        errorMessage: diagnosticReason
      });

      results.push({
        recipient: phone,
        status: 'NOT_CONFIGURED',
        error: diagnosticReason
      });
    }

    return results;
  }

  // 6. Build Template Parameters & Dispatch with Deterministic Idempotency
  const templateName = metaTemplateConfig.templateName.trim();
  const languageCode = metaTemplateConfig.languageCode || 'en';
  const templateParams = buildTemplateParameters(payload.eventType, payload);

  for (const target of targets) {
    const phone = target.phone;
    // Deterministic Idempotency Key: wa_{eventId}_{eventType}_{recipientPhone}
    const rawKey = `wa_${payload.eventId || 'evt'}_${payload.eventType}_${phone}`;
    const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, '_');

    // Atomic reservation in Firestore transaction
    const reservation = await reserveWhatsAppDispatchSlot(db, idempotencyKey, payload, phone);
    if (!reservation.canSend) {
      console.log(`[WhatsAppService] Idempotency Hit for key ${idempotencyKey} (${reservation.reason}). Skipping duplicate.`);
      results.push({ recipient: phone, status: 'IDEMPOTENT_SKIPPED' });
      continue;
    }

    // Call Meta API strictly with Template Message (NO free-form fallback)
    const sendRes = await sendMetaWhatsAppMessage(phone, {
      type: 'template',
      templateName,
      languageCode,
      parameters: templateParams
    });

    if (sendRes.success) {
      await finalizeWhatsAppDeliveryLog(db, idempotencyKey, {
        eventId: payload.eventId || 'evt',
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: 'DELIVERED',
        templateName,
        providerMessageId: sendRes.providerMessageId,
        messagePreview: `[Meta Template: ${templateName}] (Delivered)`
      });
      results.push({ recipient: phone, status: 'DELIVERED', providerMessageId: sendRes.providerMessageId });
    } else {
      await finalizeWhatsAppDeliveryLog(db, idempotencyKey, {
        eventId: payload.eventId || 'evt',
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: 'FAILED',
        templateName,
        messagePreview: `[Meta Template: ${templateName}] (Failed: ${sendRes.error})`,
        errorMessage: sendRes.error
      });
      results.push({ recipient: phone, status: 'FAILED', error: sendRes.error });
    }
  }

  return results;
}

