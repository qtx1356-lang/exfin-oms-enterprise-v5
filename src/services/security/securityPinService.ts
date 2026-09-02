/**
 * EXFIN OMS ENTERPRISE V5 — SECURITY PIN SERVICE
 * Provides cryptographic authorization verifier using Web Crypto API (PBKDF2 with SHA-256).
 * Scoped to individual employee IDs. No plaintext PIN storage.
 * Strictly single-action verification: NO session caching or grace period.
 */

export interface StoredPinConfig {
  enabled: boolean;
  salt: string;
  verifier: string;
  createdAt: string;
  updatedAt: string;
}

const PIN_STORAGE_PREFIX = 'exfin_security_pin_';

// ---------------------------------------------------------------------------
// IN-MEMORY BRUTE FORCE ATTEMPT STORE & COOLDOWN
// ---------------------------------------------------------------------------
interface AttemptState {
  failedCount: number;
  cooldownUntilMs: number;
}
const attemptStore: Record<string, AttemptState> = {};

// ---------------------------------------------------------------------------
// HELPER FUNCTIONS FOR WEB CRYPTO PBKDF2
// ---------------------------------------------------------------------------
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function derivePinHash(pin: string, saltBytes: Uint8Array): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return bytesToHex(new Uint8Array(derivedBits));
}

// ---------------------------------------------------------------------------
// WEAK PIN VALIDATION
// ---------------------------------------------------------------------------
export function validatePinStrength(pin: string): { isValid: boolean; error?: string } {
  const cleanPin = pin.trim();
  if (!/^\d{4,6}$/.test(cleanPin)) {
    return { isValid: false, error: 'Security PIN must be exactly 4 to 6 digits.' };
  }

  // Check repeated identical digits (e.g. 0000, 1111, 22222)
  if (/^(\d)\1+$/.test(cleanPin)) {
    return { isValid: false, error: 'Weak PIN. Avoid repeated digits (e.g., 0000 or 1111).' };
  }

  // Blacklist obvious weak sequences
  const commonWeak = [
    '1234', '12345', '123456',
    '654321', '54321', '4321',
    '0123', '01234', '012345',
    '5432', '543210', '9876', '98765', '987654',
    '2468', '1357', '7890', '0987'
  ];
  if (commonWeak.includes(cleanPin)) {
    return { isValid: false, error: 'Weak PIN. Avoid simple patterns like 1234 or 654321.' };
  }

  // Check strict ascending or descending sequences
  let isAscending = true;
  let isDescending = true;
  for (let i = 0; i < cleanPin.length - 1; i++) {
    const curr = parseInt(cleanPin[i], 10);
    const next = parseInt(cleanPin[i + 1], 10);
    if (next !== curr + 1) isAscending = false;
    if (next !== curr - 1) isDescending = false;
  }
  if (isAscending || isDescending) {
    return { isValid: false, error: 'Weak PIN. Avoid sequential numbers.' };
  }

  return { isValid: true };
}

// ---------------------------------------------------------------------------
// PUBLIC API: EMPLOYEE PIN STATE & OPERATIONS
// ---------------------------------------------------------------------------
export function getEffectiveEmployeeId(employeeData?: any, adminUser?: any): string {
  if (employeeData?.employeeCode) return String(employeeData.employeeCode).trim();
  if (employeeData?.id) return String(employeeData.id).trim();
  if (employeeData?.uid) return String(employeeData.uid).trim();
  if (adminUser?.uid) return String(adminUser.uid).trim();
  if (adminUser?.email) return String(adminUser.email).trim();

  const storedReg = localStorage.getItem('exfin_employee_registration');
  if (storedReg) {
    try {
      const parsed = JSON.parse(storedReg);
      if (parsed.employeeCode) return String(parsed.employeeCode).trim();
      if (parsed.uid) return String(parsed.uid).trim();
    } catch {
      // ignore
    }
  }

  return 'default_employee';
}

export function isPinEnabled(employeeId: string): boolean {
  if (!employeeId) return false;
  try {
    const raw = localStorage.getItem(PIN_STORAGE_PREFIX + employeeId);
    if (!raw) return false;
    const config = JSON.parse(raw) as StoredPinConfig;
    return Boolean(config && config.enabled && config.verifier && config.salt);
  } catch {
    return false;
  }
}

