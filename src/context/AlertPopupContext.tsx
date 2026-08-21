import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { NotificationRecord } from '../types/notification';
import {
  isNotificationEligibleForPopup,
  markAlertAcknowledged,
  markAlertHandled,
  initializeAlertBaseline,
  hasAlertBaseline,
} from '../services/notification/alertDeduplication';
import { playAlertSound, triggerAlertVibration } from '../services/notification/alertSoundService';
import { markNotificationRead } from '../services/notification/notificationService';
import { AlertPopup } from '../components/notifications/AlertPopup';

interface AlertPopupContextType {
  activeAlert: NotificationRecord | null;
  alertQueue: NotificationRecord[];
  triggerAlertPopup: (notif: NotificationRecord) => void;
  acknowledgeAlert: (notifId: string) => Promise<void>;
  dismissAlert: () => void;
  initializeBaseline: (notifications: NotificationRecord[]) => void;
}

const AlertPopupContext = createContext<AlertPopupContextType | undefined>(undefined);

export const AlertPopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeAlert, setActiveAlert] = useState<NotificationRecord | null>(null);
  const [alertQueue, setAlertQueue] = useState<NotificationRecord[]>([]);
  const activeAlertRef = useRef<NotificationRecord | null>(null);
  activeAlertRef.current = activeAlert;

  const alertQueueRef = useRef<NotificationRecord[]>([]);
  alertQueueRef.current = alertQueue;

  /**
   * Trigger popup for a newly arrived notification
   */
  const triggerAlertPopup = useCallback((notif: NotificationRecord) => {
    if (!notif || !notif.id) return;

    if (!isNotificationEligibleForPopup(notif)) {
      return;
    }

    // Mark as handled immediately to avoid duplicates in rapid listeners
    markAlertHandled(notif.id);

    // If already showing or queued, don't duplicate
    if (activeAlertRef.current?.id === notif.id) return;
    if (alertQueueRef.current.some((n) => n.id === notif.id)) return;

    if (!activeAlertRef.current) {
      setActiveAlert(notif);
      playAlertSound(notif.priority || 'NORMAL');
      triggerAlertVibration(notif.priority || 'NORMAL');
    } else {
      setAlertQueue((prev) => [...prev, notif]);
    }
  }, []);

  /**
   * User clicked [ OK / ACKNOWLEDGE ]
   */
  const acknowledgeAlert = useCallback(async (notifId: string) => {
    // 1. Mark acknowledged in deduplication persistence
    markAlertAcknowledged(notifId);

    // 2. Mark read in existing notification service (Firestore + local)
    try {
      await markNotificationRead(notifId);
    } catch (err) {
      console.warn('Failed to mark notification read on acknowledge:', err);
    }

    // 3. Process next alert from queue
    setAlertQueue((prevQueue) => {
      if (prevQueue.length > 0) {
        const [nextAlert, ...remainingQueue] = prevQueue;
        setActiveAlert(nextAlert);
        playAlertSound(nextAlert.priority || 'NORMAL');
        triggerAlertVibration(nextAlert.priority || 'NORMAL');
        return remainingQueue;
      } else {
        setActiveAlert(null);
        return [];
      }
    });
  }, []);

  /**
   * User clicked [ Close ] without formal acknowledge
   */
  const dismissAlert = useCallback(() => {
    if (activeAlertRef.current) {
      markAlertHandled(activeAlertRef.current.id);
    }

    setAlertQueue((prevQueue) => {
      if (prevQueue.length > 0) {
        const [nextAlert, ...remainingQueue] = prevQueue;
        setActiveAlert(nextAlert);
        playAlertSound(nextAlert.priority || 'NORMAL');
        triggerAlertVibration(nextAlert.priority || 'NORMAL');
        return remainingQueue;
      } else {
        setActiveAlert(null);
        return [];
      }
    });
  }, []);

  /**
   * Initialize baseline with historical notifications
   */
  const initializeBaseline = useCallback((notifications: NotificationRecord[]) => {
    initializeAlertBaseline(notifications);
  }, []);

  // Listen for global custom event 'exfin-trigger-alert-popup' (for push notification tap or central dispatcher)
  useEffect(() => {
    const handleCustomTrigger = (event: CustomEvent<NotificationRecord>) => {
      if (event.detail) {
        triggerAlertPopup(event.detail);
      }
    };

    window.addEventListener('exfin-trigger-alert-popup' as any, handleCustomTrigger);
    return () => {
      window.removeEventListener('exfin-trigger-alert-popup' as any, handleCustomTrigger);
    };
  }, [triggerAlertPopup]);

  return (
    <AlertPopupContext.Provider
      value={{
        activeAlert,
        alertQueue,
        triggerAlertPopup,
        acknowledgeAlert,
        dismissAlert,
        initializeBaseline,
      }}
    >
      {children}
      <AlertPopup
        notification={activeAlert}
        onAcknowledge={acknowledgeAlert}
        onDismiss={dismissAlert}
        queueCount={alertQueue.length}
      />
    </AlertPopupContext.Provider>
  );
};

export const useAlertPopup = () => {
  const context = useContext(AlertPopupContext);
  if (!context) {
    throw new Error('useAlertPopup must be used within an AlertPopupProvider');
  }
  return context;
};
