import { NotificationRecord } from '../../types/notification';

const ACKNOWLEDGED_ALERTS_KEY = 'exfin_acknowledged_alert_popup_ids';
const HANDLED_ALERTS_KEY = 'exfin_handled_alert_ids';
const POPUP_SHOWN_IDS_KEY = 'NOTIFICATION_POPUP_SHOWN_IDS';

// In-memory sets
const acknowledgedAlertIds = new Set<string>();
const handledAlertIds = new Set<string>();
const popupShownIds = new Set<string>();
let isBaselineLoaded = false;
let baselineTimestamp = 0;

// Load persisted IDs on startup
const loadPersistedIds = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const rawAck = localStorage.getItem(ACKNOWLEDGED_ALERTS_KEY);
    if (rawAck) {
      const arr: string[] = JSON.parse(rawAck);
      arr.slice(-300).forEach((id) => acknowledgedAlertIds.add(id));
    }
    const rawHandled = localStorage.getItem(HANDLED_ALERTS_KEY);
    if (rawHandled) {
      const arr: string[] = JSON.parse(rawHandled);
      arr.slice(-300).forEach((id) => handledAlertIds.add(id));
    }
    const rawPopupShown = localStorage.getItem(POPUP_SHOWN_IDS_KEY);
    if (rawPopupShown) {
      const arr: string[] = JSON.parse(rawPopupShown);
      arr.slice(-300).forEach((id) => popupShownIds.add(id));
    }
  } catch (err) {
    console.warn('Error reading persisted alert IDs:', err);
  }
};

loadPersistedIds();

const persistIds = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const ackArr = Array.from(acknowledgedAlertIds).slice(-300);
    localStorage.setItem(ACKNOWLEDGED_ALERTS_KEY, JSON.stringify(ackArr));

    const handledArr = Array.from(handledAlertIds).slice(-300);
    localStorage.setItem(HANDLED_ALERTS_KEY, JSON.stringify(handledArr));

    const popupShownArr = Array.from(popupShownIds).slice(-300);
    localStorage.setItem(POPUP_SHOWN_IDS_KEY, JSON.stringify(popupShownArr));
  } catch (err) {}
};

/**
 * Check if alert popup was already shown for this notification ID
 */
export const isPopupShown = (notifId: string): boolean => {
  if (!notifId) return true;
  return (
    popupShownIds.has(notifId) ||
    handledAlertIds.has(notifId) ||
    acknowledgedAlertIds.has(notifId)
  );
};

/**
 * Mark notification popup as shown (persisted to localStorage)
 */
export const markPopupShown = (notifId: string): void => {
  if (!notifId) return;
  popupShownIds.add(notifId);
  handledAlertIds.add(notifId);
  persistIds();
};

/**
 * Mark alert as acknowledged by user (persisted forever)
 */
export const markAlertAcknowledged = (notifId: string): void => {
  if (!notifId) return;
  acknowledgedAlertIds.add(notifId);
  handledAlertIds.add(notifId);
  popupShownIds.add(notifId);
  persistIds();
};

/**
 * Check if alert has been acknowledged
 */
export const isAlertAcknowledged = (notifId: string): boolean => {
  if (!notifId) return false;
  return acknowledgedAlertIds.has(notifId);
};

/**
 * Mark alert as handled/processed
 */
export const markAlertHandled = (notifId: string): void => {
  if (!notifId) return;
  handledAlertIds.add(notifId);
  popupShownIds.add(notifId);
  persistIds();
};

/**
 * Check if alert is handled or already acknowledged
 */
export const isAlertHandled = (notifId: string): boolean => {
  if (!notifId) return true;
  return (
    handledAlertIds.has(notifId) ||
    acknowledgedAlertIds.has(notifId) ||
    popupShownIds.has(notifId)
  );
};

/**
 * Establish baseline on initial snapshot load
 */
export const initializeAlertBaseline = (notifications: NotificationRecord[]): void => {
  if (!isBaselineLoaded) {
    baselineTimestamp = Date.now();
    if (notifications && notifications.length > 0) {
      notifications.forEach((n) => {
        if (n.id) {
          // If notification is older than 24 hours, mark it shown/handled so old items don't pop up
          const notifTime = new Date(
            n.timestamp || n.createdAtDeviceTime || n.createdAt || Date.now()
          ).getTime();
          if (!isNaN(notifTime) && Date.now() - notifTime > 86400000) {
            handledAlertIds.add(n.id);
            popupShownIds.add(n.id);
          }
        }
      });
      persistIds();
    }
    isBaselineLoaded = true;
  }
};

/**
 * Check if baseline has been established
 */
export const hasAlertBaseline = (): boolean => {
  return isBaselineLoaded;
};

/**
 * Check if a notification is truly new and eligible for popup
 */
export const isNotificationEligibleForPopup = (
  notif: NotificationRecord
): boolean => {
  if (!notif || !notif.id) return false;

  // 1. If already shown, acknowledged, or handled, do not popup
  if (isPopupShown(notif.id) || isAlertHandled(notif.id) || isAlertAcknowledged(notif.id)) {
    return false;
  }

  // 2. If already marked as read, do not popup
  if (notif.read || (notif as any).isRead) {
    markPopupShown(notif.id);
    return false;
  }

  // 3. Technical system logs should not trigger popup
  if (
    notif.category === 'SYSTEM' &&
    notif.type !== 'ANNOUNCEMENT' &&
    notif.type !== 'SYSTEM_ALERT'
  ) {
    return false;
  }

  // 4. If notification is older than 24 hours, skip popup
  const notifTime = new Date(
    notif.timestamp || notif.createdAtDeviceTime || notif.createdAt || Date.now()
  ).getTime();
  if (!isNaN(notifTime) && Date.now() - notifTime > 86400000) {
    markPopupShown(notif.id);
    return false;
  }

  return true;
};
