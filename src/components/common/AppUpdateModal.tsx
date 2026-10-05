import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  checkAppUpdateSilently,
  startApkDownloadAndInstall,
  dismissUpdateForSession,
  isUpdateDismissedForSession,
  checkCanInstallUnknownApps,
  openUnknownAppsSettings,
  ExfinUpdate,
  AndroidUpdateManifest,
  UpdateProgressEvent,
} from '../../services/appUpdateService';
import { Download, RefreshCw, AlertCircle, CheckCircle2, ShieldAlert, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import { PluginListenerHandle, Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

type UpdateModalState = 'PROMPT' | 'DOWNLOADING' | 'DOWNLOADED' | 'FAILED' | 'PERMISSION_REQUIRED';

const PERIODIC_CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export const AppUpdateModal: React.FC = () => {
  const [manifest, setManifest] = useState<AndroidUpdateManifest | null>(null);
  const [modalState, setModalState] = useState<UpdateModalState>('PROMPT');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [bytesDownloaded, setBytesDownloaded] = useState<number>(0);
  const [bytesTotal, setBytesTotal] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [canInstall, setCanInstall] = useState<boolean>(true);
  const listenerRef = useRef<PluginListenerHandle | null>(null);
  const isCheckingRef = useRef<boolean>(false);

  const performUpdateCheck = useCallback(async () => {
    // Only check if running on native Android
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    // In-flight guard to prevent multiple simultaneous update checks
    if (isCheckingRef.current) {
      return;
    }
    isCheckingRef.current = true;

    try {
      console.log('[AppUpdateModal] Triggering silent update check...');
      const updateInfo = await checkAppUpdateSilently();
      console.log('[AppUpdateModal] Update check result retrieved:', {
        updateAvailable: updateInfo?.updateAvailable,
        installedCode: updateInfo?.installedVersion?.versionCode,
        installedName: updateInfo?.installedVersion?.versionName,
        remoteCode: updateInfo?.remoteManifest?.versionCode,
        remoteName: updateInfo?.remoteManifest?.versionName
      });

      if (updateInfo?.updateAvailable && updateInfo.remoteManifest) {
        const remote = updateInfo.remoteManifest;
        
        // If user previously pressed 'Later' for this exact version code during this session, do not prompt again
        const isDismissed = isUpdateDismissedForSession(remote.versionCode);
        console.log(`[AppUpdateModal] Checking if version ${remote.versionCode} was dismissed:`, isDismissed);
        
        if (isDismissed) {
          console.log('[AppUpdateModal] Update check skipped because this version was dismissed for the current session.');
          return;
        }

        const installPermission = await checkCanInstallUnknownApps();
        console.log('[AppUpdateModal] Install unknown apps permission state:', installPermission);
        
        setCanInstall(installPermission);
        setManifest(remote);
        setModalState('PROMPT');
        setDownloadProgress(0);
        console.log('[AppUpdateModal] Successfully set manifest and state to PROMPT. Alert modal will now render.');
      } else {
        console.log('[AppUpdateModal] No update available or remote manifest is missing.');
      }
    } catch (err) {
      console.debug('[AppUpdateModal] Update check error ignored silently:', err);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    console.log('[AppUpdateModal] Component mounted into visual tree');
    return () => {
      console.log('[AppUpdateModal] Component unmounted from visual tree');
    };
  }, []);

  useEffect(() => {
    // 1. Initial silent check with a safe 3.5s delay to ensure the native bridge is fully initialized
    const startupTimer = setTimeout(() => {
      void performUpdateCheck();
    }, 3500);

    // 2. Foreground check when returning from background
    let appStateListener: PluginListenerHandle | null = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', (state) => {
        if (state.isActive) {
          void performUpdateCheck();
        }
      }).then((handle) => {
        appStateListener = handle;
      }).catch((e) => {
        console.debug('[AppUpdateModal] Failed to attach appStateChange listener:', e);
      });
    }

    // 3. Periodic check every 30 minutes while app remains open
    const periodicInterval = setInterval(() => {
      void performUpdateCheck();
    }, PERIODIC_CHECK_INTERVAL_MS);

    // 4. Custom event listener for manual / pull-to-refresh checks
    const handleCustomCheckEvent = () => {
      void performUpdateCheck();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('exfin-check-app-update', handleCustomCheckEvent);
    }

    return () => {
      clearTimeout(startupTimer);
      clearInterval(periodicInterval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('exfin-check-app-update', handleCustomCheckEvent);
      }
      if (appStateListener) {
        appStateListener.remove();
      }
      if (listenerRef.current) {
        listenerRef.current.remove();
      }
    };
  }, [performUpdateCheck]);

  const handleStartUpdate = async () => {
    if (!manifest?.apkUrl) return;

    // Check if permission to install unknown apps is granted
    const allowed = await checkCanInstallUnknownApps();
    if (!allowed) {
      setCanInstall(false);
      setModalState('PERMISSION_REQUIRED');
      return;
    }

    setModalState('DOWNLOADING');
    setDownloadProgress(0);
    setBytesDownloaded(0);
    setBytesTotal(0);
    setErrorMessage('');

    try {
      // Remove any existing listener
      if (listenerRef.current) {
        await listenerRef.current.remove();
        listenerRef.current = null;
      }

      // Subscribe to real-time native download progress events
      listenerRef.current = await ExfinUpdate.addListener(
        'updateDownloadProgress',
        (event: UpdateProgressEvent) => {
          if (event.status === 'DOWNLOADING') {
            setDownloadProgress(event.progress);
            if (typeof event.bytesDownloaded === 'number') {
              setBytesDownloaded(event.bytesDownloaded);
            }
            if (typeof event.bytesTotal === 'number') {
              setBytesTotal(event.bytesTotal);
            }
          } else if (event.status === 'DOWNLOADED') {
            setDownloadProgress(100);
            if (typeof event.fileSize === 'number') {
              setBytesDownloaded(event.fileSize);
              setBytesTotal(event.fileSize);
            }
            setModalState('DOWNLOADED');
          } else if (event.status === 'FAILED') {
            setModalState('FAILED');
            setErrorMessage(event.error || 'Download failed or connection interrupted');
          }
        }
      );

      // Trigger native download
      const result = await startApkDownloadAndInstall(manifest.apkUrl);
      if (result.success) {
        setDownloadProgress(100);
        setModalState('DOWNLOADED');
      }
    } catch (err: any) {
      console.error('[AppUpdateModal] Update execution error:', err);
      setModalState('FAILED');
      setErrorMessage(err?.message || 'Failed to download update APK');
    }
  };

  const handleLater = () => {
    if (manifest?.versionCode) {
      dismissUpdateForSession(manifest.versionCode);
    }
    setManifest(null);
  };

  const handleOpenSettings = async () => {
    await openUnknownAppsSettings();
    // After user returns from settings, re-check permission and start download
    setTimeout(async () => {
      const allowed = await checkCanInstallUnknownApps();
      setCanInstall(allowed);
      if (allowed) {
        void handleStartUpdate();
      }
    }, 1000);
  };

  if (!manifest) {
    return null;
  }

  const releaseNotesList: string[] = Array.isArray(manifest.releaseNotes)
    ? manifest.releaseNotes
    : typeof manifest.releaseNotes === 'string'
    ? [manifest.releaseNotes]
    : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-purple-500/30 rounded-3xl p-6 max-w-sm w-full shadow-2xl relative overflow-hidden text-white">
        {/* Glow backdrop decoration */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-40 h-40 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* PROMPT STATE */}
        {modalState === 'PROMPT' && (
          <div className="space-y-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-2">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>

            <div>
              <h3 className="text-xl font-bold tracking-tight text-white">New Update Available</h3>
              <p className="text-sm text-purple-300 font-medium mt-0.5">
                Version {manifest.versionName} (Build {manifest.versionCode})
              </p>
            </div>

            {releaseNotesList.length > 0 && (
              <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-3.5 space-y-1.5 max-h-36 overflow-y-auto">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  What's New
                </span>
                <ul className="text-xs text-slate-200 space-y-1">
                  {releaseNotesList.map((note, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <span className="text-purple-400 font-bold leading-none mt-1">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-slate-400">
              Update now to get the latest office tracking features, bug fixes, and reliability improvements.
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleLater}
                className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors cursor-pointer text-center"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handleStartUpdate}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-purple-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <Download className="w-4 h-4" />
                <span>Update Now</span>
              </button>
            </div>
          </div>
        )}

        {/* DOWNLOADING STATE */}
        {modalState === 'DOWNLOADING' && (
          <div className="space-y-5 py-2 relative z-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Download className="w-7 h-7 animate-bounce" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Updating EXFIN OMS</h3>
              <p className="text-xs text-slate-400 mt-1">
                Downloading update... {downloadProgress > 0 ? `${downloadProgress}%` : ''}
              </p>
            </div>

            <div className="space-y-2">
              <div className="w-full bg-slate-800 rounded-full h-3 p-0.5 overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, downloadProgress))}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400 px-1 font-mono">
                <span>
                  {bytesTotal > 0
                    ? `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} MB / ${(bytesTotal / (1024 * 1024)).toFixed(1)} MB`
                    : bytesDownloaded > 0
                    ? `${(bytesDownloaded / (1024 * 1024)).toFixed(1)} MB`
                    : `Version ${manifest.versionName}`}
                </span>
                <span className="font-bold text-cyan-300">
                  {bytesTotal > 0 || downloadProgress > 0 ? `${downloadProgress}%` : 'Connecting...'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Please keep the app open while the update downloads.
            </p>
          </div>
        )}

        {/* DOWNLOADED / LAUNCHING STATE */}
        {modalState === 'DOWNLOADED' && (
          <div className="space-y-4 py-2 relative z-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Installing Update...</h3>
              <p className="text-xs text-emerald-300 mt-1 font-medium">Android installer launched</p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 text-xs text-slate-300 space-y-1 text-left">
              <p className="font-semibold text-emerald-400">Next Step:</p>
              <p>Please confirm the update prompt on your screen to complete installation.</p>
            </div>

            <button
              type="button"
              onClick={handleLater}
              className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* PERMISSION REQUIRED STATE */}
        {modalState === 'PERMISSION_REQUIRED' && (
          <div className="space-y-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Permission Required</h3>
              <p className="text-xs text-slate-300 mt-1">
                To update EXFIN OMS, Android requires permission to install apps from this source.
              </p>
            </div>

            <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-3 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-amber-300">How to allow:</p>
              <p>1. Tap "Open Settings" below.</p>
              <p>2. Enable "Allow from this source".</p>
              <p>3. Return here to proceed with the update.</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleLater}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Settings</span>
              </button>
            </div>
          </div>
        )}

        {/* FAILED STATE */}
        {modalState === 'FAILED' && (
          <div className="space-y-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Update Could Not Be Downloaded</h3>
              <p className="text-xs text-rose-300 mt-1">
                {errorMessage || 'A network error occurred while downloading the update.'}
              </p>
            </div>

            <p className="text-xs text-slate-400">
              You can continue using the application normally and retry the update whenever convenient.
            </p>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleLater}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartUpdate}
                className="flex-1 py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
