import React from 'react';
import { XCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const RejectedScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] text-white p-4 flex flex-col items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#2D1B5A] border border-red-500/30 shadow-2xl rounded-[28px]">
        <div className="w-20 h-20 bg-red-500/20 border border-red-500/30 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <XCircle className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-white mb-3 tracking-tight">Registration Rejected</h2>
        <p className="text-purple-200/90 text-xs mb-6 leading-relaxed">
          {rejectionReason || 'Your device registration was rejected by the administrator.'}
        </p>
        <Button onClick={resetRegistration} variant="outlined" className="w-full border-purple-400/30 text-purple-200">
          Register Again
        </Button>
      </Card>
    </div>
  );
};
