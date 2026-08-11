import React from 'react';
import './services/startup/startupPerformanceLogger';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppRouter } from './app/Router';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { RegistrationProvider } from './context/RegistrationContext';
import { RealtimeSyncProvider } from './context/RealtimeSyncContext';
import { PermissionProvider } from './context/PermissionContext';
import { LocationProvider } from './context/LocationContext';

export default function App() {
  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <RegistrationProvider>
          <RealtimeSyncProvider>
            <PermissionProvider>
              <LocationProvider>
                <AppRouter />
              </LocationProvider>
            </PermissionProvider>
          </RealtimeSyncProvider>
        </RegistrationProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}

