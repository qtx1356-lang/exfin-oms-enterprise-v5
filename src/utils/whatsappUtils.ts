import { AttendanceRecord } from '../types/attendance';
import { db } from '../services/firebase/config';
import { doc, onSnapshot, getDoc, setDoc } from 'firebase/firestore';

/**
 * Storage key for offline caching of the Admin-configured WhatsApp recipient number
 */
const WHATSAPP_RECIPIENT_STORAGE_KEY = 'exfin_whatsapp_recipient_number';
const SETTINGS_DOC_PATH = 'notification_settings/whatsapp_config';

/**
 * Normalizes an Indian WhatsApp mobile number to standard 12-digit format: 91XXXXXXXXXX
 * 
 * Rules:
 * - Accept: +91 98765 43210, 91 98765 43210, 9876543210, 09876543210, +91-98765-43210, +91 (98765) 43210
 * - Reject letters, empty string, malformed country code, fewer than 10 mobile digits,
 *   more than expected digits, duplicate country code (9191XXXXXXXXXX), obvious malformed input.
 * - Normalized format: 91 + 10 digits = 12 digits total.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Reject letters or invalid characters
  if (/[a-zA-Z]/.test(trimmed)) return null;

  // Strip spaces, hyphens, parentheses, periods, slashes
  let cleaned = trimmed.replace(/[\s\-\(\)\.\/]/g, '');

  // Strip leading plus
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Must contain only digits now
  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  // Reject duplicate country code like 9191XXXXXXXXXX (e.g. length >= 14 or begins with 9191)
  if (cleaned.startsWith('9191')) {
    return null;
  }

  // 11 digits starting with 0 (e.g., 09876543210) -> convert 0XXXXXXXXXX to 91XXXXXXXXXX
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    cleaned = '91' + cleaned.substring(1);
  }

  // 10 digits (e.g., 9876543210) -> convert to 91XXXXXXXXXX
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }

  // Expected normalized format: 91 + 10 digits = 12 digits
  if (cleaned.length !== 12) {
    return null;
  }

  // Must start with 91
  if (!cleaned.startsWith('91')) {
    return null;
  }

  // Mobile part must be exactly 10 digits
  const mobilePart = cleaned.substring(2);
  if (mobilePart.length !== 10) {
    return null;
  }

  // Reject obvious malformed sequences (e.g. all 0s, all 1s, etc.)
  if (/^(\d)\1{9}$/.test(mobilePart)) {
    return null;
  }

  return cleaned;
}

/**
 * Validates whether an input represents a valid Indian WhatsApp mobile number
 */
export function isValidWhatsAppNumber(raw: string | null | undefined): boolean {
  return normalizeWhatsAppNumber(raw) !== null;
}

/**
 * Formats a normalized WhatsApp number for human display (e.g. +91 98765 43210)
 */
export function formatWhatsAppNumberForDisplay(raw: string | null | undefined): string {
  if (!raw) return '';
  const normalized = normalizeWhatsAppNumber(raw);
  if (!normalized) return raw;
  return `+${normalized.slice(0, 2)} ${normalized.slice(2, 7)} ${normalized.slice(7)}`;
}

// In-memory cache initialized from local storage if available
let inMemoryRecipientNumber: string | null = (() => {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(WHATSAPP_RECIPIENT_STORAGE_KEY);
    return normalizeWhatsAppNumber(cached);
  } catch {
    return null;
  }
})();

const listeners = new Set<(num: string | null) => void>();
let unsubscribeFirestore: (() => void) | null = null;

function notifyListeners(num: string | null) {
  listeners.forEach((listener) => {
    try {
      listener(num);
    } catch (e) {
      console.warn('[WhatsAppUtils] Listener error:', e);
    }
  });
}

/**
 * Initializes real-time listener on Firestore settings document.
 * Caches normalized number in-memory and localStorage for instant offline access.
 */
