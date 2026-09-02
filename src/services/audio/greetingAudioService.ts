import { GreetingPeriodKey } from '../voice/greetingAssets';

export interface GreetingAudioCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: unknown) => void;
}

export interface GreetingAudioDiagnostics {
  audioSupported: boolean;
  morningFileLoaded: boolean;
  afternoonFileLoaded: boolean;
  eveningFileLoaded: boolean;
  morningDuration: number;
  afternoonDuration: number;
  eveningDuration: number;
  currentSource: string | null;
  currentReadyState: number;
  currentNetworkState: number;
  lastPlayError: string | null;
  lastPlaybackStatus: string;
  productionUrl: string;
  isStandalonePWA: boolean;
}

const GREETING_SOURCES: Record<GreetingPeriodKey, string> = {
  good_morning: '/sounds/greetings/good_morning.wav',
  good_afternoon: '/sounds/greetings/good_afternoon.wav',
  good_evening: '/sounds/greetings/good_evening.wav'
};

const preloadedAudioMap: Record<GreetingPeriodKey, HTMLAudioElement | null> = {
  good_morning: null,
  good_afternoon: null,
  good_evening: null
};

let activeAudioKey: GreetingPeriodKey | null = null;
let lastPlayErrorMsg: string | null = null;
let lastPlaybackStatusText = 'Initialized';

// Pre-instantiate and preload audio elements synchronously on module evaluation
if (typeof window !== 'undefined' && typeof Audio !== 'undefined') {
  try {
    (Object.keys(GREETING_SOURCES) as GreetingPeriodKey[]).forEach((key) => {
      const audio = new Audio(GREETING_SOURCES[key]);
      audio.preload = 'auto';
      // Mute briefly to avoid any unexpected transient click sounds during initial decode
      audio.volume = 1.0;
      preloadedAudioMap[key] = audio;
    });
    lastPlaybackStatusText = 'Audio elements preloaded';
  } catch (err) {
    console.warn('[greetingAudioService] Failed to pre-instantiate audio elements:', err);
    lastPlaybackStatusText = `Preload failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Stops any currently playing greeting audio cleanly
 */
export function stopGreetingAudio(): void {
  if (typeof window === 'undefined') return;

  (Object.keys(preloadedAudioMap) as GreetingPeriodKey[]).forEach((key) => {
    const audio = preloadedAudioMap[key];
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.onplay = null;
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
      } catch (e) {}
    }
  });

  activeAudioKey = null;
  lastPlaybackStatusText = 'Stopped';
}

/**
 * DIRECT MANUAL GREETING PLAYBACK ENGINE
 * Crucial Requirement: Executed synchronously directly inside the user-click event path.
 * NO async/await, NO setTimeout, NO SpeechSynthesis fallback delays.
 */
export function playGreetingAudioDirect(
  periodKey: GreetingPeriodKey = 'good_morning',
  callbacks?: GreetingAudioCallbacks
): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    lastPlayErrorMsg = 'HTMLAudioElement not supported';
    lastPlaybackStatusText = 'Unsupported';
    callbacks?.onError?.(lastPlayErrorMsg);
    callbacks?.onEnd?.();
    return false;
  }

  // 1. Immediately stop any active audio
  stopGreetingAudio();

  // 2. Select preloaded audio object
  let audio = preloadedAudioMap[periodKey];
  if (!audio) {
    // Lazy creation fallback if module evaluation missed it
    audio = new Audio(GREETING_SOURCES[periodKey] || GREETING_SOURCES.good_morning);
    audio.preload = 'auto';
    preloadedAudioMap[periodKey] = audio;
  }

  activeAudioKey = periodKey;
  lastPlayErrorMsg = null;

  let hasEnded = false;

  const cleanupAndNotifyEnd = () => {
    if (!hasEnded) {
      hasEnded = true;
      activeAudioKey = null;
      lastPlaybackStatusText = 'Completed';
      callbacks?.onEnd?.();
    }
  };

  const handleStart = () => {
    lastPlaybackStatusText = `Playing (${periodKey})`;
    callbacks?.onStart?.();
  };

  const handleError = (e: unknown) => {
    lastPlayErrorMsg = e instanceof Error ? e.message : 'Audio playback error';
    lastPlaybackStatusText = `Error: ${lastPlayErrorMsg}`;
    console.warn(`[greetingAudioService] Audio error playing ${periodKey}:`, e);
    callbacks?.onError?.(e);
    cleanupAndNotifyEnd();
  };

  audio.onplay = handleStart;
  audio.onplaying = handleStart;
  audio.onended = cleanupAndNotifyEnd;
  audio.onerror = handleError;

  try {
    // 3. Reset position & volume synchronously
    audio.currentTime = 0;
    audio.volume = 1.0;

    // 4. Synchronously invoke audio.play()
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        lastPlayErrorMsg = err instanceof Error ? err.message : String(err);
        lastPlaybackStatusText = `Blocked: ${lastPlayErrorMsg}`;
        console.warn(`[greetingAudioService] play() promise rejected for ${periodKey}:`, err);
        callbacks?.onError?.(err);
        cleanupAndNotifyEnd();
      });
    }

    return true;
  } catch (err) {
    handleError(err);
    return false;
  }
}

/**
 * Diagnostic inspector for greeting audio engine
 */
export function getGreetingAudioDiagnostics(): GreetingAudioDiagnostics {
  const isBrowser = typeof window !== 'undefined' && typeof Audio !== 'undefined';
  
  const morningAudio = preloadedAudioMap.good_morning;
  const afternoonAudio = preloadedAudioMap.good_afternoon;
  const eveningAudio = preloadedAudioMap.good_evening;

  const activeAudio = activeAudioKey ? preloadedAudioMap[activeAudioKey] : null;

  const isStandalonePWA = isBrowser && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );

  return {
    audioSupported: isBrowser,
    morningFileLoaded: !!morningAudio && morningAudio.readyState >= 2,
    afternoonFileLoaded: !!afternoonAudio && afternoonAudio.readyState >= 2,
    eveningFileLoaded: !!eveningAudio && eveningAudio.readyState >= 2,
    morningDuration: morningAudio?.duration || 0,
    afternoonDuration: afternoonAudio?.duration || 0,
    eveningDuration: eveningAudio?.duration || 0,
    currentSource: activeAudio?.src || null,
    currentReadyState: activeAudio?.readyState || 0,
    currentNetworkState: activeAudio?.networkState || 0,
    lastPlayError: lastPlayErrorMsg,
    lastPlaybackStatus: lastPlaybackStatusText,
    productionUrl: isBrowser ? window.location.origin : '',
    isStandalonePWA
  };
}
