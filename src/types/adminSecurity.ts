import { AppRole } from './roles';

export interface AdminSecurityUser {
  uid: string;
  loginId: string;
  email?: string;
  displayName?: string;
  role: AppRole;
  active: boolean;
  status?: string;
  authorizedOffice?: string;
  mustChangePassword?: boolean;
  passwordChangedAt?: string | null;
  passwordResetAt?: string | null;
  passwordResetBy?: string | null;
  temporaryPasswordAssignedAt?: string | null;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  score: number; // 0 to 4
  strengthLabel: 'Weak' | 'Fair' | 'Good' | 'Strong';
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export interface ResetPasswordResponse {
  success: boolean;
  temporaryPassword: string;
  targetUid: string;
  targetLoginId?: string;
  targetEmail?: string;
  message?: string;
}
