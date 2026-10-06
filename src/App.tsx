// APPLICATION STARTUP MUST NEVER DEPEND ON NETWORK CONNECTIVITY. OFFLINE MUST BOOT THE NORMAL APPLICATION SHELL.
import React from 'react';
import './services/startup/startupPerformanceLogger';
import { isMedianApp } from './utils/medianDetector';
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
  if (isMedianApp()) {
    return (
      <div className="min-h-screen bg-[#0F1025] text-white flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[#1B1D3A] border border-[#2E325A] rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold mb-2">Access Restricted</h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Access through the legacy mobile application is no longer supported. Please use the official EXFIN OMS application or web portal.
          </p>
        </div>
      </div>
    );
  }

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


