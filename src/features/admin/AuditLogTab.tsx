import React, { useEffect, useState, useMemo } from 'react';
import { db } from '../../services/firebase/config';
import { collection, query, orderBy, limit, getDocs, onSnapshot } from 'firebase/firestore';
import { AuditLogRecord, AuditActionCategory, AuditSource, AuditResult } from '../../types/audit';
import { formatIstTimestamp } from '../../services/audit/auditService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  FileText, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  Calendar, 
  User, 
  Smartphone, 
  Clock, 
  ChevronRight, 
  RefreshCw, 
  Layers,
  ArrowRight,
  Info,
  X
} from 'lucide-react';

export const AuditLogTab: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedResult, setSelectedResult] = useState<string>('ALL');
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS'>('ALL');

  // Selected log for detail modal
  const [activeLog, setActiveLog] = useState<AuditLogRecord | null>(null);
  const [showTechDetails, setShowTechDetails] = useState(false);

  // Pagination
  const [displayLimit, setDisplayLimit] = useState(50);

  useEffect(() => {
    if (!db) {
      setLoading(false);
      // Load local fallback if db is not connected
      try {
        const local = JSON.parse(localStorage.getItem('exfin_audit_logs_local') || '[]');
        setLogs(local);
      } catch (e) {}
      return;
    }

    try {
      const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(500));
      const unsub = onSnapshot(q, (snapshot) => {
        const fetched: AuditLogRecord[] = [];
        snapshot.docs.forEach((doc) => {
          fetched.push(doc.data() as AuditLogRecord);
        });
        setLogs(fetched);
        setLoading(false);
        setError(null);
      }, (err) => {
        console.error('Error fetching audit logs:', err);
        setError('Failed to fetch authoritative audit logs. Showing cached logs.');
        setLoading(false);
        try {
          const local = JSON.parse(localStorage.getItem('exfin_audit_logs_local') || '[]');
          setLogs(local);
        } catch (e) {}
      });

      return () => unsub();
    } catch (err: any) {
      console.error('Audit log listener error:', err);
      setError(err.message || 'Error initializing audit log');
      setLoading(false);
    }
  }, []);

  // Summary metrics
  const stats = useMemo(() => {
    const total = logs.length;
    let successful = 0;
    let failed = 0;
    let todayCount = 0;

    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    logs.forEach((log) => {
      if (log.result === 'SUCCESS') successful++;
      if (log.result === 'FAILED') failed++;
      if (log.timestamp && log.timestamp.startsWith(todayStr)) {
        todayCount++;
      }
    });

    return { total, successful, failed, todayCount };
  }, [logs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Search query match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = (log.performedByName || '').toLowerCase().includes(q);
        const matchesCode = (log.employeeCode || '').toLowerCase().includes(q);
        const matchesAction = (log.action || '').toLowerCase().includes(q);
        const matchesTarget = (log.targetUserName || '').toLowerCase().includes(q);
        const matchesDesc = (log.description || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode && !matchesAction && !matchesTarget && !matchesDesc) {
          return false;
        }
      }

      // Role filter
      if (selectedRole !== 'ALL' && log.performedByRole !== selectedRole) {
        return false;
      }

      // Category filter
      if (selectedCategory !== 'ALL' && log.actionCategory !== selectedCategory) {
        return false;
      }

      // Result filter
      if (selectedResult !== 'ALL' && log.result !== selectedResult) {
        return false;
      }

      // Source filter
      if (selectedSource !== 'ALL' && log.source !== selectedSource) {
        return false;
      }

      // Date range filter
      if (dateRange !== 'ALL' && log.timestamp) {
        const logDate = new Date(log.timestamp);
        const now = new Date();
        const diffDays = (now.getTime() - logDate.getTime()) / (1000 * 3600 * 24);
        if (dateRange === 'TODAY' && diffDays > 1) return false;
        if (dateRange === '7DAYS' && diffDays > 7) return false;
        if (dateRange === '30DAYS' && diffDays > 30) return false;
      }

      return true;
    });
  }, [logs, searchQuery, selectedRole, selectedCategory, selectedResult, selectedSource, dateRange]);

  const displayedLogs = useMemo(() => {
    return filteredLogs.slice(0, displayLimit);
  }, [filteredLogs, displayLimit]);

  const getRoleBadgeStyle = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'ADMIN':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'TEAM_LEADER':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'SYSTEM':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getCategoryBadgeStyle = (category: string) => {
    return 'glass-card text-purple-200 border-purple-500/30';
  };

  return (
    <div className="space-y-6">
      {/* Header & Subtitle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-purple-400" />
            Audit Log
          </h1>
          <p className="text-xs text-purple-300/70 mt-1">
            Complete immutable record of security, administrative, operational, and system activity across Office Management System
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="text-xs glass-card border-purple-500/30 text-purple-200 hover:bg-[#3D237A]"
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 500);
            }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 rounded-2xl">
          <p className="text-[10px] uppercase font-extrabold text-purple-300/70 tracking-wider">Total Events</p>
          <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 rounded-2xl">
          <p className="text-[10px] uppercase font-extrabold text-purple-300/70 tracking-wider">Today's Events</p>
          <p className="text-2xl font-black text-amber-300 mt-1">{stats.todayCount}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 rounded-2xl">
          <p className="text-[10px] uppercase font-extrabold text-purple-300/70 tracking-wider">Successful</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{stats.successful}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 rounded-2xl">
          <p className="text-[10px] uppercase font-extrabold text-purple-300/70 tracking-wider">Failed / Alerts</p>
          <p className="text-2xl font-black text-rose-400 mt-1">{stats.failed}</p>
        </Card>
      </div>

      {/* Search & Filters Card */}
      <Card className="p-4 bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-purple-400" />
            <input
              type="text"
              placeholder="Search by name, employee code, action, target or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1A0B36] border border-purple-500/30 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-purple-400"
            />
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="bg-[#1A0B36] border border-purple-500/30 rounded-xl px-3 py-2.5 text-xs text-purple-200 focus:outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="TEAM_LEADER">Team Leader</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="SYSTEM">System</option>
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-[#1A0B36] border border-purple-500/30 rounded-xl px-3 py-2.5 text-xs text-purple-200 focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              <option value="Authentication">Authentication</option>
              <option value="Attendance">Attendance</option>
              <option value="Employee">Employee</option>
              <option value="Leave">Leave</option>
              <option value="Expense">Expense</option>
              <option value="Tasks">Tasks</option>
              <option value="Notifications">Notifications</option>
              <option value="Administration">Administration</option>
              <option value="Security">Security</option>
              <option value="System">System</option>
            </select>
            <select
              value={selectedResult}
              onChange={(e) => setSelectedResult(e.target.value)}
              className="bg-[#1A0B36] border border-purple-500/30 rounded-xl px-3 py-2.5 text-xs text-purple-200 focus:outline-none"
            >
              <option value="ALL">All Results</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as any)}
              className="bg-[#1A0B36] border border-purple-500/30 rounded-xl px-3 py-2.5 text-xs text-purple-200 focus:outline-none"
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Today</option>
              <option value="7DAYS">Last 7 Days</option>
              <option value="30DAYS">Last 30 Days</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Log List */}
      <Card className="bg-gradient-to-br from-[#2D1B5A]/90 to-[#211044]/90 border border-purple-500/30 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-purple-500/20 flex justify-between items-center">
          <h2 className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            Audit Events ({filteredLogs.length})
          </h2>
          <span className="text-[10px] text-purple-300/60 font-semibold">Immutable Append-Only Log</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-purple-300/60 text-xs">Loading audit records...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-purple-300/60 text-xs">No audit logs found matching your filters.</div>
        ) : (
          <div className="divide-y divide-purple-500/10">
            {displayedLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => setActiveLog(log)}
                className="p-4 hover:bg-purple-900/20 transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-white">{log.action}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getRoleBadgeStyle(log.performedByRole)}`}>
                      {log.performedByRole}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getCategoryBadgeStyle(log.actionCategory)}`}>
                      {log.actionCategory}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-200/80 truncate">
                    <span className="font-bold text-white">{log.performedByName}</span>
                    {log.employeeCode ? ` (${log.employeeCode})` : ''}
                    {log.targetUserName ? ` → Target: ${log.targetUserName}` : ''}
                    {log.description ? ` • ${log.description}` : ''}
                  </p>
                  <div className="flex items-center gap-3 text-[10px] text-purple-300/60">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-purple-400" />
                      {formatIstTimestamp(log.timestamp)}
                    </span>
                    <span>Source: {log.source}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  {log.result === 'SUCCESS' ? (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3" /> SUCCESS
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                      <XCircle className="w-3 h-3" /> FAILED
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-purple-400/50" />
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredLogs.length > displayLimit && (
          <div className="p-4 border-t border-purple-500/20 text-center">
            <Button
              variant="outline"
              className="text-xs glass-card border-purple-500/30 text-purple-200"
              onClick={() => setDisplayLimit((prev) => prev + 50)}
            >
              Load More ({filteredLogs.length - displayLimit} remaining)
            </Button>
          </div>
        )}
      </Card>

      {/* Detailed Audit Log Drawer / Modal */}
      {activeLog && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1F103F] border border-purple-500/30 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-purple-500/20 flex justify-between items-center sticky top-0 bg-[#1F103F] z-10">
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-wider">Audit Log Details</span>
                <h3 className="text-base font-black text-white">{activeLog.action}</h3>
              </div>
              <button
                onClick={() => {
                  setActiveLog(null);
                  setShowTechDetails(false);
                }}
                className="w-8 h-8 rounded-full bg-purple-950/50 flex items-center justify-center text-purple-300 hover:bg-purple-900 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs text-purple-200 flex-1">
              <div className="grid grid-cols-2 gap-4 glass-card/60 p-4 rounded-xl border border-purple-500/20">
                <div>
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Performed By</p>
                  <p className="text-sm font-black text-white mt-0.5">{activeLog.performedByName} {activeLog.employeeCode ? `(${activeLog.employeeCode})` : ''}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Role</p>
                  <p className="mt-0.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getRoleBadgeStyle(activeLog.performedByRole)}`}>{activeLog.performedByRole}</span></p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Action Category</p>
                  <p className="font-bold text-white mt-0.5">{activeLog.actionCategory}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Result</p>
                  <p className="mt-0.5">
                    {activeLog.result === 'SUCCESS' ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> SUCCESS</span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> FAILED</span>
                    )}
                  </p>
                </div>
              </div>

              {activeLog.targetUserName && (
                <div className="glass-card/40 p-3 rounded-xl border border-purple-500/20">
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Target Entity</p>
                  <p className="font-bold text-white text-sm mt-0.5">{activeLog.targetUserName} {activeLog.employeeCode ? `(Code: ${activeLog.employeeCode})` : ''}</p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-purple-300/60">Timestamp (IST)</p>
                <p className="font-bold text-white">{formatIstTimestamp(activeLog.timestamp)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] uppercase font-bold text-purple-300/60">Description</p>
                <p className="text-white bg-[#26134D] p-3 rounded-xl border border-purple-500/20">{activeLog.description || 'No description provided.'}</p>
              </div>

              {activeLog.failureReason && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase font-bold text-rose-400">Failure Reason</p>
                  <p className="text-rose-200 bg-rose-950/40 p-3 rounded-xl border border-rose-500/30">{activeLog.failureReason}</p>
                </div>
              )}

              {/* Before -> After Difference View */}
              {(activeLog.oldValue !== null || activeLog.newValue !== null) && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Before → After Changes</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="bg-rose-950/20 p-3 rounded-xl border border-rose-500/20 space-y-1">
                      <p className="text-[10px] font-bold text-rose-300 uppercase">Before (Previous Value)</p>
                      <pre className="text-[11px] text-rose-200 whitespace-pre-wrap font-mono overflow-x-auto">
                        {typeof activeLog.oldValue === 'object' ? JSON.stringify(activeLog.oldValue, null, 2) : String(activeLog.oldValue || 'None')}
                      </pre>
                    </div>
                    <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-500/20 space-y-1">
                      <p className="text-[10px] font-bold text-emerald-300 uppercase">After (New Value)</p>
                      <pre className="text-[11px] text-emerald-200 whitespace-pre-wrap font-mono overflow-x-auto">
                        {typeof activeLog.newValue === 'object' ? JSON.stringify(activeLog.newValue, null, 2) : String(activeLog.newValue || 'None')}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 glass-card/40 p-4 rounded-xl border border-purple-500/20">
                <div>
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Source</p>
                  <p className="font-bold text-white mt-0.5">{activeLog.source}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-bold text-purple-300/60">Device / Environment</p>
                  <p className="font-bold text-white mt-0.5">
                    {activeLog.deviceInfo?.browser || 'Unknown Browser'} / {activeLog.deviceInfo?.os || 'Unknown OS'}
                  </p>
                </div>
              </div>

              {/* Technical Details Toggle */}
              <div>
                <button
                  onClick={() => setShowTechDetails(!showTechDetails)}
                  className="text-xs text-purple-300 hover:text-white underline font-semibold"
                >
                  {showTechDetails ? 'Hide Technical Payload' : 'View Technical Details (JSON)'}
                </button>
                {showTechDetails && (
                  <pre className="mt-2 p-3 bg-[#130628] text-purple-300 rounded-xl text-[10px] font-mono overflow-x-auto border border-purple-500/20 max-h-48">
                    {JSON.stringify(activeLog, null, 2)}
                  </pre>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-purple-500/20 bg-[#1A0B36] flex justify-end">
              <Button
                variant="outline"
                className="text-xs glass-card border-purple-500/30 text-white"
                onClick={() => {
                  setActiveLog(null);
                  setShowTechDetails(false);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
