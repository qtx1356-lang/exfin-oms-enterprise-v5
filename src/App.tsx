// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import React, { useEffect } from 'react';
import './services/startup/startupPerformanceLogger';
import './services/attendance/firstReturnCheckInPatch';
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
import { VideoConferenceCenter } from './features/video/VideoConferenceCenter';
import { auth } from './services/firebase/config';
import { initNativePushNotifications } from './services/notification/nativePushNotificationService';

function NativePushBootstrap() {
  useEffect(() => {
    // Android FCM registration must happen independently of the video UI. This
    // guarantees that a device has a callable token before an administrator starts
    // a LiveKit call, even if the employee never opens the video screen.
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = auth.onAuthStateChanged((user) => {
        if (disposed || !user) return;
        void initNativePushNotifications({
          uid: user.uid,
          userId: user.uid,
          role: 'EMPLOYEE',
        }).catch((error) => {
          console.warn('[NativePushBootstrap] FCM initialization failed:', error);
        });
      });
    } catch (error) {
      console.warn('[NativePushBootstrap] Could not attach auth listener:', error);
    }

    return () => {
      disposed = true;
      try { unsubscribe?.(); } catch {}
    };
  }, []);

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
                    <NativePushBootstrap />
                    <ConnectivityIndicator />
                    <AppUpdateModal />
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
