import { GreetingPeriodKey } from '../voice/greetingAssets';

export const GREETING_AUDIO_PATHS: Record<GreetingPeriodKey, string> = {
  good_morning: '/sounds/greetings/good_morning.wav',
  good_afternoon: '/sounds/greetings/good_afternoon.wav',
  good_evening: '/sounds/greetings/good_evening.wav'
};

let currentPlayingAudio: HTMLAudioElement | null = null;
const audioCache: Partial<Record<GreetingPeriodKey, HTMLAudioElement>> = {};

export interface PlayGreetingOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Preloads the local bundled greeting audio files into memory
 * so that playback on explicit user tap is instantaneous and audible.
 */
export function preloadGreetingAudio(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;

  try {
    const keys: GreetingPeriodKey[] = ['good_morning', 'good_afternoon', 'good_evening'];
    for (const key of keys) {
      if (!audioCache[key]) {
        const audio = new Audio(GREETING_AUDIO_PATHS[key]);
        audio.preload = 'auto';
        audioCache[key] = audio;
      }
    }
  } catch (e) {
    console.warn('[greetingAudioService] Audio preload warning:', e);
  }
}

/**
 * Stops any currently active greeting audio playback and resets position.
 */
export function stopGreetingAudio(): void {
  if (currentPlayingAudio) {
    try {
      currentPlayingAudio.pause();
      currentPlayingAudio.currentTime = 0;
    } catch (e) {
      // Ignore pause errors
    }
    currentPlayingAudio = null;
  }
}

/**
 * Synchronously starts playback of the selected local bundled greeting audio.
 * Must be invoked directly from the user click/tap gesture call stack.
 */
export function playGreetingAudio(
  periodKey: GreetingPeriodKey,
  options?: PlayGreetingOptions
): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    options?.onError?.(new Error('Audio API not available'));
    return false;
  }

  // 1. Stop any currently playing greeting
  stopGreetingAudio();

  try {
    const assetUrl = GREETING_AUDIO_PATHS[periodKey] || GREETING_AUDIO_PATHS.good_morning;
    let audio = audioCache[periodKey];

    if (!audio) {
      audio = new Audio(assetUrl);
      audio.preload = 'auto';
      audioCache[periodKey] = audio;
    }

    // 2. Reset currentTime to 0
    audio.currentTime = 0;
    currentPlayingAudio = audio;

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      if (currentPlayingAudio === audio) {
        currentPlayingAudio = null;
      }
    };

    const handleEnded = () => {
      cleanup();
      options?.onEnd?.();
    };

    const handleError = (e: Event) => {
      cleanup();
      console.warn('[greetingAudioService] Audio element playback error:', e);
      options?.onError?.(e);
      options?.onEnd?.();
    };

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // 3. Directly call audio.play() synchronously from user tap event
    const playResult = audio.play();
    if (playResult !== undefined && typeof playResult.then === 'function') {
      playResult
        .then(() => {
          options?.onStart?.();
        })
        .catch((err) => {
          console.warn('[greetingAudioService] Audio play() promise rejected:', err);
          cleanup();
          options?.onError?.(err);
          options?.onEnd?.();
        });
    } else {
      options?.onStart?.();
    }

    return true;
  } catch (err) {
    console.warn('[greetingAudioService] Exception initiating audio playback:', err);
    currentPlayingAudio = null;
    options?.onError?.(err);
    options?.onEnd?.();
    return false;
  }
}
