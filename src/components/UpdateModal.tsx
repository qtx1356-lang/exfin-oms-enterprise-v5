import React, { useState, useEffect } from 'react';
import { Download, AlertCircle, RefreshCw, CheckCircle2, ShieldAlert } from 'lucide-react';
import { checkForAppUpdate, startAppUpdateDownload, UpdateCheckResult } from '../services/attendance/nativeUpdateBridge';

export function UpdateModal() {
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const result = await checkForAppUpdate();
        if (result && result.hasUpdate) {
          const dismissedVersion = localStorage.getItem('exfin_oms_dismissed_version_code');
          if (result.isForceUpdate || !dismissedVersion || parseInt(dismissedVersion, 10) < result.remote.latestVersionCode) {
            setUpdateInfo(result);
            setIsOpen(true);
          }
        }
      } catch (e) {
        console.warn('[UpdateModal] Check failed:', e);
      }
    }

    // Check on startup after 2 seconds
    const timer = setTimeout(check, 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdateNow = async () => {
    if (!updateInfo) return;
    setIsDownloading(true);
    setErrorMessage(null);
    setDownloadProgress('Preparing download...');

    try {
      setDownloadProgress('Downloading update (Android will prompt to install)...');
      await startAppUpdateDownload(updateInfo.remote.updateUrl);
    } catch (err: any) {
      console.error('[UpdateModal] Update download failed:', err);
      setErrorMessage(err?.message || 'Failed to download update. Please check connection.');
      setIsDownloading(false);
    }
  };

  const handleLater = () => {
    if (updateInfo && !updateInfo.isForceUpdate) {
      localStorage.setItem('exfin_oms_dismissed_version_code', updateInfo.remote.latestVersionCode.toString());
      setIsOpen(false);
    }
  };

  if (!isOpen || !updateInfo) {
    return null;
  }

  const { remote, installed, isForceUpdate } = updateInfo;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className={`p-6 text-white ${isForceUpdate ? 'bg-rose-600' : 'bg-slate-900'}`}>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-md">
              {isForceUpdate ? <ShieldAlert className="w-7 h-7 text-white" /> : <Download className="w-7 h-7 text-white" />}
            </div>
            <div>
              <h3 className="text-xl font-bold">
                {isForceUpdate ? 'Update Required' : 'New Version Available'}
              </h3>
              <p className="text-slate-200 text-sm mt-0.5">
                Exfin OMS v{remote.latestVersionName} (Build {remote.latestVersionCode})
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-800 mb-2">
              {isForceUpdate 
                ? 'A critical security and compatibility update is required to continue using Exfin OMS.'
                : `A newer version of Exfin OMS is available (Installed: v${installed.versionName}).`}
            </p>

            {remote.releaseNotes && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mt-3 space-y-1">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">What's New:</span>
                <div className="text-slate-700 whitespace-pre-line text-xs mt-1 leading-relaxed">
                  {remote.releaseNotes}
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isDownloading && (
            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl flex items-center space-x-3 text-sky-800">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-600 shrink-0" />
              <div className="text-xs">
                <p className="font-semibold">Downloading update...</p>
                <p className="text-sky-600 mt-0.5">{downloadProgress}</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center space-x-3 pt-2">
            {!isForceUpdate && !isDownloading && (
              <button
                onClick={handleLater}
                className="flex-1 py-3 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-sm transition-colors"
              >
                Later
              </button>
            )}
            <button
              onClick={handleUpdateNow}
              disabled={isDownloading}
              className={`flex-1 py-3 px-4 text-white font-semibold rounded-xl text-sm transition-colors shadow-sm flex items-center justify-center space-x-2 ${
                isForceUpdate ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'
              } ${isDownloading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Update Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
