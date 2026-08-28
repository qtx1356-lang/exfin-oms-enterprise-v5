import { API_BASE_URL } from '@/src/utils/apiConfig';
import { getNotificationSettings } from './notificationSettings';
import { NotificationPriority, NotificationRecord } from '../../types/notification';
import { NOTIFICATION_SOUND_DATA_URI } from './alertSoundAsset';
import { PRE_RECORDED_GREETINGS, GreetingPeriodKey } from '../voice/greetingAssets';

let alertAudioInstance: HTMLAudioElement | null = null;
let greetingAudioInstance: HTMLAudioElement | null = null;
let sharedAudioContext: AudioContext | null = null;
let audioUnlocked = false;

const PLAYED_SOUND_IDS_KEY = 'exfin_played_notification_sound_ids';
const playedNotificationSoundIds = new Set<string>();
let isBaselineInitialized = false;

// Pending notifications batch queue
const pendingNotificationBatch: NotificationRecord[] = [];
let batchTimer: any = null;

/**
 * FLOW 1 — WELCOME GREETING
 * Play high-quality natural female voice greeting on the Welcome Screen.
 * Priority 1: Dynamic custom employee name synthesis via server endpoint `/api/tts/welcome` if online
 * Priority 2: High-fidelity pre-recorded studio female voice asset (0ms latency, 100% offline reliable)
 * Constraint: NEVER fall back to device-native TTS / SpeechSynthesis
 */
export const speakWelcomeGreeting = async (
  text: string, 
  periodKey?: GreetingPeriodKey
): Promise<boolean> => {
  return new Promise(async (resolve) => {
    try {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }

      console.log(`[GreetingVoice] Playing high-quality female voice greeting. Text: "${text}", Period: ${periodKey || 'auto'}`);

      // Check if we have a matching pre-recorded high quality female voice asset
      let targetPeriod: GreetingPeriodKey = periodKey || 'good_morning';
      if (!periodKey) {
        const lower = text.toLowerCase();
        if (lower.includes('morning')) targetPeriod = 'good_morning';
        else if (lower.includes('afternoon')) targetPeriod = 'good_afternoon';
        else if (lower.includes('evening')) targetPeriod = 'good_evening';
      }

      const preRecordedBase64 = PRE_RECORDED_GREETINGS[targetPeriod] || PRE_RECORDED_GREETINGS['good_morning'];

      // Try dynamic custom employee name synthesis via server endpoint if online
      let audioToPlay: string | null = null;
      if (text && navigator.onLine) {
        try {
          const res = await fetch(API_BASE_URL + '/api/tts/welcome', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.audioBase64) {
              audioToPlay = data.audioBase64.startsWith('data:') ? data.audioBase64 : `data:audio/wav;base64,${data.audioBase64}`;
              console.log('[GreetingVoice] Loaded personalized studio female voice audio from backend');
            }
          }
        } catch (serverErr) {
          console.warn('[GreetingVoice] Server TTS fetch bypassed, using embedded master asset:', serverErr);
        }
      }

      // Fallback to high-quality pre-recorded female asset for Welcome Screen only
      if (!audioToPlay) {
        audioToPlay = preRecordedBase64;
        console.log(`[GreetingVoice] Using pre-recorded female audio asset for ${targetPeriod}`);
      }

      if (!audioToPlay) {
        console.warn('[GreetingVoice] No audio asset available for greeting');
        resolve(false);
        return;
      }

      // Play via controlled HTMLAudioElement with system audio unlock & volume normalization
      if (!greetingAudioInstance) {
        greetingAudioInstance = new Audio();
        greetingAudioInstance.preload = 'auto';
      }

      greetingAudioInstance.src = audioToPlay;
      greetingAudioInstance.volume = 0.85; // Natural, clear studio volume
      greetingAudioInstance.currentTime = 0;

      greetingAudioInstance.onended = () => {
        console.log('[GreetingVoice] Female voice greeting completed successfully');
        resolve(true);
      };

      greetingAudioInstance.onerror = (err) => {
        console.warn('[GreetingVoice] HTMLAudioElement error on playback:', err);
        resolve(false);
      };

      const playPromise = greetingAudioInstance.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[GreetingVoice] Female voice playback started smoothly');
          })
          .catch((playErr) => {
            console.warn('[GreetingVoice] Autoplay blocked or deferred, waiting for user gesture:', playErr);
            resolve(false);
          });
      }
    } catch (err) {
      console.warn('[GreetingVoice] Greeting audio execution exception handled safely:', err);
      resolve(false);
    }
  });
};

