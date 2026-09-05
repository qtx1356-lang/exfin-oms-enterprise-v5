var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_app2 = require("firebase-admin/app");
var import_firestore5 = require("firebase-admin/firestore");
var import_auth2 = require("firebase-admin/auth");
var import_vite = require("vite");
var import_genai = require("@google/genai");

// server/services/whatsappService.ts
var import_firestore = require("firebase-admin/firestore");
var ALLOWED_ATTENDANCE_EVENT_TYPES = [
  "AUTO_CHECK_IN",
  "MANUAL_CHECK_IN",
  "CHECK_OUT",
  "WFH",
  "CLIENT_VISIT",
  "OUTDOOR_WORK",
  "LATE_CHECK_IN",
  "OUTSIDE_OFFICE",
  "MISSING_CHECKOUT_REMINDER"
];
var DEFAULT_META_TEMPLATES = {
  AUTO_CHECK_IN: { enabled: true, templateName: "exfin_attendance_checkin", languageCode: "en" },
  MANUAL_CHECK_IN: { enabled: true, templateName: "exfin_attendance_checkin", languageCode: "en" },
  CHECK_OUT: { enabled: true, templateName: "exfin_attendance_checkout", languageCode: "en" },
  WFH: { enabled: true, templateName: "exfin_attendance_wfh", languageCode: "en" },
  CLIENT_VISIT: { enabled: true, templateName: "exfin_attendance_client_visit", languageCode: "en" },
  OUTDOOR_WORK: { enabled: true, templateName: "exfin_attendance_outdoor", languageCode: "en" },
  LATE_CHECK_IN: { enabled: true, templateName: "exfin_attendance_late", languageCode: "en" },
  OUTSIDE_OFFICE: { enabled: true, templateName: "exfin_attendance_outside_office", languageCode: "en" },
  MISSING_CHECKOUT_REMINDER: { enabled: true, templateName: "exfin_attendance_missing_checkout", languageCode: "en" }
};
var DEFAULT_WHATSAPP_TEMPLATES = {
  AUTO_CHECK_IN: `Smart Workforce \u2013 Auto Check-In

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Mode: {{attendanceType}}
Time: {{checkInTime}}
Location: {{townCity}}
Distance: {{distance}} m
Status: PRESENT`,
  MANUAL_CHECK_IN: `Smart Workforce \u2013 Manual Check-In

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Mode: {{attendanceType}}
Time: {{checkInTime}}
Location: {{townCity}}
Distance: {{distance}} m
Status: PRESENT`,
  CHECK_OUT: `Smart Workforce \u2013 Checkout

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Mode: {{attendanceType}}
Check-in: {{checkInTime}}
Check-out: {{checkOutTime}}
Working Hours: {{workingHours}}`,
  WFH: `Smart Workforce \u2013 Work From Home

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Time: {{checkInTime}}
Reason: {{wfhReason}}
Work Plan: {{workPlan}}`,
  CLIENT_VISIT: `Smart Workforce \u2013 Client Visit

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Client: {{clientName}}
Location: {{clientLocation}}
Time: {{checkInTime}}
Purpose: {{purpose}}`,
  OUTDOOR_WORK: `Smart Workforce \u2013 Outdoor Work

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Type: {{outdoorType}}
Time: {{checkInTime}}
Description: {{description}}`,
  LATE_CHECK_IN: `Smart Workforce \u2013 Late Check-In Alert

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Time: {{checkInTime}}
Status: LATE`,
  OUTSIDE_OFFICE: `Smart Workforce \u2013 Office Exit Alert

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Time: {{eventTime}}
Location: {{townCity}}
Status: OUTSIDE_OFFICE`,
  MISSING_CHECKOUT_REMINDER: `Smart Workforce \u2013 Missing Checkout Reminder

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Check-in: {{checkInTime}}
Please finalize your checkout for today.`,
  GENERAL_ALERT: `Smart Workforce Alert

{{customMessage}}`
};
var CONFIG_DOC_PATH = "notification_settings/whatsapp_config";
var MATRIX_DOC_PATH = "notification_settings/admin_matrix_config";
function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== "string") return null;
  let cleaned = phone.replace(/[^0-9+]/g, "");
  if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  cleaned = cleaned.replace(/^0+/, "");
  if (cleaned.length === 10) {
    cleaned = `91${cleaned}`;
  }
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return cleaned;
  }
  return null;
}
function getWhatsAppEnvCredentials() {
  const apiToken = process.env.WHATSAPP_API_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
  const apiVersion = process.env.WHATSAPP_API_VERSION || "v21.0";
  const defaultAdminMobile = process.env.WHATSAPP_ADMIN_NOTIFICATION_MOBILE || "";
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
async function getWhatsAppConfig(db3) {
  const envCreds = getWhatsAppEnvCredentials();
  const defaultConfig = {
    globalEnabled: true,
    recipientMode: "BOTH",
    adminRecipients: envCreds.defaultAdminMobile ? [envCreds.defaultAdminMobile] : [],
    apiVersion: envCreds.apiVersion,
    templates: DEFAULT_WHATSAPP_TEMPLATES,
    metaTemplates: DEFAULT_META_TEMPLATES
  };
  try {
    const docRef = db3.doc(CONFIG_DOC_PATH);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        globalEnabled: data.globalEnabled !== false,
        recipientMode: data.recipientMode || "BOTH",
        adminRecipients: Array.isArray(data.adminRecipients) ? data.adminRecipients : defaultConfig.adminRecipients,
        apiVersion: data.apiVersion || envCreds.apiVersion,
        templates: {
          ...DEFAULT_WHATSAPP_TEMPLATES,
          ...data.templates || {}
        },
        metaTemplates: {
          ...DEFAULT_META_TEMPLATES,
          ...data.metaTemplates || {}
        },
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    }
  } catch (err) {
    console.warn("[WhatsAppService] Failed to fetch config from Firestore, using defaults:", err);
  }
  return defaultConfig;
}
async function saveWhatsAppConfig(db3, configUpdate, updaterName) {
  const current = await getWhatsAppConfig(db3);
  const updated = {
    ...current,
    ...configUpdate,
    templates: {
      ...current.templates,
      ...configUpdate.templates || {}
    },
    metaTemplates: {
      ...current.metaTemplates,
      ...configUpdate.metaTemplates || {}
    },
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy: updaterName || "SUPER_ADMIN"
  };
  const docRef = db3.doc(CONFIG_DOC_PATH);
  await docRef.set(updated, { merge: true });
  return updated;
}
function buildTemplateParameters(eventType, payload) {
  switch (eventType) {
    case "AUTO_CHECK_IN":
    case "MANUAL_CHECK_IN":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.employeeCode || payload.employeeId || "EMP" },
        { type: "text", text: payload.checkInTime || "--:--" },
        { type: "text", text: payload.townCity || "Raniganj HQ" }
      ];
    case "CHECK_OUT":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.employeeCode || payload.employeeId || "EMP" },
        { type: "text", text: payload.checkOutTime || "--:--" },
        { type: "text", text: payload.workingHours || "--" }
      ];
    case "WFH":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.checkInTime || "--:--" },
        { type: "text", text: payload.wfhReason || "Work From Home" }
      ];
    case "CLIENT_VISIT":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.clientName || "Client" },
        { type: "text", text: payload.clientLocation || "Site" },
        { type: "text", text: payload.checkInTime || "--:--" }
      ];
    case "OUTDOOR_WORK":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.outdoorType || "Outdoor Assignment" },
        { type: "text", text: payload.checkInTime || "--:--" },
        { type: "text", text: payload.description || "Field Duty" }
      ];
    case "LATE_CHECK_IN":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.checkInTime || "--:--" }
      ];
    case "OUTSIDE_OFFICE":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.eventTime || payload.checkInTime || "--:--" },
        { type: "text", text: payload.townCity || "Raniganj HQ" }
      ];
    case "MISSING_CHECKOUT_REMINDER":
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.checkInTime || "--:--" }
      ];
    default:
      return [
        { type: "text", text: payload.employeeName || "Employee" },
        { type: "text", text: payload.checkInTime || payload.eventTime || "--:--" }
      ];
  }
}
async function isWhatsAppEnabledInMatrix(db3, eventType) {
  try {
    const snap = await db3.doc(MATRIX_DOC_PATH).get();
    if (snap.exists) {
      const data = snap.data() || {};
      const matrix = data.matrix || [];
      const item = matrix.find((m) => m.eventType === eventType);
      if (item) {
        return item.whatsapp === true;
      }
    }
  } catch (err) {
    console.warn("[WhatsAppService] Error checking matrix config:", err);
  }
  return true;
}
async function sendMetaWhatsAppMessage(recipientPhone, options) {
  const env2 = getWhatsAppEnvCredentials();
  if (!env2.isConfigured) {
    return {
      success: false,
      error: "WhatsApp API credentials not configured in server environment (WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing)."
    };
  }
  const normalizedPhone = normalizePhoneNumber(recipientPhone);
  if (!normalizedPhone) {
    return {
      success: false,
      error: `Invalid recipient phone number: ${recipientPhone}`
    };
  }
  const endpoint = `https://graph.facebook.com/${env2.apiVersion}/${env2.phoneNumberId}/messages`;
  let bodyPayload;
  if (typeof options === "string") {
    bodyPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "text",
      text: {
        preview_url: false,
        body: options
      }
    };
  } else if (options.type === "template") {
    if (!options.templateName || !options.templateName.trim()) {
      return {
        success: false,
        error: "Meta template name is required when sending template messages. Automated messages will not fall back to free-form text."
      };
    }
    bodyPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "template",
      template: {
        name: options.templateName.trim(),
        language: {
          code: options.languageCode || "en"
        },
        components: options.parameters && options.parameters.length > 0 ? [
          {
            type: "body",
            parameters: options.parameters
          }
        ] : []
      }
    };
  } else if (options.type === "text") {
    bodyPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizedPhone,
      type: "text",
      text: {
        preview_url: false,
        body: options.textBody || "Smart Workforce Notification"
      }
    };
  } else {
    return {
      success: false,
      error: "Invalid message options: must specify either template or text type."
    };
  }
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env2.apiToken}`,
        "Content-Type": "application/json"
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
      console.error("[WhatsAppService] Meta API Error response:", resJson);
      return {
        success: false,
        error: errMsg
      };
    }
  } catch (netErr) {
    console.error("[WhatsAppService] Network error calling Meta WhatsApp API:", netErr);
    return {
      success: false,
      error: netErr?.message || "Network error communicating with WhatsApp Cloud API"
    };
  }
}
async function reserveWhatsAppDispatchSlot(db3, idempotencyKey, payload, recipient) {
  try {
    const docRef = db3.collection("whatsapp_delivery_logs").doc(idempotencyKey);
    const result = await db3.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      if (docSnap.exists) {
        const data = docSnap.data() || {};
        if (data.status === "SENT" || data.status === "DELIVERED" || data.status === "NOT_CONFIGURED" || data.status === "NOT_REQUIRED") {
          return { canSend: false, status: data.status, reason: "ALREADY_PROCESSED" };
        }
        if (data.status === "PENDING") {
          const createdAtMs = data.createdAt ? new Date(data.createdAt).getTime() : 0;
          if (Date.now() - createdAtMs < 6e4) {
            return { canSend: false, status: "PENDING", reason: "IN_FLIGHT" };
          }
        }
        const retryCount = (data.retryCount || 0) + 1;
        transaction.set(docRef, {
          ...data,
          status: "PENDING",
          retryCount,
          updatedAt: nowIso,
          lastAttemptAt: nowIso
        }, { merge: true });
        return { canSend: true, status: "PENDING", retryCount };
      } else {
        transaction.set(docRef, {
          idempotencyKey,
          eventId: payload.eventId || "evt",
          eventType: payload.eventType,
          employeeId: payload.employeeId,
          employeeCode: payload.employeeCode,
          employeeName: payload.employeeName,
          recipient,
          status: "PENDING",
          retryCount: 0,
          createdAt: nowIso,
          updatedAt: nowIso,
          channel: "WHATSAPP"
        });
        return { canSend: true, status: "PENDING", retryCount: 0 };
      }
    });
    return result;
  } catch (err) {
    console.error("[WhatsAppService] Error in atomic idempotency reservation:", err);
    return { canSend: false, status: "ERROR", reason: "TRANSACTION_FAILED" };
  }
}
async function finalizeWhatsAppDeliveryLog(db3, idempotencyKey, data) {
  try {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const docRef = db3.collection("whatsapp_delivery_logs").doc(idempotencyKey);
    await docRef.set({
      idempotencyKey,
      ...data,
      channel: "WHATSAPP",
      updatedAt: nowIso,
      sentAt: data.status === "SENT" || data.status === "DELIVERED" ? nowIso : null,
      serverTimestamp: import_firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const notifId = `notif_wa_${idempotencyKey.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const notifRef = db3.collection("notifications").doc(notifId);
    await notifRef.set({
      id: notifId,
      notificationId: notifId,
      type: data.eventType,
      category: "ATTENDANCE",
      title: `WhatsApp: ${data.eventType.replace(/_/g, " ")}`,
      message: data.messagePreview,
      recipientUserId: data.employeeId,
      recipientEmployeeCode: data.employeeCode,
      recipientMobile: data.recipient,
      recipientRole: "EMPLOYEE",
      priority: "NORMAL",
      read: true,
      channels: ["WHATSAPP"],
      whatsappStatus: data.status,
      timestamp: nowIso,
      createdAtDeviceTime: nowIso,
      updatedAtDeviceTime: nowIso,
      serverSyncTime: nowIso,
      syncStatus: "SYNCED",
      idempotencyKey
    }, { merge: true });
  } catch (err) {
    console.warn("[WhatsAppService] Failed to finalize delivery log in Firestore:", err);
  }
}
async function dispatchWhatsAppAttendanceNotification(db3, payload) {
  const results = [];
  const env2 = getWhatsAppEnvCredentials();
  const config = await getWhatsAppConfig(db3);
  if (!config.globalEnabled) {
    console.log("[WhatsAppService] Global WhatsApp notifications are OFF. Skipping dispatch.");
    return [{ recipient: "GLOBAL", status: "NOT_REQUIRED", error: "WhatsApp notifications disabled globally by Super-Admin" }];
  }
  const isMatrixEnabled = await isWhatsAppEnabledInMatrix(db3, payload.eventType);
  if (!isMatrixEnabled) {
    console.log(`[WhatsAppService] WhatsApp is disabled in matrix for eventType: ${payload.eventType}. Skipping.`);
    return [{ recipient: "MATRIX", status: "NOT_REQUIRED", error: `WhatsApp disabled for ${payload.eventType}` }];
  }
  const metaTemplateConfig = config.metaTemplates?.[payload.eventType] || DEFAULT_META_TEMPLATES[payload.eventType];
  const isTemplateConfigured = Boolean(
    metaTemplateConfig && metaTemplateConfig.enabled !== false && metaTemplateConfig.templateName && metaTemplateConfig.templateName.trim().length > 0
  );
  const targets = [];
  if (config.recipientMode === "EMPLOYEE_ONLY" || config.recipientMode === "BOTH") {
    let empPhone = payload.employeeMobile;
    let isOptedIn = payload.whatsappConsent === "OPTED_IN" || payload.whatsappConsent === true;
    if (payload.employeeCode || payload.employeeId) {
      try {
        let regSnap = null;
        if (payload.employeeId) {
          const doc2 = await db3.collection("registrations").doc(payload.employeeId).get();
          if (doc2.exists) regSnap = doc2;
        }
        if (!regSnap && payload.employeeCode) {
          const querySnap = await db3.collection("registrations").where("employeeCode", "==", payload.employeeCode).limit(1).get();
          if (!querySnap.empty) regSnap = querySnap.docs[0];
        }
        if (regSnap && regSnap.exists) {
          const regData = regSnap.data() || {};
          if (!empPhone) {
            empPhone = regData.phone || regData.mobileNumber || regData.whatsappNumber || regData.mobile;
          }
          const consent = regData.whatsappConsent || regData.whatsappOptIn;
          isOptedIn = consent === "OPTED_IN" || consent === true;
        }
      } catch (err) {
        console.warn("[WhatsAppService] Could not lookup registration opt-in:", err);
      }
    }
    if (empPhone) {
      const normalized = normalizePhoneNumber(empPhone);
      if (normalized) {
        if (isOptedIn) {
          targets.push({ phone: normalized, isEmployee: true });
        } else {
          console.log(`[WhatsAppService] Employee ${payload.employeeCode} has not opted in (OPTED_OUT/UNKNOWN). Skipping.`);
          results.push({ recipient: normalized, status: "NOT_REQUIRED", error: "EMPLOYEE_NOT_OPTED_IN" });
        }
      }
    }
  }
  if (config.recipientMode === "ADMIN_ONLY" || config.recipientMode === "BOTH") {
    for (const adminMobile of config.adminRecipients) {
      const normalized = normalizePhoneNumber(adminMobile);
      if (normalized && !targets.some((t) => t.phone === normalized)) {
        targets.push({ phone: normalized, isEmployee: false });
      }
    }
  }
  if (targets.length === 0) {
    if (results.length === 0) {
      results.push({ recipient: "NONE", status: "NOT_REQUIRED", error: "No eligible recipients found" });
    }
    return results;
  }
  if (!isTemplateConfigured) {
    const diagnosticReason = !metaTemplateConfig || !metaTemplateConfig.templateName || !metaTemplateConfig.templateName.trim() ? `WhatsApp template not configured for event type '${payload.eventType}'. Automated attendance notifications require an approved Meta template and will not fall back to free-form text.` : `WhatsApp template '${metaTemplateConfig.templateName}' is disabled for event type '${payload.eventType}'. Automated attendance notifications will not fall back to free-form text.`;
    console.warn(`[WhatsAppService] ${diagnosticReason}`);
    for (const target of targets) {
      const phone = target.phone;
      const rawKey = `wa_${payload.eventId || "evt"}_${payload.eventType}_${phone}`;
      const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, "_");
      await finalizeWhatsAppDeliveryLog(db3, idempotencyKey, {
        eventId: payload.eventId || "evt",
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: "NOT_CONFIGURED",
        templateName: metaTemplateConfig?.templateName || void 0,
        messagePreview: "Notification skipped: WhatsApp template not configured or disabled",
        errorMessage: diagnosticReason
      });
      results.push({
        recipient: phone,
        status: "NOT_CONFIGURED",
        error: diagnosticReason
      });
    }
    return results;
  }
  if (!env2.isConfigured) {
    const diagnosticReason = "WhatsApp API credentials not configured in server environment (WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing)";
    console.warn(`[WhatsAppService] ${diagnosticReason}`);
    for (const target of targets) {
      const phone = target.phone;
      const rawKey = `wa_${payload.eventId || "evt"}_${payload.eventType}_${phone}`;
      const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, "_");
      await finalizeWhatsAppDeliveryLog(db3, idempotencyKey, {
        eventId: payload.eventId || "evt",
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: "NOT_CONFIGURED",
        templateName: metaTemplateConfig.templateName,
        messagePreview: "Notification skipped: WhatsApp credentials not configured in environment",
        errorMessage: diagnosticReason
      });
      results.push({
        recipient: phone,
        status: "NOT_CONFIGURED",
        error: diagnosticReason
      });
    }
    return results;
  }
  const templateName = metaTemplateConfig.templateName.trim();
  const languageCode = metaTemplateConfig.languageCode || "en";
  const templateParams = buildTemplateParameters(payload.eventType, payload);
  for (const target of targets) {
    const phone = target.phone;
    const rawKey = `wa_${payload.eventId || "evt"}_${payload.eventType}_${phone}`;
    const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, "_");
    const reservation = await reserveWhatsAppDispatchSlot(db3, idempotencyKey, payload, phone);
    if (!reservation.canSend) {
      console.log(`[WhatsAppService] Idempotency Hit for key ${idempotencyKey} (${reservation.reason}). Skipping duplicate.`);
      results.push({ recipient: phone, status: "IDEMPOTENT_SKIPPED" });
      continue;
    }
    const sendRes = await sendMetaWhatsAppMessage(phone, {
      type: "template",
      templateName,
      languageCode,
      parameters: templateParams
    });
    if (sendRes.success) {
      await finalizeWhatsAppDeliveryLog(db3, idempotencyKey, {
        eventId: payload.eventId || "evt",
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: "DELIVERED",
        templateName,
        providerMessageId: sendRes.providerMessageId,
        messagePreview: `[Meta Template: ${templateName}] (Delivered)`
      });
      results.push({ recipient: phone, status: "DELIVERED", providerMessageId: sendRes.providerMessageId });
    } else {
      await finalizeWhatsAppDeliveryLog(db3, idempotencyKey, {
        eventId: payload.eventId || "evt",
        eventType: payload.eventType,
        employeeId: payload.employeeId,
        employeeCode: payload.employeeCode,
        employeeName: payload.employeeName,
        recipient: phone,
        status: "FAILED",
        templateName,
        messagePreview: `[Meta Template: ${templateName}] (Failed: ${sendRes.error})`,
        errorMessage: sendRes.error
      });
      results.push({ recipient: phone, status: "FAILED", error: sendRes.error });
    }
  }
  return results;
}

