import React from 'react';
import { Clock } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const PendingApproval: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] text-white p-4 flex flex-col items-center justify-center">
      <Card className="max-w-md w-full p-8 text-center flex flex-col items-center bg-[#2D1B5A] border border-purple-500/30 shadow-2xl rounded-[28px]">
        <div className="w-20 h-20 bg-amber-500/20 border border-amber-500/30 rounded-full flex items-center justify-center mb-6 shadow-lg">
          <Clock className="w-10 h-10 text-amber-300" />
        </div>
        <h2 className="text-xl font-black text-white mb-3 tracking-tight">Registration Submitted</h2>
        <p className="text-purple-200/90 text-xs leading-relaxed">
          Waiting for Admin Approval. You will be able to access the app once your device is approved.
        </p>
      </Card>
    </div>
  );
};