// Aliased export for backward compatibility
export const playFemaleVoiceAnnouncement = speakWelcomeGreeting;

/**
 * FLOW 2 — REAL NOTIFICATION / ALERT
 * Speaks actual application notification text cleanly and professionally.
 * MUST NEVER fallback to any Welcome Greeting pre-recorded assets or greeting text phrases.
 * Priority 1: High-quality server-side dynamic TTS API `/api/tts/notification` (Aoede voice) if online
 * Priority 2: Device-native SpeechSynthesis if offline/unconfigured (safe client-side fallback)
 * Constraint: If there is no valid text, do not play/speak anything.
 */
export const speakRealNotification = async (text: string): Promise<boolean> => {
  return new Promise(async (resolve) => {
    try {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }

      const cleanText = text ? text.trim() : '';
      if (!cleanText) {
        console.log('[NotificationVoice] Suppressed: Notification text is empty');
        resolve(false);
        return;
      }

      // STRICT RULE: Guard against accidental greeting readings
      const lower = cleanText.toLowerCase();
      if (
        lower.includes('good morning') ||
        lower.includes('good afternoon') ||
        lower.includes('good evening')
      ) {
        console.warn('[NotificationVoice] Suppressed greeting-like sentence in real notifications flow:', cleanText);
        resolve(false);
        return;
      }

      console.log(`[NotificationVoice] Speaking notification: "${cleanText}"`);

      let audioToPlay: string | null = null;
      if (navigator.onLine) {
        try {
          const res = await fetch(API_BASE_URL + '/api/tts/notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: cleanText })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.audioBase64) {
              audioToPlay = data.audioBase64.startsWith('data:') ? data.audioBase64 : `data:audio/wav;base64,${data.audioBase64}`;
              console.log('[NotificationVoice] Loaded dynamic notification TTS audio from backend');
            }
          }
        } catch (serverErr) {
          console.warn('[NotificationVoice] Server notification TTS failed, attempting native browser fallback:', serverErr);
        }
      }

      // Native browser speech synthesis fallback (Strictly NO greeting fallback)
      if (!audioToPlay) {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          try {
            console.log('[NotificationVoice] Using native browser SpeechSynthesis for notification message');
            // Cancel any current utterances to prevent overlapping sounds
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.volume = 0.85;
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            
            // Attempt to select a high-quality standard English voice if available
            const voices = window.speechSynthesis.getVoices();
            const preferredVoice = voices.find(v => 
              v.lang.startsWith('en') && 
              (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || v.name.includes('Samantha'))
            );
            if (preferredVoice) {
              utterance.voice = preferredVoice;
            }

            utterance.onend = () => {
              console.log('[NotificationVoice] Native speech synthesis completed successfully');
              resolve(true);
            };
            utterance.onerror = (evt) => {
              console.warn('[NotificationVoice] Native speech synthesis error:', evt);
              resolve(false);
            };

            window.speechSynthesis.speak(utterance);
            return;
          } catch (nativeErr) {
            console.warn('[NotificationVoice] Native speech synthesis failed:', nativeErr);
          }
        }
        
        console.warn('[NotificationVoice] No voice channel available (offline and native TTS unavailable)');
        resolve(false);
        return;
      }

      // Play generated high-quality audio
      const audioInstance = new Audio(audioToPlay);
      audioInstance.volume = 0.85;
      audioInstance.currentTime = 0;
      audioInstance.onended = () => {
        console.log('[NotificationVoice] Playback of notification audio finished');
        resolve(true);
      };
      audioInstance.onerror = (err) => {
        console.warn('[NotificationVoice] HTMLAudioElement error on notification playback:', err);
        resolve(false);
      };

      const playPromise = audioInstance.play();
      if (playPromise !== undefined) {
        playPromise.catch((playErr) => {
          console.warn('[NotificationVoice] Playback blocked or failed:', playErr);
          resolve(false);
        });
      }
    } catch (err) {
      console.warn('[NotificationVoice] Execution exception:', err);
      resolve(false);
    }
  });
};

