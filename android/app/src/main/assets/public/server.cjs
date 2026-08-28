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
var import_app = require("firebase-admin/app");
var import_firestore3 = require("firebase-admin/firestore");
var import_auth = require("firebase-admin/auth");
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
  AUTO_CHECK_IN: `EXFIN OMS \u2013 Auto Check-In

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Mode: {{attendanceType}}
Time: {{checkInTime}}
Location: {{townCity}}
Distance: {{distance}} m
Status: PRESENT`,
  MANUAL_CHECK_IN: `EXFIN OMS \u2013 Manual Check-In

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Mode: {{attendanceType}}
Time: {{checkInTime}}
Location: {{townCity}}
Distance: {{distance}} m
Status: PRESENT`,
  CHECK_OUT: `EXFIN OMS \u2013 Checkout

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Mode: {{attendanceType}}
Check-in: {{checkInTime}}
Check-out: {{checkOutTime}}
Working Hours: {{workingHours}}`,
  WFH: `EXFIN OMS \u2013 Work From Home

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Time: {{checkInTime}}
Reason: {{wfhReason}}
Work Plan: {{workPlan}}`,
  CLIENT_VISIT: `EXFIN OMS \u2013 Client Visit

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Client: {{clientName}}
Location: {{clientLocation}}
Time: {{checkInTime}}
Purpose: {{purpose}}`,
  OUTDOOR_WORK: `EXFIN OMS \u2013 Outdoor Work

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Type: {{outdoorType}}
Time: {{checkInTime}}
Description: {{description}}`,
  LATE_CHECK_IN: `EXFIN OMS \u2013 Late Check-In Alert

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Time: {{checkInTime}}
Status: LATE`,
  OUTSIDE_OFFICE: `EXFIN OMS \u2013 Office Exit Alert

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Time: {{eventTime}}
Location: {{townCity}}
Status: OUTSIDE_OFFICE`,
  MISSING_CHECKOUT_REMINDER: `EXFIN OMS \u2013 Missing Checkout Reminder

Employee: {{employeeName}}
Employee Code: {{employeeCode}}
Check-in: {{checkInTime}}
Please finalize your checkout for today.`,
  GENERAL_ALERT: `EXFIN OMS Alert

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
async function getWhatsAppConfig(db2) {
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
    const docRef = db2.doc(CONFIG_DOC_PATH);
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
async function saveWhatsAppConfig(db2, configUpdate, updaterName) {
  const current = await getWhatsAppConfig(db2);
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
  const docRef = db2.doc(CONFIG_DOC_PATH);
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
async function isWhatsAppEnabledInMatrix(db2, eventType) {
  try {
    const snap = await db2.doc(MATRIX_DOC_PATH).get();
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
  const env = getWhatsAppEnvCredentials();
  if (!env.isConfigured) {
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
  const endpoint = `https://graph.facebook.com/${env.apiVersion}/${env.phoneNumberId}/messages`;
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
        body: options.textBody || "EXFIN OMS Notification"
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
        "Authorization": `Bearer ${env.apiToken}`,
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
async function reserveWhatsAppDispatchSlot(db2, idempotencyKey, payload, recipient) {
  try {
    const docRef = db2.collection("whatsapp_delivery_logs").doc(idempotencyKey);
    const result = await db2.runTransaction(async (transaction) => {
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
async function finalizeWhatsAppDeliveryLog(db2, idempotencyKey, data) {
  try {
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    const docRef = db2.collection("whatsapp_delivery_logs").doc(idempotencyKey);
    await docRef.set({
      idempotencyKey,
      ...data,
      channel: "WHATSAPP",
      updatedAt: nowIso,
      sentAt: data.status === "SENT" || data.status === "DELIVERED" ? nowIso : null,
      serverTimestamp: import_firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    const notifId = `notif_wa_${idempotencyKey.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    const notifRef = db2.collection("notifications").doc(notifId);
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
async function dispatchWhatsAppAttendanceNotification(db2, payload) {
  const results = [];
  const env = getWhatsAppEnvCredentials();
  const config = await getWhatsAppConfig(db2);
  if (!config.globalEnabled) {
    console.log("[WhatsAppService] Global WhatsApp notifications are OFF. Skipping dispatch.");
    return [{ recipient: "GLOBAL", status: "NOT_REQUIRED", error: "WhatsApp notifications disabled globally by Super-Admin" }];
  }
  const isMatrixEnabled = await isWhatsAppEnabledInMatrix(db2, payload.eventType);
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
          const doc = await db2.collection("registrations").doc(payload.employeeId).get();
          if (doc.exists) regSnap = doc;
        }
        if (!regSnap && payload.employeeCode) {
          const querySnap = await db2.collection("registrations").where("employeeCode", "==", payload.employeeCode).limit(1).get();
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
      await finalizeWhatsAppDeliveryLog(db2, idempotencyKey, {
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
  if (!env.isConfigured) {
    const diagnosticReason = "WhatsApp API credentials not configured in server environment (WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing)";
    console.warn(`[WhatsAppService] ${diagnosticReason}`);
    for (const target of targets) {
      const phone = target.phone;
      const rawKey = `wa_${payload.eventId || "evt"}_${payload.eventType}_${phone}`;
      const idempotencyKey = rawKey.replace(/[^a-zA-Z0-9_]/g, "_");
      await finalizeWhatsAppDeliveryLog(db2, idempotencyKey, {
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
    const reservation = await reserveWhatsAppDispatchSlot(db2, idempotencyKey, payload, phone);
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
      await finalizeWhatsAppDeliveryLog(db2, idempotencyKey, {
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
      await finalizeWhatsAppDeliveryLog(db2, idempotencyKey, {
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
var import_firestore2 = require("firebase-admin/firestore");

// server/services/emailService.ts
var import_nodemailer = __toESM(require("nodemailer"), 1);
async function sendMail(payload) {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT || "587";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "EXFIN OMS <noreply@exfin-oms.internal>";
  const isConfigured = !!(host && user && pass);
  if (!isConfigured) {
    console.log(`[SMTP Email Simulation]
To: ${payload.to}
Bcc: ${payload.bcc ? Array.isArray(payload.bcc) ? payload.bcc.join(", ") : payload.bcc : "None"}
Subject: ${payload.subject}
Body Size: ${payload.html.length} chars
--- FALLBACK SIMULATION ONLY ---`);
    return {
      success: true,
      simulated: true,
      messageId: `sim_${Date.now()}_${Math.floor(Math.random() * 1e3)}`,
      accepted: [payload.to, ...payload.bcc ? Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc] : []]
    };
  }
  try {
    const port = parseInt(portStr, 10);
    const transporter = import_nodemailer.default.createTransport({
      host,
      port,
      secure: port === 465,
      // Use SSL for port 465
      auth: {
        user,
        pass
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    const info = await transporter.sendMail({
      from,
      to: payload.to,
      bcc: payload.bcc,
      subject: payload.subject,
      html: payload.html
    });
    console.log(`[SMTP Email Dispatcher] Sent email successfully to ${payload.to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      simulated: false,
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || []
    };
  } catch (err) {
    console.error(`[SMTP Email Dispatcher] Failed to send email to ${payload.to}:`, err);
    return {
      success: false,
      simulated: false,
      error: err.message || String(err)
    };
  }
}

// server/services/dailyAdminReportService.ts
var DEFAULT_REPORT_CONFIG = {
  enabled: true,
  adminEmails: [],
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
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}
function getPreviousKolkataDateString(currentDate = /* @__PURE__ */ new Date()) {
  const tzString = "Asia/Kolkata";
  const kolkataStr = currentDate.toLocaleString("en-US", { timeZone: tzString });
  const kolkataDate = new Date(kolkataStr);
  kolkataDate.setDate(kolkataDate.getDate() - 1);
  return getKolkataDateString(kolkataDate);
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
function isKolkataLateCheckIn(checkInTimeStr) {
  const mins = parseTimeToMinutes(checkInTimeStr);
  if (mins === null) return false;
  return mins > 630;
}
async function getDailyReportConfig(db2) {
  try {
    const snap = await db2.collection("notification_settings").doc("daily_admin_report_config").get();
    if (!snap.exists) {
      return { ...DEFAULT_REPORT_CONFIG };
    }
    const data = snap.data();
    let adminEmails = [];
    if (Array.isArray(data?.adminEmails)) {
      adminEmails = data.adminEmails;
    } else if (typeof data?.adminEmail === "string" && data.adminEmail.trim()) {
      adminEmails = [data.adminEmail.trim()];
    }
    return {
      enabled: data?.enabled !== false,
      adminEmails,
      sendTime: data?.sendTime || "07:00 AM",
      includeAttendance: data?.includeAttendance !== false,
      includeLeaves: data?.includeLeaves !== false,
      includeExpenses: data?.includeExpenses !== false,
      includeOtherDailyActivity: data?.includeOtherDailyActivity !== false,
      updatedAt: data?.updatedAt,
      updatedBy: data?.updatedBy
    };
  } catch (err) {
    console.warn("[DailyReportService] Failed to load config, returning defaults:", err);
    return { ...DEFAULT_REPORT_CONFIG };
  }
}
async function saveDailyReportConfig(db2, config, updatedBy) {
  const current = await getDailyReportConfig(db2);
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
  await db2.collection("notification_settings").doc("daily_admin_report_config").set(updated, { merge: true });
  return updated;
}
async function generateAndSendDailyReport(db2, targetDateStr, isManualSend = false, triggerBy = "SYSTEM_SCHEDULER") {
  const reportDate = targetDateStr || getPreviousKolkataDateString();
  const dateFormattedFriendly = formatDateStringFriendly(reportDate);
  const config = await getDailyReportConfig(db2);
  if (!config.enabled && !isManualSend) {
    return { success: true, message: "Daily Admin Report is currently disabled in configuration.", reportDate };
  }
  const recipients = config.adminEmails || [];
  const reportLogRef = db2.collection("daily_admin_reports").doc(reportDate);
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
      updatedAt: import_firestore2.FieldValue.serverTimestamp()
    }, { merge: true });
    return { success: false, message: "No Admin email recipients are configured.", reportDate };
  }
  const primaryRecipient = recipients[0];
  const canProceed = await db2.runTransaction(async (transaction) => {
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
      createdAt: import_firestore2.FieldValue.serverTimestamp(),
      updatedAt: import_firestore2.FieldValue.serverTimestamp()
    }, { merge: true });
    return { proceed: true, reason: "Ok" };
  });
  if (!canProceed.proceed) {
    console.log(`[DailyReportService] Skipping generation: ${canProceed.reason}`);
    return { success: false, message: canProceed.reason, reportDate, recipient: primaryRecipient };
  }
  try {
    const regsSnap = await db2.collection("registrations").get();
    const employeesMap = /* @__PURE__ */ new Map();
    const employeeCodeMap = /* @__PURE__ */ new Map();
    regsSnap.forEach((doc) => {
      const data = doc.data() || {};
      const reg = { id: doc.id, ...data };
      employeesMap.set(doc.id, reg);
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
      const attSnap = await db2.collection("attendance").where("date", "==", reportDate).get();
      attSnap.forEach((doc) => {
        const d = doc.data() || {};
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
      const leavesSnap = await db2.collection("leaves").get();
      leavesSnap.forEach((doc) => {
        const l = doc.data() || {};
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
      const expSnap = await db2.collection("expenses").where("date", "==", reportDate).get();
      expSnap.forEach((doc) => {
        const e = doc.data() || {};
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
      const taskSnap = await db2.collection("tasks").where("dueDate", "==", reportDate).get();
      const taskRows = [];
      taskSnap.forEach((doc) => {
        const t = doc.data() || {};
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
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EXFIN OMS Daily Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 20px; margin: 0; -webkit-font-smoothing: antialiased;">
  <div style="max-width: 800px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e1b4b 0%, #31105e 100%); color: #ffffff; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">EXFIN OMS</h1>
      <p style="margin: 5px 0 0 0; font-size: 15px; color: #c084fc; font-weight: 600;">Daily Operations & Administration Report</p>
      <div style="display: inline-block; margin-top: 15px; background: rgba(255,255,255,0.15); padding: 5px 15px; border-radius: 20px; font-size: 13px; font-weight: bold;">
        Report Date: ${dateFormattedFriendly}
      </div>
    </div>

    <div style="padding: 25px;">
      
      <!-- Summary Metrics Grid -->
      <h3 style="margin-top: 0; color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Summary Overview</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 25px;">
        
        <div style="flex: 1 1 120px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #047857; text-transform: uppercase;">Present</div>
          <div style="font-size: 24px; font-weight: 800; color: #065f46; margin-top: 2px;">${presentCount}</div>
        </div>

        <div style="flex: 1 1 120px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #b91c1c; text-transform: uppercase;">Absent</div>
          <div style="font-size: 24px; font-weight: 800; color: #991b1b; margin-top: 2px;">${absentCount}</div>
        </div>

        <div style="flex: 1 1 120px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #1d4ed8; text-transform: uppercase;">WFH</div>
          <div style="font-size: 24px; font-weight: 800; color: #1e40af; margin-top: 2px;">${wfhCount}</div>
        </div>

        <div style="flex: 1 1 120px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #b45309; text-transform: uppercase;">Client Visit</div>
          <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 2px;">${clientVisitCount}</div>
        </div>

        <div style="flex: 1 1 120px; background: #f3e8ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #7e22ce; text-transform: uppercase;">Outdoor</div>
          <div style="font-size: 24px; font-weight: 800; color: #6b21a8; margin-top: 2px;">${outdoorWorkCount}</div>
        </div>

        <div style="flex: 1 1 120px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #d97706; text-transform: uppercase;">Late</div>
          <div style="font-size: 24px; font-weight: 800; color: #92400e; margin-top: 2px;">${lateCount}</div>
        </div>

        <div style="flex: 1 1 120px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center;">
          <div style="font-size: 11px; font-weight: bold; color: #475569; text-transform: uppercase;">Expenses</div>
          <div style="font-size: 24px; font-weight: 800; color: #0f172a; margin-top: 2px;">\u20B9${totalExpensesSum.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</div>
        </div>

      </div>

      <!-- Attendance Section -->
      <div style="margin-bottom: 30px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase;">1. Attendance Details (${presentCount} present / ${totalEmployeesCount} total)</h3>
        ${attendanceRows.length === 0 ? '<p style="color: #64748b; font-size: 13px;">No attendance recorded for this date.</p>' : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 10px;">Emp Code</th>
                  <th style="padding: 10px;">Name</th>
                  <th style="padding: 10px;">Type</th>
                  <th style="padding: 10px;">In</th>
                  <th style="padding: 10px;">Out</th>
                  <th style="padding: 10px;">Hours</th>
                  <th style="padding: 10px;">Status</th>
                  <th style="padding: 10px;">Late</th>
                  <th style="padding: 10px;">Location Details</th>
                </tr>
              </thead>
              <tbody>
                ${attendanceRows.join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Leave Section -->
      <div style="margin-bottom: 30px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase;">2. Leaves Overview</h3>
        ${leaveRows.length === 0 ? '<p style="color: #64748b; font-size: 13px;">No active leaves recorded for this date.</p>' : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 10px;">Emp Code</th>
                  <th style="padding: 10px;">Name</th>
                  <th style="padding: 10px;">Leave Period</th>
                  <th style="padding: 10px;">Status</th>
                  <th style="padding: 10px;">Reason</th>
                </tr>
              </thead>
              <tbody>
                ${leaveRows.join("")}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Expenses Section -->
      <div style="margin-bottom: 30px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase;">3. Expenses Claims</h3>
        ${expenseRows.length === 0 ? '<p style="color: #64748b; font-size: 13px;">No expenses submitted for this date.</p>' : `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px; text-align: left;">
              <thead>
                <tr style="background: #f8fafc; border-bottom: 2px solid #cbd5e1; color: #475569; font-weight: bold;">
                  <th style="padding: 10px;">Emp Code</th>
                  <th style="padding: 10px;">Name</th>
                  <th style="padding: 10px;">Amount</th>
                  <th style="padding: 10px;">Category</th>
                  <th style="padding: 10px;">Description</th>
                  <th style="padding: 10px;">Status</th>
                </tr>
              </thead>
              <tbody>
                ${expenseRows.join("")}
              </tbody>
            </table>
          </div>
          <div style="text-align: right; margin-top: 15px; font-size: 14px; font-weight: bold; color: #0f172a;">
            Total Daily Expenses Claimed: <span style="color: #10b981; font-size: 16px;">\u20B9${totalExpensesSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
          </div>
        `}
      </div>

      <!-- Other Activity -->
      <div style="margin-bottom: 10px;">
        <h3 style="color: #0f172a; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; font-size: 15px; font-weight: 700; text-transform: uppercase;">4. Other Daily Operational Data</h3>
        ${otherDataHtml}
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #cbd5e1; padding: 20px; text-align: center; color: #64748b; font-size: 11px;">
      <p style="margin: 0;">This email is an automatically generated administrative report from your EXFIN Office Management System.</p>
      <p style="margin: 5px 0 0 0;">\xA9 2026 EXFIN OMS. All rights reserved.</p>
    </div>

  </div>
</body>
</html>
    `;
    const subject = `EXFIN OMS \u2014 Daily Admin Report \u2014 ${formatDateStringFriendly(reportDate)}`;
    const bccRecipients = recipients.slice(1);
    const emailRes = await sendMail({
      to: primaryRecipient,
      bcc: bccRecipients.length > 0 ? bccRecipients : void 0,
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
        error: hasRejections ? `Delivery failed for: ${rejected.join(", ")}` : import_firestore2.FieldValue.delete(),
        updatedAt: import_firestore2.FieldValue.serverTimestamp()
      }, { merge: true });
      try {
        const auditRef = db2.collection("audit_logs").doc();
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
        message: hasRejections ? `Daily Admin Report partially sent to ${accepted.length} recipients, but failed for ${rejected.length} recipients.` : "Daily Admin Report generated and sent successfully.",
        reportDate,
        recipient: primaryRecipient,
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
      updatedAt: import_firestore2.FieldValue.serverTimestamp()
    }, { merge: true });
    try {
      const auditRef = db2.collection("audit_logs").doc();
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
      reportDate,
      recipient: primaryRecipient
    };
  }
}
async function sendDailyReportTestEmail(db2, triggerBy = "SUPER_ADMIN") {
  const config = await getDailyReportConfig(db2);
  const recipients = config.adminEmails || [];
  if (recipients.length === 0) {
    return { success: false, message: "No Admin email recipients are configured." };
  }
  const primaryRecipient = recipients[0];
  const bccRecipients = recipients.slice(1);
  const subject = `EXFIN OMS \u2014 Test Daily Report`;
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; background-color: #f8fafc; padding: 25px; color: #1e293b;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgb(0 0 0 / 0.05); border-top: 4px solid #6366f1;">
    <h2 style="color: #1e1b4b; margin-top: 0;">EXFIN OMS \u2014 Connection Verification</h2>
    <p>This is a <strong>Test Daily Report</strong> designed to verify that the EXFIN OMS backend email server configuration is fully operational.</p>
    <p>Details:</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Status</td>
        <td style="padding: 8px 0; color: #10b981;">ACTIVE / OPERATIONAL</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">Primary Recipient</td>
        <td style="padding: 8px 0;">${primaryRecipient}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: bold;">BCC Recipients</td>
        <td style="padding: 8px 0;">${bccRecipients.length > 0 ? bccRecipients.join(", ") : "None"}</td>
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
        <td style="padding: 8px 0;">EXFIN OMS Server</td>
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
    to: primaryRecipient,
    bcc: bccRecipients.length > 0 ? bccRecipients : void 0,
    subject,
    html
  });
  if (emailRes.success) {
    const accepted = emailRes.accepted || [];
    const rejected = emailRes.rejected || [];
    const hasRejections = rejected.length > 0;
    try {
      const auditRef = db2.collection("audit_logs").doc();
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
      message: hasRejections ? `Test email sent to ${accepted.length} recipients, but failed for ${rejected.length} recipients.` : `Test email sent to ${recipients.length} recipients.`,
      recipientCount: recipients.length,
      recipients
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

// server.ts
var OFFICE_LAT = 23.616227;
var OFFICE_LNG = 87.117063;
var GEOFENCE_RADIUS_METERS = 25;
var db = null;
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
  if (!(0, import_app.getApps)().length) {
    if (serviceAccount) {
      (0, import_app.initializeApp)({
        credential: (0, import_app.cert)(serviceAccount),
        projectId: serviceAccount.project_id || projectId
      });
    } else if (projectId) {
      (0, import_app.initializeApp)({
        projectId
      });
    } else {
      (0, import_app.initializeApp)();
    }
  }
  db = (0, import_firestore3.getFirestore)();
  authAdmin = (0, import_auth.getAuth)();
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
  if (!db) return;
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
    const qSnap = await db.collection("attendance").where("checkoutStatus", "in", ["Pending", "PENDING_CONFIRMATION", null]).limit(100).get().catch(async (queryErr) => {
      if (queryErr?.code === 7 || queryErr?.message?.includes("PERMISSION_DENIED") || queryErr?.message?.includes("7 PERMISSION_DENIED")) {
        throw queryErr;
      }
      return await db.collection("attendance").where("checkOutTime", "==", null).limit(100).get();
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
        serverSyncTimestamp: import_firestore3.FieldValue.serverTimestamp(),
        processedEvents: import_firestore3.FieldValue.arrayUnion(eventId)
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
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  app.use((req, res, next) => {
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
  app.get("/api/health", (req, res) => {
    res.json({
      success: true,
      service: "EXFIN OMS API",
      firebaseAdminInitialized: !!db,
      firebaseAuthInitialized: !!authAdmin,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      environment: "production"
    });
  });
  async function verifyCaller(req) {
    if (!authAdmin || !db) return null;
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split("Bearer ")[1].trim();
    try {
      const decoded = await authAdmin.verifyIdToken(token);
      const uid = decoded.uid;
      const adminSnap = await db.collection("admin_users").doc(uid).get();
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
      const regSnap = await db.collection("registrations").doc(uid).get();
      if (regSnap.exists) {
        const rData = regSnap.data() || {};
        employeeId = regSnap.id;
        employeeCode = rData.employeeCode || "";
      } else {
        const qSnap = await db.collection("registrations").where("uid", "==", uid).limit(1).get();
        if (!qSnap.empty) {
          employeeId = qSnap.docs[0].id;
          employeeCode = qSnap.docs[0].data().employeeCode || "";
        } else if (decoded.email) {
          const qEmail = await db.collection("registrations").where("email", "==", decoded.email).limit(1).get();
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
  app.post("/api/admin/super-admin/reset-password", async (req, res) => {
    try {
      if (!authAdmin || !db) {
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
      const targetDocRef = db.collection("admin_users").doc(targetUid);
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
      await db.collection("audit_logs").add({
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
        createdAtServer: import_firestore3.FieldValue.serverTimestamp()
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
  app.get("/api/admin/super-admin/admin-users", async (req, res) => {
    try {
      if (!authAdmin || !db) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }
      const caller = await verifyAdminCaller(req);
      if (!caller || caller.role !== "SUPER_ADMIN") {
        return res.status(403).json({ error: "Unauthorized. Super-Admin authorization is required." });
      }
      const snap = await db.collection("admin_users").get();
      const adminUsers = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          uid: doc.id,
          loginId: data.loginId || doc.id,
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
  app.post("/api/admin/password-changed", async (req, res) => {
    try {
      if (!authAdmin || !db) {
        return res.status(503).json({ error: "Firebase backend services not ready." });
      }
      const caller = await verifyAdminCaller(req);
      if (!caller) {
        return res.status(401).json({ error: "Unauthorized. Please sign in." });
      }
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const targetDocRef = db.collection("admin_users").doc(caller.uid);
      await targetDocRef.set({
        mustChangePassword: false,
        passwordChangedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: caller.loginId || caller.email || caller.uid
      }, { merge: true });
      await db.collection("audit_logs").add({
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
        createdAtServer: import_firestore3.FieldValue.serverTimestamp()
      });
      return res.json({ success: true, message: "Password status updated successfully." });
    } catch (err) {
      console.error("[Admin Backend] Error updating password status:", err);
      return res.status(500).json({ error: err.message || "Failed to update password status." });
    }
  });
  app.get("/api/app-version", async (req, res) => {
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
      if (db) {
        try {
          const doc = await db.collection("app_config").doc("version").get();
          if (doc.exists) {
            const data = doc.data();
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
  app.post("/api/tts/welcome", async (req, res) => {
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
  app.post("/api/tts/notification", async (req, res) => {
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
  app.post("/api/median-background-location", async (req, res) => {
    try {
      const payload = req.body || {};
      const query = req.query || {};
      const latitude = typeof payload.latitude === "number" ? payload.latitude : parseFloat(query.lat || "0");
      const longitude = typeof payload.longitude === "number" ? payload.longitude : parseFloat(query.lng || "0");
      const employeeId = (payload.employeeId || query.emp || payload.customData?.employeeId || "").toString().trim();
      const accuracy = typeof payload.accuracy === "number" ? payload.accuracy : payload.horizontalAccuracy || 0;
      const source = payload.source || query.source || "MEDIAN_BACKGROUND_LOCATION";
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
      const tsInput = payload.timestamp || query.ts;
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
      if (!db) {
        console.error("[Median Backend] Firebase Admin not initialized. Cannot process persistence.");
        return res.status(503).json({ error: "Database service temporarily unavailable" });
      }
      const empRef = db.collection("registrations").doc(employeeId);
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
      const townCity = empData.townCity || "Raniganj HQ";
      const distance = isLocationUnavailable ? null : payload.distance !== void 0 && typeof payload.distance === "number" ? payload.distance : calculateDistanceInMeters(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
      let isInside = false;
      let isExit = false;
      if (eventTypeParam === "EXIT" || eventTypeParam === "GEOFENCE_EXIT") {
        isInside = false;
        isExit = true;
      } else if (eventTypeParam === "ENTER" || eventTypeParam === "GEOFENCE_RETURN") {
        isInside = true;
        isExit = false;
      } else if (isLocationUnavailable) {
        isInside = false;
        isExit = false;
      } else {
        isInside = distance !== null && distance <= GEOFENCE_RADIUS_METERS;
        isExit = distance !== null && distance > GEOFENCE_RADIUS_METERS;
      }
      console.log(`[Median Backend] Location payload validated for ${employeeName} (${employeeId}): Lat/Lng=${isLocationUnavailable ? "Unavailable" : `(${latitude.toFixed(6)}, ${longitude.toFixed(6)})`} - Distance: ${distance !== null ? `${Math.round(distance)}m` : "Unavailable"} - Inside: ${isInside} - EventType: ${eventTypeParam || "PERIODIC"}`);
      const liveDocRef = db.collection("live_locations").doc(employeeId);
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
      const attDocRef = db.collection("attendance").doc(attDocId);
      let transitionRecorded = false;
      let targetState = "UNCHANGED";
      await db.runTransaction(async (transaction) => {
        const attSnap = await transaction.get(attDocRef);
        const eventIso = tsDate.toISOString();
        if (!attSnap.exists) {
          const isEntryEvent = isInside || eventTypeParam === "ENTER" || eventTypeParam === "GEOFENCE_TRANSITION_ENTER" || eventTypeParam === "GEOFENCE_RETURN";
          const isWithinBoundary = isInside || distance !== null && distance <= GEOFENCE_RADIUS_METERS;
          if (isEntryEvent && isWithinBoundary) {
            console.log(`[BackgroundAttendance] GEOFENCE_ENTRY detected for ${employeeName} (${employeeId})`);
            console.log(`[BackgroundAttendance] VALIDATED entry location: Lat=${latitude}, Lng=${longitude}, Dist=${distance !== null ? `${Math.round(distance)}m` : "N/A"}`);
            const eventId2 = payload.eventId || `evt_bg_CHECK_IN_${employeeId}_${dateStr}_${timeStr.replace(/\s+/g, "_")}`;
            const attUuid = payload.id || `att_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
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
              serverSyncTimestamp: import_firestore3.FieldValue.serverTimestamp(),
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
            const eventRef = db.collection("attendance_events").doc(eventId2);
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
              serverSyncTime: import_firestore3.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`[BackgroundAttendance] CHECKIN_CREATED: Daily attendance document ${attDocId} created with checkInTime ${timeStr}`);
            console.log(`[BackgroundAttendance] CHECKIN_SYNCED: Synced to Firestore for employee ${employeeId}`);
            transitionRecorded = true;
            targetState = "CHECKED_IN";
          } else {
            console.log(`[BackgroundAttendance] No existing attendance for ${employeeId} on ${dateStr}, payload is not an entry event inside geofence (isInside: ${isInside}, distance: ${distance}m). Skipping.`);
          }
          return;
        }
        console.log(`[BackgroundAttendance] CHECKIN_ALREADY_EXISTS for ${employeeId} on ${dateStr}`);
        const record = attSnap.data() || {};
        if (record.checkOutTime && record.checkOutTime !== "--:--" && record.checkoutStatus === "COMPLETED") {
          return;
        }
        const currentState = record.currentState || "CHECKED_IN";
        const eventType = isInside ? "GEOFENCE_RETURN" : "GEOFENCE_EXIT";
        const eventId = payload.eventId || `evt_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, "_")}`;
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
            record.serverSyncTimestamp = import_firestore3.FieldValue.serverTimestamp();
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
            record.checkoutLatitude = import_firestore3.FieldValue.delete();
            record.checkoutLongitude = import_firestore3.FieldValue.delete();
            record.checkoutDistance = import_firestore3.FieldValue.delete();
            record.checkoutTownCity = import_firestore3.FieldValue.delete();
            record.processedEvents = updatedProcessedEvents;
            record.syncStatus = "Synced";
            record.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            record.serverSyncTime = (/* @__PURE__ */ new Date()).toISOString();
            record.serverSyncTimestamp = import_firestore3.FieldValue.serverTimestamp();
            modified = true;
            targetState = "CHECKED_IN";
            transitionRecorded = true;
          }
        }
        if (modified) {
          transaction.update(attDocRef, record);
          const eventRef = db.collection("attendance_events").doc(eventId);
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
            serverSyncTime: import_firestore3.FieldValue.serverTimestamp()
          }, { merge: true });
        }
      });
      if (transitionRecorded) {
        console.log(`[Median Backend] Transition successful for ${employeeName} to state: ${targetState} (Distance: ${isLocationUnavailable ? "unavailable" : `${Math.round(distance)}m`})`);
        if (db) {
          try {
            const isEntry = targetState === "CHECKED_IN";
            const eventType = isEntry ? "AUTO_CHECK_IN" : "OUTSIDE_OFFICE";
            const eventId = `evt_bg_${employeeId}_${dateStr}_${eventType}_${timeStr.replace(/\s+/g, "_")}`;
            dispatchWhatsAppAttendanceNotification(db, {
              eventId,
              eventType,
              employeeId,
              employeeCode: employeeId,
              employeeName,
              attendanceType: "OFFICE",
              checkInTime: timeStr,
              distance: isLocationUnavailable ? 0 : Math.round(distance),
              townCity: townCity || "Raniganj HQ",
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
  app.post("/api/notifications/whatsapp", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Valid Firebase authentication token required" });
    }
    if (!db) {
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
          const doc = await db.collection("registrations").doc(targetEmployeeId).get();
          if (doc.exists) regDoc = doc;
        }
        if (!regDoc && targetEmployeeCode) {
          const q = await db.collection("registrations").where("employeeCode", "==", targetEmployeeCode).limit(1).get();
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
      const results = await dispatchWhatsAppAttendanceNotification(db, verifiedPayload);
      return res.json({
        success: true,
        results
      });
    } catch (err) {
      console.error("[WhatsApp API] Error dispatching notification:", err);
      return res.status(500).json({ error: err.message || "Internal server error dispatching WhatsApp message" });
    }
  });
  app.get("/api/admin/whatsapp/config", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isAdmin) {
      return res.status(401).json({ error: "Unauthorized access: Valid Admin token required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const env = getWhatsAppEnvCredentials();
      const config = await getWhatsAppConfig(db);
      const maskString = (str) => {
        if (!str || str.length <= 4) return str ? "****" : "";
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      };
      return res.json({
        configured: env.isConfigured,
        status: env.isConfigured ? "CONNECTED" : "NOT_CONFIGURED",
        maskedPhoneNumberId: maskString(env.phoneNumberId),
        maskedWabaId: maskString(env.businessAccountId),
        apiVersion: config.apiVersion || env.apiVersion,
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
  app.post("/api/admin/whatsapp/config", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Super-Administrator authorization required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const updateData = req.body;
      const updatedConfig = await saveWhatsAppConfig(
        db,
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
        const auditRef = db.collection("audit_logs").doc();
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
      const env = getWhatsAppEnvCredentials();
      const maskString = (str) => {
        if (!str || str.length <= 4) return str ? "****" : "";
        return `${str.slice(0, 3)}****${str.slice(-4)}`;
      };
      return res.json({
        configured: env.isConfigured,
        status: env.isConfigured ? "CONNECTED" : "NOT_CONFIGURED",
        maskedPhoneNumberId: maskString(env.phoneNumberId),
        maskedWabaId: maskString(env.businessAccountId),
        apiVersion: updatedConfig.apiVersion || env.apiVersion,
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
  app.post("/api/admin/whatsapp/test", async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isSuperAdmin) {
      return res.status(403).json({ error: "Forbidden: Super-Administrator authorization required" });
    }
    const { recipient, testMessage, templateName, languageCode, type } = req.body;
    if (!recipient) {
      return res.status(400).json({ error: "Recipient phone number is required" });
    }
    try {
      const messageBody = testMessage || "EXFIN OMS WhatsApp Connection Test Successful.";
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
        if (db) {
          try {
            const auditRef = db.collection("audit_logs").doc();
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
  app.get(["/api/admin/daily-report/config", "/api/admin/daily-email-report/config"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isAdmin) {
      return res.status(401).json({ error: "Unauthorized access: Valid Admin token required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const config = await getDailyReportConfig(db);
      return res.json({
        success: true,
        config
      });
    } catch (err) {
      console.error("[DailyReport API] Error fetching config:", err);
      return res.status(500).json({ error: "Failed to fetch daily report configuration" });
    }
  });
  app.post(["/api/admin/daily-report/config", "/api/admin/daily-email-report/config"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || caller.role !== "SUPER_ADMIN") {
      return res.status(401).json({ error: "Unauthorized access: Super-Admin credentials required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      if (req.body.adminEmails !== void 0) {
        const valResult = validateAdminEmails(req.body.adminEmails);
        if (!valResult.valid) {
          return res.status(400).json({ error: valResult.error });
        }
      }
      const updatedConfig = await saveDailyReportConfig(db, req.body, caller.email || caller.uid);
      return res.json({
        success: true,
        config: updatedConfig
      });
    } catch (err) {
      console.error("[DailyReport API] Error saving config:", err);
      return res.status(400).json({ error: err.message || "Failed to save daily report configuration" });
    }
  });
  app.post(["/api/admin/daily-report/send-test", "/api/admin/daily-email-report/test"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || caller.role !== "SUPER_ADMIN") {
      return res.status(401).json({ error: "Unauthorized access: Super-Admin credentials required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const result = await sendDailyReportTestEmail(db, caller.email || caller.uid);
      return res.json(result);
    } catch (err) {
      console.error("[DailyReport API] Error sending test email:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to send test email" });
    }
  });
  app.post(["/api/admin/daily-report/send-yesterday", "/api/admin/daily-email-report/send-yesterday"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || caller.role !== "SUPER_ADMIN") {
      return res.status(401).json({ error: "Unauthorized access: Super-Admin credentials required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const targetDate = req.body.date;
      const result = await generateAndSendDailyReport(db, targetDate, true, caller.email || caller.uid);
      return res.json(result);
    } catch (err) {
      console.error("[DailyReport API] Error manually sending report:", err);
      return res.status(500).json({ success: false, error: err.message || "Failed to manually generate/send report" });
    }
  });
  app.get(["/api/admin/daily-report/history", "/api/admin/daily-email-report/history"], async (req, res) => {
    const caller = await verifyCaller(req);
    if (!caller || !caller.isAdmin) {
      return res.status(401).json({ error: "Unauthorized access: Valid Admin token required" });
    }
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    try {
      const historySnap = await db.collection("daily_admin_reports").orderBy("startedAt", "desc").limit(30).get();
      const history = [];
      historySnap.forEach((doc) => {
        history.push({
          id: doc.id,
          ...doc.data()
        });
      });
      return res.json({
        success: true,
        history
      });
    } catch (err) {
      console.error("[DailyReport API] Error fetching history:", err);
      return res.status(500).json({ error: "Failed to fetch daily report history" });
    }
  });
  app.post("/api/internal/daily-admin-report", async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: "Database service unavailable" });
    }
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;
    const expectedSecret = process.env.CRON_SECRET || "exfin_oms_secure_scheduler_token_2026";
    const isAuthorized = authHeader === `Bearer ${expectedSecret}` || queryToken === expectedSecret;
    if (!isAuthorized) {
      console.warn(`[DailyReport Scheduler] Unauthorized attempt to invoke scheduler endpoint.`);
      return res.status(401).json({ error: "Unauthorized: Invalid or missing scheduling credentials" });
    }
    try {
      console.log(`[DailyReport Scheduler] Scheduler triggered report dispatch process...`);
      const targetDate = req.body?.date || req.query?.date;
      const result = await generateAndSendDailyReport(db, targetDate, false, "AUTOMATED_SCHEDULER");
      return res.json(result);
    } catch (err) {
      console.error("[DailyReport Scheduler] Error in scheduled report execution:", err);
      return res.status(500).json({ error: err.message || "Failed to execute scheduled report process" });
    }
  });
  const downloadsPath = import_path.default.join(process.cwd(), "public", "downloads");
  app.get("/downloads/:filename", (req, res) => {
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
  app.use("/downloads", import_express.default.static(downloadsPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".apk")) {
        res.setHeader("Content-Type", "application/vnd.android.package-archive");
        res.setHeader("Content-Disposition", "attachment");
      }
    }
  }));
  app.all("/api/*", (req, res) => {
    return res.status(404).json({ success: false, error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Office Management System Server running on http://0.0.0.0:${PORT}`);
    runServerAttendanceFinalizer().catch(() => {
    });
    setInterval(() => {
      runServerAttendanceFinalizer().catch(() => {
      });
    }, 6e4);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
