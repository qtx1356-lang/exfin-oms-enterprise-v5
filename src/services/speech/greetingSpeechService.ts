import { PRE_RECORDED_GREETINGS, GreetingPeriodKey } from '../voice/greetingAssets';

export interface SpeakOptions {
  isUserGesture?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

export interface SpeechDiagnostics {
  speechApiAvailable: boolean;
  utteranceApiAvailable: boolean;
  voiceCount: number;
  selectedVoiceName: string | null;
  selectedVoiceLang: string | null;
  isStandalonePWA: boolean;
  userAgent: string;
  lastStatus: string;
}

let activeAudioInstance: HTMLAudioElement | null = null;
let lastDiagnosticStatus = 'Initialized';

/**
 * Diagnostic Inspector for Speech API state
 */
export function getSpeechDiagnostics(): SpeechDiagnostics {
  const isBrowser = typeof window !== 'undefined';
  const speechApiAvailable = isBrowser && 'speechSynthesis' in window;
  const utteranceApiAvailable = isBrowser && 'SpeechSynthesisUtterance' in window;
  let voiceCount = 0;
  let selectedVoiceName: string | null = null;
  let selectedVoiceLang: string | null = null;

  if (speechApiAvailable) {
    try {
      const voices = window.speechSynthesis.getVoices();
      voiceCount = voices ? voices.length : 0;
      const voice = getAvailableSpeechVoice();
      if (voice) {
        selectedVoiceName = voice.name;
        selectedVoiceLang = voice.lang;
      }
    } catch (e) {}
  }

  const isStandalonePWA = isBrowser && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );

  return {
    speechApiAvailable,
    utteranceApiAvailable,
    voiceCount,
    selectedVoiceName,
    selectedVoiceLang,
    isStandalonePWA,
    userAgent: isBrowser ? navigator.userAgent : 'Server',
    lastStatus: lastDiagnosticStatus
  };
}

/**
 * Safely resolves the best available English voice
 */
export function getAvailableSpeechVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }

  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) {
      return null;
    }

    // 1. English India
    const enIn = voices.find(v => v.lang && /^en[-_]in/i.test(v.lang));
    if (enIn) return enIn;

    // 2. English US
    const enUs = voices.find(v => v.lang && /^en[-_]us/i.test(v.lang));
    if (enUs) return enUs;

    // 3. Any English
    const anyEn = voices.find(v => v.lang && /^en/i.test(v.lang));
    if (anyEn) return anyEn;

    // 4. Default
    return voices[0] || null;
  } catch (e) {
    console.warn('[greetingSpeechService] Failed to retrieve voices:', e);
    return null;
  }
}

/**
 * Initializes voice listeners to handle asynchronous voice loading (Android/PWA)
 */
export function initializeSpeech(onVoicesLoaded?: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return () => {};
  }

  const checkVoices = () => {
    try {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0 && onVoicesLoaded) {
        onVoicesLoaded();
      }
    } catch (e) {}
  };

  checkVoices();

  const handleVoicesChanged = () => {
    checkVoices();
  };

  try {
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      return () => {
        try {
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        } catch (e) {}
      };
    } else if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
      return () => {
        try {
          window.speechSynthesis.onvoiceschanged = null;
        } catch (e) {}
      };
    }
  } catch (e) {
    console.warn('[greetingSpeechService] Error attaching voiceschanged listener:', e);
  }

  return () => {};
}

/**
 * Cancels active speech synthesis and stops any playing fallback audio
 */
export function stopGreeting(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }

  if (activeAudioInstance) {
    try {
      activeAudioInstance.pause();
      activeAudioInstance.currentTime = 0;
      activeAudioInstance = null;
    } catch (e) {}
  }
}

/**
 * Plays local pre-recorded audio greeting (fallback when SpeechSynthesis is silent or unavailable)
 */
