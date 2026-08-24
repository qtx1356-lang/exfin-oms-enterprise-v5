import { getNotificationSettings } from './notificationSettings';
import { NotificationPriority, NotificationRecord } from '../../types/notification';

let alertAudioInstance: HTMLAudioElement | null = null;
let sharedAudioContext: AudioContext | null = null;
let audioUnlocked = false;

const PLAYED_SOUND_IDS_KEY = 'exfin_played_notification_sound_ids';
const playedNotificationSoundIds = new Set<string>();
let isBaselineInitialized = false;

// Load persisted sound alert IDs from storage
const loadPersistedSoundIds = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(PLAYED_SOUND_IDS_KEY);
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      arr.slice(-300).forEach((id) => playedNotificationSoundIds.add(id));
    }
  } catch (err) {
    // Graceful error handling
  }
};

loadPersistedSoundIds();

const persistSoundIds = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const arr = Array.from(playedNotificationSoundIds).slice(-300);
    localStorage.setItem(PLAYED_SOUND_IDS_KEY, JSON.stringify(arr));
  } catch (err) {}
};

/**
 * Unlock and pre-warm audio context/element on first legitimate user interaction
 */
export const setupAudioAutoplayUnlock = (): void => {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    try {
      if (!alertAudioInstance) {
        alertAudioInstance = new Audio('/sounds/alert.mp3');
        alertAudioInstance.preload = 'auto';
      }

      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        if (!sharedAudioContext) {
          sharedAudioContext = new AudioContextClass();
        }
        if (sharedAudioContext.state === 'suspended') {
          sharedAudioContext.resume().catch(() => {});
        }
      }
    } catch (e) {
      // Ignore
    }

    const events = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
    events.forEach((evt) => {
      window.removeEventListener(evt, unlock);
    });
  };

  const events = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
  events.forEach((evt) => {
    window.addEventListener(evt, unlock, { once: true, passive: true });
  });
};

// Automatically attach unlock listener when running in browser
if (typeof window !== 'undefined') {
  setupAudioAutoplayUnlock();
}

/**
 * Initialize baseline so old/cached notifications on startup never trigger a sound
 */
export const initializeNotificationSoundBaseline = (
  notifications: (NotificationRecord | string)[]
): void => {
  if (!notifications) return;
  notifications.forEach((item) => {
    const id = typeof item === 'string' ? item : item.id;
    if (id) {
      playedNotificationSoundIds.add(id);
    }
  });
  persistSoundIds();
  isBaselineInitialized = true;
};

/**
 * Check if a sound alert has already been played for this notification ID
 */
export const hasNotificationSoundPlayed = (notifId: string): boolean => {
  if (!notifId) return true;
  return playedNotificationSoundIds.has(notifId);
};

/**
 * Mark a notification ID as having played its sound alert
 */
export const markNotificationSoundPlayed = (notifId: string): void => {
  if (!notifId) return;
  playedNotificationSoundIds.add(notifId);
  persistSoundIds();
};

/**
 * Trigger sound for a newly arrived notification belonging to authenticated employee
 */
export const triggerNewNotificationSound = (
  notif: NotificationRecord,
  isEmployee: boolean = true
): boolean => {
  if (!isEmployee || !notif || !notif.id) return false;

  // 1. If notification is already read, do NOT play sound
  if (notif.read || (notif as any).isRead) {
    markNotificationSoundPlayed(notif.id);
    return false;
  }

  // 2. If sound already played for this ID, do NOT play again (idempotent)
  if (hasNotificationSoundPlayed(notif.id)) {
    return false;
  }

  // 3. If baseline has not been initialized yet, treat as baseline
  if (!isBaselineInitialized) {
    markNotificationSoundPlayed(notif.id);
    return false;
  }

  // 4. Mark as played BEFORE playing to prevent race conditions
  markNotificationSoundPlayed(notif.id);

  // 5. Play sound and vibration
  playAlertSound(notif.priority || 'NORMAL');
  triggerAlertVibration(notif.priority || 'NORMAL');

  return true;
};

/**
 * Play local alert sound for new incoming notification
 */
export const playAlertSound = (
  priority: NotificationPriority = 'NORMAL'
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.soundEnabled) return;

    // LOW priority is strictly silent
    if (priority === 'LOW') return;

    // 1. Try playing bundled local audio file (public/sounds/alert.mp3 or alert.wav)
    if (typeof window !== 'undefined') {
      try {
        if (!alertAudioInstance) {
          alertAudioInstance = new Audio('/sounds/alert.mp3');
          alertAudioInstance.preload = 'auto';
        }
        
        alertAudioInstance.currentTime = 0;
        const playPromise = alertAudioInstance.play();
        if (playPromise !== undefined) {
          playPromise.catch((_err) => {
            // Autoplay policy prevented playback or format not supported in current WebView, fall back to Web Audio API
            playSynthesizedChime(priority);
          });
        }
        return;
      } catch (audioErr) {
        // Fallback to Web Audio API
        playSynthesizedChime(priority);
      }
    }
  } catch (err) {
    // Graceful silent recovery, never crash
  }
};

/**
 * Web Audio API synthesized chime fallback
 */
function playSynthesizedChime(priority: NotificationPriority) {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    const ctx = sharedAudioContext;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (priority === 'HIGH' || priority === 'URGENT') {
      // Crisp 3-tone attention chime for HIGH/URGENT (D5 -> A5 -> D6)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.12); // A5

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174.66, now + 0.12); // D6

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.45);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } else {
      // Soft pleasant dual tone for NORMAL
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.08); // A5

      gain.gain.setValueAtTime(0.01, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (synthErr) {
    // Ignore audio context errors
  }
}

/**
 * Trigger vibration pattern for alert
 */
export const triggerAlertVibration = (
  priority: NotificationPriority = 'NORMAL'
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.vibrationEnabled) return;

    // Do NOT vibrate for LOW priority
    if (priority === 'LOW') return;

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (priority === 'HIGH' || priority === 'URGENT') {
        navigator.vibrate([300, 150, 300]);
      } else {
        navigator.vibrate([200, 100, 200]);
      }
    }
  } catch (e) {
    // Ignore vibration errors on unsupported devices
  }
};
