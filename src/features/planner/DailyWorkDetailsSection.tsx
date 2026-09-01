import React, { useState, useEffect, useMemo } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { DailyWorkDetailRecord } from '../../types/workDetails';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { 
  FileText, 
  Calendar, 
  Save, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  Sparkles, 
  AlertCircle,
  CloudCheck,
  RotateCcw,
  Check
} from 'lucide-react';
import { useSensitiveActionGuard } from '../../services/security/useSensitiveActionGuard';

export const DailyWorkDetailsSection: React.FC = () => {
  const { employeeData } = useRegistration();
  const { workDetails, updateWorkDetailOptimistically, isOnline } = useRealtimeSync();
  const { executeSensitiveAction, isVerifying } = useSensitiveActionGuard();

  const empCode = (employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN').trim();
  const empId = (employeeData?.id || empCode).trim();
  const empName = employeeData?.name || 'Employee';
  const empDept = employeeData?.department || employeeData?.office || 'Operations';

  const getTodayStr = () => {
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

  const getYesterdayStr = () => {
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

  const todayStr = getTodayStr();
  const yesterdayStr = getYesterdayStr();

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [inputText, setInputText] = useState<string>('');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');

  // Find existing record for the selected date
  const existingRecord = useMemo(() => {
    return workDetails.find((d) => {
      const matchCode = d.employeeCode && (d.employeeCode === empCode || d.employeeCode === empId);
      const matchId = d.employeeId && (d.employeeId === empId || d.employeeId === empCode);
      return (matchCode || matchId) && d.date === selectedDate;
    });
  }, [workDetails, empCode, empId, selectedDate]);

  // Sync state when selectedDate or existingRecord changes
  useEffect(() => {
    if (existingRecord) {
      setInputText(existingRecord.workDetails || '');
      setIsEditing(false);
    } else {
      setInputText('');
      setIsEditing(true);
    }
    setSuccessMessage('');
  }, [selectedDate, existingRecord]);

  const charCount = inputText.trim().length;
  const wordCount = inputText.trim() ? inputText.trim().split(/\s+/).length : 0;
  const isMeaningful = useMemo(() => {
    if (charCount < 15) return false;
    const alphanumeric = inputText.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (alphanumeric.length < 10) return false;
    const uniqueChars = new Set(alphanumeric).size;
    return uniqueChars >= 4;
  }, [inputText, charCount]);

  const handleSave = () => executeSensitiveAction(async () => {
    if (!inputText.trim()) return;

    setIsSaving(true);
    const nowIso = new Date().toISOString();
    const recordId = existingRecord?.id || `wd_${empCode}_${selectedDate}_${Date.now()}`;

    const newRecord: DailyWorkDetailRecord = {
      id: recordId,
      employeeId: empId,
      employeeCode: empCode,
      employeeName: empName,
      department: empDept,
      date: selectedDate,
      workDetails: inputText.trim(),
      syncStatus: isOnline ? 'Synced' : 'Pending Sync',
      createdAtDeviceTime: existingRecord?.createdAtDeviceTime || nowIso,
      updatedAtDeviceTime: nowIso,
      createdAt: existingRecord?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    try {
      await updateWorkDetailOptimistically(newRecord);
      setIsEditing(false);
      setSuccessMessage('Daily work details saved successfully!');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Failed to save daily work details:', err);
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <Card variant="elevated" className="p-5 border border-cyan-500/20 bg-gradient-to-b from-slate-900/90 to-slate-950/90 shadow-xl relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shadow-inner">
            <FileText className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300/90">Daily Activity Log</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                Efficiency Factor
              </span>
            </div>
            <h2 className="text-base font-black text-white leading-none mt-1 tracking-wide">
              DAILY WORK DETAILS
            </h2>
          </div>
        </div>

        {/* Date Selector Shortcuts */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={() => setSelectedDate(todayStr)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedDate === todayStr
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'glass-card-inner text-slate-400 hover:text-white border border-[var(--border)]'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(yesterdayStr)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedDate === yesterdayStr
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'glass-card-inner text-slate-400 hover:text-white border border-[var(--border)]'
            }`}
          >
            Yesterday
          </button>
          <div className="relative flex items-center">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-950/80 border border-[var(--border)] rounded-lg text-xs text-slate-200 font-mono focus:border-cyan-400/50 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs font-bold text-emerald-300 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Content Area */}
      {isEditing || !existingRecord ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Work Performed on <span className="font-mono text-cyan-300">{selectedDate}</span>:</span>
              <span className={`text-[11px] font-mono ${isMeaningful ? 'text-emerald-400' : 'text-slate-400'}`}>
                {wordCount} words · {charCount} chars {isMeaningful && '✓ Valid'}
              </span>
            </label>
            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Detail your work accomplishments, operational tasks completed, client calls, deliverables handled, or ongoing projects..."
              className="w-full p-3 bg-slate-950/70 border border-[var(--border)] rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:ring-1 focus:ring-cyan-400/30 outline-none transition-all leading-relaxed custom-scrollbar"
            />
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Documented daily work contributes directly to your canonical workload efficiency score.</span>
            </div>

            <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
              {existingRecord && (
                <Button
                  type="button"
                  variant="tonal"
                  onClick={() => {
                    setInputText(existingRecord.workDetails || '');
                    setIsEditing(false);
                  }}
                  className="text-xs text-slate-300 border border-[var(--border)] px-3 py-2 cursor-pointer"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                variant="filled"
                onClick={handleSave}
                disabled={isSaving || !inputText.trim() || isVerifying}
                className="text-xs text-white font-bold bg-[var(--button-primary)] px-4 py-2 flex items-center gap-1.5 cursor-pointer shadow-lg hover:shadow-cyan-500/20"
              >
                <Save className="w-3.5 h-3.5" />
                {isSaving || isVerifying ? 'Saving...' : existingRecord ? 'Update Details' : 'Save Details'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-slate-950/60 border border-[var(--border)] space-y-2">
            <div className="flex justify-between items-center text-[11px] pb-2 border-b border-slate-800/80">
              <div className="flex items-center gap-2 text-slate-300 font-bold">
                <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                <span>Date: <span className="font-mono text-cyan-300">{existingRecord.date}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                  existingRecord.syncStatus === 'Synced' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                }`}>
                  {existingRecord.syncStatus === 'Synced' ? 'Synced' : 'Saved Locally'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
              {existingRecord.workDetails}
            </p>

            <div className="flex justify-between items-center text-[10px] text-slate-500 pt-1">
              <span>Updated: {existingRecord.updatedAtDeviceTime ? new Date(existingRecord.updatedAtDeviceTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}</span>
              <span>{existingRecord.workDetails.split(/\s+/).length} words</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="tonal"
              onClick={() => setIsEditing(true)}
              className="text-xs text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 px-3.5 py-1.5 flex items-center gap-1.5 cursor-pointer font-bold"
            >
              <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
              Edit Work Details
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};
