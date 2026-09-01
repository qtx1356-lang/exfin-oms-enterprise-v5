export interface BiometricCredentialMetadata {
  id: string; // Base64 encoded credential ID
  userId: string;
  enrolledAt: number;
}

export interface BiometricDiagnosticReport {
  isSecureContext: boolean;
  hasPublicKeyCredential: boolean;
  isPlatformAuthAvailable: boolean;
  isIframe: boolean;
  origin: string;
  diagnosticCode: string;
  diagnosticMessage: string;
}

export interface BiometricResult {
  success: boolean;
  error?: string;
}