/**
 * Trigger short, professional haptic vibration pattern (short -> brief pause -> short)
 * This must never be triggered for standard UI interactions (only new notification alerts).
 */
export const triggerConsolidatedVibration = (): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.vibrationEnabled) {
      console.log('[NotificationSound] Vibration is disabled in settings');
      return;
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      console.log('[NotificationSound] Triggering haptic vibration pattern: [100ms, 100ms, 100ms]');
      navigator.vibrate([100, 100, 100]);
    }
  } catch (err) {
    console.warn('[NotificationSound] Haptic vibration failed gracefully:', err);
  }
};

/**
 * Process accumulated batch of new notifications to play a consolidated alert
 */
const processNotificationBatch = (): void => {
  if (pendingNotificationBatch.length === 0) return;

  const count = pendingNotificationBatch.length;
  console.log(`[NotificationSound] Processing batch of ${count} new notification(s)`);

  // Make a copy of batch notifications for safe content extraction
  const batchCopy = [...pendingNotificationBatch];

  // Clear batch queue
  pendingNotificationBatch.length = 0;
  batchTimer = null;

  // Ensure we only play voice alerts/haptics when the app is in the foreground
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    console.log('[NotificationSound] Consolidated alert suppressed: App is in background');
    return;
  }

  // 1. Play consolidated haptic pattern
  triggerConsolidatedVibration();

  // 2. Play consolidated female voice alert with the actual notification text
  if (count === 1) {
    const singleNotif = batchCopy[0];
    const speechText = (singleNotif.message || singleNotif.title || '').trim();
    if (speechText) {
      speakRealNotification(speechText);
    } else {
      console.log('[NotificationSound] Suppressing voice alert: Notification has no text content');
    }
  } else {
    speakRealNotification(`You have ${count} new notifications.`);
  }
};

/**
 * Queue a new notification record for consolidated batch processing
 */
const addToNotificationBatch = (notif: NotificationRecord): void => {
  if (pendingNotificationBatch.some((n) => n.id === notif.id)) {
    return;
  }
  pendingNotificationBatch.push(notif);

  if (batchTimer) {
    clearTimeout(batchTimer);
  }

  batchTimer = setTimeout(() => {
    processNotificationBatch();
  }, 250); // 250ms settle window to bundle near-simultaneous notifications
};

// Load persisted sound alert IDs from storage
const loadPersistedSoundIds = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(PLAYED_SOUND_IDS_KEY);
    if (raw) {
      const arr: string[] = JSON.parse(raw);
      arr.slice(-500).forEach((id) => playedNotificationSoundIds.add(id));
    }
  } catch (err) {
    // Graceful error handling
  }
};

loadPersistedSoundIds();

const persistSoundIds = () => {
  try {
    if (typeof localStorage === 'undefined') return;
    const arr = Array.from(playedNotificationSoundIds).slice(-500);
    localStorage.setItem(PLAYED_SOUND_IDS_KEY, JSON.stringify(arr));
  } catch (err) {}
};

/**
 * Get or create the reusable HTMLAudioElement using embedded data URI to guarantee 100% offline & deployment reliability
 */
const getOrCreateAudioElement = (): HTMLAudioElement | null => {
  if (typeof window === 'undefined') return null;
  if (!alertAudioInstance) {
    try {
      // Primary: embedded clean WAV data URI (never fails to resolve, 0ms network latency, immune to 404s)
      alertAudioInstance = new Audio(NOTIFICATION_SOUND_DATA_URI);
      alertAudioInstance.preload = 'auto';
      alertAudioInstance.volume = 0.75;
    } catch (e) {
      try {
        alertAudioInstance = new Audio('/sounds/alert.wav');
        alertAudioInstance.preload = 'auto';
        alertAudioInstance.volume = 0.75;
      } catch (e2) {
        // Fallback handled in playAlertSound
      }
    }
  }
  return alertAudioInstance;
};

