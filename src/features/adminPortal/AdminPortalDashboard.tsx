import React from 'react';
import { AdminDashboard } from '../admin/AdminDashboard';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Navigate } from 'react-router-dom';
import { LoadingScreen } from '../../components/ui/LoadingScreen';
import { Card } from '../../components/ui/Card';
import { ShieldAlert } from 'lucide-react';

export const AdminPortalDashboard: React.FC = () => {
  const { user, loading, role, adminProfileError, logout } = useAdminAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/admin-portal/login" replace />;

  if (adminProfileError || (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'HR')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#14082B] via-[#1D0C3C] to-[#250F4C] flex flex-col items-center justify-center p-4 text-white">
        <Card className="max-w-md w-full p-8 space-y-6 bg-[#250F4C] border border-purple-500/35 shadow-2xl rounded-[28px] text-center">
          <div className="w-16 h-16 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center justify-center mx-auto shadow-[0_0_25px_rgba(245,158,11,0.3)]">
            <ShieldAlert className="w-9 h-9 text-amber-400" />
          </div>
          <h1 className="text-xl font-black text-white">Admin Access Restricted</h1>
          <p className="text-purple-200/80 text-xs leading-relaxed">
            {adminProfileError || 'Your account is authenticated, but does not have Admin access privileges.'}
          </p>
          <div className="pt-2">
            <button
              onClick={() => logout()}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-2xl text-xs transition-colors shadow-lg"
            >
              Sign Out & Return to Login
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return <AdminDashboard />;
};
