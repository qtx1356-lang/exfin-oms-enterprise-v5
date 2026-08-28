import React, { useEffect, useState } from 'react';
import { getNativeDiagnosticInfo } from '../../services/attendance/nativeGeofenceBridge';
import { ShieldCheck, Activity, MapPin, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export const AttendanceMonitoringDiagnosticScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [diagnostic, setDiagnostic] = useState<any>(null);

  const loadDiagnostic = async () => {
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const info = await getNativeDiagnosticInfo();
        setDiagnostic(info);
      } else {
        setDiagnostic({
          locationMonitoring: 'INACTIVE (Web Mode)',
          finePermission: 'N/A',
          bgPermission: 'N/A',
          foregroundService: 'STOPPED',
          geofenceRegistered: false,
          activeSession: null,
          lastLocation: null,
          lastExitTime: null
        });
      }
    } catch (err) {
      console.error('[DiagnosticScreen] Error loading diagnostic info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiagnostic();
    const interval = setInterval(loadDiagnostic, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6 text-slate-100 font-sans">
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center">
            <Activity className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-wide">Native Location Monitoring Diagnostics</h2>
            <p className="text-xs text-slate-400">Authoritative Android Geofence & Background Service State</p>
          </div>
        </div>
        <button
          onClick={loadDiagnostic}
          disabled={loading}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center space-x-2 border border-slate-700 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <DiagnosticTile
          icon={<MapPin className="w-4 h-4 text-emerald-400" />}
          label="Location Monitoring"
          value={diagnostic?.locationMonitoring || 'INACTIVE'}
          status={diagnostic?.locationMonitoring === 'ACTIVE' ? 'good' : 'warning'}
        />
        <DiagnosticTile
          icon={<ShieldCheck className="w-4 h-4 text-blue-400" />}
          label="Fine Location Permission"
          value={diagnostic?.finePermission || 'UNKNOWN'}
          status={diagnostic?.finePermission === 'GRANTED' ? 'good' : 'bad'}
        />
        <DiagnosticTile
          icon={<ShieldCheck className="w-4 h-4 text-purple-400" />}
          label="Background Location"
          value={diagnostic?.bgPermission || 'UNKNOWN'}
          status={diagnostic?.bgPermission === 'GRANTED' ? 'good' : 'bad'}
        />
        <DiagnosticTile
          icon={<Activity className="w-4 h-4 text-amber-400" />}
          label="Foreground Service"
          value={diagnostic?.foregroundService || 'STOPPED'}
          status={diagnostic?.foregroundService === 'RUNNING' ? 'good' : 'warning'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        {/* Active Attendance Session */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>Active Attendance Session</span>
          </div>
          {diagnostic?.activeSession ? (
            <div className="space-y-2 text-xs font-mono text-slate-300">
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">Employee ID:</span>
                <span className="font-bold text-white">{diagnostic.activeSession.employeeId}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">Check-In Time:</span>
                <span className="text-emerald-400 font-bold">{diagnostic.activeSession.checkInTime}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">Session State:</span>
                <span className="text-indigo-300">{diagnostic.activeSession.sessionState}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">Authoritative Recorded Exit:</span>
                <span className="text-amber-300 font-bold">{diagnostic.activeSession.recordedExitTime || 'NONE (Inside 25m)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Exit Source:</span>
                <span className="text-purple-300">{diagnostic.activeSession.exitSource || 'NONE'}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-4 text-center italic">
              No active attendance session currently running on this device.
            </div>
          )}
        </div>

        {/* Last Location Update */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>Last Location Diagnostic</span>
          </div>
          {diagnostic?.lastLocation ? (
            <div className="space-y-2 text-xs font-mono text-slate-300">
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">Office Distance:</span>
                <span className={`font-bold ${diagnostic.lastLocation.distance <= 25 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {Math.round(diagnostic.lastLocation.distance)}m {diagnostic.lastLocation.distance <= 25 ? '(Inside 25m)' : '(Outside 25m)'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">GPS Accuracy:</span>
                <span>{Math.round(diagnostic.lastLocation.accuracy || 0)}m</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/80 pb-1">
                <span className="text-slate-500">Coordinates:</span>
                <span>{diagnostic.lastLocation.latitude?.toFixed(5)}, {diagnostic.lastLocation.longitude?.toFixed(5)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Last Fix Time:</span>
                <span>{new Date(diagnostic.lastLocation.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500 py-4 text-center italic">
              No recent background location fix recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DiagnosticTile: React.FC<{ icon: React.ReactNode; label: string; value: string; status: 'good' | 'warning' | 'bad' }> = ({
  icon,
  label,
  value,
  status
}) => {
  const getBadgeColor = () => {
    switch (status) {
      case 'good':
        return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
      case 'warning':
        return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
      case 'bad':
        return 'bg-rose-500/10 border-rose-500/30 text-rose-400';
    }
  };

  return (
    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2">
      <div className="flex items-center space-x-2 text-[11px] font-semibold text-slate-400">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`px-2.5 py-1 rounded-md border text-xs font-mono font-bold w-fit ${getBadgeColor()}`}>
        {value}
      </div>
    </div>
  );
};
