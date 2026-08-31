import { API_BASE_URL } from '@/src/utils/apiConfig';
import { auth, getAdminDb } from '../firebase/config';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { logAuditEvent } from '../rbac/rbacService';
import { AdminSecurityUser, PasswordValidationResult, ResetPasswordResponse } from '../../types/adminSecurity';

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(password);

  const errors: string[] = [];
  if (!hasMinLength) errors.push('Password must be at least 8 characters long.');
  if (!hasUppercase) errors.push('Password must contain at least one uppercase letter (A-Z).');
  if (!hasLowercase) errors.push('Password must contain at least one lowercase letter (a-z).');
  if (!hasNumber) errors.push('Password must contain at least one number (0-9).');
  if (!hasSpecialChar) errors.push('Password must contain at least one special character (!@#$%^&*).');

  let score = 0;
  if (hasMinLength) score++;
  if (hasUppercase && hasLowercase) score++;
  if (hasNumber) score++;
  if (hasSpecialChar) score++;

  let strengthLabel: 'Weak' | 'Fair' | 'Good' | 'Strong' = 'Weak';
  if (score === 2) strengthLabel = 'Fair';
  else if (score === 3) strengthLabel = 'Good';
  else if (score >= 4) strengthLabel = 'Strong';

  return {
    isValid: errors.length === 0,
    errors,
    score,
    strengthLabel,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
  };
}

export function generateSecureTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';

  // Guarantee at least one of each
  let pass = '';
  pass += upper.charAt(Math.floor(Math.random() * upper.length));
  pass += lower.charAt(Math.floor(Math.random() * lower.length));
  pass += digits.charAt(Math.floor(Math.random() * digits.length));
  pass += special.charAt(Math.floor(Math.random() * special.length));

  const allChars = upper + lower + digits + special;
  for (let i = 0; i < 6; i++) {
    pass += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle
  return pass
    .split('')
    .sort(() => 0.5 - Math.random())
    .join('');
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!auth?.currentUser) {
    throw new Error('No authenticated administrator found. Please sign in again.');
  }

  const user = auth.currentUser;
  const email = user.email;
  if (!email) {
    throw new Error('Authenticated user does not have an associated email address.');
  }

  // 1. Validate password strength
  const validation = validatePasswordStrength(newPassword);
  if (!validation.isValid) {
    throw new Error(validation.errors[0] || 'Password does not meet security standards.');
  }

  if (currentPassword === newPassword) {
    throw new Error('New password cannot be identical to the current password.');
  }

  // 2. Re-authenticate user with current password
  const credential = EmailAuthProvider.credential(email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
  } catch (err: any) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new Error('Current password is incorrect. Please try again.');
    }
    throw new Error(`Authentication failed: ${err.message || 'Unknown error'}`);
  }

  // 3. Update password in Firebase Auth
  try {
    await updatePassword(user, newPassword);
  } catch (err: any) {
    if (err.code === 'auth/requires-recent-login') {
      throw new Error('Session expired. Please sign out and sign in again before changing password.');
    }
    throw new Error(`Failed to update password: ${err.message || 'Unknown error'}`);
  }

  // 4. Update Firestore admin_users via server API or client doc
  const token = await user.getIdToken();
  const nowIso = new Date().toISOString();

  try {
    const res = await fetch(API_BASE_URL + '/api/admin/password-changed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        changedAt: nowIso,
      }),
    });

    if (!res.ok) {
      console.warn('Server password-changed endpoint returned status:', res.status);
    }
  } catch (err) {
    console.warn('Failed to call /api/admin/password-changed:', err);
  }

  // Also update client-side Firestore if permitted
  try {
    const activeDb = await getAdminDb();
    if (activeDb) {
      await setDoc(
        doc(activeDb, 'admin_users', user.uid),
        {
          mustChangePassword: false,
          passwordChangedAt: nowIso,
          updatedAt: nowIso,
          updatedBy: email,
        },
        { merge: true }
      );

      // Log audit event
      await logAuditEvent({
        actorEmail: email,
        actorUid: user.uid,
        action: 'ADMIN_PASSWORD_CHANGED',
        targetType: 'USER',
        targetId: user.uid,
        newValue: { mustChangePassword: false, passwordChangedAt: nowIso },
        deviceInfo: navigator.userAgent,
      });
    }
  } catch (e) {
    console.warn('Direct Firestore admin_users update skipped/failed:', e);
  }
}

export async function superAdminResetPassword(
  targetUid: string,
  temporaryPassword?: string,
  mustChangePassword = true
): Promise<ResetPasswordResponse> {
  if (!auth?.currentUser) {
    throw new Error('You must be signed in as Super-Admin to reset administrator passwords.');
  }

  const token = await auth.currentUser.getIdToken();

  const response = await fetch(API_BASE_URL + '/api/admin/super-admin/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      targetUid,
      temporaryPassword: temporaryPassword?.trim() || undefined,
      mustChangePassword,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Failed to reset administrator password.');
  }

  return data;
}

export async function fetchAdminSecurityUsers(): Promise<AdminSecurityUser[]> {
  if (!auth?.currentUser) return [];

  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(API_BASE_URL + '/api/admin/super-admin/admin-users', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.adminUsers)) {
        return data.adminUsers;
      }
    }
  } catch (err) {
    console.warn('API fetch for admin-users failed, falling back to direct Firestore:', err);
  }

  // Fallback to client Firestore if Super Admin
  const activeDb = await getAdminDb();
  if (!activeDb) return [];
  const adminSnap = await getDocs(collection(activeDb, 'admin_users'));
  const list: AdminSecurityUser[] = [];
  adminSnap.forEach((d) => {
    const data = d.data();
    list.push({
      uid: d.id,
      loginId: data.loginId || d.id,
      email: data.email || '',
      displayName: data.displayName || data.name || data.loginId || '',
      role: data.role || 'ADMIN',
      active: data.active !== false && data.status !== 'Suspended',
      status: data.status || (data.active !== false ? 'Approved' : 'Suspended'),
      authorizedOffice: data.authorizedOffice || 'ALL',
      mustChangePassword: !!data.mustChangePassword,
      passwordChangedAt: data.passwordChangedAt || null,
      passwordResetAt: data.passwordResetAt || null,
      passwordResetBy: data.passwordResetBy || null,
      temporaryPasswordAssignedAt: data.temporaryPasswordAssignedAt || null,
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy,
    });
  });

  return list;
}
