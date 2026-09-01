import { useState, useCallback, useRef } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { getStoredBiometricCredential, authenticateBiometricCredential, getBiometricDiagnostics, enrollBiometricCredential } from './biometricService';
import { useAlertPopup } from '../../context/AlertPopupContext';

export function useSensitiveActionGuard() {
  const { authUser, employeeData } = useRegistration();
  const userId = employeeData?.employeeId || authUser?.uid || '';
  const userDisplayName = employeeData?.name || 'User';
  const [isVerifying, setIsVerifying] = useState(false);
  const isExecutingRef = useRef(false);
  const { showAlert } = useAlertPopup();

  /**
   * Wraps a sensitive action with biometric verification.
   * Enrolls the user if they don't have a credential yet.
   * 
   * @param actionFn The function to execute after successful verification.
   * @returns A function to be attached to the button onClick handler.
   */
  const executeSensitiveAction = useCallback(
    async (actionFn: () => Promise<void> | void) => {
      if (isExecutingRef.current) return;
      
      if (!userId) {
        await actionFn();
        return;
      }

      isExecutingRef.current = true;
      setIsVerifying(true);
      try {
        const diag = await getBiometricDiagnostics();
        if (!diag.isPlatformAuthAvailable || !diag.hasPublicKeyCredential) {
          showAlert(
            'Authentication Unavailable',
            `Your phone's biometric/device authentication is unavailable in this environment.\n\nReason: ${diag.diagnosticMessage}`,
            'error'
          );
          return;
        }

        const isEnrolled = !!getStoredBiometricCredential(userId);
        
        let result;
        if (!isEnrolled) {
          // Attempt to enroll if not already enrolled. Registration inherently verifies the user.
          result = await enrollBiometricCredential(userId, userDisplayName);
        } else {
          // Authenticate using the existing credential.
          result = await authenticateBiometricCredential(userId);
        }

        if (result.success) {
          // Verification (or enrollment) passed, execute action
          await actionFn();
        } else {
          // Verification failed or cancelled, do nothing.
          console.warn('Biometric verification failed or cancelled:', result.error);
          showAlert(
            'Authentication Cancelled',
            `Fingerprint or device authentication was cancelled or failed.\n\nPlease try again.\n(${result.error})`,
            'error'
          );
        }
      } catch (err: any) {
        console.error('Unexpected error in biometric verification:', err);
        showAlert(
          'Authentication Error',
          `An unexpected error occurred during device verification: ${err.message}`,
          'error'
        );
      } finally {
        isExecutingRef.current = false;
        setIsVerifying(false);
      }
    },
    [userId, userDisplayName, showAlert]
  );

  return {
    executeSensitiveAction,
    isVerifying,
  };
}


