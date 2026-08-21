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

  return null;
};
