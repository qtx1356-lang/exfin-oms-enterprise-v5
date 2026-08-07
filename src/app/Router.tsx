import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { BoxSelect } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { AdminLogin } from '../features/admin/AdminLogin';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { useRegistration } from '../context/RegistrationContext';
import { DeviceRegistration } from '../features/registration/DeviceRegistration';
import { PendingApproval } from '../features/registration/PendingApproval';
import { RejectedScreen } from '../features/registration/RejectedScreen';
import { LoadingScreen } from '../components/ui/LoadingScreen';

import { EmployeeDashboard } from '../features/employee/EmployeeDashboard';
import { AttendanceScreen } from '../features/attendance/AttendanceScreen';
import { ExpenseScreen } from '../features/expenses/ExpenseScreen';

// Protects /admin/dashboard - only logged-in admin can access
const AdminProtectedRoute = () => {
  const { user, loading } = useAdminAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
};

// For /admin/login: if already logged in as admin, go to dashboard; else render AdminLogin
const AdminPublicRoute = () => {
  const { user, loading } = useAdminAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/admin/dashboard" replace />;
  return <AdminLogin />;
};

const EmployeeGuard = () => {
  const { status } = useRegistration();
  
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'unregistered') return <DeviceRegistration />;
  if (status === 'Pending Approval') return <PendingApproval />;
  if (status === 'Rejected') return <RejectedScreen />;
  
  return <Outlet />;
};

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="py-6 h-[calc(100vh-120px)]">
    <Card className="h-full p-6 flex flex-col bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px]">
      <h1 className="text-xl font-black text-white mb-6">{title}</h1>
      <div className="flex-1">
        <EmptyState 
          icon={BoxSelect}
          title="Module Standby"
          description={`The ${title} module architecture is ready with Deep Purple theme enabled.`}
        />
      </div>
    </Card>
  </div>
);

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Admin Routes - strictly outside Employee route group */}
        <Route path="/admin">
          <Route index element={<Navigate to="/admin/login" replace />} />
          <Route path="login" element={<AdminPublicRoute />} />
          <Route element={<AdminProtectedRoute />}>
            <Route path="dashboard" element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* Employee Routes */}
        <Route element={<EmployeeGuard />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<EmployeeDashboard />} />
            <Route path="attendance" element={<AttendanceScreen />} />
            <Route path="leave" element={<PlaceholderPage title="Leave" />} />
            <Route path="expenses" element={<ExpenseScreen />} />
            <Route path="planner" element={<PlaceholderPage title="Work Planner" />} />
            <Route path="notifications" element={<PlaceholderPage title="Notifications" />} />
            <Route path="profile" element={<PlaceholderPage title="Profile" />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
