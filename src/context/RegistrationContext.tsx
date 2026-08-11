import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, runTransaction, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../services/firebase/config';
import { Device } from '@capacitor/device';
import { logStartupTag } from '../services/startup/startupPerformanceLogger';
import {
  registerEmployeeDeviceToken,
  invalidateEmployeeDeviceToken,
} from '../services/notification/pushNotificationService';

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
    if (!auth) return;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
    });
    return () => unsubAuth();
  }, []);

  const getOrGenerateSyncDeviceId = (): string => {
    let dId = localStorage.getItem('deviceId') || '';
    if (!dId || dId === 'default' || dId === 'unknown' || dId === 'device' || dId === 'EXFIN_DEVICE') {
      dId = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      localStorage.setItem('deviceId', dId);
    }
    return dId;
  };

  const getDeviceInfo = async () => {
    let deviceId = localStorage.getItem('deviceId') || '';
    
    if (!deviceId || deviceId === 'default' || deviceId === 'unknown' || deviceId === 'device' || deviceId === 'EXFIN_DEVICE') {
      try {
        const deviceIdInfo = await Device.getId();
        if (deviceIdInfo && deviceIdInfo.identifier && 
            deviceIdInfo.identifier !== 'default' && 
            deviceIdInfo.identifier !== 'unknown' && 
            deviceIdInfo.identifier !== 'localhost' &&
            deviceIdInfo.identifier !== 'device' &&
            deviceIdInfo.identifier !== 'EXFIN_DEVICE' &&
            deviceIdInfo.identifier.length > 4) {
          deviceId = deviceIdInfo.identifier;
        }
      } catch (e) {
        console.warn('Device.getId() failed, checking localStorage fallback:', e);
      }
    }

    if (!deviceId || deviceId === 'default' || deviceId === 'unknown' || deviceId === 'device' || deviceId === 'EXFIN_DEVICE') {
      deviceId = getOrGenerateSyncDeviceId();
    } else {
      localStorage.setItem('deviceId', deviceId);
    }
    
    const ua = navigator.userAgent;
    let deviceModel = 'Web Browser';
    let androidVersion = 'N/A';
    
    try {
      const info = await Device.getInfo();
      deviceModel = info.model;
      androidVersion = info.osVersion;
    } catch (e) {
      if (/android/i.test(ua)) {
        const match = ua.match(/Android\s([0-9\.]*)/);
        androidVersion = match ? match[1] : 'Unknown';
        
        const modelMatch = ua.match(/Android.*; (.*) Build/);
        deviceModel = modelMatch ? modelMatch[1] : 'Android Device';
      } else if (/iPhone|iPad|iPod/i.test(ua)) {
        deviceModel = 'iOS Device';
      }
    }
    
    logStartupTag('DEVICE_ID_READY', `Device ID: ${deviceId}, Model: ${deviceModel}`);
    return { deviceId, deviceModel, androidVersion, appVersion: 'v5.1.0' };
  };

  useEffect(() => {
    let isMounted = true;
    let unsubSnapshot: (() => void) | null = null;

    const initializeRegistration = async () => {
      logStartupTag('REGISTRATION_CHECK_START', 'Checking device registration in Firestore and local cache');

      if (!db) {
        console.warn('Registration initialization: Firestore DB unavailable');
        logStartupTag('REGISTRATION_READY', 'Status: unregistered (DB Unavailable)');
        if (isMounted) {
          setStatus('unregistered');
        }
        return;
      }

      try {
        const { deviceId } = await getDeviceInfo();
        const cachedRegRaw = localStorage.getItem('cached_registration_data');
        if (cachedRegRaw) {
          try {
            const cachedObj = JSON.parse(cachedRegRaw);
            if (cachedObj.deviceId && cachedObj.deviceId !== deviceId) {
              console.warn('Stale cached registration belongs to different deviceId. Discarding.');
              localStorage.removeItem('registrationId');
              localStorage.removeItem('cached_registration_data');
            }
          } catch (e) {}
        }

        const authUid = auth?.currentUser?.uid || 'none';
        const localEmployeeId = localStorage.getItem('registrationId') || 'none';
        const localDeviceId = deviceId;

        console.log('STARTUP_DEVICE_ID:', deviceId);
        console.log('AUTH_UID:', authUid);
        console.log('LOCAL_EMPLOYEE_ID:', localEmployeeId);
        console.log('LOCAL_DEVICE_ID:', localDeviceId);

        let activeRegId: string | null = null;
        let activeData: any = null;

        const regsRef = collection(db, 'registrations');
        console.log('REGISTRATION_QUERY: deviceId ==', deviceId);

        // STRICT DEVICE-BASED IDENTITY RESOLUTION: Never fallback to employeeCode or localRegId across devices
        const qByDevice = query(regsRef, where('deviceId', '==', deviceId));
        const deviceQuerySnap = await getDocs(qByDevice);

        const registrationFound = !deviceQuerySnap.empty;
        console.log('REGISTRATION_FOUND:', registrationFound);

        if (registrationFound) {
          const docs = deviceQuerySnap.docs.map(d => ({ id: d.id, data: d.data() }));
          
          docs.sort((a, b) => {
            const dateA = new Date(a.data.registrationDate || 0).getTime();
            const dateB = new Date(b.data.registrationDate || 0).getTime();
            if (dateB !== dateA) return dateB - dateA;
            return 0;
          });

          const bestDoc = docs[0];
          activeRegId = bestDoc.id;
          activeData = bestDoc.data;

          const regStatus = activeData.status || 'Pending Approval';
          const resolvedEmpId = activeData.employeeCode || activeRegId;

          console.log('REGISTRATION_STATUS:', regStatus);
          console.log('RESOLVED_EMPLOYEE_ID:', resolvedEmpId);
          console.log('STARTUP_DESTINATION:', regStatus);

          localStorage.setItem('registrationId', activeRegId);
          try {
            localStorage.setItem('cached_registration_data', JSON.stringify(activeData));
          } catch (e) {}

          logStartupTag('REGISTRATION_READY', `Status: ${regStatus}, EmployeeId: ${resolvedEmpId}`);

          if (isMounted) {
            setLocalRegId(activeRegId);
            setEmployeeData(activeData);
            setStatus(regStatus);
            if (activeData.rejectionReason) setRejectionReason(activeData.rejectionReason);
          }

          // Cleanup any duplicate device records if found
          if (docs.length > 1) {
            for (let i = 1; i < docs.length; i++) {
              try {
                await deleteDoc(doc(db, 'registrations', docs[i].id));
              } catch (e) {}
            }
          }
        } else {
          console.log('REGISTRATION_STATUS: unregistered');
          console.log('RESOLVED_EMPLOYEE_ID: none');
          console.log('STARTUP_DESTINATION: Register Device');
          logStartupTag('REGISTRATION_READY', 'Status: unregistered');

          localStorage.removeItem('registrationId');
          localStorage.removeItem('cached_registration_data');
          if (isMounted) {
            setLocalRegId(null);
            setEmployeeData(null);
            setStatus('unregistered');
          }
        }

        // Subscribe to real-time updates for activeRegId
        if (activeRegId && activeData) {
          unsubSnapshot = onSnapshot(doc(db, 'registrations', activeRegId), (docSnap) => {
            if (!isMounted) return;
            if (docSnap.exists()) {
              const data = docSnap.data();
              if (data.deviceId === deviceId) {
                setStatus(data.status);
                setRejectionReason(data.rejectionReason);
                setEmployeeData(data);
                try {
                  localStorage.setItem('cached_registration_data', JSON.stringify(data));
                } catch (e) {}
              }
            }
          }, (err) => {
            console.error('Realtime registration snapshot error:', err);
          });
        }
      } catch (err) {
        console.error('Registration initialization error:', err);
        localStorage.removeItem('registrationId');
        localStorage.removeItem('cached_registration_data');
        if (isMounted) {
          setLocalRegId(null);
          setEmployeeData(null);
          setStatus('unregistered');
        }
      }
    };

    initializeRegistration();

    return () => {
      isMounted = false;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  useEffect(() => {
    if (status === 'Approved' && employeeData?.employeeCode) {
      const devId = localStorage.getItem('deviceId') || '';
      if (devId) {
        registerEmployeeDeviceToken(employeeData.employeeCode, devId);
      }
    }
  }, [status, employeeData?.employeeCode]);

  const submitRegistration = async (name: string, mobileNumber: string, selfieBase64: string) => {
    if (!db) throw new Error('Firestore not initialized');
    
    let currentAuthUser = auth?.currentUser || null;
    if (!currentAuthUser && auth) {
      try {
        const credential = await signInAnonymously(auth);
        currentAuthUser = credential.user;
      } catch (authErr: any) {
        console.warn('signInAnonymously skipped/failed (Anonymous Auth may be disabled in Firebase Console):', authErr?.message || authErr);
      }
    }

    const { deviceId, deviceModel, androidVersion, appVersion } = await getDeviceInfo();
    
    // Check for existing registration with same deviceId to prevent duplicate registration documents
    const regsRef = collection(db, 'registrations');
    const q = query(regsRef, where('deviceId', '==', deviceId));
    const querySnapshot = await getDocs(q);
    
    let registrationId = '';
    let existingData: any = null;
    let finalEmployeeCode = '';
    
    if (!querySnapshot.empty) {
      const getCodeNum = (code: string) => parseInt(code.replace('EXFRNG', ''), 10) || 0;
      const docs = querySnapshot.docs.map(d => ({ id: d.id, data: d.data() }));
      
      docs.sort((a, b) => {
        const dateA = new Date(a.data.registrationDate || 0).getTime();
        const dateB = new Date(b.data.registrationDate || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return getCodeNum(b.data.employeeCode || '') - getCodeNum(a.data.employeeCode || '');
      });

      const bestDoc = docs[0];
      registrationId = bestDoc.id;
      existingData = bestDoc.data;
      finalEmployeeCode = existingData.employeeCode || bestDoc.id;
      console.log('Found existing device registration during submit, updating record:', registrationId);
      
      if (docs.length > 1) {
        for (let i = 1; i < docs.length; i++) {
          try {
            await deleteDoc(doc(db, 'registrations', docs[i].id));
          } catch (e) {}
        }
      }
    } else {
      // Genuinely new device registration! Generate brand new employee code.
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
      registrationId = currentAuthUser?.uid || finalEmployeeCode;
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
      uid: currentAuthUser?.uid || registrationId
    };

    await setDoc(doc(db, 'registrations', registrationId), registrationData, { merge: true });

    localStorage.setItem('registrationId', registrationId);
    try {
      localStorage.setItem('cached_registration_data', JSON.stringify(registrationData));
    } catch (e) {
      console.error('Failed to cache submitted registration:', e);
    }
    setLocalRegId(registrationId);
    setStatus(registrationData.status as RegistrationStatus);
    setEmployeeData(registrationData);
  };

  const resetRegistration = () => {
    const empCode = employeeData?.employeeCode || '';
    const devId = localStorage.getItem('deviceId') || '';
    if (devId) {
      invalidateEmployeeDeviceToken(empCode, devId);
    }
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
