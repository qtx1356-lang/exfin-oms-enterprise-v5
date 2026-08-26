import React, { useState, useEffect } from 'react';
import { Download, Smartphone, ShieldCheck, Zap, Bell, MapPin, CheckCircle2, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function NativeMigrationScreen() {
  const navigate = useNavigate();
  const [versionInfo, setVersionInfo] = useState({
    latestVersionName: '2.5.0',
    latestVersionCode: 25,
    updateUrl: '/downloads/exfin-oms-v2.5.0.apk',
    releaseNotes: '• Faster automatic check-in\n• Reliable background 25m exit detection\n• Improved notifications & battery efficiency'
  });

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
        console.warn('Could not fetch app version for migration screen:', e);
      }
    }
    fetchVer();
  }, []);

  // Check if running on Android vs Desktop vs iOS
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isAndroid = /android/i.test(userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-emerald-500 selection:text-black">
      <div className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-10 space-y-8 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Brand / Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.2)] mb-2">
            <Smartphone className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="inline-block px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold rounded-full mb-1">
            Official Migration Gateway
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Exfin OMS Native App Required
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-md mx-auto">
            Exfin OMS has moved to a dedicated native Android application for faster and more reliable attendance, automatic check-in, and background location detection.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl flex items-start space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0 mt-0.5">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Precise 25m Geofence</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Reliable background entry & exit tracking.</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl flex items-start space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Automatic Check-In</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Instant verification without opening app.</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl flex items-start space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Instant Notifications</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Never miss attendance reminders & alerts.</p>
            </div>
          </div>

          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-2xl flex items-start space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white">Seamless Security</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Uses your existing employee account & data.</p>
            </div>
          </div>
        </div>

        {/* Platform Notice */}
        {isIOS ? (
          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 text-xs text-center">
            <p className="font-bold mb-1">iOS Device Detected</p>
            Exfin OMS native app is built for Android. Please access this page on your Android smartphone to install the native app.
          </div>
        ) : !isAndroid ? (
          <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-2xl text-sky-300 text-xs text-center">
            <p className="font-bold mb-1">Desktop / Web Browser Detected</p>
            Exfin OMS is now available as a native Android app. Please open this link on your Android device to download and install.
          </div>
        ) : null}

        {/* Primary Download Action */}
        <div className="space-y-3 pt-2">
          <button
            onClick={() => navigate('/download-app')}
            className="w-full py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-2xl shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center space-x-3 group cursor-pointer"
          >
            <Download className="w-5 h-5 transition-transform group-hover:translate-y-0.5" />
            <span>DOWNLOAD NATIVE APP</span>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </button>

          <div className="flex items-center justify-between text-xs text-slate-400 px-2 pt-1">
            <span>Latest Version: {versionInfo.latestVersionName} (Build {versionInfo.latestVersionCode})</span>
            <span className="text-emerald-400 font-semibold">Official & Secure APK</span>
          </div>
        </div>

        {/* Footer info */}
        <div className="border-t border-slate-800/80 pt-4 text-center text-[11px] text-slate-500">
          Exfin OMS Employee Portal &bull; Enterprise Attendance & Workforce Management
        </div>

      </div>
    </div>
  );
}