// server/services/dailyAdminReportService.ts
var import_firestore4 = require("firebase-admin/firestore");

// server/services/emailService.ts
var import_nodemailer = __toESM(require("nodemailer"), 1);
async function sendMail(payload) {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const portStr = process.env.SMTP_PORT || "465";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
  if (!user || !pass) {
    return {
      success: false,
      simulated: false,
      error: "SMTP_USER or SMTP_PASSWORD is not configured in the production environment."
    };
  }
  let toList = [];
  if (Array.isArray(payload.to)) {
    toList = payload.to.map((s) => s.trim()).filter(Boolean);
  } else if (typeof payload.to === "string") {
    toList = payload.to.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const validRecipients = toList.filter((e) => emailRegex.test(e));
  if (validRecipients.length !== 3) {
    return {
      success: false,
      simulated: false,
      error: "EMAIL_RECIPIENTS contains invalid recipient configuration."
    };
  }
  const fromName = process.env.EMAIL_FROM_NAME || "Smart Workforce Admin Report";
  const from = process.env.SMTP_FROM || `${fromName} <${user}>`;
  const to = `${fromName} <${user}>`;
  const replyTo = user;
  try {
    const port = parseInt(portStr, 10);
    const isSecure = port === 465 || process.env.SMTP_SECURE === "true";
    const transporter = import_nodemailer.default.createTransport({
      host,
      port,
      secure: isSecure,
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    try {
      await transporter.verify();
      console.log(`[SMTP Email Dispatcher] Verified connection with ${host}:${port}`);
    } catch (verifyErr) {
      console.error(`[SMTP Email Dispatcher] Connection/Authentication failed:`, verifyErr);
      const msg = verifyErr.message || String(verifyErr);
      if (msg.includes("535") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("credential") || msg.toLowerCase().includes("invalid login")) {
        return {
          success: false,
          simulated: false,
          error: "Gmail SMTP authentication failed."
        };
      }
      return {
        success: false,
        simulated: false,
        error: "Unable to connect to Gmail SMTP."
      };
    }
    const info = await transporter.sendMail({
      from,
      to,
      replyTo,
      bcc: validRecipients,
      subject: payload.subject,
      html: payload.html
    });
    const accepted = info.accepted || [];
    const rejected = info.rejected || [];
    if (rejected.length > 0) {
      return {
        success: false,
        simulated: false,
        error: "Gmail rejected one or more recipients.",
        accepted,
        rejected
      };
    }
    console.log(`[SMTP Email Dispatcher] Email accepted by Gmail SMTP to ${validRecipients.join(", ")}. MessageId: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      message: "Email accepted by Gmail SMTP",
      messageId: info.messageId,
      recipientCount: validRecipients.length,
      recipients: validRecipients,
      accepted,
      rejected
    };
  } catch (err) {
    console.error(`[SMTP Email Dispatcher] Failed to send email:`, err);
    const msg = err.message || String(err);
    if (msg.includes("535") || msg.toLowerCase().includes("auth") || msg.toLowerCase().includes("credential") || msg.toLowerCase().includes("invalid login")) {
      return {
        success: false,
        simulated: false,
        error: "Gmail SMTP authentication failed."
      };
    }
    if (msg.toLowerCase().includes("connect") || msg.toLowerCase().includes("econnrefused") || msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("enotfound")) {
      return {
        success: false,
        simulated: false,
        error: "Unable to connect to Gmail SMTP."
      };
    }
    if (msg.toLowerCase().includes("recipient") || msg.includes("550") || msg.includes("553")) {
      return {
        success: false,
        simulated: false,
        error: "Gmail rejected one or more recipients."
      };
    }
    return {
      success: false,
      simulated: false,
      error: msg
    };
  }
}

// src/types/planner.ts
var isTaskOverdue = (task) => {
  const rawStatus = (task.status || "").toUpperCase().trim();
  if (rawStatus === "COMPLETED" || rawStatus === "CANCELLED" || rawStatus === "CANCEL") return false;
  if (task.approvalStatus === "APPROVED") return false;
  if (!task.dueDate) return false;
  let dueDateTimeMs;
  if (task.dueTime && !task.dueDate.includes("T")) {
    dueDateTimeMs = (/* @__PURE__ */ new Date(`${task.dueDate}T${task.dueTime}:00`)).getTime();
  } else {
    if (task.dueDate.length === 10 && !task.dueDate.includes("T")) {
      dueDateTimeMs = (/* @__PURE__ */ new Date(`${task.dueDate}T23:59:59`)).getTime();
    } else {
      dueDateTimeMs = new Date(task.dueDate).getTime();
    }
  }
  if (isNaN(dueDateTimeMs)) return false;
  return Date.now() > dueDateTimeMs;
};
var getNormalizedTaskStatus = (task) => {
  const rawStatus = (task.status || "").toUpperCase().trim();
  if (rawStatus === "CANCELLED" || rawStatus === "CANCEL") {
    return "Cancelled";
  }
  if (rawStatus === "COMPLETED" || task.approvalStatus === "APPROVED") {
    return "Completed";
  }
  if (rawStatus === "REVISION REQUESTED" || rawStatus === "REVISION_REQUESTED" || task.approvalStatus === "REVISION_REQUIRED") {
    return "Revision Requested";
  }
  if (rawStatus === "SUBMITTED" || task.approvalStatus === "PENDING_REVIEW") {
    return "Submitted";
  }
  if (isTaskOverdue(task)) {
    return "Overdue";
  }
  if (rawStatus === "IN PROGRESS" || rawStatus === "IN_PROGRESS" || task.completionPercentage > 0 && task.completionPercentage < 100) {
    return "In Progress";
  }
  return "Assigned";
};
var getEffectiveTaskStatus = (task) => {
  return getNormalizedTaskStatus(task);
};

// src/types/efficiency.ts
var getEfficiencyGrade = (score) => {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Very Good";
  if (score >= 60) return "Good";
  if (score >= 40) return "Needs Improvement";
  return "Critical";
};

// src/services/efficiency/efficiencyCalculator.ts
var isLateCheckIn = (checkInTimeStr) => {
  if (!checkInTimeStr) return false;
  try {
    const trimmed = checkInTimeStr.trim().toUpperCase();
    const parts = trimmed.split(" ");
    if (parts.length < 2) return false;
    const timePart = parts[0];
    const modifier = parts[1];
    let [hours, minutes] = timePart.split(":").map(Number);
    if (modifier === "PM" && hours < 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    const minutesSinceMidnight = hours * 60 + minutes;
    const thresholdMinutes = 10 * 60 + 30;
    return minutesSinceMidnight > thresholdMinutes;
  } catch (err) {
    return false;
  }
};
var calculateExpectedWorkingDays = (startDateStr, endDateStr) => {
  try {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const today = /* @__PURE__ */ new Date();
    const limitDate = end < today ? end : today;
    if (start > limitDate) return 0;
    let count = 0;
    const cur = new Date(start);
    while (cur <= limitDate) {
      const day = cur.getDay();
      if (day !== 0 && day !== 6) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count || 1;
  } catch (err) {
    return 1;
  }
};
var calcInvocationCount = 0;
var calculateEfficiency = (employeeId, employeeCode, employeeName, department, teamLeaderId, startDateStr, endDateStr, tasks, attendanceRecords, weightages, workDetails = []) => {
  calcInvocationCount++;
  const calcId = calcInvocationCount;
  const startTime = performance.now();
  console.log(`[EFFICIENCY_CALC_START] #${calcId} for employee=${employeeCode || employeeId} (${employeeName}) period=${startDateStr}..${endDateStr} inputTasks=${tasks.length} inputAtt=${attendanceRecords.length} inputWorkDetails=${(workDetails || []).length}`);
  const periodAttendance = attendanceRecords.filter((rec) => {
    const rId = String(rec.employeeId || "").trim().toUpperCase();
    const rCode = String(rec.employeeCode || "").trim().toUpperCase();
    const tId = String(employeeId || "").trim().toUpperCase();
    const tCode = String(employeeCode || "").trim().toUpperCase();
    const matchId = rId && (rId === tCode || tId && rId === tId);
    const matchCode = rCode && (rCode === tCode || tId && rCode === tId);
    const isEmp = matchId || matchCode;
    return isEmp && rec.date >= startDateStr && rec.date <= endDateStr;
  });
  const periodWorkDetails = (workDetails || []).filter((wd) => {
    const wId = String(wd.employeeId || "").trim().toUpperCase();
    const wCode = String(wd.employeeCode || "").trim().toUpperCase();
    const tId = String(employeeId || "").trim().toUpperCase();
    const tCode = String(employeeCode || "").trim().toUpperCase();
    const matchId = wId && (wId === tCode || tId && wId === tId);
    const matchCode = wCode && (wCode === tCode || tId && wCode === tId);
    const isEmp = matchId || matchCode;
    return isEmp && wd.date >= startDateStr && wd.date <= endDateStr;
  });
  const validWorkDetails = periodWorkDetails.filter((wd) => {
    const text = (wd.workDetails || "").trim();
    if (text.length < 15) return false;
    const alphanumeric = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (alphanumeric.length < 10) return false;
    const uniqueChars = new Set(alphanumeric).size;
    return uniqueChars >= 4;
  });
  const periodTasks = tasks.filter((task) => {
    const tId = String(employeeId || "").trim().toUpperCase();
    const tCode = String(employeeCode || "").trim().toUpperCase();
    const assignedCodes = Array.isArray(task.assignedToEmployeeCodes) ? task.assignedToEmployeeCodes.map((c) => String(c).trim().toUpperCase()) : [];
    const assignedIds = Array.isArray(task.assignedToEmployeeIds) ? task.assignedToEmployeeIds.map((i) => String(i).trim().toUpperCase()) : [];
    const creatorId = String(task.createdBy || "").trim().toUpperCase();
    const assigneeCode = String(task.assigneeCode || "").trim().toUpperCase();
    const assigneeId = String(task.assigneeId || "").trim().toUpperCase();
    const assignedTo = String(task.assignedTo || "").trim().toUpperCase();
    const empCodeField = String(task.employeeCode || "").trim().toUpperCase();
    const isAssigned = tCode && assignedCodes.includes(tCode) || tId && assignedCodes.includes(tId) || tCode && assignedIds.includes(tCode) || tId && assignedIds.includes(tId) || tCode && creatorId === tCode || tId && creatorId === tId || tCode && assigneeCode === tCode || tId && assigneeCode === tId || tCode && assigneeId === tCode || tId && assigneeId === tId || tCode && assignedTo === tCode || tId && assignedTo === tId || tCode && empCodeField === tCode || tId && empCodeField === tId;
    if (!isAssigned) return false;
    const taskDate = task.dueDate || (task.completedAt ? task.completedAt.substring(0, 10) : task.createdAtDeviceTime ? task.createdAtDeviceTime.substring(0, 10) : "");
    return taskDate >= startDateStr && taskDate <= endDateStr;
  });
  const dedupedTasksMap = /* @__PURE__ */ new Map();
  periodTasks.forEach((t) => {
    if (t.id) dedupedTasksMap.set(t.id, t);
  });
  const uniqueTasks = Array.from(dedupedTasksMap.values());
  const validTasks = uniqueTasks.filter((t) => {
    const s = (t.status || "").toUpperCase().trim();
    return s !== "CANCELLED" && s !== "CANCEL";
  });
  const isCompletedTask = (t) => {
    const s = (t.status || "").toUpperCase().trim();
    return s === "COMPLETED" || t.approvalStatus === "APPROVED" || getEffectiveTaskStatus(t) === "Completed";
  };
  const isOverdueTask = (t) => {
    return getEffectiveTaskStatus(t) === "Overdue";
  };
  const assignedTasksCount = validTasks.length;
  const completedTasksCount = validTasks.filter(isCompletedTask).length;
  const taskCompletionScore = assignedTasksCount > 0 ? Math.round(completedTasksCount / assignedTasksCount * 100) : -1;
  const completedTasks = validTasks.filter(isCompletedTask);
  let onTimeTasksCount = 0;
  completedTasks.forEach((task) => {
    if (task.completedAt && task.dueDate) {
      const completedDateOnly = task.completedAt.substring(0, 10);
      if (completedDateOnly <= task.dueDate) {
        onTimeTasksCount++;
      }
    } else {
      const effective = getEffectiveTaskStatus(task);
      if (effective === "Completed") {
        onTimeTasksCount++;
      }
    }
  });
  const onTimeCompletionScore = completedTasksCount > 0 ? Math.round(onTimeTasksCount / completedTasksCount * 100) : -1;
  const reviewedTasks = completedTasks.filter(
    (t) => t.approvalStatus === "APPROVED" || t.approvalStatus === "REVISION_REQUIRED" || t.revisions && t.revisions.length > 0
  );
  const approvedTasksCount = completedTasks.filter((t) => t.approvalStatus === "APPROVED" || !t.revisionCount && (!t.revisions || t.revisions.length === 0)).length;
  const revisionRequiredTasksCount = completedTasks.filter((t) => t.approvalStatus === "REVISION_REQUIRED" || t.revisions && t.revisions.length > 0).length;
  const totalRevisionRequests = completedTasks.reduce((sum, t) => sum + (t.revisionCount || t.revisions?.length || 0), 0);
  let qualityScore = -1;
  if (completedTasksCount > 0) {
    if (reviewedTasks.length > 0) {
      const baseRatioScore = approvedTasksCount / reviewedTasks.length * 100;
      let progressiveRevPenalty = 0;
      completedTasks.forEach((task) => {
        const revs = task.revisionCount || task.revisions?.length || 0;
        if (revs === 1) {
          progressiveRevPenalty += 10;
        } else if (revs === 2) {
          progressiveRevPenalty += 25;
        } else if (revs >= 3) {
          progressiveRevPenalty += 50;
        }
      });
      const normalizedRevPenalty = progressiveRevPenalty / completedTasksCount;
      qualityScore = Math.max(0, Math.min(100, Math.round(baseRatioScore - normalizedRevPenalty)));
    } else {
      qualityScore = 100;
    }
  }
  const expectedWorkingDays = calculateExpectedWorkingDays(startDateStr, endDateStr);
  const attendanceDaysCount = periodAttendance.length;
  const validCheckInsCount = periodAttendance.filter((rec) => rec.checkInTime).length;
  const validCheckOutsCount = periodAttendance.filter(
    (rec) => rec.checkOutTime && rec.checkOutTime !== "N/A" && rec.checkoutStatus !== "UNRESOLVED" && rec.checkoutStatus !== "PENDING_ADMIN_REVIEW"
  ).length;
  const lateArrivalsCount = periodAttendance.filter((rec) => {
    return isLateCheckIn(rec.checkInTime);
  }).length;
  let punctualityScore = -1;
  if (attendanceDaysCount > 0) {
    const attendanceRate = Math.min(1, attendanceDaysCount / expectedWorkingDays);
    const onTimeCheckIns = attendanceDaysCount - lateArrivalsCount;
    const punctualityRatio = onTimeCheckIns / attendanceDaysCount;
    const checkoutRatio = validCheckOutsCount / attendanceDaysCount;
    punctualityScore = Math.round(
      (punctualityRatio * 0.5 + attendanceRate * 0.3 + checkoutRatio * 0.2) * 100
    );
    punctualityScore = Math.max(0, Math.min(100, punctualityScore));
  }
  let workloadScore = -1;
  const overdueTasksCount = validTasks.filter(isOverdueTask).length;
  if (assignedTasksCount > 0) {
    const activeTasks = validTasks.filter((t) => !isCompletedTask(t));
    const activeCompletionSum = activeTasks.reduce((sum, t) => sum + (t.completionPercentage || 0), 0);
    const averageActiveCompletion = activeTasks.length > 0 ? activeCompletionSum / activeTasks.length : 0;
    const completedWeight = completedTasksCount / assignedTasksCount;
    const activeWeight = activeTasks.length * (averageActiveCompletion / 100) / assignedTasksCount;
    let workloadBase = (completedWeight + activeWeight) * 100;
    if (validWorkDetails.length > 0) {
      workloadBase = Math.min(100, workloadBase + 10);
    }
    const workloadOverduePenalty = overdueTasksCount * 15;
    workloadScore = Math.max(0, Math.min(100, Math.round(workloadBase - workloadOverduePenalty)));
  } else if (validWorkDetails.length > 0) {
    workloadScore = 80;
  }
  let overduePenalty = 0;
  if (overdueTasksCount === 1) {
    overduePenalty = 3;
  } else if (overdueTasksCount === 2) {
    overduePenalty = 7;
  } else if (overdueTasksCount >= 3) {
    overduePenalty = 10;
  }
  let revisionPenalty = 0;
  if (totalRevisionRequests === 1) {
    revisionPenalty = 2;
  } else if (totalRevisionRequests === 2) {
    revisionPenalty = 5;
  } else if (totalRevisionRequests === 3) {
    revisionPenalty = 8;
  } else if (totalRevisionRequests >= 4) {
    revisionPenalty = 10;
  }
  const scores = [
    { score: taskCompletionScore, weight: weightages.taskCompletion },
    { score: onTimeCompletionScore, weight: weightages.onTimeCompletion },
    { score: qualityScore, weight: weightages.quality },
    { score: punctualityScore, weight: weightages.punctuality },
    { score: workloadScore, weight: weightages.workload }
  ];
  let sumOfAvailableWeights = 0;
  let weightedScoreSum = 0;
  scores.forEach((s) => {
    if (s.score !== -1) {
      sumOfAvailableWeights += s.weight;
      weightedScoreSum += s.score * s.weight;
    }
  });
  const weightedBaseScore = sumOfAvailableWeights > 0 ? weightedScoreSum / sumOfAvailableWeights : 0;
  const calculatedFinalScore = sumOfAvailableWeights > 0 ? Math.max(0, Math.min(100, Math.round(weightedBaseScore - overduePenalty - revisionPenalty))) : -1;
  const finalScore = calculatedFinalScore;
  const grade = finalScore < 0 ? "N/A" : getEfficiencyGrade(finalScore);
  const breakdown = {
    taskCompletionScore,
    onTimeCompletionScore,
    qualityScore,
    punctualityScore,
    workloadScore,
    assignedTasksCount,
    completedTasksCount,
    onTimeTasksCount,
    approvedTasksCount,
    revisionRequiredTasksCount,
    totalRevisionRequests,
    attendanceDaysCount,
    lateArrivalsCount,
    validCheckInsCount,
    validCheckOutsCount,
    overdueTasksCount,
    overduePenalty,
    revisionPenalty,
    workDetailsSubmitted: validWorkDetails.length > 0,
    workDetailsCount: validWorkDetails.length
  };
  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
  console.log(`[EFFICIENCY_DIAGNOSTIC] empCode=${employeeCode || employeeId} targetDate=${startDateStr} attendanceFound=${attendanceDaysCount > 0} taskCount=${assignedTasksCount} completedTaskCount=${completedTasksCount} taskCompletionScore=${taskCompletionScore} onTimeCompletionScore=${onTimeCompletionScore} qualityScore=${qualityScore} punctualityScore=${punctualityScore} workloadScore=${workloadScore} overduePenalty=${overduePenalty} revisionPenalty=${revisionPenalty} sumOfAvailableWeights=${sumOfAvailableWeights} weightedScoreSum=${weightedScoreSum} weightedBaseScore=${weightedBaseScore} finalScore=${finalScore}`);
  console.log(`[EFFICIENCY_CALC_END] #${calcId} employee=${employeeCode || employeeId} finalScore=${finalScore}% grade=${grade} elapsedMs=${durationMs}ms (totalCalculationsTotal=${calcInvocationCount})`);
  return {
    finalScore,
    grade,
    breakdown
  };
};

// src/services/efficiency/efficiencyService.ts
var import_firestore3 = require("firebase/firestore");

// src/services/firebase/config.ts
var import_app = require("firebase/app");
var import_auth = require("firebase/auth");
var import_firestore2 = require("firebase/firestore");
var import_storage = require("firebase/storage");

// firebase-applet-config.json
var firebase_applet_config_default = {
  projectId: "exfin-oms-production",
  appId: "1:467454374123:web:1c039dad311c6362b44eae",
  apiKey: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  authDomain: "exfin-oms-production.firebaseapp.com",
  storageBucket: "exfin-oms-production.firebasestorage.app",
  messagingSenderId: "467454374123",
  measurementId: "AIzaSyCHsJlbsTdaDw3xOTfM5usiS6GMVL-udxM",
  oAuthClientId: "",
  recaptchaSiteKey: ""
};

// src/services/firebase/config.ts
var import_meta = {};
var env = typeof import_meta !== "undefined" && import_meta?.env ? import_meta.env : {};
var resolvedConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || firebase_applet_config_default.apiKey || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || firebase_applet_config_default.authDomain || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || firebase_applet_config_default.projectId || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || firebase_applet_config_default.storageBucket || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebase_applet_config_default.messagingSenderId || "",
  appId: env.VITE_FIREBASE_APP_ID || firebase_applet_config_default.appId || "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || firebase_applet_config_default.measurementId || "",
  firestoreDatabaseId: firebase_applet_config_default.firestoreDatabaseId || void 0
};
var app = (0, import_app.initializeApp)(resolvedConfig);
var employeeAuth = (0, import_auth.getAuth)(app);
var employeeDb = resolvedConfig.firestoreDatabaseId ? (0, import_firestore2.getFirestore)(app, resolvedConfig.firestoreDatabaseId) : (0, import_firestore2.getFirestore)(app);
var employeeStorage = (0, import_storage.getStorage)(app);
if (employeeDb) {
  try {
    (0, import_firestore2.enableIndexedDbPersistence)(employeeDb).catch((err) => {
      console.warn("Firestore persistence warning:", err.code || err);
    });
  } catch (e) {
    console.warn("Firestore enableIndexedDbPersistence catch:", e);
  }
}
var adminApp = (0, import_app.initializeApp)(resolvedConfig, "admin");
var adminAuth = (0, import_auth.getAuth)(adminApp);
var adminDb = resolvedConfig.firestoreDatabaseId ? (0, import_firestore2.getFirestore)(adminApp, resolvedConfig.firestoreDatabaseId) : (0, import_firestore2.getFirestore)(adminApp);
var adminStorage = (0, import_storage.getStorage)(adminApp);
var isAdminContext = () => {
  if (typeof window === "undefined") return false;
  const path2 = window.location.pathname;
  return path2.startsWith("/x7Kp9") || path2.startsWith("/admin-portal");
};
var auth = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminAuth : employeeAuth;
    if (prop === "concrete" || prop === "_concrete") {
      return activeTarget;
    }
    const value = Reflect.get(activeTarget, prop);
    if (typeof value === "function") {
      return value.bind(activeTarget);
    }
    return value;
  },
  set(target, prop, value) {
    const activeTarget = isAdminContext() ? adminAuth : employeeAuth;
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? adminAuth : employeeAuth);
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? adminAuth : employeeAuth, prop);
  }
});
var db = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminDb : employeeDb;
    if (prop === "concrete" || prop === "_concrete") {
      return activeTarget;
    }
    const value = Reflect.get(activeTarget, prop);
    if (typeof value === "function") {
      return value.bind(activeTarget);
    }
    return value;
  },
  set(target, prop, value) {
    const activeTarget = isAdminContext() ? adminDb : employeeDb;
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? adminDb : employeeDb);
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? adminDb : employeeDb, prop);
  }
});
var storage = new Proxy({}, {
  get(target, prop, receiver) {
    const activeTarget = isAdminContext() ? adminStorage : employeeStorage;
    if (prop === "concrete" || prop === "_concrete") {
      return activeTarget;
    }
    const value = Reflect.get(activeTarget, prop);
    if (typeof value === "function") {
      return value.bind(activeTarget);
    }
    return value;
  },
  set(target, prop, value) {
    const activeTarget = isAdminContext() ? adminStorage : employeeStorage;
    return Reflect.set(activeTarget, prop, value);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(isAdminContext() ? adminStorage : employeeStorage);
  },
  has(target, prop) {
    return Reflect.has(isAdminContext() ? adminStorage : employeeStorage, prop);
  }
});
console.log("Firebase config initialized dynamic proxies for auth, db, storage.");

