export interface BiometricCredentialMetadata {
  id: string; // Base64URL credential ID
  rawId: string; // Base64URL string representation of raw ArrayBuffer
  type: string; // 'public-key'
  userId: string; // bound employee code or admin login ID
  userDisplayName: string;
  transports?: string[];
  createdAt: string; // ISO timestamp
  lastUsedAt?: string;
  authenticatorAttachment?: string;
}

export type BiometricAuthStatus = 
  | 'idle'
  | 'authenticating'
  | 'enrolling'
  | 'authenticated'
  | 'error'
  | 'unsupported';

export interface BiometricResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}
