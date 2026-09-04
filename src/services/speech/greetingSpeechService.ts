/**
 * Isolated Greeting Text-to-Speech Service using Native Browser SpeechSynthesis API
 * Optimized for mobile PWA, Android Chrome, and Desktop offline environments.
 */

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
 * Order of preference:
 * 1. English India (en-IN)
 * 2. English United States (en-US)
 * 3. Any English voice (en-*)
 * 4. Browser default (voices[0])
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

    const enIn = voices.find(v => v.lang && /^en[-_]in/i.test(v.lang));
    if (enIn) return enIn;

    const enUs = voices.find(v => v.lang && /^en[-_]us/i.test(v.lang));
    if (enUs) return enUs;

    const anyEn = voices.find(v => v.lang && /^en/i.test(v.lang));
    if (anyEn) return anyEn;

    return voices[0] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Waits briefly (bounded) for SpeechSynthesis voices to become populated (especially on mobile Chrome/PWA cold start)
 */
export async function waitForSpeechVoices(timeoutMs: number = 800): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null;
  }

  const existingVoice = getAvailableSpeechVoice();
  if (existingVoice) return existingVoice;

  return new Promise((resolve) => {
    let resolved = false;
    let timer: NodeJS.Timeout | null = null;

    const done = (voice: SpeechSynthesisVoice | null) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        try {
          if (typeof window.speechSynthesis.removeEventListener === 'function') {
            window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
          } else if ('onvoiceschanged' in window.speechSynthesis) {
            window.speechSynthesis.onvoiceschanged = null;
          }
        } catch (e) {}
        resolve(voice);
      }
    };

    const onVoices = () => {
      const v = getAvailableSpeechVoice();
      if (v) {
        done(v);
      }
    };

    try {
      if (typeof window.speechSynthesis.addEventListener === 'function') {
        window.speechSynthesis.addEventListener('voiceschanged', onVoices);
      } else if ('onvoiceschanged' in window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = onVoices;
      }
    } catch (e) {}

    timer = setTimeout(() => {
      done(getAvailableSpeechVoice());
    }, timeoutMs);
  });
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
  } catch (e) {}

  return () => {};
}

/**
 * Speaks the given greeting text using native SpeechSynthesis.
 */
export function speakGreeting(text: string, options?: SpeakOptions): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onError?.('SpeechSynthesis not available');
    return false;
  }

  try {
    // Cancel any previous queued speech
    window.speechSynthesis.cancel();

    // Safe resume for Android Chrome
    try {
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
      }
    } catch (e) {
      // Ignore if resume is not supported
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 1.0;
    utterance.rate = 0.95;
    utterance.pitch = 1.0;

    const voice = getAvailableSpeechVoice();
    if (voice) {
      utterance.voice = voice;
    }

    let hasEnded = false;

    const handleStart = () => {
      lastDiagnosticStatus = `Speaking: "${text}" (${voice?.name || 'Default Voice'})`;
      options?.onStart?.();
    };

    const handleEnd = () => {
      if (!hasEnded) {
        hasEnded = true;
        lastDiagnosticStatus = 'Speech Completed';
        options?.onEnd?.();
      }
    };

    const handleError = (err: unknown) => {
      if (!hasEnded) {
        hasEnded = true;
        lastDiagnosticStatus = 'Speech Error';
        options?.onError?.(err);
        options?.onEnd?.();
      }
    };

    utterance.onstart = handleStart;
    utterance.onend = handleEnd;
    utterance.onerror = handleError;

    window.speechSynthesis.speak(utterance);

    // Fallback safety timeout if speech end event never fires
    setTimeout(() => {
      if (!hasEnded) {
        hasEnded = true;
        lastDiagnosticStatus = 'Speech Timeout Finished';
        options?.onEnd?.();
      }
    }, 6000);

    return true;
  } catch (e) {
    console.warn('[greetingSpeechService] Error during speakGreeting:', e);
    lastDiagnosticStatus = 'Exception during speakGreeting';
    options?.onError?.(e);
    options?.onEnd?.();
    return false;
  }
}

/**
 * Cancels active speech synthesis
 */
export function stopGreeting(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
}

/**
 * Checks if speech synthesis is supported by browser/device
 */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
