/**
 * EXFIN OMS ENTERPRISE V5 — SECURITY COMPATIBILITY BRIDGE
 * Forwards legacy security session checks to securityPinService.
 */

import {
  isPinSessionValid,
  clearPinSession,
  setPinSessionValid,
} from './securityPinService';

export function isVerificationSessionValid(): boolean {
  return isPinSessionValid('default_employee');
}

export function getVerificationSessionInfo() {
  const active = isVerificationSessionValid();
  return {
    isActive: active,
    expiresAtMs: active ? Date.now() + 300000 : 0,
    lastVerifiedAtMs: active ? Date.now() : 0,
    remainingSeconds: active ? 300 : 0,
  };
}

export function clearVerificationSession(): void {
  clearPinSession();
}

export function establishVerificationSession(): void {
  setPinSessionValid('default_employee');
}

export async function performFirebaseReauthentication(): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}
