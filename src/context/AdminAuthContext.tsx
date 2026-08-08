import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase/config';
import { AppRole } from '../types/roles';

interface AdminAuthContextType {
  user: User | null;
  loading: boolean;
  role: AppRole;
  authorizedOffice: string; // 'ALL' or specific office name
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>('ADMIN');
  const [authorizedOffice, setAuthorizedOffice] = useState<string>('ALL');

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && db) {
        try {
          const adminDoc = await getDoc(doc(db, 'admin_users', u.uid));
          if (adminDoc.exists()) {
            const data = adminDoc.data();
            setRole(data.role as AppRole || 'ADMIN');
            setAuthorizedOffice(data.authorizedOffice || 'ALL');
          } else {
            // Unrecognized user. Ensure no fallback permissions are granted.
            setUser(null);
            setRole('EMPLOYEE');
            setAuthorizedOffice('');
          }
        } catch (err) {
          console.error("Error fetching admin role", err);
          setUser(null);
          setRole('EMPLOYEE');
          setAuthorizedOffice('');
        }
      } else {
        setRole('EMPLOYEE');
        setAuthorizedOffice('');
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
  };

  return (
    <AdminAuthContext.Provider value={{ user, loading, role, authorizedOffice, login, logout }}>
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
