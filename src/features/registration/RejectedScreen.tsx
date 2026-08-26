import React from 'react';
import { XCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const RejectedScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-[#EAF7EE] text-[#12332B] p-4 flex flex-col items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#173A32] border border-[#2A5B50] shadow-2xl rounded-[28px]">
        <div className="w-20 h-20 bg-[#EF6B73]/15 border border-[#EF6B73]/30 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <XCircle className="w-10 h-10 text-[#EF6B73]" />
        </div>
        <h2 className="text-xl font-black text-[#F4FAF7] mb-3 tracking-tight">Registration Rejected</h2>
        <p className="text-[#C7DAD3] text-xs mb-6 leading-relaxed">
          {rejectionReason || 'Your device registration was rejected by the administrator.'}
        </p>
        <Button onClick={resetRegistration} className="w-full bg-[#19C7C0] hover:bg-[#15ADA7] text-[#0A2923] font-bold rounded-2xl">
          Register Again
        </Button>
      </Card>
    </div>
  );
};
