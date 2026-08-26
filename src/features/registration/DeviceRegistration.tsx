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
    <div className="min-h-screen bg-[#EAF7EE] text-[#12332B] p-4 flex flex-col justify-center items-center">
      <div className="max-w-md w-full space-y-5">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-[#173A32] border border-[#2A5B50] rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <Shield className="w-8 h-8 text-[#19C7C0]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[#12332B]">Register Device</h1>
          <p className="text-[#31534A] text-xs font-bold">Register your phone to access Office Management System v6.0</p>
        </div>

        <Card className="p-6 bg-[#173A32] border border-[#2A5B50] shadow-2xl rounded-[28px] text-[#F4FAF7]">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#19C7C0]" /> Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter full name"
                className="w-full px-4 py-3 rounded-2xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] focus:outline-none focus:border-[#19C7C0] text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-[#19C7C0]" /> Mobile Number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="w-full px-4 py-3 rounded-2xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] focus:outline-none focus:border-[#19C7C0] text-sm"
                required
                maxLength={10}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#C7DAD3] uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#19C7C0]" /> Verification Selfie
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
                  className="border-2 border-dashed border-[#2A5B50] bg-[#112C26] rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-[#15352E] transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#173A32] border border-[#2A5B50] flex items-center justify-center mb-2">
                    <Camera className="w-6 h-6 text-[#19C7C0]" />
                  </div>
                  <span className="text-xs font-bold text-[#F4FAF7]">Tap to take selfie</span>
                  <span className="text-[10px] text-[#C7DAD3] mt-0.5">Camera verification required</span>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-[#2A5B50] aspect-square max-h-56 mx-auto w-full">
                  <img src={selfieBase64} alt="Selfie preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button type="button" variant="tonal" onClick={() => fileInputRef.current?.click()}>
                      Retake Photo
                    </Button>
                  </div>
                  <div className="absolute top-2 right-2 bg-[#35C98A] text-[#0A2923] p-1 rounded-full shadow-lg">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-[#EF6B73]/20 border border-[#EF6B73]/40 text-[#EF6B73] rounded-2xl text-xs font-bold text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !name || !mobileNumber || !selfieBase64}
              className="w-full py-3.5 text-sm font-bold bg-[#19C7C0] hover:bg-[#15ADA7] text-[#0A2923] rounded-2xl shadow-xl mt-2 cursor-pointer"
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
              className="w-full py-2.5 bg-[#EF6B73]/15 hover:bg-[#EF6B73]/25 text-[#EF6B73] text-xs font-bold rounded-xl border border-[#EF6B73]/30 transition-colors mt-3 cursor-pointer"
            >
              CLEAR DEVICE REGISTRATION
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
};
