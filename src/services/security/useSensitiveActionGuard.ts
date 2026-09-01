import { useState, useCallback } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { getStoredBiometricCredential, authenticateBiometricCredential } from './biometricService';

export function useSensitiveActionGuard() {
  const { authUser, employeeData } = useRegistration();
  const userId = employeeData?.employeeId || authUser?.uid || '';
  const [isVerifying, setIsVerifying] = useState(false);

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
        const result = await authenticateBiometricCredential(userId);
        if (result.success) {
          // Verification passed, execute action
          await actionFn();
        } else {
          // Verification failed or cancelled, do nothing.
          // The error message is currently swallowed or could be returned/alerted.
          // For now, we just silently fail or we could show a toast.
          console.warn('Biometric verification failed or cancelled:', result.error);
          alert(`Device verification failed: ${result.error}`);
        }
      } catch (err) {
        console.error('Unexpected error in biometric verification:', err);
      } finally {
        setIsVerifying(false);
      }
    },
    [userId]
  );

  return {
    executeSensitiveAction,
    isVerifying,
  };
}
