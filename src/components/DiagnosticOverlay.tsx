import React, { useState, useEffect } from 'react';

let reactRootMountCount = 0;
let appMountCount = 0;
let appUnmountCount = 0;
let offlineMountCount = 0;
let offlineUnmountCount = 0;
let visibilityChangeCount = 0;
let reloadCount = 0;

if (typeof window !== 'undefined') {
  try {
    const navEntry = performance.getEntriesByType && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming);
    if (navEntry && navEntry.type === 'reload') {
      reloadCount = (parseInt(sessionStorage.getItem('__exfin_reload_count') || '0', 10) + 1);
      sessionStorage.setItem('__exfin_reload_count', reloadCount.toString());
    }
  } catch (e) {
    // Ignore performance/session storage errors
  }
}

export function recordReactRootMount() {
  reactRootMountCount++;
}

export function recordAppMount() {
  appMountCount++;
}

export function recordAppUnmount() {
  appUnmountCount++;
}

export function recordOfflineMount() {
  offlineMountCount++;
}

export function recordOfflineUnmount() {
  offlineUnmountCount++;
}

export function DiagnosticOverlay() {
  const [state, setState] = useState({
    bootCount: (typeof window !== 'undefined' ? (window as any).__EXFIN_STARTUP_COUNT || 1 : 1),
    reactRootMount: reactRootMountCount,
    appMount: appMountCount,
    appUnmount: appUnmountCount,
    offlineMount: offlineMountCount,
    offlineUnmount: offlineUnmountCount,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    route: typeof window !== 'undefined' ? window.location.pathname : '/',
    visibility: typeof document !== 'undefined' ? document.visibilityState : 'visible',
    visibilityChanges: visibilityChangeCount,
    lastEvent: 'INITIALIZED',
    lastError: 'None',
    reloads: reloadCount,
    timestamp: new Date().toLocaleTimeString()
  });

  useEffect(() => {
    const updateStats = (eventLabel: string) => {
      setState(prev => ({
        ...prev,
        bootCount: (window as any).__EXFIN_STARTUP_COUNT || prev.bootCount,
        reactRootMount: reactRootMountCount,
        appMount: appMountCount,
        appUnmount: appUnmountCount,
        offlineMount: offlineMountCount,
        offlineUnmount: offlineUnmountCount,
        isOnline: navigator.onLine,
        route: window.location.pathname,
        visibility: document.visibilityState,
        visibilityChanges: visibilityChangeCount,
        lastEvent: eventLabel,
        timestamp: new Date().toLocaleTimeString()
      }));
    };

    const handleOnline = () => updateStats('ONLINE_EVENT');
    const handleOffline = () => updateStats('OFFLINE_EVENT');
    const handleVisibility = () => {
      visibilityChangeCount++;
      updateStats(`VISIBILITY_${document.visibilityState.toUpperCase()}`);
    };

    const handleError = (e: ErrorEvent) => {
      setState(prev => ({
        ...prev,
        lastError: e.message ? e.message.substring(0, 40) : 'Unknown error'
      }));
    };

    const handleRejection = (e: PromiseRejectionEvent) => {
      setState(prev => ({
        ...prev,
        lastError: e.reason ? String(e.reason).substring(0, 40) : 'Promise rejection'
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    const interval = setInterval(() => {
      updateStats('TICK');
    }, 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
      clearInterval(interval);
    };
  }, []);

  const isReloadLoop = state.bootCount > 1 || state.reloads > 0;
  const isRemountLoop = state.appMount > 3 && (state.appMount - state.appUnmount > 2);

  return (
    <div id="exfin-diagnostic-overlay" className="fixed bottom-3 right-3 z-[99999] max-w-[320px] bg-slate-900/95 text-slate-100 p-3 rounded-lg shadow-2xl border border-red-500/50 text-[11px] font-mono leading-tight backdrop-blur-sm pointer-events-auto">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700">
        <span className="font-bold text-amber-400 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          EXFIN DIAGNOSTIC V6
        </span>
        <span className="text-[10px] text-slate-400">{state.timestamp}</span>
      </div>

      {isReloadLoop && (
        <div className="mb-2 p-1.5 bg-red-950/80 border border-red-500 rounded text-red-200 font-bold text-center animate-bounce">
          ⚠️ PAGE RELOAD DETECTED ({state.bootCount})
        </div>
      )}

      {isRemountLoop && (
        <div className="mb-2 p-1.5 bg-amber-950/80 border border-amber-500 rounded text-amber-200 font-bold text-center">
          ⚠️ REACT REMOUNT LOOP DETECTED
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-2">
        <div>Boot: <strong className="text-emerald-400">{state.bootCount}</strong></div>
        <div>React Root: <strong className="text-emerald-400">{state.reactRootMount}</strong></div>
        <div>App Mount: <strong className="text-blue-400">{state.appMount}</strong></div>
        <div>App Unmount: <strong className="text-purple-400">{state.appUnmount}</strong></div>
        <div>Offline Mount: <strong className="text-amber-400">{state.offlineMount}</strong></div>
        <div>Offline Unmount: <strong className="text-amber-400">{state.amber ? '' : ''}{state.offlineUnmount}</strong></div>
        <div>Network: <strong className={state.isOnline ? "text-emerald-400" : "text-rose-400"}>{state.isOnline ? 'ONLINE' : 'OFFLINE'}</strong></div>
        <div>Visibility: <strong className="text-cyan-400">{state.visibility} ({state.visibilityChanges})</strong></div>
      </div>

      <div className="space-y-0.5 border-t border-slate-800 pt-1.5 text-[10px] text-slate-300">
        <div>Route: <span className="text-slate-200">{state.route}</span></div>
        <div>Last Event: <span className="text-amber-300">{state.lastEvent}</span></div>
        <div>Last Error: <span className="text-rose-400 truncate block">{state.lastError}</span></div>
      </div>
    </div>
  );
}
