import React, { useState } from 'react';
import { ErrorBoundary } from './app/ErrorBoundary';
import { AppRouter } from './app/Router';
import { SplashScreen } from './components/ui/SplashScreen';
import { AnimatePresence } from 'motion/react';
import { RegistrationProvider } from './context/RegistrationContext';
import { AdminAuthProvider } from './context/AdminAuthContext';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ErrorBoundary>
      <AdminAuthProvider>
        <RegistrationProvider>
          <AnimatePresence>
            {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
          </AnimatePresence>
          {!showSplash && <AppRouter />}
        </RegistrationProvider>
      </AdminAuthProvider>
    </ErrorBoundary>
  );
}
