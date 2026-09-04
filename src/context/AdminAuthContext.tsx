import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { auth, db, app } from '../services/firebase/config';
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

/**
 * Parses raw Firestore REST API document fields into standard JS object.
 */
function parseFirestoreRestFields(fields: any): Record<string, any> {
  if (!fields || typeof fields !== 'object') return {};
  const result: Record<string, any> = {};
  for (const [key, valObj] of Object.entries<any>(fields)) {
    if (!valObj || typeof valObj !== 'object') continue;
    if ('stringValue' in valObj) result[key] = valObj.stringValue;
    else if ('booleanValue' in valObj) result[key] = valObj.booleanValue;
    else if ('integerValue' in valObj) result[key] = parseInt(valObj.integerValue, 10);
    else if ('doubleValue' in valObj) result[key] = parseFloat(valObj.doubleValue);
    else if ('timestampValue' in valObj) result[key] = valObj.timestampValue;
    else if ('nullValue' in valObj) result[key] = null;
    else if ('mapValue' in valObj) result[key] = parseFirestoreRestFields(valObj.mapValue?.fields);
  }
  return result;
}

/**
 * Direct HTTPS REST resolution for login_ids/{normalizedLoginId}.
 * Completely independent of Firestore WebChannel connection state.
 */
async function resolveLoginIdViaRest(
  normalizedLoginId: string
): Promise<{
  success: boolean;
  email?: string;
  uid?: string;
  notFound?: boolean;
  configMissing?: boolean;
  error?: string;
  status?: number;
}> {
  const apiKey = app?.options?.apiKey;
  const projectId = app?.options?.projectId;
  const databaseId = (app?.options as any)?.firestoreDatabaseId || '(default)';

  console.log('[ADMIN_LOGIN_REST_RESOLUTION] Initiating REST lookup:', {
    normalizedLoginId,
    projectId,
    databaseId,
    apiKeyPresent: !!apiKey,
    apiKeyLength: apiKey ? apiKey.length : 0,
  });

  if (!apiKey || !projectId || projectId === 'your-firebase-project-id' || apiKey.includes('Placeholder')) {
    console.warn('[ADMIN_LOGIN_REST_ERROR] Firebase configuration is missing or placeholder in client build.');
    return {
      success: false,
      configMissing: true,
      error: 'Firebase configuration unavailable.',
    };
  }

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/login_ids/${encodeURIComponent(normalizedLoginId)}?key=${encodeURIComponent(apiKey)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log('[ADMIN_LOGIN_REST_RESOLUTION] Response received:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (response.status === 404) {
      console.log(`[ADMIN_LOGIN_REST_RESOLUTION] Document login_ids/${normalizedLoginId} not found (404).`);
      return { success: false, notFound: true, status: 404 };
    }

    if (response.ok) {
      const data = await response.json();
      const parsed = parseFirestoreRestFields(data.fields);
      const email = parsed.email || '';
      const uid = parsed.uid || '';

      console.log('[ADMIN_LOGIN_REST_RESOLUTION] Document resolved successfully:', {
        hasEmail: !!email,
        hasUid: !!uid,
        role: parsed.role || 'UNKNOWN',
      });

      if (!email) {
        return {
          success: false,
          error: 'Login ID mapping document exists but does not contain an email address.',
          status: 200,
        };
      }

      return {
        success: true,
        email,
        uid,
        status: 200,
      };
    } else {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (e) {}

      console.error('[ADMIN_LOGIN_REST_ERROR] REST request returned non-OK status:', {
        status: response.status,
        statusText: response.statusText,
        errorBody,
      });

      return {
        success: false,
        status: response.status,
        error: `Firestore REST lookup error (${response.status}): ${response.statusText}`,
      };
    }
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    console.error('[ADMIN_LOGIN_REST_ERROR] REST lookup exception:', {
      isTimeout,
      errorName: err.name,
      errorMessage: err.message,
    });

    return {
      success: false,
      error: isTimeout ? 'Login ID resolution request timed out.' : (err.message || 'Network error during Login ID resolution.'),
    };
  }
}

/**
 * Direct HTTPS REST resolution for admin_users/{uid} using the user's Auth token.
 */
