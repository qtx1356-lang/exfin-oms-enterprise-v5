import React from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PendingApproval: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0F1025] text-[#F8F8FF] p-4 flex flex-col items-center justify-center font-sans">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#1E1F41]/80 border border-[#6366F1]/20 shadow-2xl rounded-3xl backdrop-blur-md">
        <div className="w-20 h-20 bg-[#6366F1]/15 border border-[#6366F1]/30 rounded-full flex items-center justify-center mb-6 shadow-xl">
          <Clock className="w-10 h-10 text-[#818CF8]" />
        </div>
        <h2 className="text-xl font-black text-[#F8F8FF] mb-3 tracking-wide uppercase">Registration Submitted</h2>
        <p className="text-[#B9B9D0] text-xs leading-relaxed">
          Waiting for Admin Approval. You will be able to access the EXFIN OMS Executive Edition once your device is approved.
        </p>
      </Card>
    </div>
  );
};
