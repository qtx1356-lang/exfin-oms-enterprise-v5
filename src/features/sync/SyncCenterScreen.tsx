import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SyncModule, SyncRecordItem, SyncSummary } from '../../types/sync';
import {
  getAllSyncRecords,
  getSyncSummary,
  retrySyncRecord,
  retryAllSyncRecords,
  safeRemoveSyncRecord,
} from '../../services/sync/syncFailureService';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';

const MODULE_LIST: SyncModule[] = [
  'Attendance',
  'Expenses',
  'WorkPlanner',
  'Leave',
  'Profile',
  'Notifications',
];

export const SyncCenterScreen: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SyncSummary>(getSyncSummary());
  const [records, setRecords] = useState<SyncRecordItem[]>(getAllSyncRecords());
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<SyncRecordItem | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
    Attendance: true,
    Expenses: true,
    WorkPlanner: true,
    Leave: true,
    Profile: true,
    Notifications: true,
  });

  const refreshData = () => {
    setSummary(getSyncSummary());
    setRecords(getAllSyncRecords());
  };

  useEffect(() => {
    refreshData();
    const handleSyncEvent = () => refreshData();
    const handleOnlineStatus = () => refreshData();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshData();
    };

    window.addEventListener('exfin-sync-summary-updated', handleSyncEvent);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('exfin-sync-summary-updated', handleSyncEvent);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const handleRetryOne = async (record: SyncRecordItem) => {
    setIsSyncing(true);
    await retrySyncRecord(record.id);
    setIsSyncing(false);
    refreshData();
  };

  const handleRetryAll = async () => {
    setIsSyncing(true);
    await retryAllSyncRecords();
    setIsSyncing(false);
    refreshData();
  };

  const handleRemoveOne = (record: SyncRecordItem) => {
    if (window.confirm(`Are you sure you want to safely remove this ${record.module} failed item from local storage?`)) {
      safeRemoveSyncRecord(record);
      refreshData();
    }
  };

  const toggleModule = (mod: string) => {
    setExpandedModules((prev) => ({ ...prev, [mod]: !prev[mod] }));
  };

  const getStatusBadge = () => {
    switch (summary.status) {
      case 'offline':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <WifiOff className="w-3.5 h-3.5" /> OFFLINE
          </span>
        );
      case 'sync_failed':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/30">
            <AlertTriangle className="w-3.5 h-3.5" /> SYNC FAILED ({summary.totalFailed})
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--primary)]/20 text-[var(--primary-light)] border border-[var(--primary)]/30">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> PENDING SYNC ({summary.totalPending})
          </span>
        );
      case 'syncing':
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[var(--primary)]/20 text-[var(--primary-light)] border border-[var(--primary)]/30">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> SYNCING...
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" /> ALL SYNCED
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 text-[var(--text-primary)] max-w-4xl mx-auto pb-16 font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-[var(--surface-inner)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-all cursor-pointer"
            aria-label="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-black text-[var(--text-primary)] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[var(--primary-light)]" />
              Sync Failure Center
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Manage local record queues, retries, and offline failures.
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-[var(--surface-inner)] border border-[var(--border)] flex flex-col justify-between shadow-md">
          <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">System Status</span>
          <span className="text-sm font-extrabold capitalize mt-1 text-[var(--text-primary)]">
            {summary.status.replace('_', ' ')}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-inner)] border border-[var(--border)] flex flex-col justify-between shadow-md">
          <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">Pending Sync</span>
          <span className="text-2xl font-black text-[var(--primary-light)]">{summary.totalPending}</span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-inner)] border border-[var(--border)] flex flex-col justify-between shadow-md">
          <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">Failed (Dead Letter)</span>
          <span className="text-2xl font-black text-red-400">{summary.totalFailed}</span>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface-inner)] border border-[var(--border)] flex flex-col justify-between shadow-md">
          <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase">Last Sync</span>
          <span className="text-xs font-bold text-[var(--text-primary)] mt-1">
            {summary.lastSyncTime ? new Date(summary.lastSyncTime).toLocaleTimeString() : 'Not Yet'}
          </span>
        </div>
      </div>

      {/* Primary Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-inner)] border border-[var(--border)] p-3.5 rounded-2xl shadow-md">
        <span className="text-xs text-[var(--text-secondary)] font-semibold">
          Total Queue: {records.length} item(s) awaiting cloud synchronization
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={isSyncing}
            className="text-xs border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-inner)] text-[var(--text-primary)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleRetryAll}
            disabled={isSyncing || records.length === 0 || !navigator.onLine}
            className="text-xs bg-[var(--button-primary)] hover:opacity-90 text-white font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
            Retry All Records
          </Button>
        </div>
      </div>

      {/* Module Breakdown Accordions */}
      <div className="space-y-4">
        {MODULE_LIST.map((mod) => {
          const modRecords = records.filter((r) => r.module === mod);
          const isExpanded = expandedModules[mod];
          const failedCount = modRecords.filter((r) => r.status === 'failed' || r.isDeadLetter).length;

          return (
            <div
              key={mod}
              className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg"
            >
              <div
                onClick={() => toggleModule(mod)}
                className="p-4 bg-[var(--surface-inner)] hover:bg-[var(--surface-elevated)] cursor-pointer flex items-center justify-between transition-colors border-b border-[var(--border)]"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-extrabold text-sm text-[var(--text-primary)]">{mod}</span>
                  {modRecords.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[var(--surface-elevated)] text-[var(--primary-light)] border border-[var(--border)]">
                      {modRecords.length} queued
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Fully Synced
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/30">
                      {failedCount} failed
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[var(--text-secondary)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--text-secondary)]" />
                )}
              </div>

              {isExpanded && (
                <div className="p-4 space-y-3 bg-[var(--surface-inner)]">
                  {modRecords.length === 0 ? (
                    <p className="text-xs text-[var(--text-secondary)]/70 py-3 text-center italic">
                      No unsynchronized or failed records for {mod}.
                    </p>
                  ) : (
                    modRecords.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-3.5 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-bold text-[var(--text-primary)] block">
                              {rec.recordType}
                            </span>
                            <span className="text-[10px] text-[var(--text-secondary)] font-mono">
                              ID: {rec.recordId}
                            </span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                              rec.status === 'failed' || rec.isDeadLetter
                                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            {rec.isDeadLetter ? 'DEAD LETTER' : rec.status} (Attempt #{rec.attemptCount})
                          </span>
                        </div>

                        <p className="text-xs text-[var(--text-secondary)] font-medium">
                          {rec.payloadSummary}
                        </p>

                        {rec.lastError && (
                          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[11px] text-red-300">
                            <strong>Error:</strong> {rec.lastError}
                          </div>
                        )}

                        <div className="pt-2 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Created: {new Date(rec.createdAtDeviceTime).toLocaleString()}
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setSelectedRecord(rec)}
                              className="px-2.5 py-1 rounded-lg bg-[var(--surface-inner)] hover:bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text-primary)] font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3 text-[var(--primary-light)]" /> Payload
                            </button>
                            <button
                              onClick={() => handleRemoveOne(rec)}
                              className="px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 font-bold transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" /> Safe Remove
                            </button>
                            <button
                              onClick={() => handleRetryOne(rec)}
                              disabled={isSyncing || !navigator.onLine}
                              className="px-2.5 py-1 rounded-lg bg-[var(--button-primary)] hover:opacity-90 text-white font-bold transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            >
                              <RefreshCw className="w-3 h-3" /> Retry
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Record Payload Modal */}
      {selectedRecord && (
        <Dialog
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title={`Payload Details: ${selectedRecord.recordType}`}
        >
          <div className="space-y-4 font-sans text-[var(--text-primary)]">
            <div className="space-y-1">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Module:</span>
              <p className="text-sm font-extrabold text-[var(--text-primary)]">{selectedRecord.module}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-[var(--text-secondary)]">Created Device Time:</span>
              <p className="text-xs text-[var(--text-secondary)]">{new Date(selectedRecord.createdAtDeviceTime).toLocaleString()}</p>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-[var(--text-secondary)] font-mono">Payload JSON:</span>
              <pre className="p-3 bg-[var(--surface-elevated)] border border-[var(--border)] rounded-xl text-[11px] font-mono text-[var(--primary-light)] overflow-x-auto max-h-60">
                {JSON.stringify(selectedRecord.payload || {}, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="text" onClick={() => setSelectedRecord(null)} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Close
              </Button>
              <Button
                onClick={() => {
                  handleRetryOne(selectedRecord);
                  setSelectedRecord(null);
                }}
                disabled={!navigator.onLine}
                className="bg-[var(--button-primary)] text-white hover:opacity-90 font-bold"
              >
                Retry Synchronization
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
