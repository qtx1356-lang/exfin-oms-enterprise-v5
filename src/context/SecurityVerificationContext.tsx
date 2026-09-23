import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { SensitiveActionId } from '../types/security';
import {
  isPinEnabled,
  getEffectiveEmployeeId,
  getLastProcessedResetId,
  invalidateSecurityPinFromRemoteReset,
} from '../services/security/securityPinService';
import { syncLocalPinStatusToRemote } from '../services/security/adminPinResetService';
import { PinVerificationModal } from '../components/common/PinVerificationModal';
import { SecurityPinSettingsModal } from '../components/common/SecurityPinSettingsModal';
import { PinResetNoticeModal } from '../components/common/PinResetNoticeModal';
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

  // Remote reset notice modal state
  const [showResetNoticeModal, setShowResetNoticeModal] = useState(false);
  const [resetNoticeData, setResetNoticeData] = useState<{
    adminName?: string;
    resetAt?: string;
  }>({});

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  // Detect remote reset signal from Firestore
  useEffect(() => {
    if (!employeeData || !employeeId) return;

    // Verify reset target
    const effectiveCode = employeeData.employeeCode || employeeData.id || employeeData.uid;
    const isTargetEmployee =
      employeeId === effectiveCode ||
      employeeId === employeeData.id ||
      employeeId === employeeData.uid;

    if (!isTargetEmployee) return;

    const remoteResetStatus = employeeData.securityPinResetStatus;
    const remoteResetId = employeeData.securityPinResetRequestId;

    // Check for pending remote reset
    if (remoteResetStatus === 'PENDING' && remoteResetId) {
      const lastProcessed = getLastProcessedResetId(employeeId);

      // Process only once per device
      if (lastProcessed !== remoteResetId) {
        invalidateSecurityPinFromRemoteReset(employeeId, remoteResetId);

        setResetNoticeData({
          adminName: employeeData.securityPinResetBy,
          resetAt: employeeData.securityPinResetAt,
        });
        setShowResetNoticeModal(true);
      }
    } else if (remoteResetStatus !== 'PENDING' && isPinEnabled(employeeId)) {
      // Sync local PIN presence flag to remote registration if not already recorded
      if (employeeData.hasSecurityPinConfigured !== true && employeeData.id) {
        syncLocalPinStatusToRemote(employeeData.id, true);
      }
    }
  }, [employeeData, employeeId]);

  const requestVerification = useCallback(
    async (actionId: SensitiveActionId, customDescription?: string): Promise<boolean> => {
      const empId = getEffectiveEmployeeId(employeeData, adminUser);

      // 1. If remote PIN reset is pending, block sensitive action and prompt employee to set new PIN
      if (employeeData?.securityPinResetStatus === 'PENDING') {
        setResetNoticeData({
          adminName: employeeData.securityPinResetBy,
          resetAt: employeeData.securityPinResetAt,
        });
        setShowResetNoticeModal(true);
        return false;
      }

      // 2. If PIN is NOT enabled for this employee, allow action directly
      if (!isPinEnabled(empId)) {
        return true;
      }

      // 3. PIN is enabled: STRICT RULE — Every sensitive action requires PIN verification every time.
      // There is NO verification session, cache, or grace period.
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
        employeeDocId={employeeData?.id}
        employeeCode={employeeData?.employeeCode || employeeId}
        employeeName={employeeData?.name}
        isRemoteResetPending={employeeData?.securityPinResetStatus === 'PENDING'}
      />
      <PinResetNoticeModal
        isOpen={showResetNoticeModal}
        onClose={() => setShowResetNoticeModal(false)}
        onOpenSetup={() => {
          setShowResetNoticeModal(false);
          setIsSettingsOpen(true);
        }}
        adminName={resetNoticeData.adminName}
        resetAt={resetNoticeData.resetAt}
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
