import React, { useRef, useState } from 'react';
import { Camera, User, Phone, CheckCircle2, Shield } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const DeviceRegistration: React.FC = () => {
  const { submitRegistration, resetRegistration } = useRegistration();
  const [name, setName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [selfieBase64, setSelfieBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          setSelfieBase64(dataUrl);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !mobileNumber.trim() || !selfieBase64) {
      setError('Please fill in all fields and take a selfie.');
      return;
    }
    if (!navigator.onLine) {
      setError('Internet connection is required to submit device registration to the server. Please reconnect and try again.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await submitRegistration(name, mobileNumber, selfieBase64);
    } catch (err: any) {
      setError(err.message || 'Failed to submit registration');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--app-background)] text-[var(--text-primary)] p-4 flex flex-col justify-center items-center font-sans relative overflow-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--success)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

      <div className="max-w-md w-full space-y-6 relative z-10">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
            <Shield className="w-8 h-8 text-[var(--success)]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight uppercase text-[var(--text-primary)] aurora-text">EXFIN OMS</h1>
          <h2 className="text-sm font-bold tracking-[0.2em] text-[var(--success)] uppercase">Device Setup</h2>
          <p className="text-[var(--text-secondary)] text-xs font-medium max-w-[260px] mx-auto leading-relaxed mt-2"> Register your mobile device to access the <span className="text-[var(--text-primary)] font-bold">Executive Portal</span></p>
        </div>

        <div className="glass-card-elevated p-6 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 px-1">
                <User className="w-3.5 h-3.5 text-[var(--success)]" /> Full Identity Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-4 py-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--success)] focus:ring-1 focus:ring-[var(--success)]/30 text-sm transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 px-1">
                <Phone className="w-3.5 h-3.5 text-[var(--teal)]" /> Secure Mobile Number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full px-4 py-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--teal)] focus:ring-1 focus:ring-[var(--teal)]/30 text-sm transition-all"
                required
                maxLength={10}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2 px-1">
                <Camera className="w-3.5 h-3.5 text-[var(--cyan)]" /> Bio-Verification Selfie
              </label>
              
              <input
                type="file"
                accept="image/*"
                capture="user"
                ref={fileInputRef}
                onChange={handleCapture}
                className="hidden"
              />
              
              {!selfieBase64 ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[var(--border)] bg-[var(--surface-elevated)] rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-[var(--success)]/50 transition-all hover:bg-[var(--success)]/5"
                >
                  <div className="w-12 h-12 rounded-full bg-[var(--success)]/10 border border-[var(--success)]/20 flex items-center justify-center mb-3">
                    <Camera className="w-6 h-6 text-[var(--success)]" />
                  </div>
                  <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Secure Capture</span>
                  <span className="text-[10px] text-[var(--text-muted)] mt-1 font-medium italic">Biometric link required</span>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-[var(--border)] aspect-square max-h-56 mx-auto w-full group">
                  <img src={selfieBase64} alt="Selfie preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      type="button" 
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-white/10 backdrop-blur-md border border-[var(--border)] text-white rounded-xl text-xs font-black uppercase tracking-widest"
                    >
                      Retake Photo
                    </button>
                  </div>
                  <div className="absolute top-3 right-3 bg-[var(--success)] text-white p-1.5 rounded-full shadow-lg border border-[var(--border)]">
                    <CheckCircle2 className="w-5 h-5 stroke-[3]" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] rounded-2xl text-xs font-bold text-center animate-shake">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name || !mobileNumber || !selfieBase64}
              className="w-full py-4 text-xs font-black uppercase tracking-[0.2em] bg-[var(--button-primary)] text-white rounded-2xl shadow-xl mt-2 cursor-pointer border border-[var(--border)] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing Setup...' : 'Register Device'}
            </button>

            <button
              type="button"
              onClick={() => {
                resetRegistration();
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="w-full py-3 bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] text-[10px] font-black rounded-xl border border-[var(--danger)]/20 transition-all mt-3 cursor-pointer uppercase tracking-[0.1em]"
            >
              Reset Environment
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
