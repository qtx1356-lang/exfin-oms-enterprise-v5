import { auth } from '../firebase/config';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { VerificationSessionInfo, VerificationResult } from '../../types/security';

let verifiedUntilMs = 0;
let lastVerifiedAtMs = 0;
let lastAppHideTimeMs = 0;

const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes validity
const BACKGROUND_SUSPENSION_EXPIRY_MS = 2 * 60 * 1000; // 2 minutes background timeout

// Background app suspension handler
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastAppHideTimeMs = Date.now();
    } else if (document.visibilityState === 'visible') {
      if (lastAppHideTimeMs > 0 && (Date.now() - lastAppHideTimeMs) > BACKGROUND_SUSPENSION_EXPIRY_MS) {
        clearVerificationSession();
      }
      lastAppHideTimeMs = 0;
    }
  });
}

export function isVerificationSessionValid(): boolean {
  return Date.now() < verifiedUntilMs;
}

export function getVerificationSessionInfo(): VerificationSessionInfo {
  const active = isVerificationSessionValid();
  const remainingMs = Math.max(0, verifiedUntilMs - Date.now());
  return {
    isActive: active,
    expiresAtMs: verifiedUntilMs,
    lastVerifiedAtMs,
    remainingSeconds: Math.floor(remainingMs / 1000),
  };
}

export function clearVerificationSession(): void {
  verifiedUntilMs = 0;
  lastVerifiedAtMs = 0;
}

export function establishVerificationSession(): void {
  lastVerifiedAtMs = Date.now();
  verifiedUntilMs = lastVerifiedAtMs + SESSION_DURATION_MS;
}

export async function performFirebaseReauthentication(password?: string): Promise<VerificationResult> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      success: false,
      error: 'Security verification requires an active connection. Please connect to the internet and try again.',
    };
  }

  try {
    const activeAuth = auth.concrete || auth;
    const currentUser = activeAuth?.currentUser || auth?.currentUser;

    if (!currentUser) {
      return {
        success: false,
        error: 'No active user session found. Please sign in to your account and try again.',
      };
    }

    if (currentUser.email && password) {
      // Re-authenticate with EmailAuthProvider credential
      const credential = EmailAuthProvider.credential(currentUser.email, password);
      await reauthenticateWithCredential(currentUser, credential);
    } else if (currentUser) {
      // For anonymous / device token sessions, force refresh token to verify Firebase session integrity
      await currentUser.getIdToken(true);
    }

    establishVerificationSession();
    return { success: true };
  } catch (err: any) {
    console.error('Firebase security re-authentication error:', err);
    let message = err?.message || 'Security verification failed.';
    if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
      message = 'Incorrect password. Please enter your valid account password.';
    } else if (err?.code === 'auth/too-many-requests') {
      message = 'Too many failed verification attempts. Please wait a moment and try again.';
    } else if (err?.code === 'auth/network-request-failed') {
      message = 'Network connectivity error. Please check your connection and try again.';
    }
    return { success: false, error: message };
  }
}