export function initWhatsAppSettingsListener(): () => void {
  if (typeof window === 'undefined' || !db) {
    return () => {};
  }

  if (unsubscribeFirestore) {
    return unsubscribeFirestore;
  }

  try {
    const docRef = doc(db, SETTINGS_DOC_PATH);
    unsubscribeFirestore = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          const rawNum =
            data.whatsappRecipientNumber ||
            (Array.isArray(data.adminRecipients) && data.adminRecipients[0]) ||
            null;
          const normalized = normalizeWhatsAppNumber(rawNum);
          if (normalized) {
            inMemoryRecipientNumber = normalized;
            try {
              localStorage.setItem(WHATSAPP_RECIPIENT_STORAGE_KEY, normalized);
            } catch (e) {
              // ignore
            }
          } else {
            inMemoryRecipientNumber = null;
            try {
              localStorage.removeItem(WHATSAPP_RECIPIENT_STORAGE_KEY);
            } catch (e) {
              // ignore
            }
          }
        } else {
          inMemoryRecipientNumber = null;
          try {
            localStorage.removeItem(WHATSAPP_RECIPIENT_STORAGE_KEY);
          } catch (e) {
            // ignore
          }
        }
        notifyListeners(inMemoryRecipientNumber);
      },
      (error) => {
        // Offline or permissions warning: keep existing local/in-memory cache intact
        console.warn('[WhatsAppUtils] Settings listener warning (using cached if available):', error?.message || error);
      }
    );
  } catch (err) {
    console.warn('[WhatsAppUtils] Failed to attach settings listener:', err);
  }

  return () => {
    if (unsubscribeFirestore) {
      unsubscribeFirestore();
      unsubscribeFirestore = null;
    }
  };
}

// Auto-initialize real-time settings listener on client startup
if (typeof window !== 'undefined') {
  try {
    initWhatsAppSettingsListener();
  } catch (e) {
    // Non-blocking initialization
  }
}

/**
 * Synchronously retrieves current configured WhatsApp recipient number from cache.
 * Returns null if not configured.
 */
export function getWhatsAppRecipientNumber(): string | null {
  if (inMemoryRecipientNumber) {
    return inMemoryRecipientNumber;
  }
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(WHATSAPP_RECIPIENT_STORAGE_KEY);
      const normalized = normalizeWhatsAppNumber(cached);
      if (normalized) {
        inMemoryRecipientNumber = normalized;
        return inMemoryRecipientNumber;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Subscribes to changes to the WhatsApp recipient number.
 */
export function subscribeWhatsAppRecipientNumber(callback: (num: string | null) => void): () => void {
  listeners.add(callback);
  callback(getWhatsAppRecipientNumber());
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Asynchronously loads settings from Firestore with local cache fallback.
 */
export async function fetchWhatsAppRecipientNumber(): Promise<string | null> {
  if (typeof window !== 'undefined' && db && navigator.onLine) {
    try {
      const docRef = doc(db, SETTINGS_DOC_PATH);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() || {};
        const rawNum =
          data.whatsappRecipientNumber ||
          (Array.isArray(data.adminRecipients) && data.adminRecipients[0]) ||
          null;
        const normalized = normalizeWhatsAppNumber(rawNum);
        if (normalized) {
          inMemoryRecipientNumber = normalized;
          try {
            localStorage.setItem(WHATSAPP_RECIPIENT_STORAGE_KEY, normalized);
          } catch (e) {
            // ignore
          }
          notifyListeners(normalized);
          return normalized;
        }
      }
    } catch (err) {
      console.warn('[WhatsAppUtils] Fetch error, using cache:', err);
    }
  }
  return getWhatsAppRecipientNumber();
}

/**
 * Saves a new WhatsApp recipient number to Firestore settings document and updates caches.
 * Throws an error if the number is invalid.
 */
export async function saveWhatsAppRecipientNumber(
  rawInput: string,
  updaterName?: string
): Promise<{ success: boolean; normalized: string }> {
  const normalized = normalizeWhatsAppNumber(rawInput);
  if (!normalized) {
    throw new Error('Enter a valid Indian WhatsApp mobile number.');
  }

  // Update in-memory and local storage immediately
  inMemoryRecipientNumber = normalized;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(WHATSAPP_RECIPIENT_STORAGE_KEY, normalized);
    } catch (e) {
      // ignore
    }
  }
  notifyListeners(normalized);

  // Save to Firestore settings document
  if (typeof window !== 'undefined' && db) {
    const docRef = doc(db, SETTINGS_DOC_PATH);
    await setDoc(
      docRef,
      {
        whatsappRecipientNumber: normalized,
        updatedAt: new Date().toISOString(),
        updatedBy: updaterName || 'Admin'
      },
      { merge: true }
    );
  }

  return { success: true, normalized };
}

