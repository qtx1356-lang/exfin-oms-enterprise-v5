// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, getDoc, onSnapshot, runTransaction, setDoc, collection, query, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../services/firebase/config';
import { Device } from '@capacitor/device';
import { logStartupTag } from '../services/startup/startupPerformanceLogger';
import {
  registerEmployeeDeviceToken,
  invalidateEmployeeDeviceToken,
} from '../services/notification/pushNotificationService';
import { clearNotificationStorageForUser, dispatchNotificationsUpdated } from '../services/notification/notificationStorage';
import { createAuditLog } from '../services/audit/auditService';

type RegistrationStatus = 'unregistered' | 'Pending Approval' | 'Approved' | 'Rejected' | 'loading' | 'mobile_recovery' | 'suspended_notice';

interface RegistrationContextType {
  status: RegistrationStatus;
  rejectionReason?: string;
  employeeData?: any;
  submitRegistration: (name: string, mobileNumber: string, selfieBase64: string) => Promise<void>;
  verifyMobileForRecovery: (mobileNumber: string) => Promise<boolean>;
  resetRegistration: () => void;
  authUser: User | null;
  recoveryMobileInput: string;
  setRecoveryMobileInput: (val: string) => void;
  recoveryError: string | null;
  recoveryLoading: boolean;
}

const RegistrationContext = createContext<RegistrationContextType | undefined>(undefined);

// Helper to normalize phone numbers
const normalizeMobile = (num: string): string => {
  if (!num) return '';
  const digits = num.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10); // Last 10 digits as canonical
  }
  return digits;
};