async function fetchAdminUserViaRest(
  uid: string,
  idToken: string
): Promise<{ exists: boolean; data?: Record<string, any>; error?: string } | null> {
  const apiKey = app?.options?.apiKey;
  const projectId = app?.options?.projectId;
  const databaseId = (app?.options as any)?.firestoreDatabaseId || '(default)';

  if (!apiKey || !projectId || projectId === 'your-firebase-project-id' || apiKey.includes('Placeholder')) {
    return null;
  }

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/admin_users/${encodeURIComponent(uid)}?key=${encodeURIComponent(apiKey)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    console.log('[ADMIN_LOGIN_AUTHORIZATION] REST admin profile response:', {
      status: response.status,
      statusText: response.statusText,
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (response.ok) {
      const data = await response.json();
      const parsed = parseFirestoreRestFields(data.fields);
      return {
        exists: true,
        data: parsed,
      };
    }
  } catch (e: any) {
    console.warn('[ADMIN_LOGIN_AUTHORIZATION] Admin user REST lookup warning:', e?.message || e);
  }

  return null;
}

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
    let adminData: Record<string, any> | null = null;
    let docFound = false;

    // Attempt 1: Firestore SDK
    if (activeDb) {
      try {
        const adminDoc = await getDocWithRetry(doc(activeDb, 'admin_users', u.uid), 2, 250);
        if (adminDoc.exists()) {
          adminData = adminDoc.data();
          docFound = true;
        } else {
          docFound = false;
        }
      } catch (err: any) {
        // Attempt 2: REST API fallback if Firestore SDK has connection lag
        try {
          const idToken = await u.getIdToken();
          const restResult = await fetchAdminUserViaRest(u.uid, idToken);
          if (restResult) {
            if (restResult.exists && restResult.data) {
              adminData = restResult.data;
              docFound = true;
            } else {
              docFound = false;
            }
          }
        } catch (restErr) {}
      }
    }

    if (docFound && adminData) {
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
    } else if (docFound === false && adminData === null) {
      // Document missing
      setRole('EMPLOYEE');
      setAuthorizedOffice('');
      setLoginId('');
      setMustChangePassword(false);
      setAdminProfileError('Your account is authenticated, but your Admin profile has not been provisioned yet. Please contact the administrator.');
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

      // Step 1: Resolve Login ID -> email & expectedUid
      if (inputCleaned.includes('@')) {
        // Direct email input
        emailToAuth = inputCleaned;
        console.log('[ADMIN_LOGIN_REST_RESOLUTION] Direct email format detected, bypassing Login ID mapping.');
      } else {
        // Resolve Login ID without being blocked by Firestore WebChannel stream
        let resolutionSucceeded = false;

        // Method A: Direct HTTPS REST (Immediate, not blocked by WebChannel/streaming lock)
        try {
          const restResult = await resolveLoginIdViaRest(normalizedLoginId);
          if (restResult.configMissing) {
            console.warn('[ADMIN_LOGIN_REST_ERROR] Firebase configuration missing in client.');
          } else if (restResult.notFound) {
            throw new Error(`Login ID "${inputCleaned}" does not exist.`);
          } else if (restResult.success && restResult.email) {
            emailToAuth = restResult.email;
            expectedUid = restResult.uid || '';
            resolutionSucceeded = true;
          }
        } catch (restErr: any) {
          if (restErr.message && (restErr.message.includes('does not exist') || restErr.message.includes('not found'))) {
            throw restErr;
          }
        }

        // Method B: Client Firestore SDK fallback
        if (!resolutionSucceeded && activeDb) {
          console.log('[ADMIN_LOGIN_REST_RESOLUTION] Attempting Firestore SDK fallback lookup for login_ids...');
          try {
            const loginDoc = await getDocWithRetry(doc(activeDb, 'login_ids', normalizedLoginId), 2, 250);
            if (loginDoc.exists()) {
              const mappingData = loginDoc.data();
              emailToAuth = mappingData?.email || '';
              expectedUid = mappingData?.uid || '';
              resolutionSucceeded = true;
              console.log('[ADMIN_LOGIN_REST_RESOLUTION] Firestore SDK lookup succeeded.');
            } else {
              throw new Error(`Login ID "${inputCleaned}" does not exist.`);
            }
          } catch (sdkErr: any) {
            if (sdkErr.message && (sdkErr.message.includes('does not exist') || sdkErr.message.includes('not found'))) {
              throw sdkErr;
            }
            console.warn('[ADMIN_LOGIN_REST_ERROR] Firestore SDK fallback lookup warning:', sdkErr?.message || sdkErr);
          }
        }

        // Method C: Cached mapping fallback (for network resiliency, does NOT grant auth on its own)
        if (!resolutionSucceeded) {
          try {
            const cachedRaw = localStorage.getItem(`cached_login_mapping_${normalizedLoginId}`);
            if (cachedRaw) {
              const parsed = JSON.parse(cachedRaw);
              if (parsed?.email) {
                emailToAuth = parsed.email;
                expectedUid = parsed.uid || '';
                resolutionSucceeded = true;
                console.log('[ADMIN_LOGIN_REST_RESOLUTION] Using cached login mapping for email resolution.');
              }
            }
          } catch (e) {}
        }

        if (!resolutionSucceeded || !emailToAuth) {
          if (!navigator.onLine) {
            throw new Error('Authentication service unavailable. Please check your internet connection.');
          }
          throw new Error(`Login ID resolution service temporarily unavailable.`);
        }
      }

      // Step 2: Attempt Firebase Authentication (Mandatory Authority)
      console.log('[ADMIN_LOGIN_AUTH] Attempting Firebase Authentication...');
      let userCredential;
      try {
        userCredential = await signInWithEmailAndPassword(activeAuth, emailToAuth, password);
        console.log('[ADMIN_LOGIN_AUTH] Firebase Authentication succeeded.');
      } catch (err: any) {
        const code = err?.code || '';
        console.error('[ADMIN_LOGIN_AUTH] Firebase Authentication error code:', code);
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
      console.log('[ADMIN_LOGIN_AUTHORIZATION] Checking authenticated UID...');
      if (expectedUid && u.uid !== expectedUid) {
        console.error('[ADMIN_LOGIN_AUTHORIZATION] Security violation: UID mismatch between mapping and authenticated user.');
        await signOut(activeAuth);
        throw new Error('Security violation: Authenticated user does not match the mapped Login ID profile.');
      }

      // Cache mapping only AFTER successful Firebase authentication
      if (normalizedLoginId && emailToAuth) {
        try {
          localStorage.setItem(`cached_login_mapping_${normalizedLoginId}`, JSON.stringify({
            email: emailToAuth,
            uid: u.uid,
          }));
        } catch (e) {}
      }

      // Step 4: Verify Active State and Live Admin Profile in admin_users
      console.log('[ADMIN_LOGIN_AUTHORIZATION] Fetching live admin_users profile...');
      let adminData: Record<string, any> | null = null;
      let docFound = false;

      // Method A: Firestore SDK
      if (activeDb) {
        try {
          const adminDoc = await getDocWithRetry(doc(activeDb, 'admin_users', u.uid), 2, 250);
          if (adminDoc.exists()) {
            adminData = adminDoc.data();
            docFound = true;
          }
        } catch (docErr) {
          console.warn('[ADMIN_LOGIN_AUTHORIZATION] Firestore SDK admin profile read failed, attempting REST fallback.');
          // Method B: REST API fallback with Auth Token
          try {
            const idToken = await u.getIdToken();
            const restResult = await fetchAdminUserViaRest(u.uid, idToken);
            if (restResult) {
              if (restResult.exists && restResult.data) {
                adminData = restResult.data;
                docFound = true;
              }
            }
          } catch (restErr) {}
        }
      }

      if (docFound && adminData) {
        const isActive = adminData.active !== false && adminData.status !== 'Suspended';
        const userRole = (adminData.role as AppRole) || 'ADMIN';
        const isPermittedRole = userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'HR';

        if (!isActive) {
          console.error('[ADMIN_LOGIN_AUTHORIZATION] Admin user account is inactive or suspended.');
          await signOut(activeAuth);
          throw new Error('Your account is inactive. Please contact the administrator.');
        }

        if (!isPermittedRole) {
          console.error('[ADMIN_LOGIN_AUTHORIZATION] User does not have an administrative role:', userRole);
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

        console.log('[ADMIN_LOGIN_AUTHORIZATION] Admin authorization successful with role:', userRole);

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
        console.error('[ADMIN_LOGIN_AUTHORIZATION] Admin profile document not found for authenticated UID.');
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