/**
 * Checks whether an attendance record is eligible for WhatsApp sharing,
 * independent of whether the recipient number is configured yet.
 */
export function canGenerateWhatsAppAttendanceUrl(
  record: AttendanceRecord | null | undefined,
  type: 'CHECK_IN' | 'CHECK_OUT'
): boolean {
  if (!record) return false;

  if (type === 'CHECK_IN') {
    return Boolean(record.checkInTime && record.checkInTime !== '--:--');
  }

  if (type === 'CHECK_OUT') {
    const checkOut = record.checkOutTime;
    if (
      !checkOut ||
      checkOut === '--:--' ||
      checkOut === 'UNRESOLVED' ||
      record.checkoutStatus === 'UNRESOLVED' ||
      record.checkoutStatus === 'PENDING_ADMIN_REVIEW'
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Generates the WhatsApp "Tap to Send" URL for attendance notifications
 * Uses the official wa.me Click-to-Chat mechanism.
 * 
 * Returns null if:
 * - recipient is not configured (never launches wa.me/undefined or wa.me/null)
 * - parameters are missing
 * - checkout is unresolved or pending review
 */
export const getWhatsAppAttendanceUrl = (
  employeeName: string,
  employeeCode: string,
  record: AttendanceRecord,
  type: 'CHECK_IN' | 'CHECK_OUT',
  overrideRecipient?: string | null
): string | null => {
  if (!employeeName || !employeeCode || !record) return null;

  const recipient = overrideRecipient
    ? normalizeWhatsAppNumber(overrideRecipient)
    : getWhatsAppRecipientNumber();

  // If no recipient is configured, safely return null
  if (!recipient) return null;

  const date = record.date;
  const checkIn = record.checkInTime;
  const officeName = record.townCity || record.checkInTownCity || 'EXFIN Office';

  if (type === 'CHECK_IN') {
    if (!checkIn || checkIn === '--:--') return null;

    const message = `🟢 ATTENDANCE CHECK-IN

Employee: ${employeeName}
Code: ${employeeCode}
Date: ${date}
Check-in: ${checkIn}
Office: ${officeName}
Status: PRESENT`;

    return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
  }

  if (type === 'CHECK_OUT') {
    const checkOut = record.checkOutTime;
    // A checkout WhatsApp message must only be generated when the existing
    // attendance record contains a valid finalized checkout.
    if (
      !checkOut ||
      checkOut === '--:--' ||
      checkOut === 'UNRESOLVED' ||
      record.checkoutStatus === 'UNRESOLVED' ||
      record.checkoutStatus === 'PENDING_ADMIN_REVIEW'
    ) {
      return null;
    }

    const workingTime = record.workingHours || 'N/A';
    const status = record.checkoutStatus === 'COMPLETED' ? 'COMPLETED' : 'PRESENT';

    const message = `🔴 ATTENDANCE CHECK-OUT

Employee: ${employeeName}
Code: ${employeeCode}
Date: ${date}
Check-in: ${checkIn}
Check-out: ${checkOut}
Working Time: ${workingTime}
Office: ${officeName}
Status: ${status}`;

    return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
  }

  return null;
};
