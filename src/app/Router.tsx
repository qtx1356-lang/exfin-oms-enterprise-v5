import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { BoxSelect, ShieldAlert } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { RegistrationProvider, useRegistration } from '../context/RegistrationContext';
import { usePermission } from '../context/PermissionContext';
import { FeatureKey } from '../types/roles';

// Lazy load feature components
const AdminLogin = lazy(() => import('../features/admin/AdminLogin').then(m => ({ default: m.AdminLogin })));
const AdminDashboard = lazy(() => import('../features/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminPortalLogin = lazy(() => import('../features/adminPortal/AdminPortalLogin').then(m => ({ default: m.AdminPortalLogin })));
const AdminPortalDashboard = lazy(() => import('../features/adminPortal/AdminPortalDashboard').then(m => ({ default: m.AdminPortalDashboard })));
const DeviceRegistration = lazy(() => import('../features/registration/DeviceRegistration').then(m => ({ default: m.DeviceRegistration })));
const PendingApproval = lazy(() => import('../features/registration/PendingApproval').then(m => ({ default: m.PendingApproval })));
const RejectedScreen = lazy(() => import('../features/registration/RejectedScreen').then(m => ({ default: m.RejectedScreen })));
const MobileRecoveryScreen = lazy(() => import('../features/registration/MobileRecoveryScreen').then(m => ({ default: m.MobileRecoveryScreen })));
const SuspendedNoticeScreen = lazy(() => import('../features/registration/SuspendedNoticeScreen').then(m => ({ default: m.SuspendedNoticeScreen })));
const WelcomeScreen = lazy(() => import('../components/ui/WelcomeScreen').then(m => ({ default: m.WelcomeScreen })));
const EmployeeDashboard = lazy(() => import('../features/employee/EmployeeDashboard').then(m => ({ default: m.EmployeeDashboard })));
const AttendanceScreen = lazy(() => import('../features/attendance/AttendanceScreen').then(m => ({ default: m.AttendanceScreen })));
const ExpenseScreen = lazy(() => import('../features/expenses/ExpenseScreen').then(m => ({ default: m.ExpenseScreen })));
const PlannerScreen = lazy(() => import('../features/planner/PlannerScreen').then(m => ({ default: m.PlannerScreen })));
const MyTeamScreen = lazy(() => import('../features/team/MyTeamScreen').then(m => ({ default: m.MyTeamScreen })));
const EfficiencyDashboard = lazy(() => import('../features/efficiency/EfficiencyDashboard').then(m => ({ default: m.EfficiencyDashboard })));
const LeaveScreen = lazy(() => import('../features/leave/LeaveScreen').then(m => ({ default: m.LeaveScreen })));
const NotificationCenter = lazy(() => import('../features/notifications/NotificationCenter').then(m => ({ default: m.NotificationCenter })));
const ProfileScreen = lazy(() => import('../features/profile/ProfileScreen').then(m => ({ default: m.ProfileScreen })));
const SyncCenterScreen = lazy(() => import('../features/sync/SyncCenterScreen').then(m => ({ default: m.SyncCenterScreen })));
const PayslipScreen = lazy(() => import('../features/employee/PayslipScreen').then(m => ({ default: m.PayslipScreen })));
const ChatScreen = lazy(() => import('../features/employee/ChatScreen').then(m => ({ default: m.ChatScreen })));
const EmployeeFAQScreen = lazy(() => import('../features/help/EmployeeFAQScreen').then(m => ({ default: m.EmployeeFAQScreen })));
const WorkHoursScreen = lazy(() => import('../features/workHours/WorkHoursScreen').then(m => ({ default: m.WorkHoursScreen })));

// Protects /admin/dashboard - accessible by ADMIN, HR, SUPER_ADMIN
const AdminProtectedRoute = () => {
  const { user, loading, role, adminProfileError, logout } = useAdminAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/x7Kp9/login" replace />;

  if (adminProfileError || (role !== 'ADMIN' && role !== 'SUPER_ADMIN' && role !== 'HR')) {
    return (
      <div className="min-h-screen bg-[var(--app-background)] flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Emerald Aurora Ambient Lighting */}
        <div className="fixed top-20 right-10 w-[500px] h-[500px] bg-[var(--success)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
        <div className="fixed bottom-20 left-10 w-[400px] h-[400px] bg-[var(--teal)]/8 rounded-full blur-[140px] pointer-events-none -z-10" />

        <div className="glass-card-elevated max-w-md w-full p-8 space-y-6 text-center relative">
          <div className="w-16 h-16 bg-[var(--success)]/10 border border-[var(--success)]/30 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
            <ShieldAlert className="w-9 h-9 text-[var(--success)]" />
          </div>
          <h1 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight">Admin Access Restricted</h1>
          <p className="text-[var(--text-secondary)] text-xs leading-relaxed font-medium">
            {adminProfileError || 'Your account is authenticated, but does not have Admin access privileges.'}
          </p>
          <div className="pt-2">
            <button
              onClick={() => logout()}
              className="w-full py-4 bg-[var(--button-primary)] text-white font-black rounded-2xl text-xs transition-all shadow-xl active:scale-[0.98] uppercase tracking-widest border border-[var(--border)]"
            >
              Sign Out & Return
            </button>
          </div>
        </div>
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

const getTime = () => new Date().toISOString().substring(11, 23);

const EmployeeGuard = () => {
  const { status } = useRegistration();
  const [showWelcome, setShowWelcome] = React.useState(() => {
    try {
      return sessionStorage.getItem('exfin_welcome_dismissed') !== 'true';
    } catch {
      return true;
    }
  });

  const [isDbReady, setIsDbReady] = React.useState(false);

  React.useEffect(() => {
    import('../services/firebase/db').then(({ getEmployeeDb }) => {
      getEmployeeDb().then((db) => {
        if (db) setIsDbReady(true);
      }).catch(err => {
        console.warn('Failed to init employee db', err);
        // Fallback to true so we don't hang if offline
        setIsDbReady(true);
      });
    });
  }, []);

  React.useEffect(() => {
    console.log(`[FLICKER-TRACE] EmployeeGuard MOUNT ${getTime()}`);
    return () => console.log(`[FLICKER-TRACE] EmployeeGuard UNMOUNT ${getTime()}`);
  }, []);

  console.log(`[FLICKER-TRACE] EmployeeGuard RENDER status=${status} showWelcome=${showWelcome} ${getTime()}`);

  const handleProceed = React.useCallback(() => {
    try {
      sessionStorage.setItem('exfin_welcome_dismissed', 'true');
    } catch {}
    setShowWelcome(false);
  }, []);

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'mobile_recovery') {
    return <MobileRecoveryScreen />;
  }

  if (showWelcome) {
    return <WelcomeScreen onProceed={handleProceed} />;
  }

  if (status === 'unregistered') return <DeviceRegistration />;
  if (status === 'Pending Approval') return <PendingApproval />;
  if (status === 'Rejected') return <RejectedScreen />;
  if (status === 'suspended_notice') return <SuspendedNoticeScreen />;

  if (!isDbReady) return <LoadingScreen />;

  return <Outlet />;
};

const FeatureGuard: React.FC<{ feature: FeatureKey; children: React.ReactNode }> = ({ feature, children }) => {
  const { hasFeatureAccess, loading } = usePermission();
  
  if (loading) return <LoadingScreen fullScreen={false} />;
  
  if (!hasFeatureAccess(feature)) {
    return (
      <div className="py-6 h-[calc(100vh-120px)] flex flex-col relative overflow-hidden">
        {/* Emerald Aurora Ambient Lighting */}
        <div className="absolute top-20 right-10 w-[300px] h-[300px] bg-[var(--success)]/10 rounded-full blur-[100px] pointer-events-none -z-10" />
        
        <div className="flex-1 glass-card-elevated p-8 flex flex-col items-center justify-center text-center relative">
          <div className="w-16 h-16 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
            <ShieldAlert className="w-8 h-8 text-[var(--danger)]" />
          </div>
          <h1 className="text-xl font-black text-[var(--text-primary)] uppercase tracking-tight mb-2">Access Denied</h1>
          <p className="text-[var(--text-secondary)] text-xs font-medium max-w-[240px] mx-auto leading-relaxed">
            You do not have permission to access the <b>{feature}</b> module.
          </p>
          <div className="mt-8 flex gap-3">
             <button 
               onClick={() => window.history.back()}
               className="px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--text-primary)] text-xs font-black uppercase tracking-widest hover:bg-[var(--surface-elevated)] transition-all"
             >
               Go Back
             </button>
          </div>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
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

          {/* Admin Routes Fallbacks */}
          <Route path="/admin/*" element={<Navigate to="/admin-portal/login" replace />} />
          <Route path="/admin" element={<Navigate to="/admin-portal/login" replace />} />

          {/* Super Admin Routes (Backward Compatibility Redirect) */}
          <Route path="/super-admin/*" element={<Navigate to="/x7Kp9/dashboard" replace />} />

          {/* Normal Exfin OMS PWA Flow */}
          <Route element={<EmployeeGuard />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<EmployeeDashboard />} />
              <Route path="attendance" element={<FeatureGuard feature="attendance"><AttendanceScreen /></FeatureGuard>} />
              <Route path="leave" element={<FeatureGuard feature="leave"><LeaveScreen /></FeatureGuard>} />
              <Route path="expenses" element={<FeatureGuard feature="expenses"><ExpenseScreen /></FeatureGuard>} />
              <Route path="planner" element={<FeatureGuard feature="workPlanner"><PlannerScreen /></FeatureGuard>} />
              <Route path="my-team" element={<FeatureGuard feature="myTeam"><MyTeamScreen /></FeatureGuard>} />
              <Route path="team" element={<Navigate to="/my-team" replace />} />
              <Route path="efficiency" element={<FeatureGuard feature="employeeEfficiency"><EfficiencyDashboard /></FeatureGuard>} />
              <Route path="notifications" element={<FeatureGuard feature="notifications"><NotificationCenter /></FeatureGuard>} />
              <Route path="sync-center" element={<SyncCenterScreen />} />
              <Route path="profile" element={<ProfileScreen />} />
              <Route path="payslip" element={<PayslipScreen />} />
              <Route path="chat" element={<ChatScreen />} />
              <Route path="faq" element={<EmployeeFAQScreen />} />
              <Route path="work-hours" element={<WorkHoursScreen />} />
            </Route>
            <Route path="/web-dashboard/*" element={<Navigate to="/" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
