// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import React from 'react';
import './services/startup/startupPerformanceLogger';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppRouter } from './app/Router';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { RegistrationProvider } from './context/RegistrationContext';
import { RealtimeSyncProvider } from './context/RealtimeSyncContext';
import { PermissionProvider } from './context/PermissionContext';
import { LocationProvider } from './context/LocationContext';
import { AlertPopupProvider } from './context/AlertPopupContext';
import { SecurityVerificationProvider } from './context/SecurityVerificationContext';
import { ConnectivityIndicator } from './components/common/ConnectivityIndicator';
import { AppUpdateModal } from './components/common/AppUpdateModal';

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


