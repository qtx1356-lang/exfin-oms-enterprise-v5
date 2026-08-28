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
    if (!navigator.onLine) {
      setLocalError('Internet connection is required to verify your mobile number with the server. Please reconnect.');
      return;
    }
    setLocalError(null);
    setRecoveryMobileInput(localMobile);
    await verifyMobileForRecovery(localMobile);
  };

  return (
    <div className="min-h-screen bg-[#080808] text-[#FFFFFF] p-4 flex flex-col justify-center items-center font-sans">
      <div className="max-w-md w-full space-y-6">
        
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#151515] rounded-2xl flex items-center justify-center mx-auto shadow-2xl border border-[#8F7425]/40">
            <Shield className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <h1 className="text-2xl font-black tracking-wider uppercase text-[#FFFFFF]">EXFIN OMS</h1>
          <h2 className="text-sm font-bold tracking-widest text-[#D4AF37] uppercase">ACCOUNT RECOVERY</h2>
          <p className="text-[#8A8A8A] text-xs">Enter your registered mobile number to restore your executive account.</p>
        </div>

        <Card className="p-6 bg-[#151515] border border-[#292929] shadow-2xl rounded-3xl space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7C7C7] uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#D4AF37]" /> Mobile Number
              </label>
              <div className="relative">
                <span className="absolute left-4 top-3.5 text-[#8A8A8A] text-sm font-bold">+91</span>
                <input
                  type="tel"
                  value={localMobile}
                  onChange={(e) => setLocalMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="9876543210"
                  className="w-full pl-14 pr-4 py-3.5 rounded-2xl border border-[#292929] bg-[#121212] text-[#FFFFFF] placeholder-[#8A8A8A] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] text-sm font-mono tracking-wider"
                  required
                  maxLength={10}
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-[#8A8A8A] pt-1">
                Your mobile number is your persistent account recovery key across device reinstalls.
              </p>
            </div>

            {(localError || recoveryError) && (
              <div className="p-3 bg-[#EF4444]/15 border border-[#EF4444]/35 text-[#EF4444] rounded-2xl text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-[#EF4444]" />
                <span>{localError || recoveryError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={recoveryLoading || localMobile.length < 10}
              className="w-full py-3.5 text-sm font-black uppercase tracking-wider rounded-2xl shadow-xl flex items-center justify-center gap-2 bg-[#D4AF37] hover:bg-[#E6C766] active:bg-[#9C7B20] text-black border border-[#E6C766]"
            >
              <span>{recoveryLoading ? 'Verifying Account...' : 'Continue'}</span>
              <ArrowRight className="w-4 h-4 text-black" />
            </Button>
          </form>
        </Card>

        <div className="text-center">
          <p className="text-[11px] text-[#8A8A8A] flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3 text-[#D4AF37]" /> EXFIN OMS Executive Identity Engine
          </p>
        </div>

      </div>
    </div>
  );
};
