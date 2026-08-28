import React, { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { syncAllPendingRecords } from '../../services/sync/globalSyncEngine';
import { getSyncSummary } from '../../services/sync/syncFailureService';
import { SyncSummary } from '../../types/sync';
import { useNetworkStatus } from '../../services/network/networkStatusService';

export const GlobalSyncStatus: React.FC = () => {
  const navigate = useNavigate();
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus.isOnline;
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [summary, setSummary] = useState<SyncSummary>(getSyncSummary());

  const calculateCounts = () => {
    setSummary(getSyncSummary());
  };

  useEffect(() => {
    calculateCounts();

    const handleSyncEvent = () => {
      calculateCounts();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        calculateCounts();
      }
    };

    window.addEventListener('exfin-sync-summary-updated', handleSyncEvent);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('exfin-sync-summary-updated', handleSyncEvent);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleManualSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isOnline) {
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
