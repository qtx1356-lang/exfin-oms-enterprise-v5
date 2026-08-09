import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { BoxSelect, ShieldAlert } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { AdminLogin } from '../features/admin/AdminLogin';
import { AdminDashboard } from '../features/admin/AdminDashboard';
import { AdminPortalLogin } from '../features/adminPortal/AdminPortalLogin';
import { AdminPortalDashboard } from '../features/adminPortal/AdminPortalDashboard';
import { RegistrationProvider, useRegistration } from '../context/RegistrationContext';
import { usePermission } from '../context/PermissionContext';
import { FeatureKey } from '../types/roles';
import { DeviceRegistration } from '../features/registration/DeviceRegistration';
import { PendingApproval } from '../features/registration/PendingApproval';
import { RejectedScreen } from '../features/registration/RejectedScreen';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { EmployeeDashboard } from '../features/employee/EmployeeDashboard';
import { AttendanceScreen } from '../features/attendance/AttendanceScreen';
import { ExpenseScreen } from '../features/expenses/ExpenseScreen';
import { PlannerScreen } from '../features/planner/PlannerScreen';
import { MyTeamScreen } from '../features/team/MyTeamScreen';
import { EfficiencyDashboard } from '../features/efficiency/EfficiencyDashboard';
import { LeaveScreen } from '../features/leave/LeaveScreen';
import { NotificationCenter } from '../features/notifications/NotificationCenter';
import { ProfileScreen } from '../features/profile/ProfileScreen';
import { SyncCenterScreen } from '../features/sync/SyncCenterScreen';
import { PayslipScreen } from '../features/employee/PayslipScreen';

// Protects /admin/dashboard - accessible by ADMIN, HR, SUPER_ADMIN
const AdminProtectedRoute = () => {
  const { user, loading, role, adminProfileError, logout } = useAdminAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/x7Kp9/login" replace />;

  if (adminProfileError || (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'HR')) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] flex flex-col items-center justify-center p-4 text-white">
        <Card className="max-w-md w-full p-8 space-y-6 bg-[#2D1B5A] border border-purple-500/30 shadow-2xl rounded-[28px] text-center">
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
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl text-xs transition-colors shadow-lg"
            >
              Sign Out & Return to Login
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return <Outlet />;
};

// For /admin/login: route based on role when already authenticated
const AdminPublicRoute = () => {
  const { user, loading, role, adminProfileError } = useAdminAuth();
  if (loading) return <LoadingScreen />;
  if (user && !adminProfileError) {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR') {
      return <Navigate to="/x7Kp9/dashboard" replace />;
    }
  }
  return <AdminLogin />;
};

// For /admin-portal/login: route based on role when already authenticated
const AdminPortalPublicRoute = () => {
  const { user, loading, role, adminProfileError } = useAdminAuth();
  if (loading) return <LoadingScreen />;
  if (user && !adminProfileError) {
    if (role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HR') {
      return <Navigate to="/admin-portal/dashboard" replace />;
    }
  }
  return <AdminPortalLogin />;
};

const EmployeeGuard = () => {
  const { status } = useRegistration();
  
  if (status === 'loading') return <LoadingScreen />;
  if (status === 'unregistered') return <DeviceRegistration />;
  if (status === 'Pending Approval') return <PendingApproval />;
  if (status === 'Rejected') return <RejectedScreen />;
  
  return <Outlet />;
};

const FeatureGuard: React.FC<{ feature: FeatureKey; children: React.ReactNode }> = ({ feature, children }) => {
  const { hasFeatureAccess, loading } = usePermission();
  
  if (loading) return <LoadingScreen />;
  
  if (!hasFeatureAccess(feature)) {
    return (
      <div className="py-6 h-[calc(100vh-120px)]">
        <Card className="h-full p-6 flex flex-col bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px]">
          <h1 className="text-xl font-black text-white mb-6">Access Denied</h1>
          <div className="flex-1">
            <EmptyState 
              icon={ShieldAlert}
              title="Feature not available for your role"
              description="You do not have permission to access this module."
            />
          </div>
        </Card>
      </div>
    );
  }
  
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* NEW INDEPENDENT ADMIN PORTAL ROUTES */}
        <Route path="/admin-portal">
          <Route index element={<Navigate to="/admin-portal/login" replace />} />
          <Route path="login" element={<AdminPortalPublicRoute />} />
          <Route path="dashboard" element={<AdminPortalDashboard />} />
        </Route>

        {/* Existing Admin Routes */}
        <Route path="/x7Kp9">
          <Route index element={<Navigate to="/x7Kp9/login" replace />} />
          <Route path="login" element={<AdminPublicRoute />} />
          <Route element={<AdminProtectedRoute />}>
            <Route path="dashboard" element={<AdminDashboard />} />
          </Route>
        </Route>

        {/* Super Admin Routes (Backward Compatibility Redirect) */}
        <Route path="/super-admin/*" element={<Navigate to="/x7Kp9/dashboard" replace />} />

        {/* Employee Routes with RegistrationProvider */}
        <Route element={<EmployeeGuard />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<EmployeeDashboard />} />
            <Route path="attendance" element={<FeatureGuard feature="attendance"><AttendanceScreen /></FeatureGuard>} />
            <Route path="leave" element={<FeatureGuard feature="leave"><LeaveScreen /></FeatureGuard>} />
            <Route path="expenses" element={<FeatureGuard feature="expenses"><ExpenseScreen /></FeatureGuard>} />
            <Route path="planner" element={<FeatureGuard feature="workPlanner"><PlannerScreen /></FeatureGuard>} />
            <Route path="my-team" element={<FeatureGuard feature="myTeam"><MyTeamScreen /></FeatureGuard>} />
            <Route path="efficiency" element={<FeatureGuard feature="employeeEfficiency"><EfficiencyDashboard /></FeatureGuard>} />
            <Route path="notifications" element={<FeatureGuard feature="notifications"><NotificationCenter /></FeatureGuard>} />
            <Route path="sync-center" element={<SyncCenterScreen />} />
            <Route path="profile" element={<ProfileScreen />} />
            <Route path="payslip" element={<PayslipScreen />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
