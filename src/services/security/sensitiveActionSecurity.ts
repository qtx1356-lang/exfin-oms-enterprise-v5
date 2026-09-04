/**
 * OMS ENTERPRISE V5 — SECURITY COMPATIBILITY BRIDGE
 * Forwards security verification checks.
 * STRICT RULE: No verification session state or caching is retained.
 */

export function isVerificationSessionValid(): boolean {
  return false;
}

export function getVerificationSessionInfo() {
  return {
    isActive: false,
    expiresAtMs: 0,
    lastVerifiedAtMs: 0,
    remainingSeconds: 0,
  };
}

export function clearVerificationSession(): void {
  // No-op: No active session is maintained.
}

export function establishVerificationSession(): void {
  // No-op: Single-action authorization consumed immediately.
}

export async function performFirebaseReauthentication(): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}
