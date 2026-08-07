import React, { useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const AdminLogin: React.FC = () => {
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] flex flex-col items-center justify-center p-4 text-white">
      <Card className="max-w-md w-full p-8 space-y-6 bg-[#2D1B5A] border border-purple-500/30 shadow-2xl rounded-[28px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-[#7C3AED] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_25px_rgba(124,58,237,0.5)]">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">EXFIN Admin Portal</h1>
          <p className="text-purple-300/80 text-xs mt-1.5 font-medium">Enterprise Management System v6.0</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#A78BFA]" /> Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED] text-sm"
              placeholder="admin@exfin.com"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#A78BFA]" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED] text-sm"
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