export const RegistrationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [localRegId, setLocalRegId] = useState<string | null>(() => localStorage.getItem('registrationId'));
  const [employeeData, setEmployeeData] = useState<any>(() => {
    try {
      const raw = localStorage.getItem('cached_registration_data');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState<RegistrationStatus>(() => {
    const savedRegId = localStorage.getItem('registrationId');
    if (!savedRegId) return 'mobile_recovery';
    try {
      const raw = localStorage.getItem('cached_registration_data');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.status === 'Suspended' || parsed.status === 'Blocked' || parsed.status === 'INACTIVE') {
          return 'suspended_notice';
        }
        if (parsed.status === 'Rejected') return 'Rejected';
        return parsed.status || 'Approved';
      }
    } catch {}
    return 'Approved';
  });
  const [rejectionReason, setRejectionReason] = useState<string>();
  const [authUser, setAuthUser] = useState<User | null>(null);

  const [recoveryMobileInput, setRecoveryMobileInput] = useState<string>('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState<boolean>(false);

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
      const activeDb = db.concrete || db;
      logStartupTag('REGISTRATION_CHECK_START', 'Checking registration via local session / mobile recovery');

      if (!activeDb) {
        if (isMounted) setStatus('unregistered');
        return;
      }

      try {
        const { deviceId } = await getDeviceInfo();
        const savedRegId = localStorage.getItem('registrationId');
        
        if (savedRegId) {
          // Pre-populate with locally cached registration data if available
          const cachedDataRaw = localStorage.getItem('cached_registration_data');
          if (cachedDataRaw) {
            try {
              const cachedData = JSON.parse(cachedDataRaw);
              if (cachedData && isMounted) {
                setLocalRegId(savedRegId);
                setEmployeeData(cachedData);
                const regStatus = cachedData.status || 'Approved';
                if (regStatus === 'Suspended' || regStatus === 'Blocked' || regStatus === 'INACTIVE') {
                  setStatus('suspended_notice');
                  setRejectionReason(cachedData.rejectionReason || `Account status is ${regStatus}.`);
                } else if (regStatus === 'Rejected') {
                  setStatus('Rejected');
                } else {
                  setStatus(regStatus === 'Approved' ? 'Approved' : regStatus);
                }
              }
            } catch (e) {
              console.warn('Failed to parse cached_registration_data:', e);
            }
          }

          // If offline, preserve the local cached session without throwing network errors
          if (!navigator.onLine) {
            if (isMounted) {
              setLocalRegId(savedRegId);
              if (!cachedDataRaw) {
                setStatus('Approved');
              }
            }
            return;
          }

          // Verify saved registration with Firestore
          const regDocRef = doc(activeDb, 'registrations', savedRegId);
          const regSnap = await getDoc(regDocRef);
          if (regSnap.exists()) {
            const data = regSnap.data();
            const regStatus = data.status || 'Pending Approval';
            
            // Cache latest data
            try {
              localStorage.setItem('cached_registration_data', JSON.stringify({ ...data, id: savedRegId }));
            } catch (e) {}

            // Check status restrictions
            if (regStatus === 'Rejected') {
              if (isMounted) {
                setStatus('Rejected');
                setEmployeeData(data);
              }
              return;
            }

            if (regStatus === 'Suspended' || regStatus === 'Blocked' || regStatus === 'INACTIVE') {
              if (isMounted) {
                setStatus('suspended_notice');
                setRejectionReason(data.rejectionReason || `Account status is ${regStatus}. Please contact your administrator.`);
                setEmployeeData(data);
              }
              return;
            }

            // Update deviceId association on session startup for tracking (Mobile = Identity, Device = Info)
            if (data.deviceId !== deviceId) {
              await updateDoc(regDocRef, { deviceId, deviceModel: (await getDeviceInfo()).deviceModel, lastSyncTime: new Date().toISOString() });
            }

            if (isMounted) {
              setLocalRegId(savedRegId);
              setEmployeeData(data);
              setStatus(regStatus === 'Approved' ? 'Approved' : regStatus);
            }

            // Realtime listener
            if (isMounted) {
              const unsub = onSnapshot(regDocRef, (docSnap) => {
                if (!isMounted) {
                  unsub();
                  return;
                }
                if (docSnap.exists()) {
                  const liveData = docSnap.data();
                  const liveStatus = liveData.status || 'Pending Approval';
                  try {
                    localStorage.setItem('cached_registration_data', JSON.stringify({ ...liveData, id: savedRegId }));
                  } catch (e) {}
                  if (liveStatus === 'Suspended' || liveStatus === 'Blocked' || liveStatus === 'INACTIVE' || liveStatus === 'Rejected') {
                    setStatus('suspended_notice');
                    setRejectionReason(liveData.rejectionReason || `Account status is ${liveStatus}.`);
                  } else {
                    setStatus(liveStatus === 'Approved' ? 'Approved' : liveStatus);
                  }
                  setEmployeeData(liveData);
                } else {
                  localStorage.removeItem('registrationId');
                  localStorage.removeItem('cached_registration_data');
                  setLocalRegId(null);
                  setEmployeeData(null);
                  setStatus('unregistered');
                }
              });
              unsubSnapshot = unsub;
            }
            return;
          }
        }

        // No saved registration ID -> Prompt "Welcome Back" mobile number recovery
        if (isMounted) {
          setStatus('mobile_recovery');
        }

      } catch (err: any) {
        console.error('Registration init error:', err);
        // Fallback for offline / network timeout: preserve local session if registration ID exists
        const savedRegId = localStorage.getItem('registrationId');
        if (savedRegId && isMounted) {
          setLocalRegId(savedRegId);
          const cachedDataRaw = localStorage.getItem('cached_registration_data');
          if (cachedDataRaw) {
            try {
              const cachedData = JSON.parse(cachedDataRaw);
              setEmployeeData(cachedData);
              setStatus(cachedData.status || 'Approved');
              return;
            } catch (e) {}
          }
          setStatus('Approved');
          return;
        }
        if (isMounted) setStatus('mobile_recovery');
      }
    };

    initializeRegistration();

    return () => {
      isMounted = false;
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  // Verify mobile number for reinstall recovery
  const verifyMobileForRecovery = async (mobile: string): Promise<boolean> => {
    const activeDb = db.concrete || db;
    if (!activeDb) return false;
    const canonical = normalizeMobile(mobile);
    
    console.log(`[Verification] Start for: ${mobile} (Canonical: ${canonical})`);
    
    if (!canonical || canonical.length < 10) {
      setRecoveryError('Please enter a valid 10-digit mobile number.');
      return false;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);

    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Verification timed out. Please try again.')), 15000)
    );

    try {
      const regsRef = collection(activeDb, 'registrations');
      
      // Step 1: Optimized query by canonicalMobile
      const q = query(regsRef, where('canonicalMobile', '==', canonical));
      
      console.log(`[Verification] Querying Firestore for canonicalMobile: ${canonical}`);
      const snap = await Promise.race([getDocs(q), timeoutPromise]) as any;
      
      let matchedReg: { id: string; data: any } | null = null;
      
      if (!snap.empty) {
        matchedReg = { id: snap.docs[0].id, data: snap.docs[0].data() };
        console.log(`[Verification] Match found via canonicalMobile: ${snap.docs[0].id}`);
      } else {
        // Step 2: Fallback query by raw mobileNumber
        console.log(`[Verification] No canonical match, trying raw mobileNumber query`);
        const q2 = query(regsRef, where('mobileNumber', '==', mobile));
        const snap2 = await Promise.race([getDocs(q2), timeoutPromise]) as any;
        if (!snap2.empty) {
          matchedReg = { id: snap2.docs[0].id, data: snap2.docs[0].data() };
          console.log(`[Verification] Match found via raw mobileNumber: ${snap2.docs[0].id}`);
        }
      }

      if (!matchedReg) {
        console.log(`[Verification] No existing employee found for ${canonical}. Proceeding to new registration.`);
        setStatus('unregistered');
        return false;
      }

      const { id: regId, data: regData } = matchedReg as { id: string; data: any };
      const regStatus = regData.status || 'Pending Approval';

      console.log(`[Verification] Existing employee found: ${regData.name}, Status: ${regStatus}`);

      // Check if completely deleted
      if (regData.isDeleted || regStatus === 'Deleted') {
        setRecoveryError('This account was completely deleted. Please register as a new employee.');
        setStatus('unregistered');
        return false;
      }

      // Check Status
      if (regStatus === 'Rejected') {
        setStatus('Rejected');
        setEmployeeData(regData);
        return false;
      }

      if (regStatus === 'Suspended' || regStatus === 'Blocked' || regStatus === 'INACTIVE') {
        setStatus('suspended_notice');
        setRejectionReason(regData.rejectionReason || `Your account is currently ${regStatus}. Please contact your administrator.`);
        setEmployeeData(regData);
        return false;
      }

      if (regStatus === 'Pending Approval') {
        localStorage.setItem('registrationId', regId);
        setLocalRegId(regId);
        setEmployeeData(regData);
        setStatus('Pending Approval');
        return true;
      }

      // APPROVED RECOVERY SUCCESS!
      const { deviceId, deviceModel } = await getDeviceInfo();
      const regDocRef = doc(activeDb, 'registrations', regId);
      
      console.log(`[Verification] Restoring account for ${regData.name} on device ${deviceId}`);

      // Update session and device association
      await Promise.race([
        updateDoc(regDocRef, {
          deviceId,
          deviceModel,
          lastSyncTime: new Date().toISOString(),
          lastRestoredAt: new Date().toISOString()
        }),
        timeoutPromise
      ]);

      localStorage.setItem('registrationId', regId);
      try {
        localStorage.setItem('cached_registration_data', JSON.stringify({ ...regData, deviceId }));
      } catch (e) {}

      setLocalRegId(regId);
      setEmployeeData({ ...regData, deviceId });
      setStatus('Approved');

      // Audit Log
      try {
        const maskedMobile = canonical.length >= 10 ? `******${canonical.slice(-4)}` : '******';
        await createAuditLog({
          action: 'ACCOUNT_RESTORED',
          actionCategory: 'Authentication',
          performedByUserId: regId,
          performedByName: regData.name || 'Employee',
          performedByRole: 'EMPLOYEE',
          employeeCode: regData.employeeCode || regId,
          targetUserId: regId,
          targetUserName: regData.name || 'Employee',
          targetRecordId: regId,
          description: `Account successfully restored via mobile number recovery (${maskedMobile})`,
          result: 'SUCCESS',
          source: 'EMPLOYEE_APP',
          metadata: { deviceModel }
        });
      } catch (auditErr) {
        console.warn('Audit log creation failed:', auditErr);
      }

      return true;

    } catch (err: any) {
      console.error('[Verification] Error:', err);
      setRecoveryError(err.message || 'Unable to verify mobile number. Please check your internet connection and try again.');
      return false;
    } finally {
      setRecoveryLoading(false);
    }
  };

  const submitRegistration = async (name: string, mobileNumber: string, selfieBase64: string) => {
    const activeDb = db.concrete || db;
    const activeAuth = auth.concrete || auth;
    if (!activeDb) throw new Error('Firestore not initialized');
    
    console.log(`[Registration] Submitting for ${name} (${mobileNumber})`);
    
    let currentAuthUser = activeAuth?.currentUser || null;
    if (!currentAuthUser && activeAuth) {
      try {
        const credential = await signInAnonymously(activeAuth);
        currentAuthUser = credential.user;
      } catch (authErr: any) {
        console.warn('[Registration] Anonymous auth failed:', authErr);
      }
    }

    const { deviceId, deviceModel, androidVersion, appVersion } = await getDeviceInfo();
    const canonical = normalizeMobile(mobileNumber);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Registration timed out. Please check your connection.')), 20000)
    );

    try {
      // Check if mobile number already exists across registrations
      const regsRef = collection(activeDb, 'registrations');
      const q = query(regsRef, where('canonicalMobile', '==', canonical));
      const snap = await Promise.race([getDocs(q), timeoutPromise]) as any;
      
      let existingReg: { id: string; data: any } | null = null;

      if (!snap.empty) {
        existingReg = { id: snap.docs[0].id, data: snap.docs[0].data() };
        console.log(`[Registration] Mobile found: ${existingReg.id}`);
      } else {
        // Fallback check
        const q2 = query(regsRef, where('mobileNumber', '==', mobileNumber));
        const snap2 = await Promise.race([getDocs(q2), timeoutPromise]) as any;
        if (!snap2.empty) {
          existingReg = { id: snap2.docs[0].id, data: snap2.docs[0].data() };
          console.log(`[Registration] Mobile found (raw): ${existingReg.id}`);
        }
      }

      let registrationId = '';
      let existingData: any = null;
      let finalEmployeeCode = '';

      if (existingReg) {
        registrationId = (existingReg as any).id;
        existingData = (existingReg as any).data;
        finalEmployeeCode = existingData.employeeCode || registrationId;
        console.log(`[Registration] Using existing ID: ${registrationId}`);
      } else {
        // DO NOT use deviceId for identity restoration as per user request
        // Only use mobile number (handled above)
        console.log(`[Registration] Creating new employee record`);
        const counterRef = doc(activeDb, 'metadata', 'counters');
        finalEmployeeCode = await Promise.race([
          runTransaction(activeDb, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let newSeq = 1;
            if (counterDoc.exists() && counterDoc.data().employeeCodeSequence) {
              newSeq = counterDoc.data().employeeCodeSequence + 1;
            }
            transaction.set(counterRef, { employeeCodeSequence: newSeq }, { merge: true });
            return `EXFRNG${newSeq.toString().padStart(3, '0')}`;
          }),
          timeoutPromise
        ]) as string;
        registrationId = currentAuthUser?.uid || finalEmployeeCode;
      }

      const registrationData = {
        employeeCode: finalEmployeeCode,
        name,
        mobileNumber,
        canonicalMobile: canonical,
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

      await Promise.race([
        setDoc(doc(activeDb, 'registrations', registrationId), registrationData, { merge: true }),
        timeoutPromise
      ]);

      localStorage.setItem('registrationId', registrationId);
      try {
        localStorage.setItem('cached_registration_data', JSON.stringify(registrationData));
      } catch (e) {}

      setLocalRegId(registrationId);
      setStatus(registrationData.status as RegistrationStatus);
      setEmployeeData(registrationData);
      console.log(`[Registration] Success. Status set to: ${registrationData.status}`);
    } catch (err: any) {
      console.error('[Registration] Fatal Error:', err);
      throw err;
    }
  };

  const resetRegistration = () => {
    const empCode = employeeData?.employeeCode || '';
    const empId = employeeData?.id || '';
    const devId = localStorage.getItem('deviceId') || '';
    if (devId) {
      invalidateEmployeeDeviceToken(empCode, devId);
    }
    clearNotificationStorageForUser(empCode || empId);
    dispatchNotificationsUpdated();
    localStorage.removeItem('registrationId');
    localStorage.removeItem('cached_registration_data');
    setLocalRegId(null);
    setStatus('mobile_recovery');
    setRejectionReason(undefined);
    setEmployeeData(null);
    setRecoveryMobileInput('');
  };

  const contextValue = React.useMemo(
    () => ({
      status,
      rejectionReason,
      employeeData,
      submitRegistration,
      verifyMobileForRecovery,
      resetRegistration,
      authUser,
      recoveryMobileInput,
      setRecoveryMobileInput,
      recoveryError,
      recoveryLoading
    }),
    [
      status,
      rejectionReason,
      employeeData,
      verifyMobileForRecovery,
      authUser,
      recoveryMobileInput,
      recoveryError,
      recoveryLoading
    ]
  );

  return (
    <RegistrationContext.Provider value={contextValue}>
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
