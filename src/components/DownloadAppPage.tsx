import React, { useState, useEffect } from 'react';
import { Download, Smartphone, CheckCircle2, ArrowLeft, ExternalLink, ShieldCheck, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function DownloadAppPage() {
  const navigate = useNavigate();
  const [versionInfo, setVersionInfo] = useState({
    latestVersionName: '2.5.0',
    latestVersionCode: 25,
    updateUrl: '/downloads/exfin-oms-v2.5.0.apk',
    releaseNotes: '• Faster automatic check-in\n• Reliable background 25m exit detection\n• Improved notifications & battery efficiency',
    published: true
  });
  const [downloading, setDownloading] = useState(false);
  const [downloadStarted, setDownloadStarted] = useState(false);

  useEffect(() => {
    async function fetchVer() {
      try {
        const res = await fetch('/api/app-version');
        if (res.ok) {
          const data = await res.json();
          if (data && data.latestVersionName) {
            setVersionInfo(data);
          }
        }
      } catch (e) {
        console.warn('Could not fetch app version:', e);
      }
    }
    fetchVer();
  }, []);

  const handleDownload = () => {
    setDownloading(true);
    setDownloadStarted(true);

    // Trigger download
    const link = document.createElement('a');
    link.href = versionInfo.updateUrl;
    link.download = `ExfinOMS-v${versionInfo.latestVersionName}.apk`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      setDownloading(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-emerald-500 selection:text-black">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10 space-y-6">
        
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center space-x-2 text-slate-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Gateway</span>
          </button>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full">
            v{versionInfo.latestVersionName} (Build {versionInfo.latestVersionCode})
          </div>
        </div>

        {/* Header */}
        <div className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.2)]">
            <Download className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Exfin OMS Native Android App
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
            Install the official native Android app to continue using Exfin OMS with reliable automatic attendance and background location tracking.
          </p>
        </div>

        {/* Download Button */}
        <div className="space-y-3 pt-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center space-x-3 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-5 h-5" />
            <span>{downloading ? 'Preparing APK...' : 'DOWNLOAD NATIVE APP'}</span>
          </button>

          {downloadStarted && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs text-center animate-in fade-in">
              <p className="font-bold">Download started!</p>
              Open the downloaded APK file from your notifications or Downloads folder to install.
            </div>
          )}
        </div>

        {/* Release Notes */}
        {versionInfo.releaseNotes && (
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">What's New in v{versionInfo.latestVersionName}</h3>
            <div className="text-slate-400 text-xs whitespace-pre-line leading-relaxed">
              {versionInfo.releaseNotes}
            </div>
          </div>
        )}

        {/* Step-by-Step Instructions */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
            <HelpCircle className="w-4 h-4 text-emerald-400" />
            <span>Installation Guide</span>
          </h3>
          <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Tap <strong className="text-white">Download Native App</strong> above.</li>
            <li>Once downloaded, open the APK file (`ExfinOMS.apk`) from your device notifications.</li>
            <li>If Android displays a security prompt (<i>"Install from unknown sources"</i>), tap <strong className="text-white">Settings</strong> and enable <strong className="text-white">Allow from this source</strong>.</li>
            <li>Tap <strong className="text-white">Install</strong> to update/install Exfin OMS. Your existing account and data remain fully preserved.</li>
            <li>Open <strong className="text-white">Exfin OMS</strong> and continue your daily attendance seamlessly!</li>
          </ol>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-500 pt-1">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Official Signed APK &bull; Secure HTTPS Distribution</span>
        </div>

      </div>
    </div>
  );
}
