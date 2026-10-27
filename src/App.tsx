// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import React, { useEffect } from 'react';
import './services/startup/startupPerformanceLogger';
import './services/attendance/firstReturnCheckInPatch';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppRouter } from './app/Router';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { RegistrationProvider } from './context/RegistrationContext';
import { RealtimeSyncProvider } from './context/RealtimeSyncContext';
import { PermissionProvider } from './context/PermissionContext';
import { LocationProvider } from './context/LocationContext';
import { AlertPopupProvider } from './context/AlertPopupContext';
import { SecurityVerificationProvider } from './context/SecurityVerificationContext';
import { ConnectivityIndicator } from './components/common/ConnectivityIndicator';
import { AppUpdateModal } from './components/common/AppUpdateModal';
import { VideoConferenceCenter } from './features/video/VideoConferenceCenter';

const PRIVILEGED_VIDEO_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'HR', 'TEAM_LEADER', 'MANAGER']);

function EmployeeVideoConferenceLauncherGuard() {
  const { role } = useAdminAuth();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const normalizedRole = String(role || '').trim().toUpperCase();
    const isPrivileged = PRIVILEGED_VIDEO_ROLES.has(normalizedRole);
    if (isPrivileged) return;

    // VideoConferenceCenter must remain mounted for employee incoming-call
    // handling, but its manual launcher must never be visible to employees.
    // Use both the stable aria label and the launcher's stable Tailwind class
    // pattern so this remains effective if the button markup changes slightly.
    const style = document.createElement('style');
    style.setAttribute('data-exfin-employee-video-guard', 'true');
    style.textContent = [
      '[aria-label="Open EXFIN video conferences"]',
      'button[class*="bottom-20"][class*="right-4"][class*="z-[80]"]',
    ].join(',') + '{display:none !important;visibility:hidden !important;pointer-events:none !important;}';
    document.head.appendChild(style);

    return () => style.remove();
  }, [role]);

  return null;
}

export default function App() {
  console.log('[APP UPDATE DEBUG] App component initialized');
  console.log('[APP UPDATE DEBUG] Registering updater');
  console.log('[APP UPDATE DEBUG] Updater registration complete');

  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <RegistrationProvider>
          <RealtimeSyncProvider>
            <PermissionProvider>
              <LocationProvider>
                <AlertPopupProvider>
                  <SecurityVerificationProvider>
                    <ConnectivityIndicator />
                    <AppUpdateModal />
                    <EmployeeVideoConferenceLauncherGuard />
                    <VideoConferenceCenter />
                    <AppRouter />
                  </SecurityVerificationProvider>
                </AlertPopupProvider>
              </LocationProvider>
            </PermissionProvider>
          </RealtimeSyncProvider>
        </RegistrationProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}
