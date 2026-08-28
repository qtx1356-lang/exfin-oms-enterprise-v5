import React from 'react';
import { XCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const RejectedScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-[#0F1025] text-[#F8F8FF] p-4 flex flex-col items-center justify-center font-sans">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#1E1F41]/80 border border-[#6366F1]/20 shadow-2xl rounded-3xl backdrop-blur-md">
        <div className="w-20 h-20 bg-[#EF4444]/15 border border-[#EF4444]/35 rounded-full flex items-center justify-center mb-6 shadow-xl">
          <XCircle className="w-10 h-10 text-[#EF4444]" />
        </div>
        <h2 className="text-xl font-black text-[#FFFFFF] mb-3 tracking-wide uppercase">Registration Rejected</h2>
        <p className="text-[#C7C7C7] text-xs mb-6 leading-relaxed">
          {rejectionReason || 'Your device registration was rejected by the administrator.'}
        </p>
        <Button onClick={resetRegistration} className="w-full bg-[#D4AF37] hover:bg-[#E6C766] active:bg-[#9C7B20] text-black font-black uppercase tracking-wider rounded-2xl border border-[#E6C766]">
          Register Again
        </Button>
      </Card>
    </div>
  );
};
