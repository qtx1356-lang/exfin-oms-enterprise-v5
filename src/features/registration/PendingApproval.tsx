import React from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PendingApproval: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#EAF7EE] text-[#12332B] p-4 flex flex-col items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#173A32] border border-[#2A5B50] shadow-2xl rounded-[28px]">
        <div className="w-20 h-20 bg-[#F2C75C]/15 border border-[#F2C75C]/30 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <Clock className="w-10 h-10 text-[#F2C75C]" />
        </div>
        <h2 className="text-xl font-black text-[#F4FAF7] mb-3 tracking-tight">Registration Submitted</h2>
        <p className="text-[#C7DAD3] text-xs leading-relaxed">
          Waiting for Admin Approval. You will be able to access the app once your device is approved.
        </p>
      </Card>
    </div>
  );
};
