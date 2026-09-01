import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import {
  isBiometricPlatformSupported,
  getStoredBiometricCredential,
  enrollBiometricCredential,
  authenticateBiometricCredential,
  removeBiometricCredential,
  BIOMETRIC_UNLOCK_DURATION_MS,
  BACKGROUND_LOCK_TIMEOUT_MS,
} from '../services/security/biometricService';
import { BiometricCredentialMetadata, BiometricResult } from '../types/biometric';
import { useRegistration } from './RegistrationContext';
import { useAdminAuth } from './AdminAuthContext';

interface BiometricSecurityContextType {
  isUnlocked: boolean;
  isSupported: boolean | null;
  isEnrolled: boolean;
  activeUserId: string;
  activeUserDisplayName: string;
  credentialMetadata: BiometricCredentialMetadata | null;
  authenticate: () => Promise<BiometricResult>;
  enroll: () => Promise<BiometricResult>;
  resetEnrollment: () => void;
  lock: () => void;
  unlockWithFallback: () => void;
  refreshStatus: () => Promise<void>;
}

const BiometricSecurityContext = createContext<BiometricSecurityContextType | undefined>(undefined);

export const BiometricSecurityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { employeeData, authUser } = useRegistration();
  const { user: adminUser, loginId: adminLoginId } = useAdminAuth();

  // Determine the active user identity (Employee or Admin)
  const activeUserId = (
    adminLoginId ||
    adminUser?.uid ||
    employeeData?.employeeCode ||
    employeeData?.id ||
    authUser?.uid ||
    localStorage.getItem('registrationId') ||
    ''
  ).trim();

  const activeUserDisplayName = (
    adminLoginId ||
    employeeData?.name ||
    employeeData?.employeeCode ||
    'Authorized User'
  ).trim();

  // In-memory security states (Never persisted to localStorage as raw boolean)
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [lastUnlockedAt, setLastUnlockedAt] = useState<number | null>(null);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [credentialMetadata, setCredentialMetadata] = useState<BiometricCredentialMetadata | null>(null);

  const lastBackgroundTimeRef = useRef<number | null>(null);

  // Check hardware/browser support on mount
  useEffect(() => {
    let isMounted = true;
    isBiometricPlatformSupported()
      .then((supported) => {
        if (isMounted) {
          setIsSupported(supported);
        }
      })
      .catch(() => {
        if (isMounted) setIsSupported(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Sync stored credential metadata whenever activeUserId changes
  const refreshStatus = useCallback(async () => {
    if (!activeUserId) {
      setCredentialMetadata(null);
      return;
    }
    const cred = getStoredBiometricCredential(activeUserId);
    setCredentialMetadata(cred);
  }, [activeUserId]);

  useEffect(() => {
    refreshStatus();
  }, [activeUserId, refreshStatus]);

  // Periodic expiration checker for in-memory session (5-minute window)
  useEffect(() => {
    if (!isUnlocked || !lastUnlockedAt) return;

    const interval = setInterval(() => {
      if (Date.now() - lastUnlockedAt >= BIOMETRIC_UNLOCK_DURATION_MS) {
        setIsUnlocked(false);
        setLastUnlockedAt(null);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [isUnlocked, lastUnlockedAt]);

  // App Lifecycle / Visibility / Background Lock Handler
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // App went to background
        lastBackgroundTimeRef.current = Date.now();
      } else {
        // App returned to foreground
        const bgTime = lastBackgroundTimeRef.current;
        if (bgTime) {
          const bgDuration = Date.now() - bgTime;
          // If backgrounded for >= 60 seconds, lock immediately
          if (bgDuration >= BACKGROUND_LOCK_TIMEOUT_MS) {
            setIsUnlocked(false);
            setLastUnlockedAt(null);
          } else if (lastUnlockedAt && Date.now() - lastUnlockedAt >= BIOMETRIC_UNLOCK_DURATION_MS) {
            // Also check session expiration
            setIsUnlocked(false);
            setLastUnlockedAt(null);
          }
        }
        lastBackgroundTimeRef.current = null;
      }
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        // Page was restored from bfcache, evaluate lock
        const bgTime = lastBackgroundTimeRef.current;
        if (bgTime && Date.now() - bgTime >= BACKGROUND_LOCK_TIMEOUT_MS) {
          setIsUnlocked(false);
          setLastUnlockedAt(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [lastUnlockedAt]);

  // Explicit Lock function
  const lock = useCallback(() => {
    setIsUnlocked(false);
    setLastUnlockedAt(null);
  }, []);

  // Invalidate biometric unlock when user logs out or user changes
  useEffect(() => {
    if (!activeUserId) {
      lock();
    }
  }, [activeUserId, lock]);

  // Authenticate user via WebAuthn
  const authenticate = useCallback(async (): Promise<BiometricResult> => {
    if (!activeUserId) {
      return { success: false, error: 'User identity is required.' };
    }

    const result = await authenticateBiometricCredential(activeUserId);
    if (result.success) {
      setIsUnlocked(true);
      setLastUnlockedAt(Date.now());
      refreshStatus();
    }
    return result;
  }, [activeUserId, refreshStatus]);

  // Enroll user biometric credential
  const enroll = useCallback(async (): Promise<BiometricResult> => {
    if (!activeUserId) {
      return { success: false, error: 'User identity is required.' };
    }

    const result = await enrollBiometricCredential(activeUserId, activeUserDisplayName);
    if (result.success) {
      setIsUnlocked(true);
      setLastUnlockedAt(Date.now());
      refreshStatus();
    }
    return result;
  }, [activeUserId, activeUserDisplayName, refreshStatus]);

  // Reset / Re-enroll
  const resetEnrollment = useCallback(() => {
    if (activeUserId) {
      removeBiometricCredential(activeUserId);
      setCredentialMetadata(null);
      lock();
    }
  }, [activeUserId, lock]);

  // Fallback unlock (only for verified unsupported environments or explicit fallbacks)
  const unlockWithFallback = useCallback(() => {
    setIsUnlocked(true);
    setLastUnlockedAt(Date.now());
  }, []);

  const isEnrolled = !!credentialMetadata;

  return (
    <BiometricSecurityContext.Provider
      value={{
        isUnlocked,
        isSupported,
        isEnrolled,
        activeUserId,
        activeUserDisplayName,
        credentialMetadata,
        authenticate,
        enroll,
        resetEnrollment,
        lock,
        unlockWithFallback,
        refreshStatus,
      }}
    >
      {children}
    </BiometricSecurityContext.Provider>
  );
};

export const useBiometricSecurity = (): BiometricSecurityContextType => {
  const context = useContext(BiometricSecurityContext);
  if (!context) {
    throw new Error('useBiometricSecurity must be used within a BiometricSecurityProvider');
  }
  return context;
};
