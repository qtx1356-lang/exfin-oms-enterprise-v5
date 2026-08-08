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

            if (isActive && (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN' || userRole === 'HR')) {
              setRole(userRole);
              setAuthorizedOffice(data.authorizedOffice || 'ALL');
              setAdminProfileError(null);
            } else if (!isActive) {
              setRole('EMPLOYEE');
              setAuthorizedOffice('');
              setAdminProfileError('Your Admin account has been suspended or deactivated. Please contact the Super Admin.');
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

  const login = async (email: string, password: string) => {
    if (!auth) throw new Error('Firebase Auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
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

