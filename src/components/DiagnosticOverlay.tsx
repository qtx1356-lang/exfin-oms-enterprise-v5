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
    lastEvent: 'REACT_MOUNTED',
    lastError: 'None',
    reloads: reloadCount,
    timestamp: new Date().toLocaleTimeString()
  });

  useEffect(() => {
    const updateStats = (eventLabel: string) => {
      const newState = {
        bootCount: (window as any).__EXFIN_STARTUP_COUNT || 1,
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
        timestamp: new Date().toLocaleTimeString(),
        reloads: reloadCount,
        lastError: 'None'
      };
      setState(newState);
      (window as any).__EXFIN_DIAG_STATE = newState;
      if (typeof (window as any).__EXFIN_UPDATE_DIAGNOSTIC === 'function') {
        (window as any).__EXFIN_UPDATE_DIAGNOSTIC(newState);
      }
    };

    const handleOnline = () => updateStats('ONLINE_EVENT');
    const handleOffline = () => updateStats('OFFLINE_EVENT');
    const handleVisibility = () => {
      visibilityChangeCount++;
      updateStats(`VISIBILITY_${document.visibilityState.toUpperCase()}`);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    const interval = setInterval(() => {
      updateStats('TICK');
    }, 500);

    updateStats('INITIALIZED');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, []);

  return null;
}

