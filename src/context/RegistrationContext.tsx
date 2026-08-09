import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, setDoc, serverTimestamp, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../services/firebase/config';

type RegistrationStatus = 'unregistered' | 'Pending Approval' | 'Approved' | 'Rejected' | 'loading';

interface RegistrationContextType {
  status: RegistrationStatus;
  rejectionReason?: string;
  employeeData?: any;
  submitRegistration: (name: string, mobileNumber: string, selfieBase64: string) => Promise<void>;
  resetRegistration: () => void;
  authUser: User | null;
}

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export const RegistrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<RegistrationStatus>('loading');
  const [rejectionReason, setRejectionReason] = useState<string>();
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [localRegId, setLocalRegId] = useState<string | null>(localStorage.getItem('registrationId'));
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    let isMounted = true;
    let timerId: NodeJS.Timeout | null = null;

    if (!localRegId) {
      console.log('Registration initialization started: No local registration ID');
      setStatus('unregistered');
      return;
    }
    
    if (!db) {
      console.log('Registration initialization started: No DB instance');
      setStatus('unregistered');
      return;
    }

    console.log('Registration initialization started for ID:', localRegId);

    // Bounded initialization timeout (5000 ms)
    timerId = setTimeout(() => {
      if (!isMounted) return;
      console.log('Registration initialization timed out');

      // Attempt to load cached registration data
      try {
        const cachedRaw = localStorage.getItem('cached_registration_data');
        if (cachedRaw) {
          const cachedData = JSON.parse(cachedRaw);
          if (cachedData && cachedData.status) {
            console.log('Registration using cached state:', cachedData.status);
            setStatus(cachedData.status);
            setRejectionReason(cachedData.rejectionReason);
            setEmployeeData(cachedData);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to parse cached registration data:', err);
      }

      // No valid cached registration -> default to unregistered
      setStatus('unregistered');
    }, 5000);

    // Listen to changes
    const unsub = onSnapshot(doc(db, 'registrations', localRegId), (docSnap) => {
      if (!isMounted) return;

      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }

      console.log('Registration Firestore resolved');

      if (docSnap.exists()) {
        const data = docSnap.data();
        setStatus(data.status);
        setRejectionReason(data.rejectionReason);
        setEmployeeData(data);

        // Save authoritative state to local storage cache
        try {
          localStorage.setItem('cached_registration_data', JSON.stringify(data));
        } catch (e) {
          console.error('Failed to cache registration data:', e);
        }
      } else {
        console.log('Firestore document does NOT exist for registrationId:', localRegId);
        setStatus('unregistered');
        localStorage.removeItem('registrationId');
        localStorage.removeItem('cached_registration_data');
        setLocalRegId(null);
        setEmployeeData(null);
      }
    }, (error) => {
      if (!isMounted) return;

      console.error('Registration Firestore error:', error);

      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }

      // Attempt cached state fallback on Firestore error
      try {
        const cachedRaw = localStorage.getItem('cached_registration_data');
        if (cachedRaw) {
          const cachedData = JSON.parse(cachedRaw);
          if (cachedData && cachedData.status) {
            console.log('Registration using cached state after Firestore error:', cachedData.status);
            setStatus(cachedData.status);
            setRejectionReason(cachedData.rejectionReason);
            setEmployeeData(cachedData);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to load cached registration data on error:', err);
      }

      setStatus('unregistered');
    });

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      if (unsub) unsub();
    };
  }, [localRegId]);

  const getDeviceInfo = () => {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('deviceId', deviceId);
    }
    
    const ua = navigator.userAgent;
    let deviceModel = 'Web Browser';
    let androidVersion = 'N/A';
    
    if (/android/i.test(ua)) {
      const match = ua.match(/Android\s([0-9\.]*)/);
      androidVersion = match ? match[1] : 'Unknown';
      
      const modelMatch = ua.match(/Android.*; (.*) Build/);
      deviceModel = modelMatch ? modelMatch[1] : 'Android Device';
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      deviceModel = 'iOS Device';
    }
    
    return { deviceId, deviceModel, androidVersion, appVersion: 'v5.1.0' };
  };

  const submitRegistration = async (name: string, mobileNumber: string, selfieBase64: string) => {
    if (!db) throw new Error('Firestore not initialized');
    
    // Ensure the user is signed in anonymously to get a UID
    let currentAuthUser = auth.currentUser;
    if (!currentAuthUser) {
      const credential = await signInAnonymously(auth);
      currentAuthUser = credential.user;
    }

    // 2. Prepare data
    const { deviceId, deviceModel, androidVersion, appVersion } = getDeviceInfo();
    
    // 3. Check for existing registration with same deviceId to prevent duplicates
    const regsRef = collection(db, 'registrations');
    const q = query(regsRef, where('deviceId', '==', deviceId));
    const querySnapshot = await getDocs(q);
    
    let registrationId = currentAuthUser.uid;
    let existingData: any = null;
    let finalEmployeeCode = '';
    
    if (!querySnapshot.empty) {
      // If a record with this deviceId exists, use its ID to update it
      // Sort by registrationDate descending to get the newest one if duplicates exist
      const docs = querySnapshot.docs.map(d => ({ id: d.id, data: d.data() }));
      docs.sort((a, b) => {
        const dateA = new Date(a.data.registrationDate || 0).getTime();
        const dateB = new Date(b.data.registrationDate || 0).getTime();
        return dateB - dateA;
      });

      const bestDoc = docs[0];
      registrationId = bestDoc.id;
      existingData = bestDoc.data;
      finalEmployeeCode = existingData.employeeCode;
      console.log('Found existing device registration, updating record:', registrationId);
      
      // Cleanup extra duplicates immediately if found
      if (docs.length > 1) {
        console.warn('Multiple duplicate device records found for deviceId during registration:', deviceId);
        for (let i = 1; i < docs.length; i++) {
          await deleteDoc(doc(db, 'registrations', docs[i].id));
        }
      }
    } else {
      // 3b. ONLY Generate Employee Code using transaction if brand new device
      const counterRef = doc(db, 'metadata', 'counters');
      finalEmployeeCode = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newSeq = 1;
        if (counterDoc.exists() && counterDoc.data().employeeCodeSequence) {
          newSeq = counterDoc.data().employeeCodeSequence + 1;
        }
        transaction.set(counterRef, { employeeCodeSequence: newSeq }, { merge: true });
        return `EXFRNG${newSeq.toString().padStart(3, '0')}`;
      });
    }

    const registrationData = {
      employeeCode: finalEmployeeCode,
      name,
      mobileNumber,
      deviceId,
      deviceModel,
      androidVersion,
      appVersion,
      selfieUrl: selfieBase64,
      registrationDate: existingData?.registrationDate || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      status: existingData?.status || 'Pending Approval',
      office: existingData?.office || 'Raniganj',
      uid: currentAuthUser.uid
    };

    // 4. Save to Firestore
    await setDoc(doc(db, 'registrations', registrationId), registrationData);

    // 4. Save to local storage
    localStorage.setItem('registrationId', registrationId);
    try {
      localStorage.setItem('cached_registration_data', JSON.stringify(registrationData));
    } catch (e) {
      console.error('Failed to cache submitted registration:', e);
    }
    setLocalRegId(registrationId);
    setStatus('Pending Approval');
    setEmployeeData(registrationData);
  };

  const resetRegistration = () => {
    localStorage.removeItem('registrationId');
    localStorage.removeItem('cached_registration_data');
    setLocalRegId(null);
    setStatus('unregistered');
    setRejectionReason(undefined);
    setEmployeeData(null);
  };

  return (
    <RegistrationContext.Provider value={{ status, rejectionReason, employeeData, submitRegistration, resetRegistration, authUser }}>
      {children}
    </RegistrationContext.Provider>
  );
};

export const useRegistration = () => {
  const context = useContext(RegistrationContext);
  if (context === undefined) {
    throw new Error('useRegistration must be used within a RegistrationProvider');
  }
  return context;
};
