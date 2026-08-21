import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase/config';
import { AppRole } from '../types/roles';

interface AdminAuthContextType {
  user: User | null;
  loading: boolean;
  role: AppRole;
  authorizedOffice: string; // 'ALL' or specific office name
  loginId: string;
  adminProfileError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>('EMPLOYEE');
  const [authorizedOffice, setAuthorizedOffice] = useState<string>('');
  const [loginId, setLoginId] = useState<string>('');
  const [adminProfileError, setAdminProfileError] = useState<string | null>(null);

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
              setAdminProfileError(null);
            }
          } catch (e) {}
        }

        if (!navigator.onLine) {
          setLoading(false);
          return;
        }

        try {
          const adminDoc = await getDoc(doc(db, 'admin_users', u.uid));

          if (adminDoc.exists()) {
            const data = adminDoc.data();
            const isActive = data.active !== false && data.status !== 'Suspended';
            const userRole = (data.role as AppRole) || 'ADMIN';

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
            // Document missing: preserve Firebase authentication state, set explicit error message
            setRole('EMPLOYEE');
            setAuthorizedOffice('');
            setLoginId('');
            setAdminProfileError('Your account is authenticated, but your Admin profile has not been provisioned yet. Please contact the administrator.');
          }
        } catch (err: any) {
          console.error("Error fetching admin role:", err);
          // If offline or network error and we have cached admin role, preserve it
          if (cachedAdminRaw) {
            try {
              const cachedAdmin = JSON.parse(cachedAdminRaw);
              if (cachedAdmin && cachedAdmin.role) {
                setRole(cachedAdmin.role as AppRole);
                setAuthorizedOffice(cachedAdmin.authorizedOffice || 'ALL');
                setLoginId(cachedAdmin.loginId || '');
                setAdminProfileError(null);
                setLoading(false);
                return;
              }
            } catch (e) {}
          }
          setRole('EMPLOYEE');
          setAuthorizedOffice('');
          setAdminProfileError('Error validating Admin profile: ' + (err.message || 'Unknown error'));
        }
      } else {
        setRole('EMPLOYEE');
        setAuthorizedOffice('');
        setAdminProfileError(null);
      }
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

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
    await signOut(auth);
    setUser(null);
    setRole('EMPLOYEE');
    setAuthorizedOffice('');
    setLoginId('');
    setAdminProfileError(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, role, authorizedOffice, loginId, adminProfileError, login, logout }}>
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

