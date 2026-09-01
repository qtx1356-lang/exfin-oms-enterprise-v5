import { useState, useCallback } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { getStoredBiometricCredential, authenticateBiometricCredential, getBiometricDiagnostics } from './biometricService';
import { useAlertPopup } from '../../context/AlertPopupContext';

export function useSensitiveActionGuard() {
  const { authUser, employeeData } = useRegistration();
  const userId = employeeData?.employeeId || authUser?.uid || '';
  const [isVerifying, setIsVerifying] = useState(false);
  const { showAlert } = useAlertPopup();

  /**
   * Wraps a sensitive action with biometric verification if the user is enrolled.
   * If not enrolled, it just proceeds with the action (optional enrollment).
   * 
   * @param actionFn The function to execute after successful verification.
   * @returns A function to be attached to the button onClick handler.
   */
  const executeSensitiveAction = useCallback(
    async (actionFn: () => Promise<void> | void) => {
      if (!userId) {
        await actionFn();
        return;
      }

      const isEnrolled = !!getStoredBiometricCredential(userId);

      if (!isEnrolled) {
        // Biometric not enabled, proceed directly.
        await actionFn();
        return;
      }

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

        const result = await authenticateBiometricCredential(userId);
        if (result.success) {
          // Verification passed, execute action
          await actionFn();
        } else {
          // Verification failed or cancelled, do nothing.
          console.warn('Biometric verification failed or cancelled:', result.error);
          showAlert(
            'Authentication Cancelled',
            `Fingerprint or device authentication was cancelled.\n\nPlease try again.\n(${result.error})`,
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
        setIsVerifying(false);
      }
    },
    [userId, showAlert]
  );

  return {
    executeSensitiveAction,
    isVerifying,
  };
}
