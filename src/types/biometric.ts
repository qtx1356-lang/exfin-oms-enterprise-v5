export interface BiometricCredentialMetadata {
  rawId: string;
  type: string;
  registeredAt: string;
}

export interface BiometricDiagnosticReport {
  isPlatformAuthAvailable: boolean;
  isSecureContext: boolean;
  diagnosticMessage: string;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
}
