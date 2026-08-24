import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase/config';
import { clearNotificationStorageForUser, dispatchNotificationsUpdated } from '../services/notification/notificationStorage';
import { AppRole } from '../types/roles';
import { changeOwnPassword as executeChangeOwnPassword } from '../services/admin/adminPasswordService';

interface AdminAuthContextType {
  user: User | null;
  loading: boolean;
  role: AppRole;
  authorizedOffice: string; // 'ALL' or specific office name
  loginId: string;
  adminProfileError: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  passwordResetAt: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshAdminProfile: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>('EMPLOYEE');
  const [authorizedOffice, setAuthorizedOffice] = useState<string>('');
  const [loginId, setLoginId] = useState<string>('');
  const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [passwordResetAt, setPasswordResetAt] = useState<string | null>(null);

  const fetchAdminProfile = useCallback(async (u: User) => {
    if (!db) return;

    try {
      const adminDoc = await getDoc(doc(db, 'admin_users', u.uid));

      if (adminDoc.exists()) {
        const data = adminDoc.data();
        const isActive = data.active !== false && data.status !== 'Suspended';
        const userRole = (data.role as AppRole) || 'ADMIN';
        const requiresPwdChange = !!data.mustChangePassword;
        const pwdChangedTime = data.passwordChangedAt || null;
        const pwdResetTime = data.passwordResetAt || null;

        setMustChangePassword(requiresPwdChange);
        setPasswordChangedAt(pwdChangedTime);
        setPasswordResetAt(pwdResetTime);

        if (isActive && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'HR')) {
          setRole(userRole);
          setAuthorizedOffice(data.authorizedOffice || 'ALL');
          setLoginId(data.loginId || '');
          setAdminProfileError(null);
          try {
            localStorage.setItem(`cached_admin_profile_${u.uid}`, JSON.stringify({
              role: userRole,
              authorizedOffice: data.authorizedOffice || 'ALL',
              loginId: data.loginId || '',
              mustChangePassword: requiresPwdChange,
              passwordChangedAt: pwdChangedTime,
              passwordResetAt: pwdResetTime,
            }));
          } catch (e) {}
        } else if (!isActive) {
          setRole('EMPLOYEE');
          setAuthorizedOffice('');
          setLoginId('');
          setAdminProfileError('Your account is inactive. Please contact the administrator.');
        } else {
          setRole(userRole);
          setAuthorizedOffice('');
          setLoginId('');
          setAdminProfileError('Your account does not have Admin access privileges.');
        }
      } else {
        // Document missing
        setRole('EMPLOYEE');
        setAuthorizedOffice('');
        setLoginId('');
        setMustChangePassword(false);
        setAdminProfileError('Your account is authenticated, but your Admin profile has not been provisioned yet. Please contact the administrator.');
      }
    } catch (err: any) {
      console.error("Error fetching admin role:", err);
      if (!navigator.onLine || err?.message?.toLowerCase().includes('offline') || err?.code === 'unavailable') {
        setAdminProfileError(null);
        return;
      }
      setRole('EMPLOYEE');
      setAuthorizedOffice('');
      setAdminProfileError('Error validating Admin profile: ' + (err.message || 'Unknown error'));
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && db) {
        // Check for cached admin profile for instant / offline boot
        const cachedAdminRaw = localStorage.getItem(`cached_admin_profile_${u.uid}`);
        if (cachedAdminRaw) {
          try {
            const cachedAdmin = JSON.parse(cachedAdminRaw);
            if (cachedAdmin && cachedAdmin.role) {
              setRole(cachedAdmin.role as AppRole);
              setAuthorizedOffice(cachedAdmin.authorizedOffice || 'ALL');
              setLoginId(cachedAdmin.loginId || '');
              setMustChangePassword(!!cachedAdmin.mustChangePassword);
              setPasswordChangedAt(cachedAdmin.passwordChangedAt || null);
              setPasswordResetAt(cachedAdmin.passwordResetAt || null);
              setAdminProfileError(null);
            }
          } catch (e) {}
        }

        if (!navigator.onLine) {
          setLoading(false);
          return;
        }

        await fetchAdminProfile(u);
      } else {
        setRole('EMPLOYEE');
        setAuthorizedOffice('');
        setLoginId('');
        setMustChangePassword(false);
        setPasswordChangedAt(null);
        setPasswordResetAt(null);
        setAdminProfileError(null);
      }
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [fetchAdminProfile]);

