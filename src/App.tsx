import React, { useState } from 'react';
import { ErrorBoundary } from './app/ErrorBoundary';
import { Router } from './app/Router';
import { SplashScreen } from './components/ui/SplashScreen';
import { AnimatePresence } from 'motion/react';
import { RegistrationProvider, useRegistration } from './context/RegistrationContext';
import { DeviceRegistration } from './features/registration/DeviceRegistration';
import { PendingApproval } from './features/registration/PendingApproval';
import { RejectedScreen } from './features/registration/RejectedScreen';
import { LoadingScreen } from './components/ui/LoadingScreen';

const MainApp: React.FC = () => {
  const { status } = useRegistration();

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  if (status === 'unregistered') {
    return <DeviceRegistration />;
  }

  if (status === 'Pending Approval') {
    return <PendingApproval />;
  }

  if (status === 'Rejected') {
    return <RejectedScreen />;
  }

  // Approved
  return <Router />;
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ErrorBoundary>
      <RegistrationProvider>
        <AnimatePresence>
          {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
        </AnimatePresence>
        {!showSplash && <MainApp />}
      </RegistrationProvider>
    </ErrorBoundary>
  );
}
