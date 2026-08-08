import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle2, AlertTriangle, Layers, X } from 'lucide-react';
import { syncAllPendingRecords } from '../../services/sync/globalSyncEngine';
import { getDeadLetterQueue, DeadLetterItem, retryDeadLetterItem, clearDeadLetterQueue } from '../../services/sync/syncQueueService';
import { getPendingAttendanceRecords } from '../../services/attendance/attendanceStorage';
import { getPendingExpenseRecords } from '../../services/expenses/expenseStorage';
import { getPendingTasks } from '../../services/planner/taskStorage';
import { getPendingLeaves } from '../../services/leave/leaveStorage';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export const GlobalSyncStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [deadLetterItems, setDeadLetterItems] = useState<DeadLetterItem[]>([]);
  const [showQueueModal, setShowQueueModal] = useState<boolean>(false);

  const calculateCounts = () => {
    const att = getPendingAttendanceRecords().length;
    const exp = getPendingExpenseRecords().length;
    const task = getPendingTasks().length;
    const leave = getPendingLeaves().length;
    setPendingCount(att + exp + task + leave);
    setDeadLetterItems(getDeadLetterQueue());
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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(calculateCounts, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await syncAllPendingRecords();
    setIsSyncing(false);
    calculateCounts();
  };

  const handleRetryItem = (id: string) => {
    retryDeadLetterItem(id);
    handleManualSync();
  };

  const failedCount = deadLetterItems.filter((i) => i.status === 'failed').length;

  return (
    <>
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <WifiOff className="w-3.5 h-3.5" /> OFFLINE
          </span>
        ) : isSyncing ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" /> Syncing...
          </span>
        ) : failedCount > 0 ? (
          <button
            onClick={() => setShowQueueModal(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-all"
            title="Click to view failed sync records"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span>Sync Failed ({failedCount})</span>
          </button>
        ) : pendingCount > 0 ? (
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30 hover:bg-purple-500/30 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Pending Sync ({pendingCount})</span>
          </button>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Synced
          </span>
        )}
      </div>

      {/* Dead Letter Queue Modal */}
      <Dialog
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        title="Sync Failures & Retry Queue"
      >
        <div className="space-y-4">
          <p className="text-xs text-purple-300/80">
            The following items failed to synchronize automatically with the cloud database. You can retry individual items or trigger a full synchronization.
          </p>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {deadLetterItems.length > 0 ? (
              deadLetterItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-[#211044] border border-purple-500/20 rounded-xl flex flex-col gap-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-purple-200">
                      [{item.module}] {item.payloadSummary}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                        item.status === 'failed'
                          ? 'bg-red-500/20 text-red-300 border-red-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {item.status.toUpperCase()} (Attempt #{item.attemptCount})
                    </span>
                  </div>

                  <p className="text-[11px] text-red-300/90 font-medium">
                    Reason: {item.failureReason}
                  </p>

                  <div className="flex justify-between items-center text-[10px] text-purple-300/60 pt-1 border-t border-purple-500/10">
                    <span>Last Attempt: {new Date(item.lastAttemptAt).toLocaleTimeString()}</span>
                    <button
                      onClick={() => handleRetryItem(item.id)}
                      className="px-2 py-1 rounded-lg bg-[#7C3AED] text-white font-bold hover:bg-[#6D28D9] transition-all flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry Now
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-center py-6 text-purple-300/60">
                No failed sync items in dead letter queue.
              </p>
            )}
          </div>

          <div className="flex justify-between gap-3 pt-2">
            <button
              onClick={() => {
                clearDeadLetterQueue();
                calculateCounts();
              }}
              className="text-xs text-red-400 hover:underline font-bold"
            >
              Clear Failure Queue
            </button>
            <div className="flex gap-2">
              <Button variant="text" onClick={() => setShowQueueModal(false)}>
                Close
              </Button>
              <Button onClick={handleManualSync} disabled={isSyncing}>
                Sync All Records
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
};
