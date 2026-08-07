import React, { useRef, useState } from 'react';
import { Camera, User, Phone, CheckCircle2 } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useRegistration } from '../../context/RegistrationContext';

export const DeviceRegistration: React.FC = () => {
  const { submitRegistration } = useRegistration();
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
    <div className="min-h-screen bg-surface p-4 flex flex-col justify-center">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-medium text-on-surface">Register Device</h1>
          <p className="text-on-surface-variant text-sm">Please provide your details to register this device for Exfin OMS.</p>
        </div>

        <Card variant="outlined" className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-on-surface flex items-center gap-2">
                <User className="w-4 h-4" /> Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 rounded-xl border border-outline/30 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-on-surface placeholder:text-outline"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-on-surface flex items-center gap-2">
                <Phone className="w-4 h-4" /> Mobile Number
              </label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="Enter 10-digit mobile number"
                className="w-full px-4 py-3 rounded-xl border border-outline/30 bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-on-surface placeholder:text-outline"
                required
                pattern="[0-9]{10}"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-on-surface flex items-center gap-2">
                <Camera className="w-4 h-4" /> Selfie
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
                  className="border-2 border-dashed border-outline/30 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-surface-variant/30 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center mb-3">
                    <Camera className="w-6 h-6 text-on-primary-container" />
                  </div>
                  <span className="text-sm font-medium text-primary">Tap to take selfie</span>
                  <span className="text-xs text-on-surface-variant mt-1">Camera only</span>
                </div>
              ) : (
                <div className="relative rounded-xl overflow-hidden border border-outline/30 aspect-square max-h-64 mx-auto w-full">
                  <img src={selfieBase64} alt="Selfie preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Button type="button" variant="tonal" onClick={() => fileInputRef.current?.click()}>
                      Retake Photo
                    </Button>
                  </div>
                  <div className="absolute top-2 right-2 bg-green-500 text-white p-1 rounded-full">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-3 bg-red-100 text-red-800 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading || !name || !mobileNumber || !selfieBase64}
              className="w-full py-4 text-base font-medium rounded-xl"
            >
              {loading ? 'Submitting...' : 'Register Device'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
