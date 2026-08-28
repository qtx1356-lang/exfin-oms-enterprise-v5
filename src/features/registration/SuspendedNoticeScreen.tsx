import React from 'react';
import { AlertOctagon } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const SuspendedNoticeScreen: React.FC = () => {
  const { rejectionReason, resetRegistration } = useRegistration();

  return (
    <div className="min-h-screen bg-[#0F1025] text-[#F8F8FF] p-4 flex flex-col items-center justify-center font-sans">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#1E1F41]/80 border border-[#6366F1]/20 shadow-2xl rounded-3xl backdrop-blur-md">
        <div className="w-20 h-20 bg-[#F59E0B]/15 border border-[#F59E0B]/35 rounded-full flex items-center justify-center mb-6 shadow-xl">
          <AlertOctagon className="w-10 h-10 text-[#F59E0B]" />
        </div>
        <h2 className="text-xl font-black text-[#FFFFFF] mb-3 tracking-wide uppercase">Account Access Restricted</h2>
        <p className="text-[#C7C7C7] text-xs mb-6 leading-relaxed">
          {rejectionReason || 'Your account is currently suspended, blocked, or inactive. Please contact your administrator.'}
        </p>
        <Button onClick={resetRegistration} variant="outlined" className="w-full border-[#292929] text-[#C7C7C7] hover:border-[#D4AF37] hover:text-[#D4AF37] font-bold">
          Try Different Mobile Number
        </Button>
      </Card>
    </div>
  );
};
