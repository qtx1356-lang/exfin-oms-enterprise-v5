import { BiometricCredentialMetadata, BiometricResult, BiometricDiagnosticReport } from '../../types/biometric';

/**
 * Normalizes user ID for local storage key.
 */
function normalizeUserKey(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

/**
 * base64Url encoding/decoding utilities for WebAuthn.
 */
function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlToBuffer(base64Url: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    buffer[i] = raw.charCodeAt(i);
  }
  return buffer.buffer;
}

export async function getBiometricDiagnostics(): Promise<BiometricDiagnosticReport> {
  const isSecure = window.isSecureContext === true;
  const hasPKC = typeof window.PublicKeyCredential !== 'undefined';
  const isIframe = window.self !== window.top;
  const origin = window.location.origin;

  let isPlatformAuthAvailable = false;
  let diagnosticCode = 'OK';
  let diagnosticMessage = 'Platform biometric authenticator (Fingerprint/Face/Screen Lock) is ready and supported.';

  if (!isSecure) {
    diagnosticCode = 'INSECURE_CONTEXT';
    diagnosticMessage = 'Biometric authentication requires a secure HTTPS context.';
  } else if (!hasPKC) {
    diagnosticCode = 'NO_WEBAUTHN';
    diagnosticMessage = 'WebAuthn API is not supported in this browser.';
  } else {
    try {
      isPlatformAuthAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isPlatformAuthAvailable) {
        if (isIframe) {
          diagnosticCode = 'IFRAME_RESTRICTION';
          diagnosticMessage = 'Platform authenticator may be blocked inside an iframe. Open the app in a top-level window.';
        } else {
          diagnosticCode = 'NO_PLATFORM_AUTH';
          diagnosticMessage = 'No platform authenticator available on this device. Ensure device fingerprint, face recognition, or screen lock is enabled.';
        }
      }
    } catch (err: any) {
      diagnosticCode = 'CHECK_ERROR';
      diagnosticMessage = `Error checking platform authenticator: ${err.message}`;
    }
  }

  return {
    isSecureContext: isSecure,
    hasPublicKeyCredential: hasPKC,
    isPlatformAuthAvailable,
    isIframe,
    origin,
    diagnosticCode,
    diagnosticMessage,
  };
}

export function getStoredBiometricCredential(userId: string): BiometricCredentialMetadata | null {
  if (!userId) return null;
  const userKey = normalizeUserKey(userId);
  try {
    const raw = localStorage.getItem(`exfin_biometric_cred_${userKey}`);
    if (raw) {
      return JSON.parse(raw) as BiometricCredentialMetadata;
    }
  } catch (err) {
    console.error('Error reading biometric credential', err);
  }
  return null;
}

export async function enrollBiometricCredential(userId: string, userDisplayName: string): Promise<BiometricResult> {
  if (!userId) {
    return { success: false, error: 'User identity is required for biometric registration.' };
  }

  const diag = await getBiometricDiagnostics();
  if (!diag.isPlatformAuthAvailable) {
    return { success: false, error: diag.diagnosticMessage };
  }

  const userKey = normalizeUserKey(userId);
  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const userIdBuffer = new TextEncoder().encode(userId);

  const rpName = 'EXFIN OMS Enterprise';
  const rpId = window.location.hostname; // e.g. "exfin-oms-enterprise-v5.pages.dev" or "localhost"

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: rpName,
          id: rpId,
        },
        user: {
          id: userIdBuffer,
          name: userId,
          displayName: userDisplayName || userId,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 } // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Enforce local device (fingerprint/face)
          userVerification: 'required',        // Require actual user verification
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential;

    if (!credential) {
      return { success: false, error: 'Registration was cancelled or failed.' };
    }

    const credMetadata: BiometricCredentialMetadata = {
      id: credential.id, // Base64URL string
      userId: userId,
      enrolledAt: Date.now(),
    };

    localStorage.setItem(`exfin_biometric_cred_${userKey}`, JSON.stringify(credMetadata));
    return { success: true };
  } catch (err: any) {
    console.error('Biometric registration error:', err);
    let errorMessage = 'Failed to register device biometric.';
    if (err.name === 'NotAllowedError') {
      errorMessage = 'Biometric registration was cancelled by the user or is not permitted.';
    } else if (err.name === 'SecurityError') {
      errorMessage = 'Security error during biometric registration. This action may require a secure context or top-level window.';
    }
    return { success: false, error: errorMessage };
  }
}

export async function authenticateBiometricCredential(userId: string): Promise<BiometricResult> {
  if (!userId) {
    return { success: false, error: 'User identity is required for biometric authentication.' };
  }

  const storedCred = getStoredBiometricCredential(userId);
  if (!storedCred) {
    return {
      success: false,
      error: 'No biometric credential registered for this account on this device.',
    };
  }

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);

  const rpId = window.location.hostname;

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: rpId,
        allowCredentials: [
          {
            type: 'public-key',
            id: base64UrlToBuffer(storedCred.id),
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential;

    if (!assertion) {
      return { success: false, error: 'Authentication was cancelled or failed.' };
    }

    // Refresh enrolled timestamp to keep it active
    storedCred.enrolledAt = Date.now();
    const userKey = normalizeUserKey(userId);
    localStorage.setItem(`exfin_biometric_cred_${userKey}`, JSON.stringify(storedCred));

    return { success: true };
  } catch (err: any) {
    console.error('Biometric authentication error:', err);
    let errorMessage = 'Device biometric authentication could not be completed.';
    if (err.name === 'NotAllowedError') {
      errorMessage = 'Biometric authentication was cancelled by the user.';
    }
    return { success: false, error: errorMessage };
  }
}

export function removeBiometricCredential(userId: string): void {
  if (!userId) return;
  const userKey = normalizeUserKey(userId);
  localStorage.removeItem(`exfin_biometric_cred_${userKey}`);
}
