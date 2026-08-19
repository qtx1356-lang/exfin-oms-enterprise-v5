import React, { useState, useEffect } from 'react';
import {
  Activity,
  Wifi,
  WifiOff,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Server,
  Shield,
  Clock,
  Layers,
  FileText,
  Lock,
  Trash2,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { APP_VERSION, SERVICE_WORKER_VERSION } from '../../config/version';
import { getSyncSummary } from '../../services/sync/syncFailureService';
import { getRecentErrors, getLastError, clearErrorLogs, ErrorLogEntry } from '../../services/monitoring/errorLogger';
import { getResourceSnapshot, ResourceSnapshot } from '../../services/monitoring/performanceDiagnostics';
import { SyncSummary } from '../../types/sync';
import { db } from '../../services/firebase/config';
import { usePermission } from '../../context/PermissionContext';
import { DeleteAllDataSection } from './DeleteAllDataSection';

interface SystemHealthSectionProps {
  isSuperAdminUser?: boolean;
}

export const SystemHealthSection: React.FC<SystemHealthSectionProps> = ({ isSuperAdminUser: isSuperAdminProp }) => {
  const { isSuperAdmin } = usePermission();
  const isSuperAdminUser = isSuperAdminProp ?? isSuperAdmin();

  const [summary, setSummary] = useState<SyncSummary>(getSyncSummary());
  const [lastErr, setLastErr] = useState<ErrorLogEntry | null>(getLastError());
  const [allErrors, setAllErrors] = useState<ErrorLogEntry[]>(getRecentErrors());
  const [resources, setResources] = useState<ResourceSnapshot>(getResourceSnapshot());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshHealth = () => {
    setIsRefreshing(true);
    setSummary(getSyncSummary());
    setLastErr(getLastError());
    setAllErrors(getRecentErrors());
    setResources(getResourceSnapshot());
    setTimeout(() => setIsRefreshing(false), 400);
  };

  useEffect(() => {
    refreshHealth();
    const timer = setInterval(refreshHealth, 10000);
    return () => clearInterval(timer);
  }, []);

  const isOnline = navigator.onLine;
  const firebaseConnected = !!db && isOnline;

  const handleClearLogs = () => {
    if (window.confirm('Clear local system error logs?')) {
      clearErrorLogs();
      refreshHealth();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 bg-[#2D1B5A] border border-purple-500/20 rounded-[22px] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-500/40 flex items-center justify-center text-purple-300">
            <Activity className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              System Health & Reliability
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {APP_VERSION}
              </span>
            </h2>
            <p className="text-xs text-purple-300/70">
              Live enterprise operational status, sync queue metrics, and error telemetry.
            </p>
          </div>
        </div>

        <Button variant="outline" onClick={refreshHealth} disabled={isRefreshing} className="text-xs">
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Metrics
        </Button>
      </div>

      {/* Admin Compact System Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Network Connectivity */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[20px] space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-purple-300/70">
            <span>NETWORK</span>
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-400" />
            )}
          </div>
          <p className="text-sm font-black flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {isOnline ? 'Online' : 'Offline Mode'}
          </p>
          <p className="text-[10px] text-purple-300/60">Browser network status</p>
        </Card>

        {/* Firebase Firestore */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[20px] space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-purple-300/70">
            <span>DATABASE</span>
            <Database className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-sm font-black flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                firebaseConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {firebaseConnected ? 'Firebase Active' : 'Offline / Standby'}
          </p>
          <p className="text-[10px] text-purple-300/60">Firestore DB connection</p>
        </Card>

        {/* Sync Queue */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[20px] space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-purple-300/70">
            <span>SYNC QUEUE</span>
            {summary.totalFailed > 0 ? (
              <AlertTriangle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <p className="text-sm font-black">
            {summary.totalPending} Pending /{' '}
            <span className={summary.totalFailed > 0 ? 'text-red-400 font-extrabold' : ''}>
              {summary.totalFailed} Failed
            </span>
          </p>
          <p className="text-[10px] text-purple-300/60">
            Last Sync: {summary.lastSyncTime ? new Date(summary.lastSyncTime).toLocaleTimeString() : 'N/A'}
          </p>
        </Card>

        {/* App & Service Worker Version */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[20px] space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-purple-300/70">
            <span>SOFTWARE VERSION</span>
            <Server className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xs font-black text-white">{APP_VERSION}</p>
          <p className="text-[10px] text-purple-300/60 font-mono">PWA Cache: {SERVICE_WORKER_VERSION}</p>
        </Card>
      </div>

      {/* Backup & Recovery Indicator */}
      <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-200">
              Disaster Recovery & Backup Status
            </h3>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Backup Configuration Required
          </span>
        </div>
        <p className="text-xs text-purple-300/80 leading-relaxed">
          Local client offline-first storage and dead-letter queues are actively protecting user submissions. Cloud automated point-in-time Firestore exports require Google Cloud Backup configuration on the Firebase project instance.
        </p>
      </Card>

      {/* Super Admin Monitoring Details */}
      {isSuperAdminUser && (
        <div className="space-y-6 pt-2">
          <DeleteAllDataSection />

          <div className="flex items-center justify-between border-b border-purple-500/20 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-purple-300 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" /> Advanced System Telemetry
            </h3>
            <span className="text-xs font-bold text-purple-300/70">Privileged Access Level</span>
          </div>

          {/* Module Unsynced Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {(Object.keys(summary.moduleCounts) as Array<keyof typeof summary.moduleCounts>).map((mod) => {
              const counts = summary.moduleCounts[mod];
              return (
                <div
                  key={mod}
                  className="p-3 bg-[#211044] border border-purple-500/15 rounded-xl space-y-1"
                >
                  <span className="text-[10px] font-bold text-purple-300/70 block uppercase truncate">
                    {mod}
                  </span>
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-amber-300">{counts.pending} pnd</span>
                    <span className={`text-xs font-bold ${counts.failed > 0 ? 'text-red-400' : 'text-purple-300/50'}`}>
                      {counts.failed} err
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resource Lifecycle & Anti-Leak Diagnostics */}
          <div className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-purple-200 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" /> Resource Lifecycle & Memory Diagnostics
                </h4>
                <p className="text-[11px] text-purple-300/70">
                  Real-time active listener, timer, and sync-lock monitoring.
                </p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${resources.isSyncEngineLocked ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                {resources.isSyncEngineLocked ? 'Sync Active' : 'Idle & Healthy'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[#211044] border border-purple-500/15 rounded-xl text-center">
                <span className="text-[10px] font-bold text-purple-300/70 block uppercase">Active Watchers</span>
                <span className="text-lg font-black text-purple-200">{resources.locationWatchers}</span>
              </div>
              <div className="p-3 bg-[#211044] border border-purple-500/15 rounded-xl text-center">
                <span className="text-[10px] font-bold text-purple-300/70 block uppercase">Network Listeners</span>
                <span className="text-lg font-black text-purple-200">{resources.onlineListeners + resources.offlineListeners}</span>
              </div>
              <div className="p-3 bg-[#211044] border border-purple-500/15 rounded-xl text-center">
                <span className="text-[10px] font-bold text-purple-300/70 block uppercase">Active Timers</span>
                <span className="text-lg font-black text-purple-200">{resources.syncTimers}</span>
              </div>
              <div className="p-3 bg-[#211044] border border-purple-500/15 rounded-xl text-center">
                <span className="text-[10px] font-bold text-purple-300/70 block uppercase">Sync Concurrency</span>
                <span className="text-lg font-black text-purple-200">{resources.isSyncEngineLocked ? '1 (Locked)' : '0 (Unlocked)'}</span>
              </div>
            </div>
          </div>

          {/* Error Logs Telemetry */}
          <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-purple-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-400" /> System Error Logs ({allErrors.length})
                </h4>
                <p className="text-[11px] text-purple-300/70">
                  Recent client runtime and network exceptions (sanitized for credentials & tokens).
                </p>
              </div>
              {allErrors.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-bold transition-all flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Logs
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {allErrors.length === 0 ? (
                <p className="text-xs text-purple-300/60 py-6 text-center italic">
                  No critical application errors recorded.
                </p>
              ) : (
                allErrors.map((err) => (
                  <div
                    key={err.id}
                    className="p-3 bg-[#110B29] border border-purple-500/15 rounded-xl space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-purple-200 uppercase">
                        [{err.category}] {err.message}
                      </span>
                      <span className="text-[10px] text-purple-300/60">
                        {new Date(err.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {err.stack && (
                      <p className="text-[10px] font-mono text-purple-300/60 truncate">
                        {err.stack.split('\n')[0]}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