/**
 * Unlock and pre-warm audio context/element on first legitimate user interaction
 */
export const setupAudioAutoplayUnlock = (): void => {
  if (typeof window === 'undefined' || audioUnlocked) return;

  const unlock = async () => {
    if (audioUnlocked) return;
    audioUnlocked = true;

    try {
      console.log('[NotificationSound] USER_GESTURE_AUDIO_INIT');
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      
      console.log('[NotificationSound] DIAGNOSTIC_SYSTEM_STATE:');
      console.log('navigator.userAgent:', navigator.userAgent);
      console.log('AudioContext available:', !!AudioContextClass);
      console.log('HTMLAudioElement available:', typeof Audio !== 'undefined');
      console.log('document.visibilityState:', document.visibilityState);
      
      if (AudioContextClass) {
        if (!sharedAudioContext) {
          sharedAudioContext = new AudioContextClass();
        }
        if (sharedAudioContext.state === 'suspended') {
          await sharedAudioContext.resume().catch(() => {});
        }
        console.log(`[NotificationSound] AUDIO_CONTEXT_STATE ${sharedAudioContext.state}`);
      }

      // Pre-warm/unlock SpeechSynthesis engine on WebView / Mobile / PWA
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          const warmUpUtterance = new SpeechSynthesisUtterance('');
          warmUpUtterance.volume = 0;
          window.speechSynthesis.speak(warmUpUtterance);
          console.log('[NotificationSound] SpeechSynthesis pre-warmed on user gesture');
        } catch (ttsErr) {
          console.warn('[NotificationSound] SpeechSynthesis pre-warm error ignored:', ttsErr);
        }
      }
    } catch (e) {
      console.warn('[NotificationSound] Audio unlock warning:', e);
    }

    const events = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
    events.forEach((evt) => {
      window.removeEventListener(evt, unlock);
      document.removeEventListener(evt, unlock);
    });
  };

  const events = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'];
  events.forEach((evt) => {
    window.addEventListener(evt, unlock, { once: true, passive: true });
    document.addEventListener(evt, unlock, { once: true, passive: true });
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
  let count = 0;
  notifications.forEach((item) => {
    const id = typeof item === 'string' ? item : item.id;
    if (id) {
      playedNotificationSoundIds.add(id);
      count++;
    }
  });
  persistSoundIds();
  isBaselineInitialized = true;
  console.log(`[NotificationSound] BASELINE_INITIALIZED ${count} existing notification(s) baselined`);
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
    console.log(`[NotificationSound] DUPLICATE_SUPPRESSED ${notif.id}`);
    return false;
  }

  // 3. If baseline has not been initialized yet, treat as baseline
  if (!isBaselineInitialized) {
    markNotificationSoundPlayed(notif.id);
    console.log(`[NotificationSound] BASELINE_INITIALIZED (auto on initial record ${notif.id})`);
    return false;
  }

  console.log(`[NotificationSound] NEW_NOTIFICATION_DETECTED ${notif.id}`);

  // 4. Mark as played BEFORE playing to prevent race conditions across parallel snapshot updates
  markNotificationSoundPlayed(notif.id);

  console.log(`[NotificationSound] PLAY_ATTEMPT ${notif.id} (Queueing to batch)`);

  // 5. Add to the consolidated notification batch queue
  addToNotificationBatch(notif);

  return true;
};

/**
 * Play local alert sound for new incoming notification
 */
