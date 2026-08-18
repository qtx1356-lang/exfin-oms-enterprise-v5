export interface NotificationSettings {
  pushEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  taskNotifs: boolean;
  leaveNotifs: boolean;
  teamNotifs: boolean;
  attendanceNotifs: boolean;
  chatNotifs: boolean;
}

const STORAGE_KEY = 'exfin_notification_settings';

const DEFAULT_SETTINGS: NotificationSettings = {
  pushEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  taskNotifs: true,
  leaveNotifs: true,
  teamNotifs: true,
  attendanceNotifs: true,
  chatNotifs: true,
};

export const getNotificationSettings = (): NotificationSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
};

export const updateNotificationSettings = (
  updates: Partial<NotificationSettings>
): NotificationSettings => {
  const current = getNotificationSettings();
  const updated = { ...current, ...updates };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save notification settings:', e);
  }
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('exfin_notif_settings_changed', { detail: updated }));
  }
  return updated;
};