export async function setSecurityPin(
  employeeId: string,
  pin: string
): Promise<{ success: boolean; error?: string }> {
  if (!employeeId) return { success: false, error: 'No active employee context.' };

  const strength = validatePinStrength(pin);
  if (!strength.isValid) {
    return { success: false, error: strength.error };
  }

  try {
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const verifier = await derivePinHash(pin.trim(), saltBytes);

    const config: StoredPinConfig = {
      enabled: true,
      salt: bytesToHex(saltBytes),
      verifier,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(PIN_STORAGE_PREFIX + employeeId, JSON.stringify(config));
    return { success: true };
  } catch (err: any) {
    console.error('Failed to set Security PIN:', err);
    return { success: false, error: 'Failed to save Security PIN securely.' };
  }
}

export function getCooldownRemainingSeconds(employeeId: string): number {
  const state = attemptStore[employeeId];
  if (!state || !state.cooldownUntilMs) return 0;
  const remainingMs = state.cooldownUntilMs - Date.now();
  if (remainingMs <= 0) {
    state.failedCount = 0;
    state.cooldownUntilMs = 0;
    return 0;
  }
  return Math.ceil(remainingMs / 1000);
}

export async function verifySecurityPin(
  employeeId: string,
  inputPin: string
): Promise<{ success: boolean; error?: string; cooldownSeconds?: number }> {
  if (!employeeId) return { success: false, error: 'No active employee context.' };

  if (!isPinEnabled(employeeId)) {
    return { success: true };
  }

  const cd = getCooldownRemainingSeconds(employeeId);
  if (cd > 0) {
    return {
      success: false,
      error: `Too many incorrect attempts. Try again in ${cd} seconds.`,
      cooldownSeconds: cd,
    };
  }

  try {
    const raw = localStorage.getItem(PIN_STORAGE_PREFIX + employeeId);
    if (!raw) return { success: false, error: 'Security PIN is not configured.' };
    const config = JSON.parse(raw) as StoredPinConfig;

    const saltBytes = hexToBytes(config.salt);
    const inputHash = await derivePinHash(inputPin.trim(), saltBytes);

    if (inputHash === config.verifier) {
      // Reset attempts upon successful verification.
      // Note: No session is stored; authorization is strictly single-use per action.
      attemptStore[employeeId] = { failedCount: 0, cooldownUntilMs: 0 };
      return { success: true };
    } else {
      const state = attemptStore[employeeId] || { failedCount: 0, cooldownUntilMs: 0 };
      state.failedCount += 1;
      if (state.failedCount >= 5) {
        state.cooldownUntilMs = Date.now() + 30000; // 30 second cooldown
        attemptStore[employeeId] = state;
        return {
          success: false,
          error: 'Too many incorrect attempts. Try again in 30 seconds.',
          cooldownSeconds: 30,
        };
      }
      attemptStore[employeeId] = state;
      return { success: false, error: 'Incorrect Security PIN.' };
    }
  } catch (err: any) {
    console.error('Error verifying Security PIN:', err);
    return { success: false, error: 'Failed to verify Security PIN.' };
  }
}

export async function disableSecurityPin(
  employeeId: string,
  currentPin: string
): Promise<{ success: boolean; error?: string; cooldownSeconds?: number }> {
  const verification = await verifySecurityPin(employeeId, currentPin);
  if (!verification.success) {
    return verification;
  }

  try {
    localStorage.removeItem(PIN_STORAGE_PREFIX + employeeId);
    delete attemptStore[employeeId];
    return { success: true };
  } catch (err: any) {
    console.error('Error disabling Security PIN:', err);
    return { success: false, error: 'Failed to disable Security PIN.' };
  }
}

export async function changeSecurityPin(
  employeeId: string,
  currentPin: string,
  newPin: string
): Promise<{ success: boolean; error?: string; cooldownSeconds?: number }> {
  const verification = await verifySecurityPin(employeeId, currentPin);
  if (!verification.success) {
    return verification;
  }

  return setSecurityPin(employeeId, newPin);
}
