import React from 'react';
import { PinVerificationModal } from './PinVerificationModal';
import { SensitiveActionId } from '../../types/security';

interface SecurityVerificationModalProps {
  isOpen: boolean;
  actionId: SensitiveActionId;
  customDescription?: string;
  onSuccess: () => void;
  onCancel: () => void;
  employeeId?: string;
}

export const SecurityVerificationModal: React.FC<SecurityVerificationModalProps> = ({
  isOpen,
  actionId,
  customDescription,
  onSuccess,
  onCancel,
  employeeId = 'default_employee',
}) => {
  return (
    <PinVerificationModal
      isOpen={isOpen}
      actionId={actionId}
      customDescription={customDescription}
      employeeId={employeeId}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />
  );
};
