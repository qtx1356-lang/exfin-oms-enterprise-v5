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
import { BiometricSecurityProvider } from './context/BiometricSecurityContext';
import { AlertPopupProvider } from './context/AlertPopupContext';
import { ConnectivityIndicator } from './components/common/ConnectivityIndicator';

export default function App() {
  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <RegistrationProvider>
          <RealtimeSyncProvider>
            <PermissionProvider>
              <LocationProvider>
                <BiometricSecurityProvider>
                  <AlertPopupProvider>
                    <ConnectivityIndicator />
                    <AppRouter />
                  </AlertPopupProvider>
                </BiometricSecurityProvider>
              </LocationProvider>
            </PermissionProvider>
          </RealtimeSyncProvider>
        </RegistrationProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}


