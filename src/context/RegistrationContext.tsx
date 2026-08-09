import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../services/firebase/config';
import { Device } from '@capacitor/device';

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

  const getDeviceInfo = async () => {
    let deviceId = '';
    
    try {
      const deviceIdInfo = await Device.getId();
      if (deviceIdInfo && deviceIdInfo.identifier) {
        deviceId = deviceIdInfo.identifier;
      }
    } catch (e) {
      console.warn('Device.getId() failed, checking localStorage fallback:', e);
    }

    if (!deviceId) {
      deviceId = localStorage.getItem('deviceId') || '';
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        localStorage.setItem('deviceId', deviceId);
      }
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
    
    return { deviceId, deviceModel, androidVersion, appVersion: 'v5.1.0' };
  };

  useEffect(() => {
    let isMounted = true;
    let unsubSnapshot: (() => void) | null = null;

    const initializeRegistration = async () => {
      if (!db) {
        console.warn('Registration initialization: Firestore DB unavailable');
        if (isMounted) setStatus('unregistered');
        return;
      }

      try {
        const { deviceId } = await getDeviceInfo();
        console.log('Registration initialization starting. Target deviceId:', deviceId, 'Stored localRegId:', localRegId);

        let activeRegId = localRegId;
        let activeData: any = null;

        // Step 1: Query Firestore by deviceId FIRST to detect any existing registration for this physical device
        const regsRef = collection(db, 'registrations');
        const qByDevice = query(regsRef, where('deviceId', '==', deviceId));
        const deviceQuerySnap = await getDocs(qByDevice);

        if (!deviceQuerySnap.empty) {
          const getCodeNum = (code: string) => parseInt(code.replace('EXFRNG', ''), 10) || 0;
          const docs = deviceQuerySnap.docs.map(d => ({ id: d.id, data: d.data() }));
          
          docs.sort((a, b) => {
            const dateA = new Date(a.data.registrationDate || 0).getTime();
            const dateB = new Date(b.data.registrationDate || 0).getTime();
            if (dateB !== dateA) return dateB - dateA;
            return getCodeNum(b.data.employeeCode || '') - getCodeNum(a.data.employeeCode || '');
          });

          const bestDoc = docs[0];
          activeRegId = bestDoc.id;
          activeData = bestDoc.data;

          console.log('Successfully detected existing device registration:', activeRegId, activeData.employeeCode);

          // Cleanup duplicate device records if found
          if (docs.length > 1) {
            console.warn('Cleaning up extra duplicate device records for deviceId:', deviceId);
            for (let i = 1; i < docs.length; i++) {
              try {
                await deleteDoc(doc(db, 'registrations', docs[i].id));
              } catch (delErr) {
                console.error('Failed to delete duplicate doc:', docs[i].id, delErr);
              }
            }
          }

          localStorage.setItem('registrationId', activeRegId);
          try {
            localStorage.setItem('cached_registration_data', JSON.stringify(activeData));
          } catch (e) {}
          
          if (isMounted) {
            setLocalRegId(activeRegId);
            setEmployeeData(activeData);
            setStatus(activeData.status || 'Pending Approval');
            if (activeData.rejectionReason) setRejectionReason(activeData.rejectionReason);
          }
        } else if (activeRegId) {
          // Step 2: Query by localRegId if no doc was found by deviceId
          try {
            const docSnap = await getDocs(query(regsRef, where('__name__', '==', activeRegId)));
            if (!docSnap.empty) {
              const data = docSnap.docs[0].data();
              activeData = data;
              if (isMounted) {
                setEmployeeData(data);
                setStatus(data.status || 'Pending Approval');
                if (data.rejectionReason) setRejectionReason(data.rejectionReason);
              }
            } else {
              console.warn('Doc for localRegId does not exist in Firestore:', activeRegId);
              const cachedRaw = localStorage.getItem('cached_registration_data');
              if (cachedRaw) {
                const cachedData = JSON.parse(cachedRaw);
                if (cachedData && cachedData.status) {
                  if (isMounted) {
                    setStatus(cachedData.status);
                    setEmployeeData(cachedData);
                    setRejectionReason(cachedData.rejectionReason);
                  }
                  return;
                }
              }
              if (isMounted) setStatus('unregistered');
            }
          } catch (err) {
            console.error('Error fetching registration by localRegId:', err);
            const cachedRaw = localStorage.getItem('cached_registration_data');
            if (cachedRaw && isMounted) {
              try {
                const cachedData = JSON.parse(cachedRaw);
                if (cachedData && cachedData.status) {
                  setStatus(cachedData.status);
                  setEmployeeData(cachedData);
                  setRejectionReason(cachedData.rejectionReason);
                  return;
                }
              } catch (e) {}
            }
            if (isMounted) setStatus('unregistered');
          }
        } else {
          // Step 3: Check cached registration data as fallback
          const cachedRaw = localStorage.getItem('cached_registration_data');
          if (cachedRaw) {
            try {
              const cachedData = JSON.parse(cachedRaw);
              if (cachedData && cachedData.status && (cachedData.deviceId === deviceId || cachedData.employeeCode)) {
                if (isMounted) {
                  setStatus(cachedData.status);
                  setEmployeeData(cachedData);
                  setRejectionReason(cachedData.rejectionReason);
                  const regIdToUse = cachedData.employeeCode || cachedData.uid;
                  if (regIdToUse) {
                    localStorage.setItem('registrationId', regIdToUse);
                    setLocalRegId(regIdToUse);
                  }
                }
                return;
              }
            } catch (e) {}
          }
          if (isMounted) setStatus('unregistered');
        }

        // Subscribe to real-time updates for activeRegId
        if (activeRegId) {
          unsubSnapshot = onSnapshot(doc(db, 'registrations', activeRegId), (docSnap) => {
            if (!isMounted) return;
            if (docSnap.exists()) {
              const data = docSnap.data();
              setStatus(data.status);
              setRejectionReason(data.rejectionReason);
              setEmployeeData(data);
              try {
                localStorage.setItem('cached_registration_data', JSON.stringify(data));
              } catch (e) {}
            }
          }, (err) => {
            console.error('Realtime registration snapshot error:', err);
          });
        }
      } catch (err) {
        console.error('Registration initialization error:', err);
        const cachedRaw = localStorage.getItem('cached_registration_data');
        if (cachedRaw && isMounted) {
          try {
            const cachedData = JSON.parse(cachedRaw);
            if (cachedData && cachedData.status) {
              setStatus(cachedData.status);
              setEmployeeData(cachedData);
              setRejectionReason(cachedData.rejectionReason);
              return;
            }
          } catch (e) {}
        }
        if (isMounted) setStatus('unregistered');
      }
    };

    initializeRegistration();

    return () => {
      isMounted = false;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

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
    
    let registrationId = currentAuthUser?.uid || localRegId || '';
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
      if (!registrationId) {
        // Generate new employee code sequence ONLY if genuinely new device
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
        registrationId = finalEmployeeCode;
      } else {
        finalEmployeeCode = existingData?.employeeCode || registrationId;
      }
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
