import React, { useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Lock, User, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AdminLogin: React.FC = () => {
  const { login } = useAdminAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginId, password);
      navigate('/x7Kp9/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1025] flex flex-col items-center justify-center p-4 text-[#F8F8FF]">
      <Card className="max-w-md w-full p-8 space-y-6 bg-[#1E1F41]/80 backdrop-blur-[14px] border border-[#6366F1]/30 shadow-2xl rounded-[28px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#6366F1] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_25px_rgba(99,102,241,0.4)]">
            <ShieldCheck className="w-9 h-9 text-[#FFFFFF]" />
          </div>
          <h1 className="text-2xl font-black text-[#F8F8FF] tracking-tight">Admin Portal</h1>
          <p className="text-[#B9B9D0] text-xs mt-1.5 font-medium">Enterprise Management System v6.0</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#C7C7C7] uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#D4AF37]" /> Login ID
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#292929] bg-[#121212] text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
              placeholder="admin"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#C7C7C7] uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#D4AF37]" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#292929] bg-[#121212] text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37] text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-2xl text-xs font-bold text-center">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full py-3.5 text-base font-bold rounded-2xl shadow-xl mt-2">
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </Button>
        </form>
      </Card>
    </div>
  );
};
