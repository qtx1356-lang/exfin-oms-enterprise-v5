import React, { useState, useEffect } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Lock, User, ShieldCheck, Terminal } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { app } from '../../services/firebase/config';

export const AdminPortalLogin: React.FC = () => {
  const { login } = useAdminAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('debug') === 'true') {
      setShowAudit(true);
    }
  }, [location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(loginId, password);
      navigate('/admin-portal/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#14082B] via-[#1D0C3C] to-[#250F4C] flex flex-col items-center justify-center p-4 text-white">
      <Card className="max-w-md w-full p-8 space-y-6 bg-[#250F4C] border border-amber-500/30 shadow-2xl rounded-[28px]">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-[0_0_25px_rgba(245,158,11,0.4)]">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Admin Portal</h1>
          <p className="text-purple-300/80 text-xs mt-1.5 font-medium">Enterprise Management System v6.0</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-400" /> Login ID
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#1A0B36] text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              placeholder="Enter Login ID"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-amber-400" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-purple-500/30 bg-[#1A0B36] text-white focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-2xl text-xs font-bold text-center">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full py-3.5 text-base font-bold rounded-2xl shadow-xl mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black">
            {loading ? 'Authenticating...' : 'Sign In to Portal'}
          </Button>
        </form>

        {showAudit && app && (
          <div className="mt-8 p-4 bg-black/40 border border-purple-500/30 rounded-2xl space-y-3 font-mono text-[10px] text-purple-300">
            <div className="flex items-center gap-2 text-amber-400 font-bold mb-1">
              <Terminal className="w-4 h-4" /> RUNTIME FIREBASE AUDIT
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-purple-400">RUNTIME_PROJECT_ID:</div>
              <div className="col-span-2 text-white break-all">{app.options.projectId}</div>
              
              <div className="text-purple-400">RUNTIME_APP_ID:</div>
              <div className="col-span-2 text-white break-all">{app.options.appId}</div>
              
              <div className="text-purple-400">RUNTIME_AUTH_DOMAIN:</div>
              <div className="col-span-2 text-white break-all">{app.options.authDomain}</div>
              
              <div className="text-purple-400">API_KEY:</div>
              <div className="col-span-2 text-white break-all">
                {app.options.apiKey?.substring(0, 12)}...{app.options.apiKey?.substring(app.options.apiKey.length - 4)}
              </div>
            </div>
            <div className="pt-2 border-t border-purple-500/20 text-[9px] text-purple-400/60 text-center italic">
              Verification Mode Active (v6.0 Build)
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
