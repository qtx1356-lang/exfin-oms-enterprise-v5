import React, { useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Lock, Mail } from 'lucide-react';
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
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-on-surface">Admin Login</h1>
          <p className="text-on-surface-variant text-sm mt-2">Sign in to access the Exfin OMS Admin Panel</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-on-surface flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline/30 bg-surface focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-on-surface flex items-center gap-2">
              <Lock className="w-4 h-4" /> Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-outline/30 bg-surface focus:outline-none focus:ring-2 focus:ring-primary text-on-surface"
              required
            />
          </div>

          {error && <div className="p-3 bg-red-100 text-red-800 rounded-lg text-sm">{error}</div>}

          <Button type="submit" disabled={loading} className="w-full py-3">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
      </Card>
    </div>
  );
};
