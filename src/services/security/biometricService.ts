import { BiometricCredentialMetadata, BiometricResult, BiometricDiagnosticReport } from '../../types/biometric';

// Central configuration constants
export const BIOMETRIC_UNLOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes in-memory unlock window
export const BACKGROUND_LOCK_TIMEOUT_MS = 60 * 1000; // 60 seconds background threshold

/**
 * ArrayBuffer <-> Base64 / Base64URL conversions
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  // Convert from base64url to standard base64
  let b64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  const binary = window.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Normalizes user identifier to avoid credential collision
 */
export function normalizeUserKey(userId: string): string {
  if (!userId) return 'anonymous';
  return userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

/**
 * Performs a comprehensive, safe diagnostic evaluation of the browser, platform, and WebAuthn capabilities.
 * (Zero sensitive or biometric data is accessed or recorded.)
 */
export async function getBiometricDiagnostics(): Promise<BiometricDiagnosticReport> {
  const isSecureContext = typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const hasPublicKeyCredential = typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';
  const hasCredentialsNavigator = typeof navigator !== 'undefined' && !!navigator.credentials;
  const hasPlatformAuthMethod = hasPublicKeyCredential && typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function';
  const isIframe = typeof window !== 'undefined' ? window.self !== window.top : false;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : '';

  let isPlatformAuthAvailable = false;
  let diagnosticCode = 'READY';
  let diagnosticMessage = 'Platform biometric authenticator (Fingerprint/Face/Screen Lock) is ready and supported.';

  if (!isSecureContext && protocol !== 'http:' && hostname !== 'localhost') {
    diagnosticCode = 'INSECURE_CONTEXT';
    diagnosticMessage = 'WebAuthn requires a secure HTTPS context. Current page is not in a secure context.';
  } else if (!hasPublicKeyCredential || !hasCredentialsNavigator) {
    diagnosticCode = 'WEBAUTHN_UNSUPPORTED';
    diagnosticMessage = 'Your current browser does not support the Web Authentication (WebAuthn / Passkeys) API.';
  } else if (isIframe) {
    // In an iframe without explicit allow="publickey-credentials-get; publickey-credentials-create", WebAuthn is blocked by browser policy
    try {
      if (hasPlatformAuthMethod) {
        isPlatformAuthAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      }
    } catch {
      isPlatformAuthAvailable = false;
    }

    if (!isPlatformAuthAvailable) {
      diagnosticCode = 'IFRAME_RESTRICTED';
      diagnosticMessage = 'Application is running inside an embedded iframe. Browser security policies restrict platform authenticators inside iframes. Open EXFIN OMS directly in a new browser tab or install as PWA.';
    }
  } else {
    try {
      if (hasPlatformAuthMethod) {
        isPlatformAuthAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (!isPlatformAuthAvailable) {
          diagnosticCode = 'NO_PLATFORM_AUTHENTICATOR';
          diagnosticMessage = 'No platform authenticator available on this device. Ensure device fingerprint, face recognition, or screen lock (PIN/Pattern) is enabled in Android Settings.';
        }
      } else {
        // Fallback for older WebAuthn implementations
        isPlatformAuthAvailable = true;
      }
    } catch (err) {
      console.warn('[BIOMETRIC_DIAGNOSTIC_ERROR]', err);
      isPlatformAuthAvailable = false;
      diagnosticCode = 'DIAGNOSTIC_EXCEPTION';
      diagnosticMessage = 'An error occurred while querying platform authenticator status.';
    }
  }

  return {
    isSecureContext,
    hasPublicKeyCredential,
    hasCredentialsNavigator,
    hasPlatformAuthMethod,
    isPlatformAuthAvailable,
    isIframe,
    origin,
    hostname,
    protocol,
    diagnosticCode,
    diagnosticMessage,
  };
}

/**
 * Checks if WebAuthn and Platform Authenticators (fingerprint / face / device lock) are supported.
 */
export async function isBiometricPlatformSupported(): Promise<boolean> {
  const diag = await getBiometricDiagnostics();
  return diag.isPlatformAuthAvailable;
}

/**
 * Reads the stored cryptographic credential metadata for a specific user identity.
 * (Contains ONLY public credential ID, user ID binding, and timestamp. Never raw biometric data.)
 */
export function getStoredBiometricCredential(userId: string): BiometricCredentialMetadata | null {
  if (!userId) return null;
  const userKey = normalizeUserKey(userId);
  try {
    const raw = localStorage.getItem(`exfin_biometric_cred_${userKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricCredentialMetadata;
    // Multi-user identity verification: ensure credential belongs to this exact user
    if (parsed && normalizeUserKey(parsed.userId) === userKey) {
      return parsed;
    }
    return null;
  } catch (e) {
    console.warn('[BIOMETRIC_STORAGE_READ_ERROR]', e);
    return null;
  }
}

/**
 * Enrolls a new platform biometric credential for the logged-in user.
 */
export async function enrollBiometricCredential(
  userId: string,
  userDisplayName: string
): Promise<BiometricResult> {
  if (!userId) {
    return { success: false, error: 'User identity is required for biometric registration.' };
  }

  const diag = await getBiometricDiagnostics();
  if (!diag.isPlatformAuthAvailable) {
    return {
      success: false,
      errorCode: diag.diagnosticCode,
      error: diag.diagnosticMessage,
    };
  }

  try {
    // Generate 32-byte cryptographic challenge
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userKey = normalizeUserKey(userId);
    const userIdBytes = new TextEncoder().encode(userKey);

    const hostname = window.location.hostname;
    // Omit rp.id if on IP address or localhost
    const isValidRpId = hostname && !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && hostname !== 'localhost';

    const createOptions: CredentialCreationOptions = {
      publicKey: {
        challenge,
        rp: {
          name: 'EXFIN OMS Enterprise',
          ...(isValidRpId ? { id: hostname } : {}),
        },
        user: {
          id: userIdBytes,
          name: userId,
          displayName: userDisplayName || userId,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256 (standard platform / Android / FIDO2)
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Built-in platform authenticator (fingerprint/face/device screen lock)
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    };

    const credential = (await navigator.credentials.create(createOptions)) as PublicKeyCredential | null;

    if (!credential) {
      return { success: false, error: 'Biometric credential creation was not completed.' };
    }

    const credMetadata: BiometricCredentialMetadata = {
      id: credential.id,
      rawId: bufferToBase64(credential.rawId),
      type: credential.type,
      userId: userId,
      userDisplayName: userDisplayName || userId,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      authenticatorAttachment: (credential as any).authenticatorAttachment || 'platform',
    };

    // Store credential metadata locally bound to this user key
    localStorage.setItem(`exfin_biometric_cred_${userKey}`, JSON.stringify(credMetadata));

    return { success: true };
  } catch (err: any) {
    console.warn('[BIOMETRIC_ENROLLMENT_ERROR]', err);
    return mapWebAuthnError(err, 'enrollment');
  }
}

/**
 * Authenticates the user with their registered platform biometric credential.
 */
export async function authenticateBiometricCredential(userId: string): Promise<BiometricResult> {
  if (!userId) {
    return { success: false, error: 'User identity is required for biometric authentication.' };
  }

  const storedCred = getStoredBiometricCredential(userId);
  if (!storedCred) {
    return {
      success: false,
      errorCode: 'NOT_ENROLLED',
      error: 'No biometric credential registered for this account on this device.',
    };
  }

  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const hostname = window.location.hostname;
    const isValidRpId = hostname && !/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && hostname !== 'localhost';

    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge,
        ...(isValidRpId ? { rpId: hostname } : {}),
        userVerification: 'required',
        allowCredentials: [
          {
            id: base64ToBuffer(storedCred.rawId),
            type: 'public-key',
            transports: storedCred.transports as AuthenticatorTransport[] | undefined,
          },
        ],
        timeout: 60000,
      },
    };

    const assertion = (await navigator.credentials.get(getOptions)) as PublicKeyCredential | null;

    if (!assertion) {
      return { success: false, error: 'Biometric verification was not completed.' };
    }

    // Update last used timestamp in metadata
    storedCred.lastUsedAt = new Date().toISOString();
    const userKey = normalizeUserKey(userId);
    localStorage.setItem(`exfin_biometric_cred_${userKey}`, JSON.stringify(storedCred));

    return { success: true };
  } catch (err: any) {
    console.warn('[BIOMETRIC_AUTH_ERROR]', err);
    return mapWebAuthnError(err, 'authentication');
  }
}

/**
 * Removes biometric credential for the specified user (e.g., when re-enrolling or resetting).
 */
export function removeBiometricCredential(userId: string): void {
  if (!userId) return;
  const userKey = normalizeUserKey(userId);
  localStorage.removeItem(`exfin_biometric_cred_${userKey}`);
}

/**
 * Translates browser WebAuthn exceptions into safe, human-readable messages.
 */
function mapWebAuthnError(err: any, context: 'enrollment' | 'authentication'): BiometricResult {
  const name = err?.name || '';
  const message = err?.message || '';

  if (name === 'NotAllowedError') {
    return {
      success: false,
      errorCode: 'NOT_ALLOWED',
      error: 'Biometric verification was cancelled by user or timed out. Please try again.',
    };
  }

  if (name === 'NotSupportedError') {
    return {
      success: false,
      errorCode: 'NOT_SUPPORTED',
      error: 'Platform authenticator (fingerprint/face/screen lock) is not supported by your browser or device.',
    };
  }

  if (name === 'SecurityError') {
    return {
      success: false,
      errorCode: 'SECURITY_ERROR',
      error: 'Security constraint violation. WebAuthn platform authentication requires HTTPS and a top-level browser context (not an embedded iframe).',
    };
  }

  if (name === 'InvalidStateError') {
    return {
      success: false,
      errorCode: 'INVALID_STATE',
      error: context === 'enrollment'
        ? 'A credential already exists for this device or the state is invalid.'
        : 'The registered credential is no longer valid on this device. Please re-enroll device security.',
    };
  }

  if (name === 'AbortError') {
    return {
      success: false,
      errorCode: 'ABORTED',
      error: 'Biometric operation was interrupted. Please try again.',
    };
  }

  return {
    success: false,
    errorCode: 'OPERATION_ERROR',
    error: message && !message.includes('object')
      ? message
      : 'Device biometric authentication could not be completed. Please try again.',
  };
}

