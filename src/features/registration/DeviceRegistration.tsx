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
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] text-white p-4 flex flex-col justify-center items-center">
      <div className="max-w-md w-full space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#7C3AED] rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_30px_rgba(124,58,237,0.5)]">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Register Device</h1>
          <p className="text-purple-300/80 text-xs">Register your phone to access Office Management System v6.0</p>
        </div>

        <Card className="p-6 bg-[#2D1B5A] border border-purple-500/30 shadow-2xl rounded-[28px]">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#A78BFA]" /> Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED] text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#A78BFA]" /> Mobile Number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED] text-sm"
                required
                maxLength={10}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#A78BFA]" /> Verification Selfie
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
                  className="border-2 border-dashed border-purple-500/30 bg-[#211044]/60 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-[#211044] transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#7C3AED]/20 border border-purple-500/30 flex items-center justify-center mb-2">
                    <Camera className="w-6 h-6 text-[#A78BFA]" />
                  </div>
                  <span className="text-xs font-bold text-white">Tap to take selfie</span>
                  <span className="text-[10px] text-purple-300/70 mt-0.5">Camera verification required</span>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-purple-500/30 aspect-square max-h-56 mx-auto w-full">
                  <img src={selfieBase64} alt="Selfie preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button type="button" variant="tonal" onClick={() => fileInputRef.current?.click()}>
                      Retake Photo
                    </Button>
                  </div>
                  <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-2xl text-xs font-bold text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !name || !mobileNumber || !selfieBase64}
              className="w-full py-3.5 text-sm font-bold rounded-2xl shadow-xl mt-2"
            >
              {loading ? 'Submitting Registration...' : 'Submit Device Registration'}
            </Button>

            <button
              type="button"
              onClick={() => {
                resetRegistration();
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              className="w-full py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-bold rounded-xl border border-rose-500/30 transition-colors mt-3 cursor-pointer"
            >
              CLEAR DEVICE REGISTRATION
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
};
