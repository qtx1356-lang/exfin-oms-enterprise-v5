import { GreetingPeriodKey } from '../voice/greetingAssets';
import { 
  playGreetingAudioDirect, 
  stopGreetingAudio, 
  getGreetingAudioDiagnostics,
  GreetingAudioDiagnostics 
} from '../audio/greetingAudioService';

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
  audioDiagnostics: GreetingAudioDiagnostics;
}

/**
 * Diagnostic Inspector for Speech API & Audio state
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

  const audioDiag = getGreetingAudioDiagnostics();

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
    lastStatus: audioDiag.lastPlaybackStatus,
    audioDiagnostics: audioDiag
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
 * Initializes voice listeners to handle asynchronous voice loading
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
 * Cancels active speech synthesis and stops any playing fallback audio
 */
export function stopGreeting(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }
  stopGreetingAudio();
}

/**
 * Plays local pre-recorded audio greeting
 */
export function playBundledGreetingAudio(periodKey: GreetingPeriodKey = 'good_morning', options?: SpeakOptions): boolean {
  return playGreetingAudioDirect(periodKey, {
    onStart: options?.onStart,
    onEnd: options?.onEnd,
    onError: options?.onError
  });
}

/**
 * Main Greeting Playback Router:
 * Always routes directly to local bundled HTMLAudioElement for instant, reliable, offline-first playback on Android/PWA.
 */
export function speakGreeting(
  _text: string, 
  options?: SpeakOptions,
  periodKey: GreetingPeriodKey = 'good_morning'
): boolean {
  return playGreetingAudioDirect(periodKey, {
    onStart: options?.onStart,
    onEnd: options?.onEnd,
    onError: options?.onError
  });
}

/**
 * Checks if greeting audio is supported by browser/device
 */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined';
}

export { getGreetingAudioDiagnostics };


