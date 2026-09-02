import { useState, useCallback, useRef } from 'react';
import { SensitiveActionId } from '../../types/security';
import { useSecurityVerification } from '../../context/SecurityVerificationContext';
import { useAlertPopup } from '../../context/AlertPopupContext';

export function useSensitiveActionGuard() {
  const [isVerifying, setIsVerifying] = useState(false);
  const isExecutingRef = useRef(false);
  const { requestVerification } = useSecurityVerification();
  const { showAlert } = useAlertPopup();

  /**
   * Wraps a sensitive action with account security re-authentication verification.
   * Guarantees absolute UI recovery via try/catch/finally.
   */
  const executeSensitiveAction = useCallback(
    async (
      actionIdOrFn: SensitiveActionId | (() => Promise<void> | void),
      actionFnOrDesc?: (() => Promise<void> | void) | string,
      maybeActionFn?: () => Promise<void> | void
    ) => {
      if (isExecutingRef.current) return;

      let actionId: SensitiveActionId = 'EXPENSE_SUBMIT';
      let actionFn: (() => Promise<void> | void) | undefined;
      let customDesc: string | undefined;

      if (typeof actionIdOrFn === 'function') {
        actionFn = actionIdOrFn;
      } else {
        actionId = actionIdOrFn;
        if (typeof actionFnOrDesc === 'function') {
          actionFn = actionFnOrDesc;
        } else if (typeof actionFnOrDesc === 'string') {
          customDesc = actionFnOrDesc;
          actionFn = maybeActionFn;
        }
      }

      if (!actionFn) return;

      isExecutingRef.current = true;
      setIsVerifying(true);

      try {
        const isVerified = await requestVerification(actionId, customDesc);
        if (isVerified) {
          await actionFn();
        }
      } catch (err: any) {
        console.error('Unexpected error in sensitive action verification:', err);
        showAlert(
          'Action Warning',
          `An error occurred while executing the action: ${err?.message || 'Unknown error'}`,
          'error'
        );
      } finally {
        isExecutingRef.current = false;
        setIsVerifying(false); // ABSOLUTE ANTI-LOCK GUARANTEE
      }
    },
    [requestVerification, showAlert]
  );

  return {
    executeSensitiveAction,
    isVerifying,
  };
}

export const useSensitiveActionSecurity = useSensitiveActionGuard;
