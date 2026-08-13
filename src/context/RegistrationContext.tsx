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
  const [status, setStatus] = useState<RegistrationStatus>('loading');
  const [rejectionReason, setRejectionReason] = useState<string>();
  const [employeeData, setEmployeeData] = useState<any>(null);
  const [localRegId, setLocalRegId] = useState<string | null>(localStorage.getItem('registrationId'));
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
      logStartupTag('REGISTRATION_CHECK_START', 'Checking registration via local session / mobile recovery');

      if (!db) {
        if (isMounted) setStatus('unregistered');
        return;
      }

      try {
        const { deviceId } = await getDeviceInfo();
        const savedRegId = localStorage.getItem('registrationId');
        
        if (savedRegId) {
          // Verify saved registration
          const regDocRef = doc(db, 'registrations', savedRegId);
          const regSnap = await getDoc(regDocRef);
          if (regSnap.exists()) {
            const data = regSnap.data();
            const regStatus = data.status || 'Pending Approval';
            
            // Check status restrictions
            if (regStatus === 'Suspended' || regStatus === 'Blocked' || regStatus === 'INACTIVE' || regStatus === 'Rejected') {
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
            unsubSnapshot = onSnapshot(regDocRef, (docSnap) => {
              if (!isMounted) return;
              if (docSnap.exists()) {
                const liveData = docSnap.data();
                const liveStatus = liveData.status || 'Pending Approval';
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
            return;
          }
        }

        // No saved registration ID -> Prompt "Welcome Back" mobile number recovery
        if (isMounted) {
          setStatus('mobile_recovery');
        }

      } catch (err) {
        console.error('Registration init error:', err);
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
    if (!db) return false;
    const canonical = normalizeMobile(mobile);
    if (!canonical || canonical.length < 10) {
      setRecoveryError('Please enter a valid 10-digit mobile number.');
      return false;
    }

    setRecoveryLoading(true);
    setRecoveryError(null);

    try {
      const regsRef = collection(db, 'registrations');
      const snap = await getDocs(regsRef);
      
      let matchedReg: { id: string; data: any } | null = null;
      
      snap.forEach(d => {
        const data = d.data();
        const regMobile = normalizeMobile(data.mobileNumber || '');
        if (regMobile === canonical) {
          matchedReg = { id: d.id, data };
        }
      });

      if (!matchedReg) {
        // No match found -> Proceed to normal registration
        setRecoveryLoading(false);
        setStatus('unregistered');
        return false;
      }

      const { id: regId, data: regData } = matchedReg as { id: string; data: any };
      const regStatus = regData.status || 'Pending Approval';

      // Check if completely deleted (if marked deleted)
      if (regData.isDeleted || regStatus === 'Deleted') {
        setRecoveryError('This account was completely deleted. Please register as a new employee.');
        setRecoveryLoading(false);
        setStatus('unregistered');
        return false;
      }

      // Check Status
      if (regStatus === 'Suspended' || regStatus === 'Blocked' || regStatus === 'INACTIVE' || regStatus === 'Rejected') {
        setStatus('suspended_notice');
        setRejectionReason(regData.rejectionReason || `Your account is currently ${regStatus}. Please contact your administrator.`);
        setEmployeeData(regData);
        setRecoveryLoading(false);
        return false;
      }

      if (regStatus === 'Pending Approval') {
        localStorage.setItem('registrationId', regId);
        setLocalRegId(regId);
        setEmployeeData(regData);
        setStatus('Pending Approval');
        setRecoveryLoading(false);
        return true;
      }

      // APPROVED RECOVERY SUCCESS!
      const { deviceId, deviceModel } = await getDeviceInfo();
      const regDocRef = doc(db, 'registrations', regId);
      
      // Update session and device association without changing identity key (Mobile Number)
      await updateDoc(regDocRef, {
        deviceId,
        deviceModel,
        lastSyncTime: new Date().toISOString(),
        lastRestoredAt: new Date().toISOString()
      });

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

      setRecoveryLoading(false);
      return true;

    } catch (err: any) {
      console.error('Mobile recovery error:', err);
      setRecoveryError(err.message || 'Failed to verify mobile number.');
      setRecoveryLoading(false);
      return false;
    }
  };

  const submitRegistration = async (name: string, mobileNumber: string, selfieBase64: string) => {
    if (!db) throw new Error('Firestore not initialized');
    
    let currentAuthUser = auth?.currentUser || null;
    if (!currentAuthUser && auth) {
      try {
        const credential = await signInAnonymously(auth);
        currentAuthUser = credential.user;
      } catch (authErr: any) {}
    }

    const { deviceId, deviceModel, androidVersion, appVersion } = await getDeviceInfo();
    const canonical = normalizeMobile(mobileNumber);
    
    // Check if mobile number already exists across registrations
    const regsRef = collection(db, 'registrations');
    const snap = await getDocs(regsRef);
    let existingReg: { id: string; data: any } | null = null;

    snap.forEach(d => {
      const data = d.data();
      if (normalizeMobile(data.mobileNumber || '') === canonical) {
        existingReg = { id: d.id, data: d.data() };
      }
    });

    let registrationId = '';
    let existingData: any = null;
    let finalEmployeeCode = '';

    if (existingReg) {
      registrationId = (existingReg as any).id;
      existingData = (existingReg as any).data;
      finalEmployeeCode = existingData.employeeCode || registrationId;
    } else {
      // Check for deviceId registration if mobile not found
      const qDev = query(regsRef, where('deviceId', '==', deviceId));
      const devSnap = await getDocs(qDev);
      if (!devSnap.empty) {
        registrationId = devSnap.docs[0].id;
        existingData = devSnap.docs[0].data();
        finalEmployeeCode = existingData.employeeCode || registrationId;
      } else {
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

    await setDoc(doc(db, 'registrations', registrationId), registrationData, { merge: true });

    localStorage.setItem('registrationId', registrationId);
    try {
      localStorage.setItem('cached_registration_data', JSON.stringify(registrationData));
    } catch (e) {}

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
    setStatus('mobile_recovery');
    setRejectionReason(undefined);
    setEmployeeData(null);
    setRecoveryMobileInput('');
  };

  return (
    <RegistrationContext.Provider value={{ 
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
    }}>
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
