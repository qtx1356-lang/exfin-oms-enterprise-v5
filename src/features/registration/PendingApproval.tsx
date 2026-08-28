import React from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PendingApproval: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#080808] text-[#FFFFFF] p-4 flex flex-col items-center justify-center font-sans">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#151515] border border-[#292929] shadow-2xl rounded-3xl">
        <div className="w-20 h-20 bg-[#D4AF37]/15 border border-[#8F7425]/40 rounded-full flex items-center justify-center mb-6 shadow-xl">
          <Clock className="w-10 h-10 text-[#D4AF37]" />
        </div>
        <h2 className="text-xl font-black text-[#FFFFFF] mb-3 tracking-wide uppercase">Registration Submitted</h2>
        <p className="text-[#C7C7C7] text-xs leading-relaxed">
          Waiting for Admin Approval. You will be able to access the EXFIN OMS Executive Edition once your device is approved.
        </p>
      </Card>
    </div>
  );
};
