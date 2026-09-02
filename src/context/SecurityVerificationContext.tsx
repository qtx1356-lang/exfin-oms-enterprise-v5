import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { SensitiveActionId } from '../types/security';
import {
  isPinEnabled,
  isPinSessionValid,
  getEffectiveEmployeeId,
} from '../services/security/securityPinService';
import { PinVerificationModal } from '../components/common/PinVerificationModal';
import { SecurityPinSettingsModal } from '../components/common/SecurityPinSettingsModal';
import { useRegistration } from './RegistrationContext';
import { useAdminAuth } from './AdminAuthContext';
import { createAuditLog } from '../services/audit/auditService';

interface SecurityVerificationContextType {
  requestVerification: (actionId: SensitiveActionId, customDescription?: string) => Promise<boolean>;
  openPinSettings: () => void;
  isPinConfigured: boolean;
}

const SecurityVerificationContext = createContext<SecurityVerificationContextType | undefined>(undefined);

export const SecurityVerificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();

  const employeeId = getEffectiveEmployeeId(employeeData, adminUser);
  const isPinConfigured = isPinEnabled(employeeId);

  // Verification modal state
  const [verificationModalState, setVerificationModalState] = useState<{
    isOpen: boolean;
    actionId: SensitiveActionId;
    customDescription?: string;
  }>({
    isOpen: false,
    actionId: 'EXPENSE_SUBMIT',
  });

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const requestVerification = useCallback(
    async (actionId: SensitiveActionId, customDescription?: string): Promise<boolean> => {
      const empId = getEffectiveEmployeeId(employeeData, adminUser);

      // 1. If PIN is NOT enabled for this employee, allow action directly without modal
      if (!isPinEnabled(empId)) {
        return true;
      }

      // 2. If valid 5-minute in-memory verification session exists, allow action directly
      if (isPinSessionValid(empId)) {
        return true;
      }

      // 3. Otherwise open PIN verification modal and wait for user PIN input
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setVerificationModalState({
          isOpen: true,
          actionId,
          customDescription,
        });
      });
    },
    [employeeData, adminUser]
  );

  const openPinSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const handleSuccess = () => {
    const actionId = verificationModalState.actionId;
    setVerificationModalState((prev) => ({ ...prev, isOpen: false }));
    createAuditLog({
      action: 'SECURITY_REAUTH',
      actionCategory: 'Security',
      performedByUserId: employeeId,
      performedByName: employeeData?.name || 'User',
      performedByRole: 'EMPLOYEE',
      description: 'User verified Security PIN for sensitive action',
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
    const actionId = verificationModalState.actionId;
    setVerificationModalState((prev) => ({ ...prev, isOpen: false }));
    createAuditLog({
      action: 'SECURITY_REAUTH',
      actionCategory: 'Security',
      performedByUserId: employeeId,
      performedByName: employeeData?.name || 'User',
      performedByRole: 'EMPLOYEE',
      description: 'User cancelled Security PIN prompt',
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
    <SecurityVerificationContext.Provider
      value={{
        requestVerification,
        openPinSettings,
        isPinConfigured,
      }}
    >
      {children}
      <PinVerificationModal
        isOpen={verificationModalState.isOpen}
        actionId={verificationModalState.actionId}
        customDescription={verificationModalState.customDescription}
        employeeId={employeeId}
        onSuccess={handleSuccess}
        onCancel={handleCancel}
      />
      <SecurityPinSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        employeeId={employeeId}
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
