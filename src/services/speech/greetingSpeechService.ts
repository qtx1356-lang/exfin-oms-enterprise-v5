import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';

interface GreetingTtsPlugin {
  speak(options: { text: string }): Promise<{ success: boolean; utteranceId?: string }>;
  stop(): Promise<{ stopped: boolean }>;
  isAvailable(): Promise<{ available: boolean }>;
  isFirebaseConfigured(): Promise<{ configured: boolean }>;
  addListener(eventName: 'ttsStarted', listenerFunc: (data: { utteranceId: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'ttsCompleted', listenerFunc: (data: { utteranceId: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'ttsError', listenerFunc: (data: { utteranceId: string; error?: string; errorCode?: number }) => void): Promise<PluginListenerHandle>;
}

export const GreetingTts = registerPlugin<GreetingTtsPlugin>('GreetingTts');

/**
 * Isolated Greeting Text-to-Speech Service
 * Uses native Android TextToSpeech on native platform,
 * and native browser SpeechSynthesis on PWA/desktop.
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
let activeUtterance: SpeechSynthesisUtterance | null = null;
let hasSpokenOnce = false;

// Warm up the SpeechSynthesis engine as early as possible on module load
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    const dummy = new SpeechSynthesisUtterance('');
    dummy.volume = 0;
    window.speechSynthesis.speak(dummy);
    if (typeof window.speechSynthesis.resume === 'function') {
      window.speechSynthesis.resume();
    }
  } catch (e) {}
}

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
 * Native Android implementation using GreetingTts plugin.
 */
async function speakGreetingNative(text: string, options?: SpeakOptions): Promise<boolean> {
  console.log('[GREETING NATIVE TTS] speaking:', text);
  let isFinished = false;
  let startListener: PluginListenerHandle | null = null;
  let completeListener: PluginListenerHandle | null = null;
  let errorListener: PluginListenerHandle | null = null;

  const cleanup = async () => {
    try {
      if (startListener) await startListener.remove();
      if (completeListener) await completeListener.remove();
      if (errorListener) await errorListener.remove();
    } catch (e) {}
  };

  try {
    startListener = await GreetingTts.addListener('ttsStarted', () => {
      console.log('[GREETING NATIVE TTS] started');
      options?.onStart?.();
    });

    completeListener = await GreetingTts.addListener('ttsCompleted', async () => {
      if (!isFinished) {
        isFinished = true;
        console.log('[GREETING NATIVE TTS] completed');
        await cleanup();
        options?.onEnd?.();
      }
    });

    errorListener = await GreetingTts.addListener('ttsError', async (data) => {
      if (!isFinished) {
        isFinished = true;
        console.error('[GREETING NATIVE TTS] error:', data);
        await cleanup();
        options?.onError?.(data);
        options?.onEnd?.();
      }
    });

    const res = await GreetingTts.speak({ text });
    if (!res || !res.success) {
      if (!isFinished) {
        isFinished = true;
        await cleanup();
        options?.onError?.('Native speak call returned false');
        options?.onEnd?.();
      }
      return false;
    }

    // Safety timeout in case native completion event is dropped
    setTimeout(async () => {
      if (!isFinished) {
        isFinished = true;
        console.log('[GREETING NATIVE TTS] completed (safety timeout)');
        await cleanup();
        options?.onEnd?.();
      }
    }, 6000);

    return true;
  } catch (err) {
    console.error('[GREETING NATIVE TTS] error calling native GreetingTts:', err);
    if (!isFinished) {
      isFinished = true;
      await cleanup();
      options?.onError?.(err);
      options?.onEnd?.();
    }
    return false;
  }
}

/**
 * Speaks the given greeting text using native Android TextToSpeech on native platform,
 * or native browser SpeechSynthesis on PWA/desktop.
 */
export function speakGreeting(text: string, options?: SpeakOptions): boolean {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    void speakGreetingNative(text, options);
    return true;
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onError?.('SpeechSynthesis not available');
    return false;
  }

  try {
    // Clean up any previously active utterance handlers
    if (activeUtterance) {
      activeUtterance.onstart = null;
      activeUtterance.onend = null;
      activeUtterance.onerror = null;
      activeUtterance = null;
    }

    // Cancel any previous active queued speech only if currently speaking or pending AND we've spoken before.
    // This critical check prevents Chrome/WebView from stalling/freezing for 3 seconds on the very first greeting!
    try {
      if (hasSpokenOnce && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
        window.speechSynthesis.cancel();
      }
    } catch (e) {}

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

    let hasEnded = false;

    const handleStart = () => {
      console.log('[GREETING VOICE] started:', text);
      lastDiagnosticStatus = `Speaking: "${text}" (${voice?.name || 'Default Voice'})`;
      options?.onStart?.();
    };

    const handleEnd = () => {
      if (!hasEnded) {
        hasEnded = true;
        console.log('[GREETING VOICE] ended');
        if (activeUtterance === utterance) {
          activeUtterance = null;
        }
        lastDiagnosticStatus = 'Speech Completed';
        options?.onEnd?.();
      }
    };

    const handleError = (err: unknown) => {
      if (!hasEnded) {
        hasEnded = true;
        console.error('[GREETING VOICE] error:', err);
        if (activeUtterance === utterance) {
          activeUtterance = null;
        }
        lastDiagnosticStatus = 'Speech Error';
        options?.onError?.(err);
        options?.onEnd?.();
      }
    };

    utterance.onstart = handleStart;
    utterance.onend = handleEnd;
    utterance.onerror = handleError;

    activeUtterance = utterance;
    hasSpokenOnce = true;
    window.speechSynthesis.speak(utterance);

    // CRITICAL CHROME & ANDROID WEBVIEW FIX: Ensure synthesis queue is resumed immediately after speak()
    try {
      if (typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
      }
    } catch (e) {}

    // Fallback safety timeout if speech end event never fires
    setTimeout(() => {
      if (!hasEnded) {
        hasEnded = true;
        if (activeUtterance === utterance) {
          activeUtterance = null;
        }
        lastDiagnosticStatus = 'Speech Timeout Finished';
        options?.onEnd?.();
      }
    }, 6000);

    return true;
  } catch (e) {
    console.warn('[greetingSpeechService] Error during speakGreeting:', e);
    activeUtterance = null;
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
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    GreetingTts.stop().catch(() => {});
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (activeUtterance) {
    activeUtterance.onstart = null;
    activeUtterance.onend = null;
    activeUtterance.onerror = null;
    activeUtterance = null;
  }
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
}

/**
 * Checks if speech synthesis is supported by browser/device
 */
export function isSpeechAvailable(): boolean {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return true;
  }
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
