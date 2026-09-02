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
 * Returns a cleanup unsubscribe function.
 */
export function initializeSpeech(onVoicesLoaded?: () => void): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return () => {};
  }

  const checkVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0 && onVoicesLoaded) {
      onVoicesLoaded();
    }
  };

  // Immediate check
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
      options?.onStart?.();
    };

    const handleEnd = () => {
      if (!hasEnded) {
        hasEnded = true;
        options?.onEnd?.();
      }
    };

    const handleError = (err: unknown) => {
      if (!hasEnded) {
        hasEnded = true;
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
        options?.onEnd?.();
      }
    }, 6000);

    return true;
  } catch (e) {
    console.warn('[greetingSpeechService] Error during speakGreeting:', e);
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
