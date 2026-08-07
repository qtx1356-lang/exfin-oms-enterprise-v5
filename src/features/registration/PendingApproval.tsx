import React from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PendingApproval: React.FC = () => {
  return (
    <div className="min-h-screen bg-surface p-4 flex flex-col items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center">
        <div className="w-20 h-20 bg-secondary-container rounded-full flex items-center justify-center mb-6">
          <Clock className="w-10 h-10 text-on-secondary-container" />
        </div>
        <h2 className="text-2xl font-medium text-on-surface mb-3">Registration Submitted Successfully</h2>
        <p className="text-on-surface-variant text-base">
          Waiting for Admin Approval. You will be able to access the app once your device is approved.
        </p>
      </Card>
    </div>
  );
};
