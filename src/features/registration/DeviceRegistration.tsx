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
    <div className="min-h-screen bg-[#0F1025] text-[#F8F8FF] p-4 flex flex-col justify-center items-center font-sans">
      <div className="max-w-md w-full space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#151515] border border-[#8F7425]/40 rounded-2xl flex items-center justify-center mx-auto shadow-2xl">
            <Shield className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <h1 className="text-2xl font-black tracking-wider uppercase text-[#FFFFFF]">EXFIN OMS</h1>
          <h2 className="text-sm font-bold tracking-widest text-[#D4AF37] uppercase">REGISTER DEVICE</h2>
          <p className="text-[#8A8A8A] text-xs font-semibold">Register your mobile device to access EXFIN OMS Executive Portal</p>
        </div>

        <Card className="p-6 bg-[#151515] border border-[#292929] shadow-2xl rounded-3xl text-[#FFFFFF]">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7C7C7] uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#D4AF37]" /> Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-4 py-3 rounded-2xl border border-[#292929] bg-[#121212] text-[#FFFFFF] placeholder-[#8A8A8A] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7C7C7] uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#D4AF37]" /> Mobile Number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full px-4 py-3 rounded-2xl border border-[#292929] bg-[#121212] text-[#FFFFFF] placeholder-[#8A8A8A] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] text-sm"
                required
                maxLength={10}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7C7C7] uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#D4AF37]" /> Verification Selfie
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
                  className="border-2 border-dashed border-[#292929] bg-[#121212] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#1B1B1B] border border-[#292929] flex items-center justify-center mb-2">
                    <Camera className="w-6 h-6 text-[#D4AF37]" />
                  </div>
                  <span className="text-xs font-bold text-[#FFFFFF]">Tap to take selfie</span>
                  <span className="text-[10px] text-[#8A8A8A] mt-0.5">Camera verification required</span>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-[#292929] aspect-square max-h-56 mx-auto w-full">
                  <img src={selfieBase64} alt="Selfie preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button type="button" variant="tonal" onClick={() => fileInputRef.current?.click()}>
                      Retake Photo
                    </Button>
                  </div>
                  <div className="absolute top-2 right-2 bg-[#22C55E] text-black p-1 rounded-full shadow-lg">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-[#EF4444]/15 border border-[#EF4444]/35 text-[#EF4444] rounded-2xl text-xs font-bold text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !name || !mobileNumber || !selfieBase64}
              className="w-full py-3.5 text-sm font-black uppercase tracking-wider bg-[#D4AF37] hover:bg-[#E6C766] active:bg-[#9C7B20] text-black rounded-2xl shadow-xl mt-2 cursor-pointer border border-[#E6C766]"
            >
              {loading ? 'Submitting Registration...' : 'Register Device'}
            </Button>

            <button
              type="button"
              onClick={() => {
                resetRegistration();
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="w-full py-2.5 bg-[#EF4444]/15 hover:bg-[#EF4444]/25 text-[#EF4444] text-xs font-bold rounded-xl border border-[#EF4444]/30 transition-colors mt-3 cursor-pointer uppercase tracking-wider"
            >
              Clear Device Registration
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
};
