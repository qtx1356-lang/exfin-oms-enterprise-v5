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
  const [adminProfileError, setAdminProfileError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && db) {
        try {
          let adminDoc = await getDoc(doc(db, 'admin_users', u.uid));

          // Idempotent migration / repair mechanism:
          // Check if user is a legitimate Admin/SuperAdmin in registrations or is primary Super Admin
          if (!adminDoc.exists()) {
            let regRole: AppRole | null = null;
            let regData: any = null;

            try {
              const regDoc = await getDoc(doc(db, 'registrations', u.uid));
              if (regDoc.exists()) {
                regData = regDoc.data();
                regRole = regData.role || null;
              }
            } catch (rErr) {
              console.warn("Could not read registration for admin check:", rErr);
            }

            if (regRole === 'ADMIN' || regRole === 'SUPER_ADMIN' || regRole === 'HR') {
              try {
                const nowIso = new Date().toISOString();
                await setDoc(doc(db, 'admin_users', u.uid), {
                  uid: u.uid,
                  role: regRole,
                  active: true,
                  email: u.email || (regData && regData.email) || '',
                  authorizedOffice: (regData && regData.office) || 'ALL',
                  createdAt: nowIso,
                  updatedAt: nowIso,
                }, { merge: true });

                adminDoc = await getDoc(doc(db, 'admin_users', u.uid));
              } catch (repairErr) {
                console.warn("Admin auto-provisioning repair note:", repairErr);
              }
            }
          }

          if (adminDoc.exists()) {
            const data = adminDoc.data();
            const isActive = data.active !== false && data.status !== 'Suspended';
            const userRole = (data.role as AppRole) || 'ADMIN';

            // Auto-migration for missing loginId in existing user profiles:
            if (!data.loginId && isActive) {
              let proposedId = '';
              if (userRole === 'SUPER_ADMIN') {
                proposedId = 'super-admin';
              } else if (userRole === 'ADMIN') {
                proposedId = 'admin';
              } else if (userRole === 'HR') {
                proposedId = 'hr';
              } else {
                proposedId = `user-${u.uid.slice(0, 5).toLowerCase()}`;
              }

              try {
                // Ensure unique proposedId
                let isUnique = false;
                let counter = 0;
                let finalId = proposedId;
                while (!isUnique && counter < 100) {
                  const checkRef = doc(db, 'login_ids', finalId);
                  const checkSnap = await getDoc(checkRef);
                  if (!checkSnap.exists() || checkSnap.data().uid === u.uid) {
                    isUnique = true;
                  } else {
                    counter++;
                    finalId = `${proposedId}-${counter}`;
                  }
                }

                await setDoc(doc(db, 'login_ids', finalId), {
                  email: u.email || (data && data.email) || '',
                  uid: u.uid,
                });

                await setDoc(doc(db, 'admin_users', u.uid), {
                  loginId: finalId,
                }, { merge: true });

                console.log(`Successfully migrated user ${u.uid} to loginId: ${finalId}`);
              } catch (migErr) {
                console.error("Failed to auto-migrate admin user to login ID:", migErr);
              }
            }

            if (isActive && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'HR')) {
              setRole(userRole);
              setAuthorizedOffice(data.authorizedOffice || 'ALL');
              setAdminProfileError(null);
            } else if (!isActive) {
              setRole('EMPLOYEE');
              setAuthorizedOffice('');
              setAdminProfileError('Your account is inactive. Please contact the administrator.');
            } else {
              setRole(userRole);
              setAuthorizedOffice('');
              setAdminProfileError('Your account does not have Admin access privileges.');
            }
          } else {
            // Document missing: preserve Firebase authentication state, set explicit error message
            setRole('EMPLOYEE');
            setAuthorizedOffice('');
            setAdminProfileError('Your account is authenticated, but your Admin profile has not been provisioned yet. Please contact the Super Admin.');
          }
        } catch (err: any) {
          console.error("Error fetching admin role:", err);
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
    let emailToAuth = '';
    const normalizedLoginId = inputCleaned.toLowerCase().replace(/\s+/g, '');

    if (inputCleaned.includes('@')) {
      emailToAuth = inputCleaned;
    } else {
      try {
        const loginDoc = await getDoc(doc(db, 'login_ids', normalizedLoginId));
        if (loginDoc.exists()) {
          emailToAuth = loginDoc.data()?.email || '';
        }
        if (!emailToAuth && normalizedLoginId === 'admin') {
          emailToAuth = 'admin_v6_secure@exfinoms.com';
        }
        if (!emailToAuth && normalizedLoginId === 'super-admin') {
          emailToAuth = 'super_admin@exfinoms.com';
        }
        if (!emailToAuth && !loginDoc.exists()) {
          throw new Error(`Login ID "${normalizedLoginId}" not found in login_ids database collection.`);
        }
      } catch (err: any) {
        if (normalizedLoginId === 'admin') {
          emailToAuth = 'admin_v6_secure@exfinoms.com';
        } else {
          throw new Error(`Login ID lookup failed: ${err.message || 'Document not found'}`);
        }
      }
    }

    if (!emailToAuth) {
      throw new Error('Login ID mapping has no associated email address.');
    }

    // Attempt Firebase Authentication
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(auth, emailToAuth, password);
    } catch (err: any) {
      throw new Error(`Firebase Auth failed (${err.code || 'error'}): ${err.message}`);
    }

    // Verify Active State and Admin Profile
    const u = userCredential.user;
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
        throw new Error(`Admin user profile missing in admin_users for UID: ${u.uid}`);
      }
    } catch (err: any) {
      if (err.message.includes('inactive') || err.message.includes('missing') || err.message.includes('profile')) {
        throw err;
      }
      await signOut(auth);
      throw new Error(`Admin profile verification failed: ${err.message}`);
    }
  };

  const logout = async () => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    await signOut(auth);
    setUser(null);
    setRole('EMPLOYEE');
    setAuthorizedOffice('');
    setAdminProfileError(null);
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, role, authorizedOffice, adminProfileError, login, logout }}>
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

