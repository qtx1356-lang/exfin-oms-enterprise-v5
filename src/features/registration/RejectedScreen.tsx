import React from 'react';
import { XCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const RejectedScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-surface p-4 flex flex-col items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center border-red-100">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-red-600" />
        </div>
        <h2 className="text-2xl font-medium text-on-surface mb-3">Registration Rejected</h2>
        <p className="text-on-surface-variant text-base mb-6">
          {rejectionReason || 'Your device registration was rejected by the administrator.'}
        </p>
        <Button onClick={resetRegistration} variant="outlined" className="w-full">
          Register Again
        </Button>
      </Card>
    </div>
  );
};
