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
import { ConnectivityIndicator } from './components/common/ConnectivityIndicator';

const getTime = () => new Date().toISOString().substring(11, 23);

export default function App() {
  React.useEffect(() => {
    console.log(`[FLICKER-TRACE] App MOUNT ${getTime()}`);
    return () => console.log(`[FLICKER-TRACE] App UNMOUNT ${getTime()}`);
  }, []);

  console.log(`[FLICKER-TRACE] App RENDER ${getTime()}`);

  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <RegistrationProvider>
          <RealtimeSyncProvider>
            <PermissionProvider>
              <LocationProvider>
                <AlertPopupProvider>
                  <ConnectivityIndicator />
                  <AppRouter />
                </AlertPopupProvider>
              </LocationProvider>
            </PermissionProvider>
          </RealtimeSyncProvider>
        </RegistrationProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}


