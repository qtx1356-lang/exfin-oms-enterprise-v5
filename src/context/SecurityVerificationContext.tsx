import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { SensitiveActionId } from '../types/security';
import { isVerificationSessionValid } from '../services/security/sensitiveActionSecurity';
import { SecurityVerificationModal } from '../components/common/SecurityVerificationModal';
import { createAuditLog } from '../services/audit/auditService';

interface SecurityVerificationContextType {
  requestVerification: (actionId: SensitiveActionId, customDescription?: string) => Promise<boolean>;
}

const SecurityVerificationContext = createContext<SecurityVerificationContextType | undefined>(undefined);

export const SecurityVerificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    actionId: SensitiveActionId;
    customDescription?: string;
  }>({
    isOpen: false,
    actionId: 'EXPENSE_SUBMIT',
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const requestVerification = useCallback(
    async (actionId: SensitiveActionId, customDescription?: string): Promise<boolean> => {
      // 1. Check if recent verification is valid (5-minute session in memory)
      if (isVerificationSessionValid()) {
        return true;
      }

      // 2. Otherwise open security verification modal and wait for promise resolution
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setModalState({
          isOpen: true,
          actionId,
          customDescription,
        });
      });
    },
    []
  );

  const handleSuccess = () => {
    const actionId = modalState.actionId;
    setModalState((prev) => ({ ...prev, isOpen: false }));
    createAuditLog({
      action: 'SECURITY_REAUTH',
      actionCategory: 'Security',
      performedByUserId: 'user',
      performedByName: 'User',
      performedByRole: 'EMPLOYEE',
      description: 'User completed account security re-authentication',
      result: 'SUCCESS',
      source: 'EMPLOYEE_APP',
      metadata: { actionId },
    }).catch(() => {});
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
  };

  const handleCancel = () => {
    const actionId = modalState.actionId;
    setModalState((prev) => ({ ...prev, isOpen: false }));
    createAuditLog({
      action: 'SECURITY_REAUTH',
      actionCategory: 'Security',
      performedByUserId: 'user',
      performedByName: 'User',
      performedByRole: 'EMPLOYEE',
      description: 'User cancelled security verification prompt',
      result: 'FAILED',
      failureReason: 'User cancelled prompt',
      source: 'EMPLOYEE_APP',
      metadata: { actionId },
    }).catch(() => {});
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
  };

  return (
    <SecurityVerificationContext.Provider value={{ requestVerification }}>
      {children}
      <SecurityVerificationModal
        isOpen={modalState.isOpen}
        actionId={modalState.actionId}
        customDescription={modalState.customDescription}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
    </SecurityVerificationContext.Provider>
  );
};

export function useSecurityVerification() {
  const context = useContext(SecurityVerificationContext);
  if (!context) {
    throw new Error('useSecurityVerification must be used within a SecurityVerificationProvider');
  }
  return context;
}