export function playBundledGreetingAudio(periodKey: GreetingPeriodKey = 'good_morning', options?: SpeakOptions): boolean {
  if (typeof window === 'undefined') return false;

  stopGreeting();

  const primarySrc = `/sounds/greetings/${periodKey}.wav`;
  const fallbackBase64 = PRE_RECORDED_GREETINGS[periodKey] || PRE_RECORDED_GREETINGS.good_morning;

  try {
    const audio = new Audio(primarySrc);
    activeAudioInstance = audio;
    audio.volume = 1.0;

    let hasStarted = false;
    let hasEnded = false;

    audio.onplay = () => {
      hasStarted = true;
      lastDiagnosticStatus = `Playing Bundled Audio (${periodKey})`;
      options?.onStart?.();
    };

    audio.onended = () => {
      if (!hasEnded) {
        hasEnded = true;
        activeAudioInstance = null;
        options?.onEnd?.();
      }
    };

    const tryBase64Fallback = () => {
      if (hasEnded) return;
      console.log('[greetingSpeechService] Primary audio failed, attempting base64 fallback');
      try {
        const base64Audio = new Audio(fallbackBase64);
        activeAudioInstance = base64Audio;
        base64Audio.volume = 1.0;
        base64Audio.onplay = () => {
          options?.onStart?.();
        };
        base64Audio.onended = () => {
          if (!hasEnded) {
            hasEnded = true;
            activeAudioInstance = null;
            options?.onEnd?.();
          }
        };
        base64Audio.onerror = (e) => {
          if (!hasEnded) {
            hasEnded = true;
            activeAudioInstance = null;
            options?.onError?.(e);
            options?.onEnd?.();
          }
        };
        base64Audio.play().catch(err => {
          if (!hasEnded) {
            hasEnded = true;
            activeAudioInstance = null;
            options?.onError?.(err);
            options?.onEnd?.();
          }
        });
      } catch (e) {
        if (!hasEnded) {
          hasEnded = true;
          activeAudioInstance = null;
          options?.onError?.(e);
          options?.onEnd?.();
        }
      }
    };

    audio.onerror = tryBase64Fallback;

    const promise = audio.play();
    if (promise !== undefined) {
      promise.catch(err => {
        console.warn('[greetingSpeechService] Audio play blocked or failed:', err);
        tryBase64Fallback();
      });
    }

    return true;
  } catch (e) {
    console.warn('[greetingSpeechService] Failed to play bundled greeting:', e);
    options?.onError?.(e);
    options?.onEnd?.();
    return false;
  }
}

/**
 * Intelligent Speech Greeting Router:
 * 1. Attempts Native SpeechSynthesis
 * 2. If SpeechSynthesis does not fire 'onstart' within 800ms (silent/blocked on Android PWA),
 *    cancels TTS and immediately falls back to bundled audio.
 */
export function speakGreeting(
  text: string, 
  options?: SpeakOptions,
  periodKey: GreetingPeriodKey = 'good_morning'
): boolean {
  if (typeof window === 'undefined') {
    options?.onError?.('Window undefined');
    return false;
  }

  stopGreeting();

  const isTtsSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const voices = isTtsSupported ? window.speechSynthesis.getVoices() : [];

  // If TTS is completely unsupported or has 0 voices, fallback immediately
  if (!isTtsSupported || !voices || voices.length === 0) {
    lastDiagnosticStatus = 'TTS unsupported or 0 voices -> Playing Bundled Audio';
    console.log('[greetingSpeechService]', lastDiagnosticStatus);
    return playBundledGreetingAudio(periodKey, options);
  }

  try {
    // Safe resume for Android Chrome
    try {
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1.0;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voice = getAvailableSpeechVoice();
    if (voice) {
      utterance.voice = voice;
    }

    let ttsStarted = false;
    let ttsFinished = false;

    // 800ms Start Check Timer: if TTS doesn't start producing audio within 800ms, switch to bundled audio
    const startFallbackTimer = setTimeout(() => {
      if (!ttsStarted && !ttsFinished) {
        ttsFinished = true;
        lastDiagnosticStatus = 'TTS start timeout (silent on Android) -> Falling back to Bundled Audio';
        console.warn('[greetingSpeechService]', lastDiagnosticStatus);
        stopGreeting();
        playBundledGreetingAudio(periodKey, options);
      }
    }, 800);

    utterance.onstart = () => {
      clearTimeout(startFallbackTimer);
      if (!ttsFinished) {
        ttsStarted = true;
        lastDiagnosticStatus = `TTS Active (${voice?.name || 'Default'})`;
        console.log('[greetingSpeechService]', lastDiagnosticStatus);
        options?.onStart?.();
      }
    };

    utterance.onend = () => {
      clearTimeout(startFallbackTimer);
      if (!ttsFinished) {
        ttsFinished = true;
        lastDiagnosticStatus = 'TTS Completed';
        options?.onEnd?.();
      }
    };

    utterance.onerror = (err) => {
      clearTimeout(startFallbackTimer);
      if (!ttsFinished) {
        ttsFinished = true;
        lastDiagnosticStatus = 'TTS Error -> Falling back to Bundled Audio';
        console.warn('[greetingSpeechService]', lastDiagnosticStatus, err);
        stopGreeting();
        playBundledGreetingAudio(periodKey, options);
      }
    };

    window.speechSynthesis.speak(utterance);
    return true;
  } catch (e) {
    lastDiagnosticStatus = 'TTS Exception -> Falling back to Bundled Audio';
    console.warn('[greetingSpeechService]', lastDiagnosticStatus, e);
    return playBundledGreetingAudio(periodKey, options);
  }
}

/**
 * Checks if speech synthesis or local audio is available
 */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined';
}

