import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { syncAllPendingRecords } from '../../services/sync/globalSyncEngine';
import { getSyncSummary } from '../../services/sync/syncFailureService';
import { SyncSummary } from '../../types/sync';
import {
  trackResourceCreated,
  trackResourceCleaned,
} from '../../services/monitoring/performanceDiagnostics';

export const GlobalSyncStatus: React.FC = () => {
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [summary, setSummary] = useState<SyncSummary>(getSyncSummary());

  const calculateCounts = () => {
    setIsOnline(navigator.onLine);
    setSummary(getSyncSummary());
  };

  useEffect(() => {
    calculateCounts();

    const handleOnline = () => {
      setIsOnline(true);
      calculateCounts();
    };

    const handleOffline = () => {
      setIsOnline(false);
      calculateCounts();
    };

    const handleSyncEvent = () => {
      calculateCounts();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        calculateCounts();
      }
    };

    const onlineListenerId = 'global_sync_status_online';
    const offlineListenerId = 'global_sync_status_offline';
    trackResourceCreated('ONLINE_LISTENER', onlineListenerId);
    trackResourceCreated('OFFLINE_LISTENER', offlineListenerId);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('exfin-sync-summary-updated', handleSyncEvent);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      trackResourceCleaned('ONLINE_LISTENER', onlineListenerId);
      trackResourceCleaned('OFFLINE_LISTENER', offlineListenerId);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('exfin-sync-summary-updated', handleSyncEvent);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigator.onLine) {
      navigate('/sync-center');
      return;
    }
    setIsSyncing(true);
    await syncAllPendingRecords();
    setIsSyncing(false);
    calculateCounts();
  };

  const handleGoToSyncCenter = () => {
    navigate('/sync-center');
  };

  return (
    <div className="flex items-center gap-2">
      {!isOnline ? (
        <button
          onClick={handleGoToSyncCenter}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-all cursor-pointer"
          title="Click to open Sync Center"
        >
          <WifiOff className="w-3.5 h-3.5" /> OFFLINE
        </button>
      ) : isSyncing ? (
        <button
          onClick={handleGoToSyncCenter}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer"
          title="Click to open Sync Center"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" /> Syncing...
        </button>
      ) : summary.totalFailed > 0 ? (
        <button
          onClick={handleGoToSyncCenter}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all cursor-pointer"
          title="Click to open Sync Failure Center"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span>Sync Failed ({summary.totalFailed})</span>
        </button>
      ) : summary.totalPending > 0 ? (
        <button
          onClick={handleManualSync}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 transition-all cursor-pointer"
          title="Click to trigger sync or view pending items"
        >
          <RefreshCw className="w-3.5 h-3.5 text-purple-300" />
          <span>Pending Sync ({summary.totalPending})</span>
        </button>
      ) : null}
    </div>
  );
};