// src/services/efficiency/efficiencyService.ts
var DEFAULT_WEIGHTAGES = {
  taskCompletion: 30,
  onTimeCompletion: 25,
  quality: 20,
  punctuality: 15,
  workload: 10
};

// server/services/dailyAdminReportService.ts
var DEFAULT_TARGET_RECIPIENTS = [
  "admin@yourcompany.com"
];
function getCentralizedRecipients(configEmails) {
  if (Array.isArray(configEmails)) {
    return configEmails;
  }
  if (process.env.EMAIL_RECIPIENTS) {
    const envList = process.env.EMAIL_RECIPIENTS.split(",").map((s) => s.trim()).filter(Boolean);
    if (envList.length > 0) {
      return envList;
    }
  }
  return [...DEFAULT_TARGET_RECIPIENTS];
}
var DEFAULT_REPORT_CONFIG = {
  enabled: true,
  adminEmails: [...DEFAULT_TARGET_RECIPIENTS],
  sendTime: "07:00 AM",
  includeAttendance: true,
  includeLeaves: true,
  includeExpenses: true,
  includeOtherDailyActivity: true
};
function validateAdminEmails(emails) {
  if (!emails) {
    return { valid: false, error: "Recipient list is required." };
  }
  if (!Array.isArray(emails)) {
    return { valid: false, error: "Recipient list must be an array." };
  }
  if (emails.length > 20) {
    return { valid: false, error: "Maximum 20 email recipients are allowed." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const cleaned = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i < emails.length; i++) {
    const raw = emails[i];
    if (typeof raw !== "string") {
      return { valid: false, error: `Invalid recipient format at index ${i}.` };
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      return { valid: false, error: "Email addresses cannot be empty." };
    }
    if (!emailRegex.test(trimmed)) {
      return { valid: false, error: `"${trimmed}" is not a valid email address.` };
    }
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      return { valid: false, error: `Duplicate email address detected: "${trimmed}".` };
    }
    seen.add(lower);
    cleaned.push(trimmed);
  }
  return { valid: true, cleaned };
}
function getKolkataDateString(date = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}
function getPreviousKolkataDateString(currentDate = /* @__PURE__ */ new Date()) {
  const todayKolkata = getKolkataDateString(currentDate);
  const [yearStr, monthStr, dayStr] = todayKolkata.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  const utc = new Date(Date.UTC(year, month, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  const prevYear = utc.getUTCFullYear();
  const prevMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const prevDay = String(utc.getUTCDate()).padStart(2, "0");
  return `${prevYear}-${prevMonth}-${prevDay}`;
}
function getKolkataCurrentMinutes(currentDate = /* @__PURE__ */ new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hour12: false
  });
  const parts = formatter.formatToParts(currentDate);
  const hourPart = parts.find((p) => p.type === "hour");
  const minutePart = parts.find((p) => p.type === "minute");
  let hour = hourPart ? parseInt(hourPart.value, 10) : 0;
  if (hour === 24) hour = 0;
  const min = minutePart ? parseInt(minutePart.value, 10) : 0;
  return hour * 60 + min;
}
function formatDateStringFriendly(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthNum = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const monthName = months[monthNum - 1] || "Jan";
  return `${day} ${monthName} ${year}`;
}
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  try {
    const trimmed = timeStr.trim().toUpperCase();
    const match = trimmed.match(/^(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3];
    if (ampm === "PM" && hours < 12) {
      hours += 12;
    } else if (ampm === "AM" && hours === 12) {
      hours = 0;
    }
    return hours * 60 + minutes;
  } catch (e) {
    return null;
  }
}
function to12HourFormat(time24) {
  if (!time24) return { hour: "07", minute: "00", period: "AM" };
  try {
    const trimmed = time24.trim().toUpperCase();
    const match = trimmed.match(/^(\d+):(\d+)\s*(AM|PM)?$/);
    if (!match) {
      return { hour: "07", minute: "00", period: "AM" };
    }
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    let period = match[3] || "AM";
    if (!match[3]) {
      if (hours >= 12) {
        period = "PM";
        if (hours > 12) hours -= 12;
      } else {
        period = "AM";
        if (hours === 0) hours = 12;
      }
    } else {
      if (hours > 12) {
        hours = hours % 12 || 12;
      }
    }
    return {
      hour: String(hours).padStart(2, "0"),
      minute: String(minutes).padStart(2, "0"),
      period
    };
  } catch (e) {
    return { hour: "07", minute: "00", period: "AM" };
  }
}
function isKolkataLateCheckIn(checkInTimeStr) {
  const mins = parseTimeToMinutes(checkInTimeStr);
  if (mins === null) return false;
  return mins > 630;
}
var inMemoryReportConfig = { ...DEFAULT_REPORT_CONFIG };
var hasLoadedFromFirestore = false;
var isSchedulerExecuting = false;
var isSchedulerDisabled = false;
var hasLoggedSchedulerDisabled = false;
async function getDailyReportConfig(db3) {
  if (!db3) {
    return { ...inMemoryReportConfig };
  }
  try {
    let snap = await db3.collection("system_settings").doc("daily_admin_report").get();
    if (!snap.exists) {
      snap = await db3.collection("notification_settings").doc("daily_admin_report_config").get();
    }
    if (isSchedulerDisabled) {
      isSchedulerDisabled = false;
      hasLoggedSchedulerDisabled = false;
      console.log("[DailyReport Scheduler] Self-healed: Successfully read configuration from Firestore. Re-enabling scheduler.");
    }
    if (!snap.exists) {
      if (process.env.EMAIL_RECIPIENTS) {
        const envList = process.env.EMAIL_RECIPIENTS.split(",").map((s) => s.trim()).filter(Boolean);
        if (envList.length > 0) {
          inMemoryReportConfig.adminEmails = envList;
        }
      }
      hasLoadedFromFirestore = true;
      return { ...inMemoryReportConfig };
    }
    const data = snap.data();
    let adminEmails = [];
    if (Array.isArray(data?.adminEmails)) {
      adminEmails = data.adminEmails;
    } else if (typeof data?.adminEmail === "string" && data.adminEmail.trim()) {
      adminEmails = [data.adminEmail.trim()];
    } else {
      adminEmails = inMemoryReportConfig.adminEmails;
    }
    const loadedConfig = {
      enabled: data?.enabled !== false,
      adminEmails,
      sendTime: data?.sendTime || inMemoryReportConfig.sendTime || "07:00 AM",
      includeAttendance: data?.includeAttendance !== false,
      includeLeaves: data?.includeLeaves !== false,
      includeExpenses: data?.includeExpenses !== false,
      includeOtherDailyActivity: data?.includeOtherDailyActivity !== false,
      updatedAt: data?.updatedAt || inMemoryReportConfig.updatedAt,
      updatedBy: data?.updatedBy || inMemoryReportConfig.updatedBy,
      lastSchedulerTick: data?.lastSchedulerTick || inMemoryReportConfig.lastSchedulerTick
    };
    inMemoryReportConfig = loadedConfig;
    hasLoadedFromFirestore = true;
    return loadedConfig;
  } catch (err) {
    if (!hasLoadedFromFirestore) {
      console.log("[DailyReportService] Note: Using local configuration cache (Firestore:", err?.message || "unavailable", ")");
    }
    return { ...inMemoryReportConfig };
  }
}
async function saveDailyReportConfig(db3, config, updatedBy) {
  const current = await getDailyReportConfig(db3);
  let emailsToSave = config.adminEmails;
  if (emailsToSave !== void 0) {
    const valResult = validateAdminEmails(emailsToSave);
    if (!valResult.valid) {
      throw new Error(valResult.error);
    }
    emailsToSave = valResult.cleaned;
  }
  const updated = {
    ...current,
    ...config,
    adminEmails: emailsToSave !== void 0 ? emailsToSave : current.adminEmails,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedBy
  };
  inMemoryReportConfig = { ...updated };
  if (isSchedulerDisabled) {
    isSchedulerDisabled = false;
    hasLoggedSchedulerDisabled = false;
    console.log("[DailyReport Scheduler] Config updated: Re-enabling scheduler.");
  }
  if (db3) {
    try {
      await db3.collection("system_settings").doc("daily_admin_report").set({
        enabled: updated.enabled,
        sendTime: updated.sendTime,
        adminEmails: updated.adminEmails,
        includeAttendance: updated.includeAttendance,
        includeLeaves: updated.includeLeaves,
        includeExpenses: updated.includeExpenses,
        includeOtherDailyActivity: updated.includeOtherDailyActivity,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy
      }, { merge: true });
      await db3.collection("notification_settings").doc("daily_admin_report_config").set(updated, { merge: true });
    } catch (writeErr) {
      console.warn("[DailyReportService] Saved configuration to in-memory store; Firestore sync notice:", writeErr?.message || writeErr);
    }
  }
  return updated;
}
async function generateAndSendDailyReport(db3, targetDateStr, isManualSend = false, triggerBy = "SYSTEM_SCHEDULER") {
  const reportDate = targetDateStr || getPreviousKolkataDateString();
  const dateFormattedFriendly = formatDateStringFriendly(reportDate);
  const config = await getDailyReportConfig(db3);
  if (!config.enabled && !isManualSend) {
    return { success: true, message: "Daily Admin Report is currently disabled in configuration.", reportDate };
  }
  const recipients = config.adminEmails || [];
  const reportLogRef = db3.collection("daily_admin_reports").doc(reportDate);
  if (recipients.length === 0) {
    await reportLogRef.set({
      reportDate,
      status: "FAILED",
      recipientCount: 0,
      recipients: [],
      recipient: "",
      error: "No Admin email recipients are configured.",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: import_firestore4.FieldValue.serverTimestamp()
    }, { merge: true });
    return { success: false, message: "No Admin email recipients are configured.", reportDate };
  }
  const primaryRecipient = recipients[0];
  const canProceed = await db3.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(reportLogRef);
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data) {
        if (data.status === "SENT" && !isManualSend) {
          return { proceed: false, reason: "Already successfully sent report for this date." };
        }
        if (data.status === "SENDING" && !isManualSend) {
          const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
          const diffMins = (Date.now() - startedAt) / 6e4;
          if (diffMins < 10) {
            return { proceed: false, reason: "A report dispatch is already active for this date." };
          }
        }
      }
    }
    transaction.set(reportLogRef, {
      reportDate,
      status: "SENDING",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      recipientCount: recipients.length,
      recipients,
      recipient: primaryRecipient,
      triggeredBy: triggerBy,
      createdAt: import_firestore4.FieldValue.serverTimestamp(),
      updatedAt: import_firestore4.FieldValue.serverTimestamp()
    }, { merge: true });
    return { proceed: true, reason: "Ok" };
  });
  if (!canProceed.proceed) {
    console.log(`[DailyReportService] Skipping generation: ${canProceed.reason}`);
    return { success: false, message: canProceed.reason, reportDate, recipient: primaryRecipient };
  }
  try {
    const regsSnap = await db3.collection("registrations").get();
    const employeesMap = /* @__PURE__ */ new Map();
    const employeeCodeMap = /* @__PURE__ */ new Map();
    regsSnap.forEach((doc2) => {
      const data = doc2.data() || {};
      const reg = { id: doc2.id, ...data };
      employeesMap.set(doc2.id, reg);
      if (data.employeeCode) {
        employeeCodeMap.set(data.employeeCode, reg);
      }
    });
    const totalEmployeesCount = Array.from(employeesMap.values()).filter(
      (r) => r.status === "Approved" && r.role !== "ADMIN" && r.role !== "SUPER_ADMIN"
    ).length;
    let presentCount = 0;
    let lateCount = 0;
    let checkedInCount = 0;
    let checkedOutCount = 0;
    let unresolvedCount = 0;
    let wfhCount = 0;
    let clientVisitCount = 0;
    let outdoorWorkCount = 0;
    const attendanceRows = [];
    if (config.includeAttendance) {
      const attSnap2 = await db3.collection("attendance").where("date", "==", reportDate).get();
      attSnap2.forEach((doc2) => {
        const d = doc2.data() || {};
        const empCode = d.employeeCode || "";
        const empName = d.employeeName || d.name || employeeCodeMap.get(empCode)?.name || "Employee";
        const attType = d.attendanceType || "Office";
        const inTime = d.checkInTime || "-";
        const outTime = d.checkOutTime || "-";
        const workHrs = d.workingHours || "-";
        const isLate = d.isLate === true || d.late === true || d.checkInTime && isKolkataLateCheckIn(d.checkInTime);
        const status = d.checkoutStatus || "Completed";
        presentCount++;
        if (isLate) lateCount++;
        if (inTime && inTime !== "-") checkedInCount++;
        if (outTime && outTime !== "-") checkedOutCount++;
        if (status === "Pending" || status === "UNRESOLVED" || inTime !== "-" && outTime === "-") unresolvedCount++;
        if (attType === "WFH") wfhCount++;
        else if (attType === "Client Visit" || attType === "CLIENT_VISIT") clientVisitCount++;
        else if (attType === "Outdoor Work" || attType === "OUTDOOR_WORK") outdoorWorkCount++;
        let locDetails = "-";
        if (attType === "WFH") {
          locDetails = d.wfhReason ? `WFH Reason: ${d.wfhReason}` : "WFH";
        } else if (attType === "Client Visit" || attType === "CLIENT_VISIT") {
          locDetails = `${d.clientName || "Client"} (${d.clientLocation || d.townCity || "Unknown"})`;
        } else if (attType === "Outdoor Work" || attType === "OUTDOOR_WORK") {
          locDetails = d.description || d.outdoorType || "Outdoor";
        } else {
          locDetails = d.townCity ? `Office: ${d.townCity}` : "HQ Office";
        }
        attendanceRows.push(`
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; color: #1e293b;">${empCode}</td>
            <td style="padding: 10px; color: #334155;">${empName}</td>
            <td style="padding: 10px; color: #334155;">
              <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${attType === "WFH" ? "#dbeafe; color: #1e40af;" : attType.includes("Client") ? "#fef3c7; color: #92400e;" : attType.includes("Outdoor") ? "#f3e8ff; color: #6b21a8;" : "#d1fae5; color: #065f46;"}">${attType}</span>
            </td>
            <td style="padding: 10px; color: #334155;">${inTime}</td>
            <td style="padding: 10px; color: #334155;">${outTime}</td>
            <td style="padding: 10px; color: #334155;">${workHrs}</td>
            <td style="padding: 10px; color: #334155;">
              <span style="font-weight: 500; color: ${status === "Pending" || status === "UNRESOLVED" ? "#ef4444;" : "#10b981;"}">${status}</span>
            </td>
            <td style="padding: 10px; color: #334155;">${isLate ? '<span style="color: #f59e0b; font-weight: bold;">LATE</span>' : "On-Time"}</td>
            <td style="padding: 10px; font-size: 12px; color: #64748b;">${locDetails}</td>
          </tr>
        `);
      });
    }
    const absentCount = Math.max(0, totalEmployeesCount - presentCount);
    const leaveRows = [];
    if (config.includeLeaves) {
      const leavesSnap = await db3.collection("leaves").get();
      leavesSnap.forEach((doc2) => {
        const l = doc2.data() || {};
        const startDate = l.startDate || "";
        const endDate = l.endDate || "";
        const empCode = l.employeeCode || "";
        const empName = l.employeeName || employeeCodeMap.get(empCode)?.name || "Employee";
        const reason = l.reason || "-";
        const status = l.status || l.approvalStatus || "APPROVED";
        if (startDate && endDate && reportDate >= startDate && reportDate <= endDate) {
          leaveRows.push(`
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px; font-weight: bold; color: #1e293b;">${empCode}</td>
              <td style="padding: 10px; color: #334155;">${empName}</td>
              <td style="padding: 10px; color: #334155;">${startDate} to ${endDate} (${l.totalDays || 1} days)</td>
              <td style="padding: 10px; color: #334155;">
                <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${status === "APPROVED" ? "#d1fae5; color: #065f46;" : "#fee2e2; color: #991b1b;"}">${status}</span>
              </td>
              <td style="padding: 10px; font-size: 12px; color: #64748b;">${reason}</td>
            </tr>
          `);
        }
      });
    }
    const expenseRows = [];
    let totalExpensesSum = 0;
    if (config.includeExpenses) {
      const expSnap = await db3.collection("expenses").where("date", "==", reportDate).get();
      expSnap.forEach((doc2) => {
        const e = doc2.data() || {};
        const empCode = e.employeeCode || "";
        const empName = e.employeeName || employeeCodeMap.get(empCode)?.name || "Employee";
        const amount = parseFloat(e.amount) || 0;
        const category = e.category || "Miscellaneous";
        const desc = e.description || "-";
        const status = e.status || "Pending";
        totalExpensesSum += amount;
        expenseRows.push(`
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: bold; color: #1e293b;">${empCode}</td>
            <td style="padding: 10px; color: #334155;">${empName}</td>
            <td style="padding: 10px; font-weight: bold; color: #10b981;">\u20B9${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
            <td style="padding: 10px; color: #334155;">${category}</td>
            <td style="padding: 10px; font-size: 12px; color: #64748b;">${desc}</td>
            <td style="padding: 10px; color: #334155;">
              <span style="padding: 3px 8px; border-radius: 12px; font-size: 11px; background: ${status === "Approved" ? "#d1fae5; color: #065f46;" : status === "Rejected" ? "#fee2e2; color: #991b1b;" : "#fef3c7; color: #92400e;"}">${status}</span>
            </td>
          </tr>
        `);
      });
    }
    let otherDataHtml = '<p style="color: #64748b; font-size: 13px;">No other operational activities found for this date.</p>';
    if (config.includeOtherDailyActivity) {
      const taskSnap = await db3.collection("tasks").where("dueDate", "==", reportDate).get();
      const taskRows = [];
      taskSnap.forEach((doc2) => {
        const t = doc2.data() || {};
        taskRows.push(`<li><strong>${t.title}</strong> (Assigned: ${t.assignedToEmployeeCodes?.join(", ") || "-"}, Status: ${t.status})</li>`);
      });
      if (taskRows.length > 0) {
        otherDataHtml = `
          <div style="background: #f8fafc; border-radius: 8px; padding: 15px; border-left: 4px solid #6366f1;">
            <h4 style="margin: 0 0 10px 0; color: #1e293b; font-size: 14px;">Tasks Due on this Day</h4>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #334155; line-height: 1.6;">
              ${taskRows.join("")}
            </ul>
          </div>
        `;
      }
    }
    const employeesList = Array.from(employeesMap.values()).filter((r) => {
      const status = (r.status || "").toUpperCase();
      const role = (r.role || "").toUpperCase();
      if (status === "DELETED" || status === "PENDING" || status === "REJECTED") return false;
      if (role === "ADMIN" || role === "SUPER_ADMIN") return false;
      return status === "APPROVED" || status === "Approved" || status === "ACTIVE" || !r.status;
    });
    const tasksSnap = await db3.collection("tasks").get();
    const rawTasks = [];
    tasksSnap.forEach((tDoc) => rawTasks.push({ id: tDoc.id, ...tDoc.data() }));
    const allTasks = rawTasks.filter((t) => {
      const tDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : "");
      return tDate === reportDate;
    });
    const attSnap = await db3.collection("attendance").where("date", "==", reportDate).get();
    const allAttendance = [];
    attSnap.forEach((aDoc) => allAttendance.push({ id: aDoc.id, ...aDoc.data() }));
    const workDetailsSnap = await db3.collection("daily_work_details").where("date", "==", reportDate).get();
    const allWorkDetails = [];
    workDetailsSnap.forEach((wDoc) => allWorkDetails.push({ id: wDoc.id, ...wDoc.data() }));
    const evaluatedEmployees = [];
    let totalScoreSum = 0;
    let aboveTargetCount = 0;
    let belowTargetCount = 0;
    let insufficientDataCount = 0;
    employeesList.forEach((emp) => {
      const empCode = emp.employeeCode || emp.id;
      const empName = emp.name || empCode;
      const dept = emp.department || emp.office || "Operations";
      const teamLeaderId = emp.teamLeaderId || null;
      const calc = calculateEfficiency(
        emp.id || empCode,
        empCode,
        empName,
        dept,
        teamLeaderId,
        reportDate,
        reportDate,
        allTasks,
        allAttendance,
        DEFAULT_WEIGHTAGES,
        allWorkDetails
      );
      const efficiency = Math.round(calc.finalScore);
      const grade = calc.grade;
      const hasActivity = allAttendance.some((a) => (a.employeeCode === empCode || a.employeeId === emp.id || a.employeeId === empCode) && (a.date === reportDate || (a.createdAtDeviceTime || "").startsWith(reportDate))) || allTasks.some((t) => {
        const matchCode = t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(empCode);
        const matchId = t.assignedToEmployeeIds && (t.assignedToEmployeeIds.includes(emp.id) || t.assignedToEmployeeIds.includes(empCode));
        const tDate = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : t.createdAtDeviceTime ? t.createdAtDeviceTime.substring(0, 10) : "");
        return (matchCode || matchId) && tDate === reportDate;
      });
      if (!hasActivity && efficiency === 0) {
        insufficientDataCount++;
      }
      totalScoreSum += Math.max(0, efficiency);
      if (efficiency >= 75) {
        aboveTargetCount++;
      } else {
        belowTargetCount++;
      }
      evaluatedEmployees.push({
        empCode,
        empName,
        dept,
        efficiency,
        grade,
        breakdown: calc.breakdown,
        insufficientData: !hasActivity && efficiency === 0
      });
    });
    for (const emp of evaluatedEmployees) {
      if (!Number.isFinite(emp.efficiency)) {
        throw new Error(`Daily Report validation failed: Non-finite efficiency for ${emp.empCode}`);
      }
      if (emp.efficiency < -1 || emp.efficiency > 100) {
        throw new Error(`Daily Report validation failed: Out of bounds efficiency ${emp.efficiency} for ${emp.empCode}`);
      }
      if (emp.breakdown && emp.breakdown.assignedTasksCount === 0) {
        if (emp.breakdown.taskCompletionScore !== -1 || emp.breakdown.onTimeCompletionScore !== -1 || emp.breakdown.qualityScore !== -1) {
          throw new Error(`Daily Report validation failed: No-task employee ${emp.empCode} penalized by task factors.`);
        }
      }
    }
    const validEvaluated = evaluatedEmployees;
    const evaluatedCount = evaluatedEmployees.length;
    const overallAvgEfficiency = validEvaluated.length > 0 ? Math.round(totalScoreSum / validEvaluated.length) : 0;
    const sortedByEff = [...validEvaluated].sort((a, b) => b.efficiency - a.efficiency);
    const highestEff = sortedByEff.length > 0 ? sortedByEff[0].efficiency : 0;
    const lowestEff = sortedByEff.length > 0 ? sortedByEff[sortedByEff.length - 1].efficiency : 0;
    const topPerformerCandidates = validEvaluated.filter((e) => e.efficiency >= 60).sort((a, b) => {
      if (b.efficiency !== a.efficiency) {
        return b.efficiency - a.efficiency;
      }
      return a.empCode.localeCompare(b.empCode);
    });
    const topPerformers = topPerformerCandidates.slice(0, 5);
    const improvementCandidates = validEvaluated.filter((e) => e.efficiency < 60).sort((a, b) => {
      if (a.efficiency !== b.efficiency) {
        return a.efficiency - b.efficiency;
      }
      return a.empCode.localeCompare(b.empCode);
    });
    const bottomPerformers = improvementCandidates.slice(0, 5);
    const overlap = topPerformers.filter(
      (top) => bottomPerformers.some((bottom) => bottom.empCode === top.empCode)
    );
    if (overlap.length > 0) {
      throw new Error("Daily Report validation failed: Top Performers and Needs Improvement overlap.");
    }
    const invalidTopPerformers = topPerformers.filter((e) => e.efficiency < 60);
    if (invalidTopPerformers.length > 0) {
      throw new Error("Daily Report validation failed: Top Performers contains employee below 60%.");
    }
    const invalidImprovement = bottomPerformers.filter((e) => e.efficiency >= 60);
    if (invalidImprovement.length > 0) {
      throw new Error("Daily Report validation failed: Needs Improvement contains employee at or above 60%.");
    }
    const hasBelowThresholdEmployees = validEvaluated.some((e) => e.efficiency < 60);
    if (bottomPerformers.length === 0 && hasBelowThresholdEmployees) {
      throw new Error("Daily Report validation failed: Employees below 60% exist but Needs Improvement is empty.");
    }
    const dist = {
      excellent: validEvaluated.filter((e) => e.efficiency >= 90).length,
      good: validEvaluated.filter((e) => e.efficiency >= 75 && e.efficiency < 90).length,
      needsImprovement: validEvaluated.filter((e) => e.efficiency >= 60 && e.efficiency < 75).length,
      critical: validEvaluated.filter((e) => e.efficiency < 60).length,
      insufficient: insufficientDataCount
    };
    const teamMap = /* @__PURE__ */ new Map();
    evaluatedEmployees.forEach((e) => {
      if (e.insufficientData) return;
      const d = e.dept;
      if (!teamMap.has(d)) {
        teamMap.set(d, { totalScore: 0, count: 0, above: 0, needAttention: 0 });
      }
      const t = teamMap.get(d);
      t.count++;
      t.totalScore += e.efficiency;
      if (e.efficiency >= 75) t.above++;
      else t.needAttention++;
    });
    const teamRowsHtml = [];
    teamMap.forEach((val, teamName) => {
      const avg = Math.round(val.totalScore / val.count);
      teamRowsHtml.push(`
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-weight: bold; color: #1e293b;">${teamName}</td>
          <td style="padding: 10px; font-weight: bold; color: ${avg >= 75 ? "#059669" : "#d97706"};">${avg}%</td>
          <td style="padding: 10px; color: #334155;">${val.count}</td>
          <td style="padding: 10px; color: #059669; font-weight: 500;">${val.above}</td>
          <td style="padding: 10px; color: #dc2626; font-weight: 500;">${val.needAttention}</td>
        </tr>
      `);
    });
    const diagnosticHtml = validEvaluated.length === 0 ? `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 12px; color: #991b1b;">
        <strong>Server Diagnostics:</strong> No efficiency data available.<br/>
        - Report Date: ${reportDate}<br/>
        - Employees Found: ${employeesList.length}<br/>
        - Attendance Records Found: ${allAttendance.length}<br/>
        - Tasks Found: ${allTasks.length}<br/>
        - Valid Scores: ${validEvaluated.length}
      </div>
    ` : "";
    const topPerformersRowsHtml = topPerformers.map((p, idx) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-weight: bold; color: #1e293b;">#${idx + 1}</td>
        <td style="padding: 10px; color: #334155;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 10px; font-weight: bold; color: #059669;">${p.efficiency}%</td>
        <td style="padding: 10px; color: #334155;">${p.workHours}</td>
        <td style="padding: 10px; color: #334155;">${p.tasksCompleted}/${p.tasksTotal} tasks</td>
      </tr>
    `).join("");
    const bottomPerformersRowsHtml = bottomPerformers.map((p) => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; color: #334155;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 10px; font-weight: bold; color: #dc2626;">${p.efficiency}%</td>
        <td style="padding: 10px; color: #334155;">${p.workHours}</td>
        <td style="padding: 10px; color: #334155;">${p.tasksCompleted}/${p.tasksTotal} tasks</td>
        <td style="padding: 10px; font-size: 12px; color: #b91c1c;">${p.reason}</td>
      </tr>
    `).join("");
    const highestEffEmp = sortedByEff.length > 0 ? sortedByEff[0] : null;
    const lowestEffEmp = sortedByEff.length > 0 ? sortedByEff[sortedByEff.length - 1] : null;
    const highestEffEmpName = highestEffEmp ? `${highestEffEmp.empName} (${highestEffEmp.empCode})` : "N/A";
    const lowestEffEmpName = lowestEffEmp ? `${lowestEffEmp.empName} (${lowestEffEmp.empCode})` : "N/A";
    const topPerformersEmptyMessage = validEvaluated.length > 0 ? `No qualifying top performers (all evaluated employees scored below 60%).` : `No performance records available`;
    const topPerformersRows = topPerformers.length > 0 ? topPerformers.map((p, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 10px; font-weight: bold; color: #0f766e;">#${idx + 1}</td>
        <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 12px 10px; color: #475569;">${p.dept}</td>
        <td style="padding: 12px 10px; font-weight: bold; color: #047857; text-align: right;">${p.efficiency}%</td>
      </tr>
    `).join("") : `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">${topPerformersEmptyMessage}</td></tr>`;
    const needsImprovementEmptyMessage = validEvaluated.length > 0 ? `No improvement records needed (All performers scored &ge; 60%)` : `No improvement records available`;
    const needsImprovementRows = bottomPerformers.length > 0 ? bottomPerformers.map((p, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 10px; font-weight: bold; color: #b91c1c;">#${idx + 1}</td>
        <td style="padding: 12px 10px; color: #0f172a; font-weight: 500;">${p.empName} <span style="font-size: 11px; color: #64748b;">(${p.empCode})</span></td>
        <td style="padding: 12px 10px; color: #475569;">${p.dept}</td>
        <td style="padding: 12px 10px; font-weight: bold; color: #b91c1c; text-align: right;">${p.efficiency}%</td>
      </tr>
    `).join("") : `<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b; font-style: italic;">${needsImprovementEmptyMessage}</td></tr>`;
    const appUrl = process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, "") : "https://your-domain.com";
    const adminPanelUrl = `${appUrl}/x7Kp9`;
    const generatedTimeKolkata = (/* @__PURE__ */ new Date()).toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short"
    });
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Workforce Daily Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 20px; margin: 0; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    
    <!-- 1. Header -->
    <div style="background-color: #0f766e; color: #ffffff; padding: 32px 24px; text-align: center; border-bottom: 4px solid #0d9488;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Smart Workforce</h1>
      <p style="margin: 4px 0 0 0; font-size: 16px; color: #ccfbf1; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Daily Administration Report</p>
      <div style="margin-top: 16px; display: inline-block; background-color: rgba(255, 255, 255, 0.15); padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: bold;">
        Report Date: ${dateFormattedFriendly}
      </div>
      <p style="margin: 8px 0 0 0; font-size: 11px; color: #99f6e4;">Generated Time: ${generatedTimeKolkata} (Asia/Kolkata)</p>
    </div>

    <div style="padding: 25px;">
      
      <!-- 2. Attendance Overview -->
      <div style="margin-bottom: 35px;">
        <h3 style="margin-top: 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">2. Attendance Overview</h3>
        
        <!-- Stats Grid -->
        <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-top: 15px; margin-bottom: 25px;">
          <div style="flex: 1 1 120px; background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #047857; text-transform: uppercase;">Present</div>
            <div style="font-size: 24px; font-weight: 800; color: #065f46; margin-top: 2px;">${presentCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #b91c1c; text-transform: uppercase;">Absent</div>
            <div style="font-size: 24px; font-weight: 800; color: #991b1b; margin-top: 2px;">${absentCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #1d4ed8; text-transform: uppercase;">WFH</div>
            <div style="font-size: 24px; font-weight: 800; color: #1e40af; margin-top: 2px;">${wfhCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #b45309; text-transform: uppercase;">Client Visit</div>
            <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 2px;">${clientVisitCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #f3e8ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #7e22ce; text-transform: uppercase;">Outdoor</div>
            <div style="font-size: 24px; font-weight: 800; color: #6b21a8; margin-top: 2px;">${outdoorWorkCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #d97706; text-transform: uppercase;">Late</div>
            <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 2px;">${lateCount}</div>
          </div>

          <div style="flex: 1 1 120px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
            <div style="font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Expenses</div>
            <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 2px;">\u20B9${totalExpensesSum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
          </div>
        </div>

        <!-- Attendance Detail Table -->
        ${attendanceRows.length === 0 ? '<p style="color: #64748b; font-size: 13px; font-style: italic;">No attendance recorded for this date.</p>' : `
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 12px 10px;">Emp Code</th>
                  <th style="padding: 12px 10px;">Name</th>
                  <th style="padding: 12px 10px;">Type</th>
                  <th style="padding: 12px 10px;">In</th>
                  <th style="padding: 12px 10px;">Out</th>
                  <th style="padding: 12px 10px;">Hours</th>
                  <th style="padding: 12px 10px;">Status</th>
                  <th style="padding: 12px 10px;">Late</th>
                  <th style="padding: 12px 10px;">Location Details</th>
                </tr>
              </thead>
              <tbody>
                ${attendanceRows.join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- 3. Efficiency Summary -->
      <div style="margin-bottom: 35px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">3. Efficiency Summary</h3>
        ${validEvaluated.length === 0 ? `
          <p style="color: #64748b; font-size: 13px; font-style: italic; padding: 15px; background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; text-align: center; margin-top: 15px;">
            No efficiency data available for this reporting period.
          </p>
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; margin-top: 10px; font-size: 12px; color: #991b1b;">
            <strong>Server Diagnostics:</strong> Efficiency data source returned 0 evaluated employees.<br/>
            - Report Date: ${reportDate}<br/>
            - Employees Found: ${employeesList.length}<br/>
            - Attendance Records Found: ${allAttendance.length}<br/>
            - Tasks Found: ${allTasks.length}
          </div>
        ` : `
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-top: 15px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr style="border-bottom: 1px solid #dcfce7;">
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Team Average Efficiency</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #0f766e; font-size: 16px;">${overallAvgEfficiency}%</td>
              </tr>
              <tr style="border-bottom: 1px solid #dcfce7;">
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Highest Efficiency Employee</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #047857;">${highestEffEmpName} (${highestEff}%)</td>
              </tr>
              <tr style="border-bottom: 1px solid #dcfce7;">
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Lowest Efficiency Employee</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #b91c1c;">${lowestEffEmpName} (${lowestEff}%)</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #1e3a1e; font-weight: 600;">Total Employees Evaluated</td>
                <td style="padding: 10px 0; text-align: right; font-weight: bold; color: #0f172a;">${evaluatedCount}</td>
              </tr>
            </table>
          </div>
        `}
      </div>

      <!-- 4. Efficiency Leaderboard -->
      <div style="margin-bottom: 35px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">4. Efficiency Leaderboard</h3>
        
        <h4 style="color: #047857; font-size: 13px; font-weight: bold; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">\u{1F3C6} Top Performers</h4>
        <div style="overflow-x: auto; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
              <tr style="background-color: #f0fdf4; border-bottom: 2px solid #bbf7d0; color: #166534; font-weight: bold;">
                <th style="padding: 12px 10px; width: 60px;">Rank</th>
                <th style="padding: 12px 10px;">Employee Name</th>
                <th style="padding: 12px 10px;">Department</th>
                <th style="padding: 12px 10px; text-align: right; width: 120px;">Efficiency Score</th>
              </tr>
            </thead>
            <tbody>
              ${topPerformersRows}
            </tbody>
          </table>
        </div>

        <h4 style="color: #b91c1c; font-size: 13px; font-weight: bold; margin-top: 15px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">\u26A0\uFE0F Needs Improvement</h4>
        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
            <thead>
              <tr style="background-color: #fef2f2; border-bottom: 2px solid #fecaca; color: #991b1b; font-weight: bold;">
                <th style="padding: 12px 10px; width: 60px;">Rank</th>
                <th style="padding: 12px 10px;">Employee Name</th>
                <th style="padding: 12px 10px;">Department</th>
                <th style="padding: 12px 10px; text-align: right; width: 120px;">Efficiency Score</th>
              </tr>
            </thead>
            <tbody>
              ${needsImprovementRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. Operational Summary & Additional Details -->
      <div style="margin-bottom: 35px; border-top: 2px solid #f1f5f9; padding-top: 20px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">5. Leaves Overview</h3>
        ${leaveRows.length === 0 ? '<p style="color: #64748b; font-size: 13px; font-style: italic;">No active leaves recorded for this date.</p>' : `
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 12px 10px;">Emp Code</th>
                  <th style="padding: 12px 10px;">Name</th>
                  <th style="padding: 12px 10px;">Leave Period</th>
                  <th style="padding: 12px 10px;">Status</th>
                  <th style="padding: 12px 10px;">Reason</th>
                </tr>
              </thead>
              <tbody>
                ${leaveRows.join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <div style="margin-bottom: 35px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">6. Expenses Claims</h3>
        ${expenseRows.length === 0 ? '<p style="color: #64748b; font-size: 13px; font-style: italic;">No expenses submitted for this date.</p>' : `
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 12px 10px;">Emp Code</th>
                  <th style="padding: 12px 10px;">Name</th>
                  <th style="padding: 12px 10px;">Amount</th>
                  <th style="padding: 12px 10px;">Category</th>
                  <th style="padding: 12px 10px;">Description</th>
                  <th style="padding: 12px 10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${expenseRows.join("")}
              </tbody>
            </table>
          </div>
          <div style="text-align: right; margin-top: 15px; font-size: 14px; font-weight: bold; color: #0f172a;">
            Total Daily Expenses Claimed: <span style="color: #0f766e; font-size: 16px;">\u20B9${totalExpensesSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        `}
      </div>

      ${validEvaluated.length > 0 ? `
        <!-- Team Performance -->
        ${teamRowsHtml.length > 0 ? `
          <div style="margin-bottom: 35px;">
            <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">7. Team Performance Breakdown</h3>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
                <thead>
                  <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                    <th style="padding: 12px 10px;">Department / Team</th>
                    <th style="padding: 12px 10px;">Avg Efficiency</th>
                    <th style="padding: 12px 10px;">Evaluated</th>
                    <th style="padding: 12px 10px;">Above Target</th>
                    <th style="padding: 12px 10px;">Needs Attention</th>
                  </tr>
                </thead>
                <tbody>
                  ${teamRowsHtml.join("")}
                </tbody>
              </table>
            </div>
          </div>
        ` : ""}

        <!-- Efficiency Distribution Details -->
        <div style="margin-bottom: 35px;">
          <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">8. Efficiency Distribution</h3>
          <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Excellent (90%+)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #059669;">${dist.excellent} employees</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Good (75% - 89%)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #2563eb;">${dist.good} employees</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Needs Improvement (60% - 74%)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #d97706;">${dist.needsImprovement} employees</td>
              </tr>
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Critical (&lt;60%)</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #dc2626;">${dist.critical} employees</td>
              </tr>
              <tr>
                <td style="padding: 12px 10px; font-weight: 600; color: #1e293b;">Insufficient Data</td>
                <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: #64748b;">${dist.insufficient} employees</td>
              </tr>
            </table>
          </div>
        </div>

        <!-- Productivity Highlights -->
        <div style="margin-bottom: 35px; background-color: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 16px;">
          <h3 style="color: #0f766e; font-size: 14px; font-weight: 700; text-transform: uppercase; margin: 0 0 10px 0;">Productivity Highlights</h3>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #1e293b; line-height: 1.6;">
            <li>Highest efficiency recorded today: <strong>${highestEff}%</strong></li>
            <li>Number of employees meeting or exceeding performance targets: <strong>${aboveTargetCount} / ${evaluatedCount}</strong></li>
            <li>Active attendance tracking operational across all departments with <strong>${presentCount}</strong> present today.</li>
          </ul>
        </div>

        <!-- Action Required -->
        <div style="margin-bottom: 35px; background-color: #fffbeb; border: 1.5px solid #fde68a; border-radius: 8px; padding: 16px;">
          <h3 style="color: #92400e; font-size: 14px; font-weight: 700; text-transform: uppercase; margin: 0 0 10px 0;">Action Required</h3>
          <p style="margin: 0; font-size: 13px; color: #92400e; line-height: 1.6;">
            Review employees falling into the critical or needs improvement categories. Follow up on attendance exceptions and investigate missing activity logs for employees with insufficient tracking data.
          </p>
        </div>
      ` : ""}

      <!-- Other Activity -->
      <div style="margin-top: 30px; margin-bottom: 10px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Other Daily Operational Data</h3>
        ${otherDataHtml}
      </div>

      <!-- 6. Admin Panel Access (Highlighted) -->
      <div style="margin-top: 40px; background-color: #f0fdf4; border: 1.5px solid #0f766e; border-radius: 12px; padding: 24px; text-align: center; box-shadow: 0 1px 3px 0 rgba(0,0,0,0.05);">
        <h3 style="margin: 0 0 8px 0; color: #0f766e; font-size: 18px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Admin Panel</h3>
        <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.5; max-width: 500px; margin-left: auto; margin-right: auto;">
          View the complete dashboard, analytics, attendance, efficiency, reports and employee management.
        </p>
        <a href="${adminPanelUrl}" target="_blank" style="display: inline-block; background-color: #0f766e; color: #ffffff; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: bold; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 2px 4px 0 rgba(15, 118, 110, 0.2);">
          View More
        </a>
        
        <!-- 7. Admin Login Credentials -->
        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px dashed #cbd5e1; font-size: 12px; color: #64748b; text-align: center; line-height: 1.6;">
          <strong style="color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Admin Login</strong>
          Admin credentials are managed securely by the system.
        </div>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #cbd5e1; padding: 24px; text-align: center; color: #64748b; font-size: 11px; line-height: 1.5;">
      <p style="margin: 0;">This email is an automatically generated administrative report from your Smart Workforce Management System.</p>
      <p style="margin: 5px 0 0 0;">\xA9 2026 Smart Workforce. All rights reserved.</p>
    </div>

  </div>
</body>
</html>
    `;
    const subject = `Smart Workforce \u2014 Daily Admin Report \u2014 ${formatDateStringFriendly(reportDate)}`;
    console.log(`[DailyReport] Efficiency records: ${evaluatedEmployees.length}`);
    console.log(`[DailyReport] Evaluated employees: ${validEvaluated.length}`);
    console.log(`[DailyReport] Top performers: ${topPerformers.length}`);
    console.log(`[DailyReport] Improvement records: ${bottomPerformers.length}`);
    console.log(`[DailyReport] Final HTML length: ${emailHtml.length}`);
    console.log(`[DailyReport] Contains efficiency section: ${emailHtml.includes("EFFICIENCY SUMMARY")}`);
    console.log(`[DailyReport] Contains top performers: ${emailHtml.includes("TOP 5 PERFORMERS")}`);
    console.log(`[DailyReport] Contains needs improvement: ${emailHtml.includes("NEEDS IMPROVEMENT")}`);
    console.log(`[DailyReport] Contains admin panel link: ${emailHtml.includes("VIEW MORE")}`);
    console.log(`[DailyReport] Contains /x7Kp9 URL: ${emailHtml.includes("/x7Kp9")}`);
    console.log(`[DailyReport] Report date: ${reportDate}`);
    if (!emailHtml.includes("EFFICIENCY SUMMARY") || !emailHtml.includes("TOP 5 PERFORMERS") || !emailHtml.includes("NEEDS IMPROVEMENT") || !emailHtml.includes("VIEW MORE") || !emailHtml.includes("/x7Kp9")) {
      throw new Error("Daily Report HTML validation failed: missing required efficiency or admin panel link sections.");
    }
    const emailRes = await sendMail({
      to: recipients,
      subject,
      html: emailHtml
    });
    if (emailRes.success) {
      const accepted = emailRes.accepted || [];
      const rejected = emailRes.rejected || [];
      const hasRejections = rejected.length > 0;
      const statusValue = hasRejections ? "PARTIALLY_SENT" : "SENT";
      await reportLogRef.set({
        status: statusValue,
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        messageId: emailRes.messageId || "simulated",
        simulated: emailRes.simulated,
        acceptedRecipients: accepted,
        rejectedRecipients: rejected,
        error: hasRejections ? `Delivery failed for: ${rejected.join(", ")}` : import_firestore4.FieldValue.delete(),
        updatedAt: import_firestore4.FieldValue.serverTimestamp()
      }, { merge: true });
      try {
        const auditRef = db3.collection("audit_logs").doc();
        await auditRef.set({
          id: auditRef.id,
          actionCategory: "SYSTEM_SETTINGS",
          action: isManualSend ? "Manually Dispatched Daily Admin Email Report" : "Dispatched Scheduled Daily Admin Email Report",
          performedByUserId: triggerBy,
          performedByName: triggerBy,
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          details: {
            reportDate,
            recipients,
            recipientCount: recipients.length,
            status: statusValue,
            manual: isManualSend,
            simulated: emailRes.simulated,
            messageId: emailRes.messageId,
            acceptedCount: accepted.length,
            rejectedCount: rejected.length
          }
        });
      } catch (ae) {
      }
      return {
        success: true,
        message: "Email accepted by Gmail SMTP",
        reportDate,
        recipientCount: recipients.length,
        recipients,
        recipient: recipients.join(", "),
        messageId: emailRes.messageId
      };
    } else {
      throw new Error(emailRes.error || "Failed to dispatch email");
    }
  } catch (err) {
    console.error(`[DailyReportService] Error generating and sending report for ${reportDate}:`, err);
    await reportLogRef.set({
      status: "FAILED",
      completedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: err.message || String(err),
      updatedAt: import_firestore4.FieldValue.serverTimestamp()
    }, { merge: true });
    try {
      const auditRef = db3.collection("audit_logs").doc();
      await auditRef.set({
        id: auditRef.id,
        actionCategory: "SYSTEM_SETTINGS",
        action: "Daily Admin Email Report Dispatch Failed",
        performedByUserId: triggerBy,
        performedByName: triggerBy,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          reportDate,
          recipients,
          recipientCount: recipients.length,
          error: err.message || String(err)
        }
      });
    } catch (ae) {
    }
    return {
      success: false,
      message: err.message || "Failed to generate and dispatch daily report.",
      error: err.message || "Failed to generate and dispatch daily report.",
      reportDate,
      recipient: primaryRecipient
    };
  }
}
async function sendDailyReportTestEmail(db3, triggerBy = "SUPER_ADMIN") {
  const config = await getDailyReportConfig(db3);
  const recipients = getCentralizedRecipients(config.adminEmails);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (recipients.length !== 3 || recipients.some((r) => !emailRegex.test(r))) {
    return {
      success: false,
      message: "EMAIL_RECIPIENTS contains invalid recipient configuration.",
      recipientCount: 0,
      recipients: []
    };
  }
  const subject = `Smart Workforce \u2014 Test Daily Report`;
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 25px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgb(0 0 0 / 0.05); border-top: 4px solid #6366f1;">
    <h2 style="color: #1e1b4b; margin-top: 0;">Smart Workforce \u2014 Connection Verification</h2>
    <p>This is a <strong>Test Daily Report</strong> designed to verify that the Smart Workforce backend email server configuration is fully operational.</p>
    <p>Details:</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Status</td>
        <td style="padding: 8px 0; color: #10b981;">ACTIVE / OPERATIONAL</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Recipients</td>
        <td style="padding: 8px 0;">Configured Admin Recipients (BCC Protected)</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Recipient Count</td>
        <td style="padding: 8px 0;">${recipients.length}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Send Time Setting</td>
        <td style="padding: 8px 0;">${config.sendTime} (Asia/Kolkata)</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Dispatched From</td>
        <td style="padding: 8px 0;">Smart Workforce Server</td>
      </tr>
    </table>
    <p style="margin-top: 25px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px;">
      Verified successfully on ${(/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })} IST.
    </p>
  </div>
</body>
</html>
  `;
  const emailRes = await sendMail({
    to: recipients,
    subject,
    html
  });
  if (emailRes.success) {
    const accepted = emailRes.accepted || [];
    const rejected = emailRes.rejected || [];
    try {
      const auditRef = db3.collection("audit_logs").doc();
      await auditRef.set({
        id: auditRef.id,
        actionCategory: "SYSTEM_SETTINGS",
        action: "Dispatched Test Daily Admin Report Email",
        performedByUserId: triggerBy,
        performedByName: triggerBy,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        details: {
          recipients,
          recipientCount: recipients.length,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length
        }
      });
    } catch (ae) {
    }
    return {
      success: true,
      message: "Test email sent to 3 recipients",
      recipientCount: recipients.length,
      recipients,
      messageId: emailRes.messageId
    };
  } else {
    return {
      success: false,
      message: emailRes.error || "Failed to dispatch verification email",
      recipientCount: recipients.length,
      recipients
    };
  }
}
async function checkAndRunScheduledDailyReport(db3) {
  if (!db3) {
    console.log("[DailyReport Scheduler] Database is not initialized. Skipping scheduled check.");
    return;
  }
  if (isSchedulerExecuting) {
    console.log("[DailyReport Scheduler] Scheduler is already executing. Skipping concurrent check.");
    return;
  }
  if (isSchedulerDisabled) {
    return;
  }
  try {
    isSchedulerExecuting = true;
    const config = await getDailyReportConfig(db3);
    const currentKolkataTime = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true
    }).format(/* @__PURE__ */ new Date());
    if (!config.enabled) {
      console.log(`[DailyReport Scheduler] Check completed at ${currentKolkataTime} IST: Automated delivery is DISABLED in configuration.`);
      return;
    }
    if (!config.adminEmails || config.adminEmails.length === 0) {
      console.log(`[DailyReport Scheduler] Check completed at ${currentKolkataTime} IST: No admin email recipients are configured.`);
      return;
    }
    const scheduledMinutes = parseTimeToMinutes(config.sendTime) ?? 420;
    const currentMinutes = getKolkataCurrentMinutes();
    console.log(`[DailyReport Scheduler] Check at ${currentKolkataTime} IST | Configured Time: ${config.sendTime} (${scheduledMinutes}m) | Current Time: ${currentMinutes}m`);
    if (currentMinutes < scheduledMinutes) {
      console.log(`[DailyReport Scheduler] Too early to run. Remaining time: ${scheduledMinutes - currentMinutes} minute(s).`);
      return;
    }
    const reportDate = getPreviousKolkataDateString();
    const reportLogRef = db3.collection("daily_admin_reports").doc(reportDate);
    const logSnap = await reportLogRef.get();
    if (logSnap.exists) {
      const data = logSnap.data();
      if (data?.status === "SENT") {
        console.log(`[DailyReport Scheduler] Automated report for date ${reportDate} was already successfully SENT. Skipping.`);
        return;
      }
      if (data?.status === "SENDING") {
        const startedAt = data.startedAt ? new Date(data.startedAt).getTime() : 0;
        const diffMins = (Date.now() - startedAt) / 6e4;
        if (diffMins < 15) {
          console.log(`[DailyReport Scheduler] Automated report for date ${reportDate} is currently SENDING (active lock since ${diffMins.toFixed(1)} mins ago). Skipping.`);
          return;
        } else {
          console.log(`[DailyReport Scheduler] Found stale SENDING lock for date ${reportDate} from ${diffMins.toFixed(1)} mins ago. Overriding lock.`);
        }
      }
    }
    console.log(`[DailyReport Scheduler] CRON Triggered: Dispatching automated morning report for date: ${reportDate} to ${config.adminEmails.length} recipient(s).`);
    const result = await generateAndSendDailyReport(db3, reportDate, false, "SYSTEM_SCHEDULER");
    console.log(`[DailyReport Scheduler] Report run completed for ${reportDate}. Result success: ${result.success}`);
  } catch (err) {
    if (err && err.message && err.message.includes("PERMISSION_DENIED")) {
      isSchedulerDisabled = true;
    } else {
      console.error("[DailyReport Scheduler] Error in automated scheduled check:", err);
    }
  } finally {
    isSchedulerExecuting = false;
  }
}

// server.ts
var OFFICE_LAT = process.env.VITE_OFFICE_LATITUDE ? Number(process.env.VITE_OFFICE_LATITUDE) : 0;
var OFFICE_LNG = process.env.VITE_OFFICE_LONGITUDE ? Number(process.env.VITE_OFFICE_LONGITUDE) : 0;
var GEOFENCE_RADIUS_METERS = 25;
var db2 = null;
var authAdmin = null;
try {
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch (e) {
      console.warn("[Median Backend] Could not parse FIREBASE_SERVICE_ACCOUNT_KEY JSON");
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS && import_fs.default.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    try {
      serviceAccount = JSON.parse(import_fs.default.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
    } catch (e) {
      console.warn("[Median Backend] Could not read GOOGLE_APPLICATION_CREDENTIALS file");
    }
  }
  const configPath = import_path.default.join(process.cwd(), "firebase-applet-config.json");
  let projectId;
  if (import_fs.default.existsSync(configPath)) {
    const config = JSON.parse(import_fs.default.readFileSync(configPath, "utf8"));
    projectId = config.projectId;
  }
  if (!(0, import_app2.getApps)().length) {
    if (serviceAccount) {
      (0, import_app2.initializeApp)({
        credential: (0, import_app2.cert)(serviceAccount),
        projectId: serviceAccount.project_id || projectId
      });
    } else if (projectId) {
      (0, import_app2.initializeApp)({
        projectId
      });
    } else {
      (0, import_app2.initializeApp)();
    }
  }
  db2 = (0, import_firestore5.getFirestore)();
  authAdmin = (0, import_auth2.getAuth)();
  console.log("[Median Backend] Firebase Admin Firestore & Auth initialized successfully.");
} catch (error) {
  console.error("[Median Backend] Failed to initialize Firebase Admin:", error);
}
function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function getFormattedDateStr(date) {
  try {
    return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  } catch (e) {
    const kolkataTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1e3);
    const year = kolkataTime.getUTCFullYear();
    const month = String(kolkataTime.getUTCMonth() + 1).padStart(2, "0");
    const day = String(kolkataTime.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}
function getFormattedTimeStr(date) {
  try {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata"
    });
  } catch (e) {
    const kolkataTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1e3);
    let hours = kolkataTime.getUTCHours();
    const minutes = String(kolkataTime.getUTCMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  }
}
function parseAttendanceTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (!clean || clean === "Pending" || clean === "N/A" || clean === "UNRESOLVED" || clean === "--:--") {
    return null;
  }
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridian = match12[3].toUpperCase();
    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
    if (meridian === "AM") {
      if (hours === 12) hours = 0;
    } else if (meridian === "PM") {
      if (hours < 12) hours += 12;
    }
    return hours * 60 + minutes;
  }
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}
function calculateWorkingHours(checkInTimeStr, checkOutTimeStr) {
  if (!checkInTimeStr || !checkOutTimeStr) return null;
  const inMins = parseAttendanceTimeToMinutes(checkInTimeStr);
  const outMins = parseAttendanceTimeToMinutes(checkOutTimeStr);
  if (inMins === null || outMins === null || outMins < inMins) return null;
  const diffMins = outMins - inMins;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;
  return `${h}h ${m}m`;
}
var firestoreAdminNoticeLogged = false;
async function runServerAttendanceFinalizer() {
  if (!db2) return;
  try {
    const now = /* @__PURE__ */ new Date();
    const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    const nowKolkata = new Date(kolkataStr);
    const year = nowKolkata.getFullYear();
    const month = String(nowKolkata.getMonth() + 1).padStart(2, "0");
    const day = String(nowKolkata.getDate()).padStart(2, "0");
    const todayKolkataStr = `${year}-${month}-${day}`;
    const hours = nowKolkata.getHours();
    const minutes = nowKolkata.getMinutes();
    const isEndOfDay = hours === 23 && minutes >= 59;
    const qSnap = await db2.collection("attendance").where("checkoutStatus", "in", ["Pending", "PENDING_CONFIRMATION", null]).limit(100).get().catch(async (queryErr) => {
      if (queryErr?.code === 7 || queryErr?.message?.includes("PERMISSION_DENIED") || queryErr?.message?.includes("7 PERMISSION_DENIED")) {
        throw queryErr;
      }
      return await db2.collection("attendance").where("checkOutTime", "==", null).limit(100).get();
    });
    if (qSnap.empty) return;
    for (const docSnap of qSnap.docs) {
      const data = docSnap.data();
      if (!data) continue;
      if (data.checkOutTime && data.checkoutStatus === "COMPLETED") continue;
      if (data.manualRectified || data.isAdminRectified || data.correctedAt) continue;
      const recDate = data.date;
      if (!recDate) continue;
      const isPastDay = recDate < todayKolkataStr;
      const isToday = recDate === todayKolkataStr;
      if (!isPastDay && (!isToday || !isEndOfDay)) {
        continue;
      }
      const genuineExitTime = data.geofenceExitTime || data.lastExitTime || data.exitTime;
      let finalCheckoutTime;
      let resolutionSource;
      if (genuineExitTime && genuineExitTime !== "Pending" && genuineExitTime !== "N/A" && genuineExitTime !== "UNRESOLVED") {
        finalCheckoutTime = genuineExitTime;
        resolutionSource = "AUTO_GEOFENCE";
      } else {
        finalCheckoutTime = "11:59 PM";
        resolutionSource = "AUTO_SYSTEM";
      }
      const workingHours = calculateWorkingHours(data.checkInTime, finalCheckoutTime);
      const cleanTimeKey = finalCheckoutTime.replace(/[^a-zA-Z0-9]/g, "_");
      const eventId = `evt_srv_final_${data.employeeId}_${recDate}_${cleanTimeKey}`;
      await docSnap.ref.update({
        checkOutTime: finalCheckoutTime,
        checkoutStatus: "COMPLETED",
        checkOutMode: "AUTO_SYSTEM",
        checkoutType: "AUTO_CHECKOUT",
        status: "completed",
        workingHours,
        currentState: "FINALIZED_CHECKOUT",
        resolutionSource,
        evidenceSource: "SERVER_FINALIZATION",
        updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        serverSyncTime: (/* @__PURE__ */ new Date()).toISOString(),
        serverSyncTimestamp: import_firestore5.FieldValue.serverTimestamp(),
        processedEvents: import_firestore5.FieldValue.arrayUnion(eventId)
      });
      console.log(`[ServerFinalizer] Settled attendance for ${data.employeeId} on ${recDate} at ${finalCheckoutTime} (Evidence: SERVER_FINALIZATION, Source: ${resolutionSource})`);
    }
  } catch (err) {
    if (err?.code === 7 || err?.message?.includes("PERMISSION_DENIED") || err?.message?.includes("7 PERMISSION_DENIED")) {
      if (!firestoreAdminNoticeLogged) {
        console.log("[ServerFinalizer] Standby: Firebase Admin service account not configured. Client-side engines manage real-time attendance settlement.");
        firestoreAdminNoticeLogged = true;
      }
      return;
    }
    console.warn("[ServerFinalizer] Error during background finalizer run:", err?.message || err);
  }
}
async function startServer() {
  const app2 = (0, import_express.default)();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3e3;
  app2.use(import_express.default.json());
  app2.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Accept, Origin");
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Accept, Origin");
    }
    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
    next();
  });
  app2.get("/api/health", (req, res) => {
    res.json({
      success: true,
      service: "Smart Workforce API",
      firebaseAdminInitialized: !!db2,
      firebaseAuthInitialized: !!authAdmin,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: "production"
    });
  });
  async function verifyCaller(req) {
    if (!authAdmin || !db2) return null;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1].trim();
    try {
      const decoded = await authAdmin.verifyIdToken(token);
      const uid = decoded.uid;
      const adminSnap = await db2.collection("admin_users").doc(uid).get();
      if (adminSnap.exists) {
        const data = adminSnap.data() || {};
        const role = data.role || "EMPLOYEE";
        return {
          uid,
          email: data.email || decoded.email,
          role,
          loginId: data.loginId || "",
          isAdmin: role === "SUPER_ADMIN" || role === "ADMIN" || role === "HR" || role === "TEAM_LEADER",
          isSuperAdmin: role === "SUPER_ADMIN"
        };
      }
      let employeeId = uid;
      let employeeCode = "";
      const regSnap = await db2.collection("registrations").doc(uid).get();
      if (regSnap.exists) {
        const rData = regSnap.data() || {};
        employeeId = regSnap.id;
        employeeCode = rData.employeeCode || "";
      } else {
        const qSnap = await db2.collection("registrations").where("uid", "==", uid).limit(1).get();
        if (!qSnap.empty) {
          employeeId = qSnap.docs[0].id;
          employeeCode = qSnap.docs[0].data().employeeCode || "";
        } else if (decoded.email) {
          const qEmail = await db2.collection("registrations").where("email", "==", decoded.email).limit(1).get();
          if (!qEmail.empty) {
            employeeId = qEmail.docs[0].id;
            employeeCode = qEmail.docs[0].data().employeeCode || "";
          }
        }
      }
      return {
        uid,
        email: decoded.email,
        role: "EMPLOYEE",
        loginId: "",
        employeeId,
        employeeCode,
        isAdmin: false,
        isSuperAdmin: false
      };
    } catch (err) {
      console.error("[Backend Auth] Token verification failed:", err);
      return null;
    }
  }
  const verifyAdminCaller = verifyCaller;
  app2.post("/api/admin/super-admin/reset-password", async (req, res) => {
    try {
      if (!authAdmin || !db2) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }
      const caller = await verifyAdminCaller(req);
      if (!caller || caller.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Unauthorized. Super-Admin authorization is required." });
      }
      const { targetUid, temporaryPassword, mustChangePassword } = req.body || {};
      if (!targetUid || typeof targetUid !== "string") {
        return res.status(400).json({ error: "Missing or invalid targetUid." });
      }
      const targetDocRef = db2.collection("admin_users").doc(targetUid);
      const targetDoc = await targetDocRef.get();
      let finalTempPassword = typeof temporaryPassword === "string" && temporaryPassword.trim().length >= 8 ? temporaryPassword.trim() : null;
      if (!finalTempPassword) {
        const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const lower = "abcdefghijkmnopqrstuvwxyz";
        const digits = "23456789";
        const special = "!@#$%&*";
        let pass = "";
        pass += upper.charAt(Math.floor(Math.random() * upper.length));
        pass += lower.charAt(Math.floor(Math.random() * lower.length));
        pass += digits.charAt(Math.floor(Math.random() * digits.length));
        pass += special.charAt(Math.floor(Math.random() * special.length));
        const allChars = upper + lower + digits + special;
        for (let i = 0; i < 6; i++) {
          pass += allChars.charAt(Math.floor(Math.random() * allChars.length));
        }
        finalTempPassword = pass.split("").sort(() => 0.5 - Math.random()).join("");
      }
      await authAdmin.updateUser(targetUid, {
        password: finalTempPassword
      });
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const targetData = targetDoc.exists ? targetDoc.data() || {} : {};
      await targetDocRef.set({
        mustChangePassword: mustChangePassword !== false,
        passwordResetAt: nowIso,
        passwordResetBy: caller.loginId || caller.email || caller.uid,
        temporaryPasswordAssignedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: caller.loginId || caller.email || caller.uid
      }, { merge: true });
      await db2.collection("audit_logs").add({
        actorEmail: caller.email || caller.loginId || "super_admin",
        actorUid: caller.uid,
        action: "ADMIN_PASSWORD_RESET_BY_SUPER_ADMIN",
        targetType: "USER",
        targetId: targetUid,
        newValue: {
          targetLoginId: targetData.loginId || targetUid,
          targetEmail: targetData.email || "",
          mustChangePassword: mustChangePassword !== false,
          resetAt: nowIso
        },
        timestamp: nowIso,
        createdAtServer: import_firestore5.FieldValue.serverTimestamp()
      });
      console.log(`[Admin Backend] Password reset executed by Super-Admin ${caller.loginId || caller.uid} for target ${targetData.loginId || targetUid}`);
      return res.json({
        success: true,
        temporaryPassword: finalTempPassword,
        targetUid,
        targetLoginId: targetData.loginId || "",
        targetEmail: targetData.email || "",
        mustChangePassword: mustChangePassword !== false,
        message: "Administrator password reset successfully."
      });
    } catch (err) {
      console.error("[Admin Backend] Error resetting admin password:", err);
      return res.status(500).json({ error: err.message || "Failed to reset administrator password." });
    }
  });
  app2.get("/api/admin/super-admin/admin-users", async (req, res) => {
    try {
      if (!authAdmin || !db2) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }
      const caller = await verifyAdminCaller(req);
      if (!caller || caller.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Unauthorized. Super-Admin authorization is required." });
      }
      const snap = await db2.collection("admin_users").get();
      const adminUsers = snap.docs.map((doc2) => {
        const data = doc2.data();
        return {
          uid: doc2.id,
          loginId: data.loginId || doc2.id,
          email: data.email || "",
          displayName: data.displayName || data.name || data.loginId || "",
          role: data.role || "ADMIN",
          active: data.active !== false && data.status !== "Suspended",
          status: data.status || (data.active !== false ? "Approved" : "Suspended"),
          authorizedOffice: data.authorizedOffice || "ALL",
          mustChangePassword: !!data.mustChangePassword,
          passwordChangedAt: data.passwordChangedAt || null,
          passwordResetAt: data.passwordResetAt || null,
          passwordResetBy: data.passwordResetBy || null,
          temporaryPasswordAssignedAt: data.temporaryPasswordAssignedAt || null,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy
        };
      });
      return res.json({
        success: true,
        adminUsers
      });
    } catch (err) {
      console.error("[Admin Backend] Error fetching admin users list:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch admin users list." });
    }
  });
  app2.post("/api/admin/password-changed", async (req, res) => {
    try {
      if (!authAdmin || !db2) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }
      const caller = await verifyAdminCaller(req);
      if (!caller) {
        return res.status(401).json({ error: "Unauthorized. Please sign in." });
      }
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const targetDocRef = db2.collection("admin_users").doc(caller.uid);
      await targetDocRef.set({
        mustChangePassword: false,
        passwordChangedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: caller.loginId || caller.email || caller.uid
      }, { merge: true });
      await db2.collection("audit_logs").add({
        actorEmail: caller.email || caller.loginId || "admin",
        actorUid: caller.uid,
        action: "ADMIN_PASSWORD_CHANGED_BY_USER",
        targetType: "USER",
        targetId: caller.uid,
        newValue: {
          mustChangePassword: false,
          passwordChangedAt: nowIso
        },
        timestamp: nowIso,
        createdAtServer: import_firestore5.FieldValue.serverTimestamp()
      });
      return res.json({ success: true, message: "Password status updated successfully." });
    } catch (err) {
      console.error("[Admin Backend] Error updating password status:", err);
      return res.status(500).json({ error: err.message || "Failed to update password status." });
    }
  });
  app2.get("/api/app-version", async (req, res) => {
    try {
      let versionConfig = {
        latestVersionCode: 1,
        latestVersionName: "1.0.0",
        minimumSupportedVersionCode: 1,
        updateUrl: "",
        releaseNotes: "",
        published: false,
        forceUpdate: false,
        nativeAppAvailable: false,
        nativeAppDownloadUrl: "",
        nativeAppLandingUrl: ""
      };
      if (db2) {
        try {
          const doc2 = await db2.collection("app_config").doc("version").get();
          if (doc2.exists) {
            const data = doc2.data();
            if (data) {
              versionConfig = { ...versionConfig, ...data };
            }
          }
        } catch (e) {
          if (!e?.message?.includes("PERMISSION_DENIED")) {
            console.warn("[AppVersion] Could not fetch version config from Firestore, using default:", e?.message || e);
          }
        }
      }
      return res.json(versionConfig);
    } catch (err) {
      console.error("[AppVersion] Error serving app version:", err);
      return res.status(500).json({ error: err.message || "Failed to fetch version config" });
    }
  });
  const greetingAudioCache = /* @__PURE__ */ new Map();
  app2.post("/api/tts/welcome", async (req, res) => {
    try {
      const { text } = req.body || {};
      const cleanText = typeof text === "string" ? text.trim() : "";
      if (!cleanText || cleanText.length > 100) {
        return res.status(400).json({ error: "Invalid greeting text parameter" });
      }
      const cached = greetingAudioCache.get(cleanText.toLowerCase());
      if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1e3) {
        return res.json({ audioBase64: cached.audioBase64, cached: true });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }
      const ai = new import_genai.GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: cleanText,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede"
                // Natural, professional warm female voice
              }
            }
          }
        }
      });
      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        return res.status(502).json({ error: "Failed to generate audio stream from voice model" });
      }
      greetingAudioCache.set(cleanText.toLowerCase(), {
        audioBase64,
        timestamp: Date.now()
      });
      return res.json({ audioBase64, cached: false });
    } catch (err) {
      console.warn("[TTS Welcome] Server voice generation error:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Internal voice generation error" });
    }
  });
  const notificationAudioCache = /* @__PURE__ */ new Map();
  app2.post("/api/tts/notification", async (req, res) => {
    try {
      const { text } = req.body || {};
      const cleanText = typeof text === "string" ? text.trim() : "";
      if (!cleanText || cleanText.length > 250) {
        return res.status(400).json({ error: "Invalid notification text parameter (must be 1-250 chars)" });
      }
      const cached = notificationAudioCache.get(cleanText.toLowerCase());
      if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1e3) {
        return res.json({ audioBase64: cached.audioBase64, cached: true });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(503).json({ error: "Gemini API key not configured" });
      }
      const ai = new import_genai.GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { "User-Agent": "aistudio-build" } }
      });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: cleanText,
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede"
                // Natural, professional warm female voice
              }
            }
          }
        }
      });
      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!audioBase64) {
        return res.status(502).json({ error: "Failed to generate audio stream from voice model" });
      }
      notificationAudioCache.set(cleanText.toLowerCase(), {
        audioBase64,
        timestamp: Date.now()
      });
      return res.json({ audioBase64, cached: false });
    } catch (err) {
      console.warn("[TTS Notification] Server voice generation error:", err?.message || err);
      return res.status(500).json({ error: err?.message || "Internal voice generation error" });
    }
  });
  app2.post("/api/median-background-location", async (req, res) => {
    try {
      const payload = req.body || {};
      const query2 = req.query || {};
      const latitude = typeof payload.latitude === "number" ? payload.latitude : parseFloat(query2.lat || "0");
      const longitude = typeof payload.longitude === "number" ? payload.longitude : parseFloat(query2.lng || "0");
      const employeeId = (payload.employeeId || query2.emp || payload.customData?.employeeId || "").toString().trim();
      const accuracy = typeof payload.accuracy === "number" ? payload.accuracy : payload.horizontalAccuracy || 0;
      const source = payload.source || query2.source || "MEDIAN_BACKGROUND_LOCATION";
      if (!employeeId || employeeId === "ANONYMOUS" || employeeId === "SYSTEM") {
        console.warn("[Median Backend] Rejected request due to missing or anonymous employee identity.");
        return res.status(400).json({ error: "Missing or invalid employee identity" });
      }
      const eventTypeParam = payload.eventType || (payload.transition === "EXIT" ? "EXIT" : payload.transition === "ENTER" ? "ENTER" : null);
      const isLocationUnavailable = !!payload.locationUnavailable || (typeof latitude !== "number" || isNaN(latitude) || latitude === 0 && longitude === 0);
      if (isLocationUnavailable && eventTypeParam) {
      } else {
        if (typeof latitude !== "number" || typeof longitude !== "number" || isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || latitude === 0 && longitude === 0) {
          console.warn(`[Median Backend] Rejected invalid coordinates from ${employeeId}: lat=${latitude}, lng=${longitude}`);
          return res.status(400).json({ error: "Invalid coordinates provided" });
        }
      }
      const tsInput = payload.timestamp || query2.ts;
      let tsDate = /* @__PURE__ */ new Date();
      if (tsInput) {
        const parsedDate = new Date(tsInput);
        if (!isNaN(parsedDate.getTime())) {
          tsDate = parsedDate;
        }
      }
      const nowMs = Date.now();
      const tsMs = tsDate.getTime();
      if (tsMs > nowMs + 3e5) {
        console.warn(`[Median Backend] Rejected future timestamp from ${employeeId}: ${tsDate.toISOString()}`);
        return res.status(400).json({ error: "Timestamp cannot be in the future" });
      }
      if (nowMs - tsMs > 864e5) {
        console.warn(`[Median Backend] Rejected stale timestamp (>24h) from ${employeeId}: ${tsDate.toISOString()}`);
        return res.status(400).json({ error: "Stale background location data ignored" });
      }
      if (!db2) {
        console.error("[Median Backend] Firebase Admin not initialized. Cannot process persistence.");
        return res.status(503).json({ error: "Database service temporarily unavailable" });
      }
      const empRef = db2.collection("registrations").doc(employeeId);
      const empSnap = await empRef.get();
      if (!empSnap.exists) {
        console.warn(`[Median Backend] Unauthorized: Employee document '${employeeId}' does not exist in registrations.`);
        return res.status(401).json({ error: "Unauthorized: Employee record does not exist" });
      }
      const empData = empSnap.data() || {};
      const regStatus = empData.status || "Pending Approval";
      const isDeleted = empData.isDeleted || regStatus === "Deleted";
      if (regStatus !== "Approved" || isDeleted || regStatus === "Suspended" || regStatus === "Blocked" || regStatus === "INACTIVE") {
        console.warn(`[Median Backend] Forbidden: Employee '${employeeId}' has status '${regStatus}' (isDeleted: ${isDeleted}).`);
        return res.status(403).json({ error: "Forbidden: Employee is suspended, deleted, or unapproved" });
      }
      const employeeName = empData.name || "Employee";
      const townCity = empData.townCity || "Main Office";
      const distance = isLocationUnavailable ? null : calculateDistanceInMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
      let isInside = false;
      let isExit = false;
      if (isLocationUnavailable) {
        isInside = false;
        isExit = false;
      } else {
        isInside = distance !== null && distance <= GEOFENCE_RADIUS_METERS;
        isExit = distance !== null && distance > GEOFENCE_RADIUS_METERS;
      }
      console.log(`[Median Backend] Location payload validated for ${employeeName} (${employeeId}): Lat/Lng=${isLocationUnavailable ? "Unavailable" : `(${latitude.toFixed(6)}, ${longitude.toFixed(6)})`} - Distance: ${distance !== null ? `${Math.round(distance)}m` : "Unavailable"} - Inside: ${isInside} - EventType: ${eventTypeParam || "PERIODIC"}`);
      const liveDocRef = db2.collection("live_locations").doc(employeeId);
      await liveDocRef.set({
        employeeId,
        employeeName,
        latitude: isLocationUnavailable ? null : latitude,
        longitude: isLocationUnavailable ? null : longitude,
        accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
        distanceFromOffice: isLocationUnavailable ? "location unavailable" : distance,
        townCity,
        timestamp: tsDate.toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }, { merge: true });
      const dateStr = getFormattedDateStr(tsDate);
      const timeStr = getFormattedTimeStr(tsDate);
      const attDocId = `${employeeId}_${dateStr}`;
      const attDocRef = db2.collection("attendance").doc(attDocId);
      let transitionRecorded = false;
      let targetState = "UNCHANGED";
      await db2.runTransaction(async (transaction) => {
        const attSnap = await transaction.get(attDocRef);
        const eventIso = tsDate.toISOString();
        if (!attSnap.exists) {
          const isNativeGeofence = source && String(source).includes("NATIVE_GEOFENCE") || eventTypeParam === "ENTER" || eventTypeParam === "GEOFENCE_TRANSITION_ENTER";
          const isEntryEvent = isInside || isNativeGeofence || eventTypeParam === "GEOFENCE_RETURN";
          const isWithinBoundary = isInside || isNativeGeofence || distance !== null && distance <= GEOFENCE_RADIUS_METERS;
          if (isEntryEvent && isWithinBoundary) {
            const eventId2 = payload.eventId || `evt_bg_CHECK_IN_${employeeId}_${dateStr}_${timeStr.replace(/\s+/g, "_")}`;
            const attUuid = payload.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            if (isNativeGeofence) {
              console.log(`[NATIVE_GEOFENCE_ENTER_RECEIVED] employeeId=${employeeId} eventId=${eventId2} eventTimestamp=${eventIso} source=native`);
            }
            console.log(`[AUTO_CHECKIN_BACKGROUND] employeeId=${employeeId} checkInTime=${timeStr} source=native_geofence`);
            console.log(`[BackgroundAttendance] GEOFENCE_ENTRY detected for ${employeeName} (${employeeId})`);
            console.log(`[BackgroundAttendance] VALIDATED entry location: Lat=${latitude}, Lng=${longitude}, Dist=${distance !== null ? `${Math.round(distance)}m` : "N/A"}`);
            console.log(`[BackgroundAttendance] CHECKIN_REQUEST processing for canonical document ${attDocId}`);
            const newRecord = {
              id: attUuid,
              docId: attDocId,
              employeeId,
              employeeName,
              date: dateStr,
              attendanceType: "OFFICE",
              checkInTime: timeStr,
              checkOutTime: null,
              workingHours: null,
              latitude: isLocationUnavailable ? null : latitude,
              longitude: isLocationUnavailable ? null : longitude,
              distance: isLocationUnavailable ? "location unavailable" : distance,
              townCity,
              checkInMode: "AUTO",
              checkOutMode: "N/A",
              exitTime: null,
              returnTime: null,
              reason: null,
              createdAtDeviceTime: eventIso,
              syncStatus: "Synced",
              serverSyncTime: (/* @__PURE__ */ new Date()).toISOString(),
              serverSyncTimestamp: import_firestore5.FieldValue.serverTimestamp(),
              updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
              isOffline: false,
              reminderCount: 0,
              currentState: "CHECKED_IN",
              processedEvents: [eventId2],
              // Permanent Check-In Location
              checkInLatitude: isLocationUnavailable ? null : latitude,
              checkInLongitude: isLocationUnavailable ? null : longitude,
              checkInDistance: isLocationUnavailable ? "location unavailable" : distance,
              checkInTownCity: townCity,
              // Dynamic Current Location
              currentLatitude: isLocationUnavailable ? null : latitude,
              currentLongitude: isLocationUnavailable ? null : longitude,
              currentDistance: isLocationUnavailable ? "location unavailable" : distance,
              currentTownCity: townCity,
              currentLocationTimestamp: eventIso,
              currentLocationStatus: "LIVE"
            };
            transaction.set(attDocRef, newRecord);
            const eventRef = db2.collection("attendance_events").doc(eventId2);
            transaction.set(eventRef, {
              eventId: eventId2,
              employeeId,
              attendanceDate: dateStr,
              eventType: "CHECK_IN",
              eventTime: timeStr,
              location: {
                latitude: isLocationUnavailable ? null : latitude,
                longitude: isLocationUnavailable ? null : longitude,
                townCity,
                distance: isLocationUnavailable ? "location unavailable" : distance
              },
              attendanceMode: "OFFICE",
              source: source || "NATIVE_GEOFENCE_ENTER",
              syncStatus: "Synced",
              syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
              serverSyncTime: import_firestore5.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`[NATIVE_ENTER_SYNCED] employeeId=${employeeId} eventId=${eventId2}`);
            console.log(`[BackgroundAttendance] CHECKIN_CREATED: Daily attendance document ${attDocId} created with checkInTime ${timeStr}`);
            console.log(`[BackgroundAttendance] CHECKIN_SYNCED: Synced to Firestore for employee ${employeeId}`);
            transitionRecorded = true;
            targetState = "CHECKED_IN";
          } else {
            console.log(`[BackgroundAttendance] No existing attendance for ${employeeId} on ${dateStr}, payload is not an entry event inside geofence (isInside: ${isInside}, distance: ${distance}m). Skipping.`);
          }
          return;
        }
        const record = attSnap.data() || {};
        const eventType = isInside ? "GEOFENCE_RETURN" : "GEOFENCE_EXIT";
        const eventId = payload.eventId || `evt_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, "_")}`;
        console.log(`[AUTO_CHECKIN_DUPLICATE_IGNORED] employeeId=${employeeId} eventId=${eventId}`);
        console.log(`[BackgroundAttendance] CHECKIN_ALREADY_EXISTS for ${employeeId} on ${dateStr}`);
        if (record.checkOutTime && record.checkOutTime !== "--:--" && record.checkoutStatus === "COMPLETED") {
          return;
        }
        const currentState = record.currentState || "CHECKED_IN";
        if (record.processedEvents?.includes(eventId)) {
          console.log(`[BackgroundAttendance] DUPLICATE_SUPPRESSED: Event ${eventId} already processed for ${attDocId}`);
          return;
        }
        const updatedProcessedEvents = Array.from(/* @__PURE__ */ new Set([...record.processedEvents || [], eventId]));
        let modified = false;
        if (!isInside) {
          console.log(`[BackgroundAttendance] GEOFENCE_EXIT detected for ${employeeId} on ${dateStr}`);
          if (currentState === "CHECKED_IN" || currentState === "ENTERING" || currentState === "RETURNING_TO_OFFICE") {
            const existingTimestampMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;
            const newTimestampMs = tsDate.getTime();
            if (!record.geofenceExitTime || !record.recordedExitTime || newTimestampMs < existingTimestampMs || currentState === "RETURNING_TO_OFFICE") {
              record.lastExitTime = timeStr;
              record.exitTime = record.exitTime || timeStr;
              record.geofenceExitTime = timeStr;
              record.geofenceExitTimestamp = eventIso;
              record.recordedExitTime = timeStr;
              record.exitDetectedAt = eventIso;
              record.exitDetectedTime = timeStr;
              record.exitDetectionSource = "NATIVE_GEOFENCE";
            }
            record.pendingCheckoutConfirmation = true;
            record.returningToOffice = false;
            record.currentState = "PENDING_EXIT_CONFIRMATION";
            if (!isLocationUnavailable) {
              record.checkoutLatitude = latitude;
              record.checkoutLongitude = longitude;
              record.checkoutDistance = distance;
            } else {
              record.checkoutLocationUnavailable = true;
              record.checkoutDistance = "location unavailable";
            }
            record.checkoutTownCity = townCity;
            record.processedEvents = updatedProcessedEvents;
            record.syncStatus = "Synced";
            record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            record.serverSyncTime = (/* @__PURE__ */ new Date()).toISOString();
            record.serverSyncTimestamp = import_firestore5.FieldValue.serverTimestamp();
            modified = true;
            targetState = "PENDING_EXIT_CONFIRMATION";
            transitionRecorded = true;
            console.log(`[BackgroundAttendance] EXIT_SYNCED: Recorded geofence exit for ${employeeId} at ${timeStr}`);
          }
        } else {
          if (currentState === "PENDING_FINAL_EXIT" || currentState === "PENDING_EXIT_CONFIRMATION" || currentState === "RETURNING_TO_OFFICE" || record.pendingCheckoutConfirmation || record.lastExitTime || record.exitTime || record.geofenceExitTime) {
            record.returnTime = timeStr;
            record.lastExitTime = null;
            record.exitTime = null;
            record.geofenceExitTime = null;
            record.geofenceExitTimestamp = null;
            record.pendingCheckoutConfirmation = false;
            record.returningToOffice = false;
            record.currentState = "CHECKED_IN";
            record.checkoutLatitude = import_firestore5.FieldValue.delete();
            record.checkoutLongitude = import_firestore5.FieldValue.delete();
            record.checkoutDistance = import_firestore5.FieldValue.delete();
            record.checkoutTownCity = import_firestore5.FieldValue.delete();
            record.processedEvents = updatedProcessedEvents;
            record.syncStatus = "Synced";
            record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            record.serverSyncTime = (/* @__PURE__ */ new Date()).toISOString();
            record.serverSyncTimestamp = import_firestore5.FieldValue.serverTimestamp();
            modified = true;
            targetState = "CHECKED_IN";
            transitionRecorded = true;
          }
        }
        if (modified) {
          transaction.update(attDocRef, record);
          const eventRef = db2.collection("attendance_events").doc(eventId);
          transaction.set(eventRef, {
            eventId,
            employeeId,
            attendanceDate: dateStr,
            eventType,
            eventTime: timeStr,
            location: {
              latitude: isLocationUnavailable ? null : latitude,
              longitude: isLocationUnavailable ? null : longitude,
              townCity,
              distance: isLocationUnavailable ? "location unavailable" : distance
            },
            attendanceMode: record.attendanceType || "OFFICE",
            source: "AUTO_GEOFENCE",
            syncStatus: "Synced",
            syncedAt: (/* @__PURE__ */ new Date()).toISOString(),
            serverSyncTime: import_firestore5.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      });
      if (transitionRecorded) {
        console.log(`[Median Backend] Transition successful for ${employeeName} to state: ${targetState} (Distance: ${isLocationUnavailable ? "unavailable" : `${Math.round(distance)}m`})`);
        if (db2) {
          try {
            const isEntry = targetState === "CHECKED_IN";
            const eventType = isEntry ? "AUTO_CHECK_IN" : "OUTSIDE_OFFICE";
            const eventId = `evt_bg_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, "_")}`;
            dispatchWhatsAppAttendanceNotification(db2, {
              eventId,
              eventType,
              employeeId,
              employeeCode: employeeId,
              employeeName,
              attendanceType: "OFFICE",
              checkInTime: timeStr,
              distance: isLocationUnavailable ? 0 : Math.round(distance),
              townCity: townCity || "Main Office",
              eventTime: timeStr
            }).catch((waErr) => {
              console.warn("[BackgroundAttendance] Auxiliary WhatsApp dispatch warning (non-fatal):", waErr);
            });
          } catch (waTriggerErr) {
            console.warn("[BackgroundAttendance] Non-fatal WhatsApp trigger error:", waTriggerErr);
          }
        }
      }
      return res.json({
        success: true,
        processed: true,
        employeeId,
        employeeName,
        distanceMeters: isLocationUnavailable ? null : Math.round(distance),
        isInsideGeofence: isInside,
        isExitCandidate: isExit,
        geofenceRadius: GEOFENCE_RADIUS_METERS,
        transitionOccurred: transitionRecorded,
        newState: targetState,
        source,
        timestamp: tsDate.toISOString(),
        accuracy
      });
    } catch (err) {
      console.error("[Median Backend] Error processing background location:", err);
      return res.status(500).json({ error: "Internal server error processing location" });
    }
  });
  app2.post("/api/background-location", async (req, res) => {
    req.url = "/api/median-background-location";
    return app2._router.handle(req, res);
  });
  app2.get("/api/attendance/today", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const employeeId = (req.query.employeeId || caller.employeeId || caller.uid || "").toString().trim();
      const todayStr = (/* @__PURE__ */ new Date()).toISOString().substring(0, 10);
      const attDocId = `${employeeId}_${todayStr}`;
      const attSnap = await db2.collection("attendance").doc(attDocId).get();
      const liveSnap = await db2.collection("live_locations").doc(employeeId).get();
      let liveData = liveSnap.exists ? liveSnap.data() || {} : {};
      let attData = attSnap.exists ? attSnap.data() || {} : {};
      return res.json({
        date: todayStr,
        employeeId,
        currentGeofenceState: liveData.distanceFromOffice !== void 0 && typeof liveData.distanceFromOffice === "number" ? liveData.distanceFromOffice <= 25 ? "INSIDE" : "OUTSIDE" : "UNKNOWN",
        currentDistanceMeters: liveData.distanceFromOffice ?? null,
        lastLocationAt: liveData.timestamp || null,
        checkInAt: attData.checkInTime || null,
        checkOutAt: attData.checkOutTime || attData.exitTime || null,
        workedDuration: attData.workingHours || "00:00:00",
        attendanceSource: attData.checkInMode || "AUTOMATIC_GEOFENCE",
        status: attData.currentState || (attData.checkInTime ? "CHECKED_IN" : "ABSENT")
      });
    } catch (err) {
      console.error("[Attendance Today API] Error:", err);
      return res.status(500).json({ error: "Internal server error fetching today's attendance" });
    }
  });
  app2.get("/api/attendance/latest", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const employeeId = (req.query.employeeId || caller.employeeId || caller.uid || "").toString().trim();
      const eventsSnap = await db2.collection("attendance_events").where("employeeId", "==", employeeId).orderBy("serverSyncTime", "desc").limit(1).get();
      if (eventsSnap.empty) {
        const todayStr = (/* @__PURE__ */ new Date()).toISOString().substring(0, 10);
        const attSnap = await db2.collection("attendance").doc(`${employeeId}_${todayStr}`).get();
        if (attSnap.exists) {
          const data = attSnap.data() || {};
          return res.json({
            eventType: data.checkOutTime ? "CHECK_OUT" : "CHECK_IN",
            timestamp: data.updatedAt || (/* @__PURE__ */ new Date()).toISOString(),
            timeStr: data.checkOutTime || data.checkInTime || "No attendance yet",
            source: "AUTOMATIC_GEOFENCE"
          });
        }
        return res.json({ eventType: "NONE", timestamp: null, timeStr: "No attendance yet", source: "NONE" });
      }
      const latestEvent = eventsSnap.docs[0].data();
      return res.json({
        eventType: latestEvent.eventType,
        timestamp: latestEvent.eventTime || latestEvent.syncedAt,
        timeStr: latestEvent.eventTime,
        source: latestEvent.source
      });
    } catch (err) {
      console.error("[Attendance Latest API] Error:", err);
      return res.status(500).json({ error: "Internal server error fetching latest attendance" });
    }
  });
  app2.get("/api/attendance/history", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const employeeId = (req.query.employeeId || caller.employeeId || caller.uid || "").toString().trim();
      const limit = parseInt(req.query.limit || "30", 10);
      const qSnap = await db2.collection("attendance").where("employeeId", "==", employeeId).limit(limit).get();
      const history = qSnap.docs.map((doc2) => doc2.data());
      return res.json({ success: true, count: history.length, history });
    } catch (err) {
      console.error("[Attendance History API] Error:", err);
      return res.status(500).json({ error: "Internal server error fetching attendance history" });
    }
  });
  app2.get("/api/reports/daily", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid authentication required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const dateStr = (req.query.date || (/* @__PURE__ */ new Date()).toISOString().substring(0, 10)).toString();
      const regSnap = await db2.collection("registrations").get();
      const totalEmployees = regSnap.size;
      const attSnap = await db2.collection("attendance").where("date", "==", dateStr).get();
      const presentCount = attSnap.size;
      return res.json({
        date: dateStr,
        summary: {
          totalEmployees,
          present: presentCount,
          absent: Math.max(0, totalEmployees - presentCount),
          late: 0,
          earlyDeparture: 0
        },
        efficiency: {
          top: [],
          bottom: []
        },
        attendance: {
          best: [],
          exceptions: []
        },
        workingHours: {
          highest: [],
          lowest: []
        },
        tasks: {
          highestCompletion: [],
          lowestCompletion: [],
          overdue: []
        }
      });
    } catch (err) {
      console.error("[Daily Reports API] Error:", err);
      return res.status(500).json({ error: "Internal server error generating daily report" });
    }
  });
  app2.post("/api/notifications/whatsapp", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid Firebase authentication token required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const payload = req.body;
      if (!payload || !payload.eventType) {
        return res.status(400).json({ error: "Invalid payload: eventType is required" });
      }
      if (!ALLOWED_ATTENDANCE_EVENT_TYPES.includes(payload.eventType)) {
        return res.status(400).json({
          error: `Unsupported eventType: ${payload.eventType}. Must be one of: ${ALLOWED_ATTENDANCE_EVENT_TYPES.join(", ")}`
        });
      }
      const targetEmployeeId = payload.employeeId || caller.employeeId || caller.uid;
      const targetEmployeeCode = payload.employeeCode || caller.employeeCode || "";
      if (!caller.isAdmin) {
        const isOwnAccount = caller.employeeId && (caller.employeeId === payload.employeeId || caller.uid === payload.employeeId) || caller.employeeCode && caller.employeeCode === payload.employeeCode || caller.uid === payload.employeeId;
        if (!isOwnAccount) {
          return res.status(403).json({
            error: "Forbidden: Employees can only dispatch attendance notifications for their own verified account"
          });
        }
      }
      let authoritativeName = payload.employeeName;
      let authoritativeCode = targetEmployeeCode;
      let authoritativePhone = "";
      let authoritativeConsent = "";
      try {
        let regDoc = null;
        if (targetEmployeeId) {
          const doc2 = await db2.collection("registrations").doc(targetEmployeeId).get();
          if (doc2.exists) regDoc = doc2;
        }
        if (!regDoc && targetEmployeeCode) {
          const q = await db2.collection("registrations").where("employeeCode", "==", targetEmployeeCode).limit(1).get();
          if (!q.empty) regDoc = q.docs[0];
        }
        if (regDoc && regDoc.exists) {
          const rData = regDoc.data() || {};
          authoritativeName = rData.name || authoritativeName || "Employee";
          authoritativeCode = rData.employeeCode || authoritativeCode || targetEmployeeId;
          authoritativePhone = rData.phone || rData.mobileNumber || rData.whatsappNumber || rData.mobile || "";
          authoritativeConsent = rData.whatsappConsent || rData.whatsappOptIn || "";
        }
      } catch (regLookupErr) {
        console.warn("[WhatsApp API] Registration lookup non-fatal error:", regLookupErr);
      }
      const verifiedPayload = {
        ...payload,
        employeeId: targetEmployeeId,
        employeeCode: authoritativeCode || targetEmployeeId,
        employeeName: authoritativeName || "Employee",
        employeeMobile: authoritativePhone || void 0,
        whatsappConsent: authoritativeConsent || void 0
      };
      const results = await dispatchWhatsAppAttendanceNotification(db2, verifiedPayload);
      return res.json({
        success: true,
        results
      });
    } catch (err) {
      console.error("[WhatsApp API] Error dispatching notification:", err);
      return res.status(500).json({ error: err.message || "Internal server error dispatching WhatsApp message" });
    }
  });
  app2.get("/api/admin/whatsapp/config", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isAdmin) {
      return res.status(401).json({ error: "Unauthorized access: Valid Admin token required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const env2 = getWhatsAppEnvCredentials();
      const config = await getWhatsAppConfig(db2);
      const maskString = (str) => {
        if (!str || str.length <= 4) return str ? "****" : "";
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      };
      return res.json({
        configured: env2.isConfigured,
        status: env2.isConfigured ? "CONNECTED" : "NOT_CONFIGURED",
        maskedPhoneNumberId: maskString(env2.phoneNumberId),
        maskedWabaId: maskString(env2.businessAccountId),
        apiVersion: config.apiVersion || env2.apiVersion,
        globalEnabled: config.globalEnabled,
        recipientMode: config.recipientMode,
        adminRecipients: config.adminRecipients || [],
        templates: config.templates || DEFAULT_WHATSAPP_TEMPLATES,
        metaTemplates: config.metaTemplates || DEFAULT_META_TEMPLATES,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy
      });
    } catch (err) {
      console.error("[WhatsApp Admin] Error fetching config:", err);
      return res.status(500).json({ error: "Failed to fetch WhatsApp configuration" });
    }
  });
  app2.post("/api/admin/whatsapp/config", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Super-Administrator authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const updateData = req.body;
      const updatedConfig = await saveWhatsAppConfig(
        db2,
        {
          globalEnabled: updateData.globalEnabled,
          recipientMode: updateData.recipientMode,
          adminRecipients: updateData.adminRecipients,
          templates: updateData.templates,
          metaTemplates: updateData.metaTemplates
        },
        caller.email || caller.loginId || "SUPER_ADMIN"
      );
      try {
        const auditRef = db2.collection("audit_logs").doc();
        await auditRef.set({
          id: auditRef.id,
          actionCategory: "SYSTEM_SETTINGS",
          action: "Updated WhatsApp Notification Configuration",
          performedByUserId: caller.loginId || caller.uid,
          performedByName: caller.email || "Super Admin",
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          details: {
            globalEnabled: updatedConfig.globalEnabled,
            recipientMode: updatedConfig.recipientMode,
            adminRecipientsCount: (updatedConfig.adminRecipients || []).length
          }
        });
      } catch (auditErr) {
        console.warn("[WhatsApp Admin] Non-fatal audit log warning:", auditErr);
      }
      const env2 = getWhatsAppEnvCredentials();
      const maskString = (str) => {
        if (!str || str.length <= 4) return str ? "****" : "";
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      };
      return res.json({
        configured: env2.isConfigured,
        status: env2.isConfigured ? "CONNECTED" : "NOT_CONFIGURED",
        maskedPhoneNumberId: maskString(env2.phoneNumberId),
        maskedWabaId: maskString(env2.businessAccountId),
        apiVersion: updatedConfig.apiVersion || env2.apiVersion,
        globalEnabled: updatedConfig.globalEnabled,
        recipientMode: updatedConfig.recipientMode,
        adminRecipients: updatedConfig.adminRecipients || [],
        templates: updatedConfig.templates || DEFAULT_WHATSAPP_TEMPLATES,
        metaTemplates: updatedConfig.metaTemplates || DEFAULT_META_TEMPLATES,
        updatedAt: updatedConfig.updatedAt,
        updatedBy: updatedConfig.updatedBy
      });
    } catch (err) {
      console.error("[WhatsApp Admin] Error saving config:", err);
      return res.status(500).json({ error: "Failed to save WhatsApp configuration" });
    }
  });
  app2.post("/api/admin/whatsapp/test", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Super-Administrator authorization required" });
    }
    const { recipient, testMessage, templateName, languageCode, type } = req.body;
    if (!recipient) {
      return res.status(400).json({ error: "Recipient phone number is required" });
    }
    try {
      const messageBody = testMessage || "Smart Workforce WhatsApp Connection Test Successful.";
      let sendRes;
      if (type === "template" && templateName) {
        sendRes = await sendMetaWhatsAppMessage(recipient, {
          type: "template",
          templateName,
          languageCode: languageCode || "en",
          parameters: [{ type: "text", text: "Admin Test" }],
          textBody: messageBody
        });
      } else {
        sendRes = await sendMetaWhatsAppMessage(recipient, messageBody);
      }
      if (sendRes.success) {
        if (db2) {
          try {
            const auditRef = db2.collection("audit_logs").doc();
            await auditRef.set({
              id: auditRef.id,
              actionCategory: "SYSTEM_SETTINGS",
              action: "Sent WhatsApp Live Test Message",
              performedByUserId: caller.loginId || caller.uid,
              performedByName: caller.email || "Super Admin",
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              details: {
                recipientPhone: normalizePhoneNumber(recipient),
                providerMessageId: sendRes.providerMessageId,
                templateUsed: templateName || "text"
              }
            });
          } catch (e) {
          }
        }
        return res.json({
          success: true,
          message: "Test WhatsApp message sent successfully!",
          providerMessageId: sendRes.providerMessageId
        });
      } else {
        return res.status(400).json({
          success: false,
          error: sendRes.error || "Failed to send WhatsApp test message via Meta API"
        });
      }
    } catch (err) {
      console.error("[WhatsApp Admin] Error sending test message:", err);
      return res.status(500).json({ error: err.message || "Failed to execute WhatsApp test dispatch" });
    }
  });
  app2.get(["/api/admin/daily-report/config", "/api/admin/daily-email-report/config"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }
    try {
      const config = await getDailyReportConfig(db2);
      return res.json({
        success: true,
        config
      });
    } catch (err) {
      console.error("[DailyReport API] Error fetching config:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch daily report configuration" });
    }
  });
  app2.post(["/api/admin/daily-report/config", "/api/admin/daily-email-report/config"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }
    try {
      if (req.body.adminEmails !== void 0) {
        const valResult = validateAdminEmails(req.body.adminEmails);
        if (!valResult.valid) {
          return res.status(400).json({ success: false, error: valResult.error });
        }
      }
      const updatedConfig = await saveDailyReportConfig(db2, req.body, caller.email || caller.uid);
      return res.json({
        success: true,
        config: updatedConfig
      });
    } catch (err) {
      console.error("[DailyReport API] Error saving config:", err);
      return res.status(400).json({ success: false, error: err.message || "Failed to save daily report configuration" });
    }
  });
  app2.post(["/api/admin/daily-report/send-test", "/api/admin/daily-email-report/test"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }
    try {
      const result = await sendDailyReportTestEmail(db2, caller.email || caller.uid);
      return res.json(result);
    } catch (err) {
      console.error("[DailyReport API] Error sending test email:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to send test email" });
    }
  });
  app2.post([
    "/api/admin/daily-report/send-yesterday",
    "/api/admin/daily-email-report/send-yesterday",
    "/api/admin/daily-report/retry-yesterday",
    "/api/admin/daily-email-report/retry-yesterday"
  ], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }
    try {
      const targetDate = req.body.date;
      const result = await generateAndSendDailyReport(db2, targetDate, true, caller.email || caller.uid);
      return res.json(result);
    } catch (err) {
      console.error("[DailyReport API] Error manually sending report:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to manually generate/send report" });
    }
  });
  app2.get(["/api/admin/daily-report/history", "/api/admin/daily-email-report/history"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }
    try {
      const historySnap = await db2.collection("daily_admin_reports").orderBy("startedAt", "desc").limit(30).get();
      const history = [];
      historySnap.forEach((doc2) => {
        history.push({
          id: doc2.id,
          ...doc2.data()
        });
      });
      return res.json({
        success: true,
        history
      });
    } catch (err) {
      console.error("[DailyReport API] Error fetching history:", err);
      return res.status(500).json({ success: false, error: "Failed to fetch daily report history" });
    }
  });
  app2.get(["/api/admin/daily-report/diagnostics", "/api/admin/daily-email-report/diagnostics"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ success: false, error: "Authentication required: Please provide a valid token" });
    }
    if (caller.role !== "SUPER_ADMIN") {
      return res.status(403).json({ success: false, error: "Access Forbidden: Super-Admin authorization required" });
    }
    if (!db2) {
      return res.status(503).json({ success: false, error: "Database service unavailable" });
    }
    try {
      const config = await getDailyReportConfig(db2);
      const currentMinutes = getKolkataCurrentMinutes();
      const scheduledMinutes = parseTimeToMinutes ? parseTimeToMinutes(config.sendTime) ?? 420 : 420;
      const todayKolkata = getKolkataDateString();
      let nextRunDateStr = todayKolkata;
      if (currentMinutes >= scheduledMinutes) {
        const [yearStr, monthStr, dayStr] = todayKolkata.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
        const day = parseInt(dayStr, 10);
        const utc = new Date(Date.UTC(year, month, day));
        utc.setUTCDate(utc.getUTCDate() + 1);
        const nextYear = utc.getUTCFullYear();
        const nextMonth = String(utc.getUTCMonth() + 1).padStart(2, "0");
        const nextDay = String(utc.getUTCDate()).padStart(2, "0");
        nextRunDateStr = `${nextYear}-${nextMonth}-${nextDay}`;
      }
      const { hour, minute, period } = to12HourFormat(config.sendTime);
      const formattedSendTime = `${hour}:${minute} ${period}`;
      const nextRun = `${formatDateStringFriendly(nextRunDateStr)}, ${formattedSendTime}`;
      const lastRunSnap = await db2.collection("daily_admin_reports").orderBy("startedAt", "desc").limit(1).get();
      let lastRun = "NEVER RUN";
      let lastStatus = "NOT RUN";
      if (!lastRunSnap.empty) {
        const doc2 = lastRunSnap.docs[0];
        const data = doc2.data();
        const reportDate = data.reportDate || doc2.id;
        const completedAtStr = data.completedAt || data.startedAt;
        let completedFormatted = "";
        if (completedAtStr) {
          try {
            const completedDate = new Date(completedAtStr);
            const kTimeStr = completedDate.toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
              timeZone: "Asia/Kolkata"
            });
            completedFormatted = ` (Sent At: ${kTimeStr})`;
          } catch (e) {
          }
        }
        lastRun = `${formatDateStringFriendly(reportDate)}${completedFormatted}`;
        lastStatus = data.status || "UNKNOWN";
      }
      const currentKolkataTimeStr = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(/* @__PURE__ */ new Date());
      let lastSchedulerTickFormatted = "NEVER CALLED";
      if (config.lastSchedulerTick) {
        try {
          const tickDate = new Date(config.lastSchedulerTick);
          lastSchedulerTickFormatted = new Intl.DateTimeFormat("en-IN", {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true
          }).format(tickDate);
        } catch (e) {
          lastSchedulerTickFormatted = config.lastSchedulerTick;
        }
      }
      return res.json({
        success: true,
        diagnostics: {
          enabled: config.enabled,
          configuredTime: formattedSendTime,
          timezone: "Asia/Kolkata",
          currentTimeInTimezone: currentKolkataTimeStr,
          nextRun,
          lastRun,
          lastStatus,
          schedulerMode: "EXTERNAL CRON",
          endpointStatus: "READY",
          lastSchedulerTick: lastSchedulerTickFormatted
        }
      });
    } catch (err) {
      console.error("[DailyReport API] Error generating diagnostics:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to generate diagnostics" });
    }
  });
  app2.post("/api/internal/daily-admin-report", async (req, res) => {
    if (!db2) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    const expectedSecret = process.env.CRON_SECRET || (process.env.NODE_ENV !== "production" ? "smart_workforce_secure_scheduler_token" : void 0);
    if (!expectedSecret) {
      console.error("[DailyReport Scheduler] CRON_SECRET environment variable is missing in production!");
      return res.status(500).json({ error: "Server Configuration Error: CRON_SECRET not configured in production." });
    }
    const isAuthorized = authHeader === `Bearer ${expectedSecret}` || queryToken === expectedSecret;
    if (!isAuthorized) {
      console.warn(`[DailyReport Scheduler] Unauthorized attempt to invoke scheduler endpoint.`);
      return res.status(401).json({ error: "Unauthorized: Invalid or missing scheduling credentials" });
    }
    try {
      const config = await getDailyReportConfig(db2);
      const currentKolkataTimeStr = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
      }).format(/* @__PURE__ */ new Date());
      const scheduledMinutes = parseTimeToMinutes(config.sendTime) ?? 420;
      const currentMinutes = getKolkataCurrentMinutes();
      const targetDate = getPreviousKolkataDateString();
      let alreadySent = false;
      try {
        const logSnap = await db2.collection("daily_admin_reports").doc(targetDate).get();
        if (logSnap.exists && logSnap.data()?.status === "SENT") {
          alreadySent = true;
        }
      } catch (e) {
      }
      let action = "SKIP";
      if (!config.enabled) {
        action = "SKIP (Disabled)";
      } else if (currentMinutes < scheduledMinutes) {
        action = "SKIP (Too Early)";
      } else if (alreadySent) {
        action = "SKIP (Already Sent)";
      } else {
        action = "SEND";
      }
      console.log("=========================================");
      console.log("Daily report scheduler tick received");
      console.log(`Kolkata time: ${currentKolkataTimeStr}`);
      console.log(`Configured time: ${config.sendTime}`);
      console.log(`Target report date: ${targetDate}`);
      console.log(`Already sent: ${alreadySent}`);
      console.log(`Action: ${action}`);
      console.log("=========================================");
      try {
        await db2.collection("system_settings").doc("daily_admin_report").set({
          lastSchedulerTick: (/* @__PURE__ */ new Date()).toISOString()
        }, { merge: true });
      } catch (e) {
        console.error("[DailyReport Scheduler] Failed to save scheduler tick to Firestore:", e);
      }
      const passedDate = req.body?.date || req.query?.date;
      if (passedDate) {
        const result = await generateAndSendDailyReport(db2, passedDate, false, "AUTOMATED_SCHEDULER");
        return res.json(result);
      } else {
        await checkAndRunScheduledDailyReport(db2);
        return res.json({
          success: true,
          message: "Standard scheduled daily report verification executed successfully",
          tick: {
            kolkataTime: currentKolkataTimeStr,
            configuredTime: config.sendTime,
            targetReportDate: targetDate,
            alreadySent,
            action
          }
        });
      }
    } catch (err) {
      console.error("[DailyReport Scheduler] Error in scheduled report execution:", err);
      return res.status(500).json({ error: err.message || "Failed to execute scheduled report process" });
    }
  });
  const downloadsPath = import_path.default.join(process.cwd(), "public", "downloads");
  app2.get("/downloads/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = import_path.default.join(downloadsPath, filename);
    if (import_fs.default.existsSync(filePath)) {
      res.setHeader("Content-Type", "application/vnd.android.package-archive");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.sendFile(filePath);
    } else {
      return res.status(404).json({ error: "APK file not found on server", requested: filename });
    }
  });
  app2.use("/downloads", import_express.default.static(downloadsPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".apk")) {
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  }));
  app2.all(["/api", "/api/*"], (req, res) => {
    res.setHeader("Content-Type", "application/json");
    return res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app2.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app2.use(import_express.default.static(distPath));
    app2.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app2.listen(PORT, "0.0.0.0", () => {
    console.log(`Office Management System Server running on http://0.0.0.0:${PORT}`);
    runServerAttendanceFinalizer().catch(() => {
    });
    if (process.env.NODE_ENV !== "production" && db2) {
      console.log("[DailyReport Scheduler] In-memory local development scheduler active.");
      checkAndRunScheduledDailyReport(db2).catch(() => {
      });
    } else {
      console.log("[DailyReport Scheduler] Production Mode: Relying entirely on external CRON trigger endpoint.");
    }
    setInterval(() => {
      runServerAttendanceFinalizer().catch(() => {
      });
      if (process.env.NODE_ENV !== "production" && db2) {
        checkAndRunScheduledDailyReport(db2).catch(() => {
        });
      }
    }, 6e4);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
