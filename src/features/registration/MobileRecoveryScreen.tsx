import React from 'react';
import { Phone, Shield, ArrowRight, AlertTriangle, Sparkles } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const MobileRecoveryScreen: React.FC = () => {
  const { 
    verifyMobileForRecovery, 
    recoveryMobileInput, 
    setRecoveryMobileInput, 
    recoveryError, 
    recoveryLoading 
  } = useRegistration();

  const [localMobile, setLocalMobile] = React.useState(recoveryMobileInput || '');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localMobile || localMobile.trim().length < 10) {
      setLocalError('Please enter a valid 10-digit mobile number.');
      return;
    }
    setLocalError(null);
    setRecoveryMobileInput(localMobile);
    await verifyMobileForRecovery(localMobile);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] text-white p-4 flex flex-col justify-center items-center">
      <div className="max-w-md w-full space-y-6">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#7C3AED] rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(124,58,237,0.5)] border border-purple-400/30">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Welcome Back</h1>
          <p className="text-purple-300/80 text-xs">Enter your registered mobile number to restore your account.</p>
        </div>

        <Card className="p-6 bg-[#2D1B5A] border border-purple-500/30 shadow-2xl rounded-[28px] space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#A78BFA]" /> Mobile Number
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-purple-300 text-sm font-bold">+91</span>
                <input
                  type="tel"
                  value={localMobile}
                  onChange={(e) => setLocalMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="w-full pl-14 pr-4 py-3.5 rounded-2xl border border-purple-500/30 bg-[#211044] text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED] text-sm font-mono tracking-wider"
                  required
                  maxLength={10}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-purple-300/70 pt-1">
                Your mobile number is your persistent account recovery key across device reinstalls.
              </p>
            </div>

            {(localError || recoveryError) && (
              <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{localError || recoveryError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={recoveryLoading || localMobile.length < 10}
              className="w-full py-3.5 text-sm font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 bg-gradient-to-r from-[#7C3AED] to-[#9333EA]"
            >
              <span>{recoveryLoading ? 'Verifying Account...' : 'Continue'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </Card>

        <div className="text-center">
          <p className="text-[11px] text-purple-300/60 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> EXFIN OMS Secure Mobile Identity System
          </p>
        </div>

      </div>
    </div>
  );
};