  const refreshAdminProfile = async () => {
    if (user) {
      await fetchAdminProfile(user);
    }
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string) => {
    await executeChangeOwnPassword(currentPassword, newPassword);
    setMustChangePassword(false);
    const nowIso = new Date().toISOString();
    setPasswordChangedAt(nowIso);
    if (user) {
      try {
        const cachedRaw = localStorage.getItem(`cached_admin_profile_${user.uid}`);
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          parsed.mustChangePassword = false;
          parsed.passwordChangedAt = nowIso;
          localStorage.setItem(`cached_admin_profile_${user.uid}`, JSON.stringify(parsed));
        }
      } catch (e) {}
    }
  };

  const login = async (emailOrLoginId: string, password: string) => {
    if (!auth || !db) throw new Error('Firebase services not initialized');
    
    const inputCleaned = emailOrLoginId.trim();
    const normalizedLoginId = inputCleaned.toLowerCase().replace(/\s+/g, '');
    
    let emailToAuth = '';
    let expectedUid = '';

    // Always attempt to resolve Login ID first for security and mapping consistency
    try {
      const loginDoc = await getDoc(doc(db, 'login_ids', normalizedLoginId));
      if (loginDoc.exists()) {
        const mappingData = loginDoc.data();
        emailToAuth = mappingData?.email || '';
        expectedUid = mappingData?.uid || '';
      } else if (inputCleaned.includes('@')) {
        // Fallback for direct email login if not found as a Login ID
        emailToAuth = inputCleaned;
      } else {
        throw new Error(`Login ID "${normalizedLoginId}" not found.`);
      }
    } catch (err: any) {
      if (err.message.includes('not found')) throw err;
      throw new Error(`Login resolution failed: ${err.message || 'Unknown error'}`);
    }

    if (!emailToAuth) {
      throw new Error('Could not resolve an email address for authentication.');
    }

    // Attempt Firebase Authentication
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, emailToAuth, password);
    } catch (err: any) {
      // Provide user-friendly errors for common auth failures
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        throw new Error('Invalid Login ID or password.');
      }
      throw new Error(`Authentication failed: ${err.message}`);
    }

    // Security Verification: Check if authenticated UID matches the expected UID from mapping
    const u = userCredential.user;
    if (expectedUid && u.uid !== expectedUid) {
      await signOut(auth);
      throw new Error('Security violation: Authenticated user does not match the mapped Login ID profile.');
    }

    // Verify Active State and Admin Profile in admin_users
    try {
      const adminDoc = await getDoc(doc(db, 'admin_users', u.uid));

      if (adminDoc.exists()) {
        const data = adminDoc.data();
        const isActive = data.active !== false && data.status !== 'Suspended';
        if (!isActive) {
          await signOut(auth);
          throw new Error('Your account is inactive. Please contact the administrator.');
        }
        setMustChangePassword(!!data.mustChangePassword);
        setPasswordChangedAt(data.passwordChangedAt || null);
        setPasswordResetAt(data.passwordResetAt || null);
      } else {
        await signOut(auth);
        throw new Error('Admin profile not found. Access denied.');
      }
    } catch (err: any) {
      if (err.message.includes('inactive') || err.message.includes('not found') || err.message.includes('denied')) {
        throw err;
      }
      await signOut(auth);
      throw new Error(`Profile verification failed: ${err.message}`);
    }
  };

  const logout = async () => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    if (user?.uid) {
      clearNotificationStorageForUser(user.uid);
    }
    clearNotificationStorageForUser('ADMIN');
    dispatchNotificationsUpdated();
    await signOut(auth);
    setUser(null);
    setRole('EMPLOYEE');
    setAuthorizedOffice('');
    setLoginId('');
    setMustChangePassword(false);
    setPasswordChangedAt(null);
    setPasswordResetAt(null);
    setAdminProfileError(null);
  };

  return (
    <AdminAuthContext.Provider
      value={{
        user,
        loading,
        role,
        authorizedOffice,
        loginId,
        adminProfileError,
        mustChangePassword,
        passwordChangedAt,
        passwordResetAt,
        login,
        logout,
        changeOwnPassword,
        refreshAdminProfile,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (context === undefined) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
};

