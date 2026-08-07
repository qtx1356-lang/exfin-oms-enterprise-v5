import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase/config';

type RegistrationStatus = 'unregistered' | 'Pending Approval' | 'Approved' | 'Rejected' | 'loading';

interface RegistrationContextType {
  status: RegistrationStatus;
  rejectionReason?: string;
  submitRegistration: (name: string, mobileNumber: string, selfieBase64: string) => Promise<void>;
  resetRegistration: () => void;
}

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

export const RegistrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<RegistrationStatus>('loading');
  const [rejectionReason, setRejectionReason] = useState<string>();

  useEffect(() => {
    const registrationId = localStorage.getItem('registrationId');
    if (!registrationId) {
      setStatus('unregistered');
      return;
    }

    if (!db) {
      setStatus('unregistered');
      return;
    }

    // Listen to changes
    const unsub = onSnapshot(doc(db, 'registrations', registrationId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStatus(data.status);
        setRejectionReason(data.rejectionReason);
      } else {
        setStatus('unregistered');
        localStorage.removeItem('registrationId');
      }
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

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
    
    // 1. Generate Employee Code using transaction
    const counterRef = doc(db, 'metadata', 'counters');
    
    const employeeCode = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let newSeq = 1;
      if (counterDoc.exists() && counterDoc.data().employeeCodeSequence) {
        newSeq = counterDoc.data().employeeCodeSequence + 1;
      }
      transaction.set(counterRef, { employeeCodeSequence: newSeq }, { merge: true });
      return `EXFRNG${newSeq.toString().padStart(3, '0')}`;
    });

    // 2. Prepare data
    const { deviceId, deviceModel, androidVersion, appVersion } = getDeviceInfo();
    const registrationId = crypto.randomUUID();

    const registrationData = {
      employeeCode,
      name,
      mobileNumber,
      deviceId,
      deviceModel,
      androidVersion,
      appVersion,
      selfieUrl: selfieBase64,
      registrationDate: new Date().toISOString(), // Use ISO string as requested or serverTimestamp
      status: 'Pending Approval',
      office: 'Raniganj'
    };

    // 3. Save to Firestore
    await setDoc(doc(db, 'registrations', registrationId), registrationData);

    // 4. Save to local storage
    localStorage.setItem('registrationId', registrationId);
    setStatus('Pending Approval');
  };

  const resetRegistration = () => {
    localStorage.removeItem('registrationId');
    setStatus('unregistered');
    setRejectionReason(undefined);
  };

  return (
    <RegistrationContext.Provider value={{ status, rejectionReason, submitRegistration, resetRegistration }}>
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