export const playAlertSound = (
  priority: NotificationPriority = 'NORMAL',
  notifId: string = 'direct',
  title?: string,
  message?: string
): void => {
  try {
    const settings = getNotificationSettings();
    if (!settings.soundEnabled) {
      console.log(`[NotificationSound] Sound disabled in settings for ${notifId}`);
      return;
    }

    // LOW priority is strictly silent
    if (priority === 'LOW') {
      console.log(`[NotificationSound] LOW priority notification ${notifId} is silent`);
      return;
    }

    if (typeof window === 'undefined') return;

    // Capacitor Native Android Route (Bypasses Web Audio stream limitations)
    if ((window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
      import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
        console.log(`[NotificationSound] NATIVE_SOUND_REQUEST ${notifId}`);
        const channelId = 'exfin_oms_employee_alerts';
        
        LocalNotifications.createChannel({
          id: channelId,
          name: 'Employee Notifications',
          description: 'Employee Alerts and Updates',
          importance: 5, // IMPORTANCE_HIGH for audible sound and heads-up
          visibility: 1,
          sound: 'alert.wav',
          vibration: true,
        }).then(() => {
          // Schedule a Local Notification instantly to trigger the native sound
          return LocalNotifications.schedule({
            notifications: [
              {
                id: Math.floor(Math.random() * 2147483647), // Must be a 32-bit int
                title: title || 'EXFIN OMS Alert', 
                body: message || 'You have a new update.',
                schedule: { at: new Date(Date.now() + 100) }, // Immediate
                channelId: channelId,
                sound: 'alert.wav',
                smallIcon: 'ic_stat_onesignal_default',
                iconColor: '#D4AF37',
                extra: { notifId }
              }
            ]
          });
        }).then(() => {
          console.log(`[NotificationSound] NATIVE_SOUND_SUCCESS ${notifId}`);
        }).catch((err) => {
          console.warn(`[NotificationSound] NATIVE_SOUND_FAILED ${notifId}`, err);
        });
      }).catch(err => {
        console.warn(`[NotificationSound] Failed to import LocalNotifications`, err);
      });
      return;
    }

    // 1. Browser/PWA Fallback: Try playing bundled local audio element
    const audio = getOrCreateAudioElement();
    if (audio) {
      audio.currentTime = 0;
      audio.volume = priority === 'URGENT' ? 0.9 : priority === 'HIGH' ? 0.8 : 0.75;
      
      console.log(`[NotificationSound] AUDIO_ELEMENT_PLAY_REQUEST ${notifId}`);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log(`[NotificationSound] AUDIO_ELEMENT_PLAY_SUCCESS ${notifId}`);
            console.log(`[NotificationSound] PLAY_SUCCESS ${notifId} (AudioElement)`);
          })
          .catch((err) => {
            console.warn(`[NotificationSound] AUDIO_ELEMENT_PLAY_FAILED ${notifId} AudioElement error:`, err);
            // Autoplay policy prevented playback or audio format issue, fall back to Web Audio API
            playSynthesizedChime(priority, notifId);
          });
        return;
      }
    }

    // If audio element is null, fall back to Web Audio API
    playSynthesizedChime(priority, notifId);
  } catch (err) {
    console.warn(`[NotificationSound] PLAY_FAILED ${notifId} Unexpected exception:`, err);
    playSynthesizedChime(priority, notifId);
  }
};

/**
 * Web Audio API synthesized chime fallback
 */
function playSynthesizedChime(priority: NotificationPriority, notifId: string = 'fallback') {
  try {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) {
      console.warn(`[NotificationSound] AUDIO_BLOCKED (Web Audio API not supported in this browser)`);
      return;
    }

    if (!sharedAudioContext) {
      sharedAudioContext = new AudioContextClass();
    }
    const ctx = sharedAudioContext;
    console.log(`[NotificationSound] AUDIO_CONTEXT_STATE ${ctx.state}`);

    const runSynth = () => {
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

      console.log(`[NotificationSound] PLAY_SUCCESS ${notifId} (Web Audio Synthesized)`);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log(`[NotificationSound] AUDIO_CONTEXT_STATE ${ctx.state}`);
        if (ctx.state === 'suspended') {
          console.warn(`[NotificationSound] AUDIO_CONTEXT_RESUME_FAILED`);
          console.warn(`[NotificationSound] AUDIO_BLOCKED (AudioContext is suspended, awaiting user interaction)`);
          return;
        }
        runSynth();
      }).catch((err) => {
        console.warn(`[NotificationSound] AUDIO_CONTEXT_RESUME_FAILED`);
        console.warn(`[NotificationSound] AUDIO_BLOCKED (AudioContext suspended and resume rejected):`, err);
      });
    } else {
      runSynth();
    }
  } catch (synthErr) {
    console.warn(`[NotificationSound] PLAY_FAILED ${notifId} Synthesizer error:`, synthErr);
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
