import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, DocumentSnapshot, DocumentData } from 'firebase/firestore';
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

const getTime = () => new Date().toISOString().substring(11, 23);

/**
 * Checks if a Firestore error is transient (network / offline / unavailable).
 */
const isTransientFirestoreError = (err: any): boolean => {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'resource-exhausted' ||
    msg.includes('offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to get document')
  );
};

/**
 * Retries a Firestore getDoc read a limited number of times with exponential backoff.
 */
const getDocWithRetry = async (
  docRef: any,
  maxAttempts = 3,
  initialDelayMs = 300
): Promise<DocumentSnapshot<DocumentData>> => {
  let lastError: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return (await getDoc(docRef)) as DocumentSnapshot<DocumentData>;
    } catch (err: any) {
      lastError = err;
      if (attempt < maxAttempts && isTransientFirestoreError(err)) {
        const delay = initialDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
};

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    console.log(`[FLICKER-TRACE] AdminAuthProvider MOUNT ${getTime()}`);
    return () => console.log(`[FLICKER-TRACE] AdminAuthProvider UNMOUNT ${getTime()}`);
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>('EMPLOYEE');
  const [authorizedOffice, setAuthorizedOffice] = useState<string>('');
  const [loginId, setLoginId] = useState<string>('');
  const [adminProfileError, setAdminProfileError] = useState<string | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(null);
  const [passwordResetAt, setPasswordResetAt] = useState<string | null>(null);
  
  const isLoggingInRef = useRef(false);

  const fetchAdminProfile = useCallback(async (u: User) => {
    const activeDb = db.concrete || db;
    if (!activeDb) return;

    try {
      const adminDoc = await getDocWithRetry(doc(activeDb, 'admin_users', u.uid), 3, 300);
      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        const isActive = adminData.active !== false && adminData.status !== 'Suspended';
        const userRole = (adminData.role as AppRole) || 'ADMIN';
        const requiresPwdChange = !!adminData.mustChangePassword;
        const pwdChangedTime = adminData.passwordChangedAt || null;
        const pwdResetTime = adminData.passwordResetAt || null;

        setMustChangePassword(requiresPwdChange);
        setPasswordChangedAt(pwdChangedTime);
        setPasswordResetAt(pwdResetTime);

        if (isActive && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'HR')) {
          setRole(userRole);
          setAuthorizedOffice(adminData.authorizedOffice || 'ALL');
          setLoginId(adminData.loginId || '');
          setAdminProfileError(null);
          try {
            localStorage.setItem(`cached_admin_profile_${u.uid}`, JSON.stringify({
              role: userRole,
              authorizedOffice: adminData.authorizedOffice || 'ALL',
              loginId: adminData.loginId || '',
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
      console.warn('Failed to fetch admin profile document:', err);
    }
  }, []);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      const activeDb = db.concrete || db;
      if (u && activeDb) {
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
    if (isLoggingInRef.current) {
      throw new Error('Authentication is already in progress. Please wait.');
    }

    const activeAuth = auth.concrete || auth;
    const activeDb = db.concrete || db;
    if (!activeAuth) throw new Error('Firebase services not initialized');
    
    isLoggingInRef.current = true;

    try {
      const inputCleaned = emailOrLoginId.trim();
      const normalizedLoginId = inputCleaned.toLowerCase().replace(/\s+/g, '');
      
      let emailToAuth = '';
      let expectedUid = '';

      if (inputCleaned.includes('@')) {
        emailToAuth = inputCleaned;
      } else {
        if (!activeDb) {
          throw new Error('Database services not initialized');
        }

        try {
          const loginDoc = await getDocWithRetry(doc(activeDb, 'login_ids', normalizedLoginId), 3, 300);
          if (loginDoc.exists()) {
            const mappingData = loginDoc.data();
            emailToAuth = mappingData?.email || '';
            expectedUid = mappingData?.uid || '';
          } else {
            throw new Error(`Login ID "${inputCleaned}" does not exist.`);
          }
        } catch (err: any) {
          if (err.message && (err.message.includes('does not exist') || err.message.includes('not found'))) {
            throw err;
          }
          if (isTransientFirestoreError(err)) {
            throw new Error('Login resolution failed: Unable to connect to database. Please check your internet connection.');
          }
          throw new Error(`Login resolution failed: ${err.message || 'Unknown error'}`);
        }

        if (!emailToAuth) {
          throw new Error('Login ID mapping is invalid.');
        }
      }

      // Step 2: Attempt Firebase Authentication
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(activeAuth, emailToAuth, password);
      } catch (err: any) {
        const code = err?.code || '';
        if (
          code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password' ||
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-email'
        ) {
          throw new Error('Invalid Login ID or password.');
        }
        if (
          code === 'auth/network-request-failed' ||
          code === 'auth/internal-error' ||
          !navigator.onLine
        ) {
          throw new Error('Authentication service unavailable. Please check your internet connection.');
        }
        if (code === 'auth/too-many-requests') {
          throw new Error('Too many failed attempts. Please try again later.');
        }
        throw new Error(`Authentication failed: ${err.message || 'Unknown error'}`);
      }

      // Step 3: Security Verification: Check if authenticated UID matches the expected UID from mapping
      const u = userCredential.user;
      if (expectedUid && u.uid !== expectedUid) {
        await signOut(activeAuth);
        throw new Error('Security violation: Authenticated user does not match the mapped Login ID profile.');
      }

      // Step 4: Verify Active State and Live Admin Profile in admin_users
      if (!activeDb) {
        await signOut(activeAuth);
        throw new Error('Database service unavailable.');
      }

      let adminDoc;
      try {
        adminDoc = await getDocWithRetry(doc(activeDb, 'admin_users', u.uid), 3, 300);
      } catch (err: any) {
        await signOut(activeAuth);
        if (isTransientFirestoreError(err)) {
          throw new Error('Admin verification failed: Network error. Please check your connection.');
        }
        throw new Error(`Admin verification failed: ${err.message || 'Unknown error'}`);
      }

      if (adminDoc.exists()) {
        const adminData = adminDoc.data();
        const isActive = adminData.active !== false && adminData.status !== 'Suspended';
        const userRole = (adminData.role as AppRole) || 'ADMIN';
        const isPermittedRole = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'HR';

        if (!isActive) {
          await signOut(activeAuth);
          throw new Error('Your account is inactive. Please contact the administrator.');
        }

        if (!isPermittedRole) {
          await signOut(activeAuth);
          throw new Error('Your account does not have Admin access privileges.');
        }

        const requiresPwdChange = !!adminData.mustChangePassword;
        const pwdChangedTime = adminData.passwordChangedAt || null;
        const pwdResetTime = adminData.passwordResetAt || null;

        setMustChangePassword(requiresPwdChange);
        setPasswordChangedAt(pwdChangedTime);
        setPasswordResetAt(pwdResetTime);
        setRole(userRole);
        setAuthorizedOffice(adminData.authorizedOffice || 'ALL');
        setLoginId(adminData.loginId || normalizedLoginId);
        setAdminProfileError(null);

        try {
          localStorage.setItem(`cached_admin_profile_${u.uid}`, JSON.stringify({
            role: userRole,
            authorizedOffice: adminData.authorizedOffice || 'ALL',
            loginId: adminData.loginId || normalizedLoginId,
            mustChangePassword: requiresPwdChange,
            passwordChangedAt: pwdChangedTime,
            passwordResetAt: pwdResetTime,
          }));
        } catch (e) {}
      } else {
        await signOut(activeAuth);
        throw new Error('Admin profile not found. Access denied.');
      }
    } finally {
      isLoggingInRef.current = false;
    }
  };

  const logout = async () => {
    const activeAuth = auth.concrete || auth;
    if (!activeAuth) throw new Error('Firebase Auth not initialized');
    if (user?.uid) {
      clearNotificationStorageForUser(user.uid);
    }
    clearNotificationStorageForUser('ADMIN');
    dispatchNotificationsUpdated();
    await signOut(activeAuth);
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
