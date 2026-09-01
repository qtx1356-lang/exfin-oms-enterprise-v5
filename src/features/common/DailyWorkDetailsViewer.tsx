import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { DailyWorkDetailRecord } from '../../types/workDetails';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { 
  FileText, 
  Calendar, 
  Search, 
  Filter, 
  User, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  AlertCircle, 
  Building2,
  Layers,
  ChevronDown,
  RefreshCw
} from 'lucide-react';

export interface EmployeeInfo {
  id: string;
  employeeCode: string;
  name: string;
  department?: string;
  office?: string;
}

interface DailyWorkDetailsViewerProps {
  title?: string;
  subtitle?: string;
  allowedEmployeeCodes?: string[];
  employeesList: EmployeeInfo[];
  isTeamLeaderView?: boolean;
}

export const DailyWorkDetailsViewer: React.FC<DailyWorkDetailsViewerProps> = ({
  title = "Daily Work Details",
  subtitle = "Inspect daily work accomplishment logs submitted by employees",
  allowedEmployeeCodes,
  employeesList,
  isTeamLeaderView = false
}) => {
  const [allRecords, setAllRecords] = useState<DailyWorkDetailRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const getTodayKolkata = () => {
    try {
      const now = new Date();
      const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const d = new Date(kolkataStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  const getYesterdayKolkata = () => {
    try {
      const now = new Date();
      const kolkataStr = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
      const d = new Date(kolkataStr);
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    }
  };

  const todayStr = getTodayKolkata();
  const yesterdayStr = getYesterdayKolkata();

  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Firestore listener
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    try {
      const q = query(collection(db, 'daily_work_details'));
      const unsub = onSnapshot(q, (snapshot) => {
        const records: DailyWorkDetailRecord[] = [];
        snapshot.forEach((docSnap) => {
          records.push({ id: docSnap.id, ...docSnap.data() } as DailyWorkDetailRecord);
        });
        setAllRecords(records);
        setLoading(false);
      }, (err) => {
        console.warn('daily_work_details listener error:', err);
        setLoading(false);
      });

      return () => unsub();
    } catch (e) {
      console.error('Error setting up daily_work_details listener:', e);
      setLoading(false);
    }
  }, []);

  // Filter allowed employees (Team Leader scope if applicable)
  const scopedEmployees = useMemo(() => {
    if (!allowedEmployeeCodes || allowedEmployeeCodes.length === 0) {
      return employeesList;
    }
    const allowedSet = new Set(allowedEmployeeCodes.map(c => c.trim().toLowerCase()));
    return employeesList.filter(e => allowedSet.has(e.employeeCode?.trim().toLowerCase()) || allowedSet.has(e.id?.trim().toLowerCase()));
  }, [employeesList, allowedEmployeeCodes]);

  const scopedEmployeeCodes = useMemo(() => {
    return new Set(scopedEmployees.map(e => e.employeeCode.trim().toLowerCase()));
  }, [scopedEmployees]);

  const scopedEmployeeIds = useMemo(() => {
    return new Set(scopedEmployees.map(e => e.id.trim().toLowerCase()));
  }, [scopedEmployees]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      // 1. Team Leader Scope
      if (allowedEmployeeCodes && allowedEmployeeCodes.length > 0) {
        const codeMatch = rec.employeeCode && scopedEmployeeCodes.has(rec.employeeCode.trim().toLowerCase());
        const idMatch = rec.employeeId && scopedEmployeeIds.has(rec.employeeId.trim().toLowerCase());
        if (!codeMatch && !idMatch) return false;
      }

      // 2. Date Filter
      if (dateFilter !== 'ALL' && rec.date !== dateFilter) {
        return false;
      }

      // 3. Employee Filter
      if (selectedEmployee !== 'ALL') {
        const matchesCode = rec.employeeCode?.toLowerCase() === selectedEmployee.toLowerCase();
        const matchesId = rec.employeeId?.toLowerCase() === selectedEmployee.toLowerCase();
        if (!matchesCode && !matchesId) return false;
      }

      // 4. Search filter
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const textMatch = rec.workDetails?.toLowerCase().includes(s);
        const nameMatch = rec.employeeName?.toLowerCase().includes(s);
        const codeMatch = rec.employeeCode?.toLowerCase().includes(s);
        const deptMatch = rec.department?.toLowerCase().includes(s);
        if (!textMatch && !nameMatch && !codeMatch && !deptMatch) return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by date desc, then by name
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (a.employeeName || '').localeCompare(b.employeeName || '');
    });
  }, [allRecords, allowedEmployeeCodes, scopedEmployeeCodes, scopedEmployeeIds, dateFilter, selectedEmployee, searchTerm]);

  // Statistics for selected date
  const stats = useMemo(() => {
    const recordsForDate = allRecords.filter(r => {
      if (dateFilter !== 'ALL' && r.date !== dateFilter) return false;
      if (allowedEmployeeCodes && allowedEmployeeCodes.length > 0) {
        const codeMatch = r.employeeCode && scopedEmployeeCodes.has(r.employeeCode.trim().toLowerCase());
        const idMatch = r.employeeId && scopedEmployeeIds.has(r.employeeId.trim().toLowerCase());
        return codeMatch || idMatch;
      }
      return true;
    });

    const reportedEmpCodes = new Set(recordsForDate.map(r => r.employeeCode?.toLowerCase()).filter(Boolean));
    const totalEligible = scopedEmployees.length;
    const totalReported = reportedEmpCodes.size;
    const missingCount = Math.max(0, totalEligible - totalReported);

    let totalWords = 0;
    let validCount = 0;
    recordsForDate.forEach(r => {
      const words = (r.workDetails || '').trim().split(/\s+/).filter(Boolean).length;
      totalWords += words;
      if ((r.workDetails || '').trim().length >= 15) {
        validCount++;
      }
    });

    const avgWords = recordsForDate.length > 0 ? Math.round(totalWords / recordsForDate.length) : 0;

    return {
      totalReported,
      totalEligible,
      missingCount,
      avgWords,
      validCount,
      submissionCount: recordsForDate.length
    };
  }, [allRecords, dateFilter, allowedEmployeeCodes, scopedEmployeeCodes, scopedEmployeeIds, scopedEmployees]);

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/80 p-4 rounded-2xl border border-[var(--border)] shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shadow-inner">
            <FileText className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white">{title}</h2>
              {isTeamLeaderView && (
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  TEAM LEADER SCOPE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>

        {/* Quick Date Selectors */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setDateFilter(todayStr)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              dateFilter === todayStr
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'glass-card-inner text-slate-400 hover:text-white border border-[var(--border)]'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setDateFilter(yesterdayStr)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              dateFilter === yesterdayStr
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'glass-card-inner text-slate-400 hover:text-white border border-[var(--border)]'
            }`}
          >
            Yesterday
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              dateFilter === 'ALL'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'glass-card-inner text-slate-400 hover:text-white border border-[var(--border)]'
            }`}
          >
            All Dates
          </button>
          <div className="relative">
            <input
              type="date"
              value={dateFilter === 'ALL' ? '' : dateFilter}
              onChange={(e) => setDateFilter(e.target.value || 'ALL')}
              className="px-2.5 py-1.5 bg-slate-950/80 border border-[var(--border)] rounded-xl text-xs text-slate-200 font-mono focus:border-cyan-400/50 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card-elevated p-3.5 rounded-2xl border border-[var(--border)] text-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reported Employees</p>
          <p className="text-xl font-black text-cyan-300 font-mono mt-0.5">
            {stats.totalReported} <span className="text-xs text-slate-400 font-normal">/ {stats.totalEligible}</span>
          </p>
        </div>

        <div className="glass-card-elevated p-3.5 rounded-2xl border border-[var(--border)] text-center">
          <p className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Missing Log</p>
          <p className="text-xl font-black text-amber-300 font-mono mt-0.5">
            {stats.missingCount}
          </p>
        </div>

        <div className="glass-card-elevated p-3.5 rounded-2xl border border-[var(--border)] text-center">
          <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Avg Words</p>
          <p className="text-xl font-black text-emerald-300 font-mono mt-0.5">
            {stats.avgWords} <span className="text-xs text-slate-400 font-normal">words</span>
          </p>
        </div>

        <div className="glass-card-elevated p-3.5 rounded-2xl border border-[var(--border)] text-center">
          <p className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Total Submissions</p>
          <p className="text-xl font-black text-purple-300 font-mono mt-0.5">
            {stats.submissionCount}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-900/60 rounded-2xl border border-[var(--border)]">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search work details text, employee name, or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950/70 border border-[var(--border)] rounded-xl text-xs text-white placeholder:text-slate-500 outline-none focus:border-cyan-400/50"
          />
        </div>

        <div>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full px-3 py-2 bg-slate-950/70 border border-[var(--border)] rounded-xl text-xs text-white outline-none focus:border-cyan-400/50"
          >
            <option value="ALL">All Employees ({scopedEmployees.length})</option>
            {scopedEmployees.map(emp => (
              <option key={emp.employeeCode || emp.id} value={emp.employeeCode || emp.id}>
                {emp.name} ({emp.employeeCode}) - {emp.department || emp.office || 'Operations'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Records Feed */}
      {loading ? (
        <div className="text-center py-12 glass-card rounded-2xl">
          <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-400">Loading daily work details...</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <Card variant="elevated" className="p-8 text-center rounded-2xl border border-dashed border-[var(--border)]">
          <FileText className="w-10 h-10 text-slate-500 mx-auto mb-3 opacity-40" />
          <h3 className="text-sm font-bold text-slate-300">No Daily Work Details Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            No work detail entries have been recorded matching the selected date ({dateFilter}) and filter criteria.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredRecords.map((record) => {
            const wordCount = (record.workDetails || '').trim().split(/\s+/).filter(Boolean).length;
            const charCount = (record.workDetails || '').length;
            const isDetailed = wordCount >= 10 && charCount >= 30;

            return (
              <Card key={record.id} variant="elevated" className="p-4 rounded-2xl border border-[var(--border)] hover:border-cyan-500/30 transition-all space-y-3">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold text-xs">
                      {record.employeeName ? record.employeeName.charAt(0).toUpperCase() : 'E'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{record.employeeName || 'Unknown Employee'}</span>
                        <span className="text-[11px] font-mono text-cyan-300">({record.employeeCode})</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {record.department || 'Operations'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-slate-950/70 border border-slate-800 text-slate-300">
                      <Calendar className="w-3 h-3 text-cyan-400" />
                      {record.date}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      isDetailed 
                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                    }`}>
                      {isDetailed ? '✓ Detailed Log' : 'Brief Entry'}
                    </span>
                  </div>
                </div>

                {/* Work Details Text */}
                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-900 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {record.workDetails}
                </div>

                {/* Footer Metadata */}
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <div className="flex items-center gap-3">
                    <span>{wordCount} words</span>
                    <span>·</span>
                    <span>{charCount} chars</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>
                      Logged: {record.updatedAtDeviceTime ? new Date(record.updatedAtDeviceTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : record.createdAt ? new Date(record.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown'}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
