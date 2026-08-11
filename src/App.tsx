import React, { useState } from 'react';
import { ErrorBoundary } from './app/ErrorBoundary';
import { IdentityDiagnosticScreen } from './components/IdentityDiagnosticScreen';
import { SplashScreen } from './components/ui/SplashScreen';
import { AnimatePresence } from 'motion/react';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { RegistrationProvider } from './context/RegistrationContext';
import { PermissionProvider } from './context/PermissionContext';
import { LocationProvider } from './context/LocationContext';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <RegistrationProvider>
          <PermissionProvider>
            <LocationProvider>
              <AnimatePresence>
                {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
              </AnimatePresence>
              {!showSplash && <IdentityDiagnosticScreen />}
            </LocationProvider>
          </PermissionProvider>
        </RegistrationProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}

