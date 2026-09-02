// Deprecated biometric service stub for backwards compatibility
export async function getBiometricDiagnostics(): Promise<{ isPlatformAuthAvailable: boolean; diagnosticMessage: string }> {
  return {
    isPlatformAuthAvailable: false,
    diagnosticMessage: 'Replaced by PWA account security re-authentication.',
  };
}

export function getStoredBiometricCredential(userId: string): null {
  return null;
}

export async function enrollBiometricCredential(userId: string, userDisplayName: string): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

export async function authenticateBiometricCredential(userId: string): Promise<{ success: boolean; error?: string }> {
  return { success: true };
}

export function removeBiometricCredential(userId: string): void {}
