import React, { useState, useMemo, useEffect } from 'react';
import { getActiveDbSync } from '../../services/firebase/db_sync';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { 
  Users, CheckCircle, Smartphone, UserCheck, Calendar, Clock, AlertTriangle, 
  Search, Filter, Download, ArrowRight, MapPin, Mail, Phone, Building2, 
  Briefcase, CalendarX, Lock, ShieldCheck, ChevronRight, RefreshCw
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ManagedUser } from '../../types/user';
import { isSalaryLateCheckIn } from '../../services/salary/salaryService';
import { isSameEmployee, hasActualCheckIn } from '../../utils/attendanceUtils';

interface OfficePulseProps {
  role: 'ADMIN' | 'SUPER_ADMIN' | 'HR' | string;
  authorizedOffice: string;
}

export const OfficePulse: React.FC<OfficePulseProps> = ({
  role,
  authorizedOffice,
}) => {
  const isSuperAdmin = role === 'SUPER_ADMIN';

  // State for data
  const [registrations, setRegistrations] = useState<ManagedUser[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Firestore Subscriptions
  useEffect(() => {
    if (!getActiveDbSync()) return;

    let regsLoaded = false;
    let attLoaded = false;
    let leavesLoaded = false;

    const checkAllLoaded = () => {
      if (regsLoaded && attLoaded && leavesLoaded) {
        setIsLoading(false);
      }
    };

    // 1. Registrations
    const qRegs = query(collection(getActiveDbSync(), 'registrations'), limit(500));
    const unsubRegs = onSnapshot(qRegs, (snap) => {
      const list: ManagedUser[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as ManagedUser));
      setRegistrations(list);
      regsLoaded = true;
      checkAllLoaded();
    }, () => { regsLoaded = true; checkAllLoaded(); });

    // 2. Attendance (Today's attendance usually, but we fetch latest 500 for pulse)
    // Actually today's attendance is preferred.
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const qAtt = query(collection(getActiveDbSync(), 'attendance'), limit(1000));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setAttendanceRecords(list);
      attLoaded = true;
      checkAllLoaded();
    }, () => { attLoaded = true; checkAllLoaded(); });

    // 3. Leaves
    const qLeaves = query(collection(getActiveDbSync(), 'leaves'), limit(300));
    const unsubLeaves = onSnapshot(qLeaves, (snap) => {
      const list: any[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
      setLeaves(list);
      leavesLoaded = true;
      checkAllLoaded();
    }, () => { leavesLoaded = true; checkAllLoaded(); });

    return () => {
      unsubRegs();
      unsubAtt();
      unsubLeaves();
    };
  }, []);

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOffice, setSelectedOffice] = useState<string>(
    isSuperAdmin ? 'ALL' : authorizedOffice
  );
  const [statusFilter, setStatusFilter] = useState<string>('ALL'); // ALL, PRESENT, WFH, CLIENT, OUTDOOR, LATE, NOT_CHECKED_IN, ABSENT
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  // Timezone-safe local date for Kolkata
  const todayDateStr = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }, []);

  const todayFormattedText = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
  }, []);

  // Check if today is Sunday (0) in Kolkata timezone
  const isTodaySunday = useMemo(() => {
    try {
      const d = new Date(todayDateStr);
      return d.getDay() === 0;
    } catch {
      return false;
    }
  }, [todayDateStr]);

  // Check if current time in Kolkata is past the check-in window (10:31 AM)
  const isPastCheckInCutoff = useMemo(() => {
    try {
      const now = new Date();
      const kolkataTimeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
      }).format(now);
      
      const [hours, minutes] = kolkataTimeStr.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes;
      const cutoffMinutes = 10 * 60 + 31; // 10:31 AM is 631 minutes
      return totalMinutes >= cutoffMinutes;
    } catch {
      // Fallback
      const now = new Date();
      return (now.getHours() * 60 + now.getMinutes()) >= (10 * 60 + 31);
    }
  }, []);

  // 1. EXTRACT ALL DEPARTMENTS FOR THE FILTER (BASED ON SECURITY BOUNDARIES)
  const departments = useMemo(() => {
    const activeEmps = registrations.filter(r => r.status === 'Approved');
    const uniq = Array.from(new Set(activeEmps.map(r => r.office || 'Raniganj')));
    if (isSuperAdmin) {
      return ['ALL', ...uniq];
    }
    return [authorizedOffice];
  }, [registrations, isSuperAdmin, authorizedOffice]);

  // 2. MAP EMPLOYEES TO THEIR DETAILED TODAY WORKFORCE STATE
  const rawWorkforceList = useMemo(() => {
    const safeRegs = Array.isArray(registrations) ? registrations : [];
    const safeAttendance = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const safeLeaves = Array.isArray(leaves) ? leaves : [];

    // Expected workforce consists only of Approved employees (deduplicated by employeeCode)
    const approved = safeRegs.filter(emp => emp && emp.status === 'Approved');
    const seenCodes = new Set<string>();
    const activeEmployees: typeof approved = [];

    approved.forEach(emp => {
      const codeKey = (emp.employeeCode || emp.id || '').trim();
      if (codeKey && !seenCodes.has(codeKey)) {
        seenCodes.add(codeKey);
        activeEmployees.push(emp);
      } else if (!codeKey) {
        activeEmployees.push(emp);
      }
    });

    return activeEmployees.map(emp => {
      const empCode = (emp.employeeCode || emp.id || '').trim();
      const empId = (emp.id || '').trim();

      // Find today's attendance record (defensive check matching employeeCode or id)
      const todayRecord = safeAttendance.find(rec => 
        rec && rec.date === todayDateStr && (
          isSameEmployee(rec.employeeId, empCode) ||
          isSameEmployee(rec.employeeId, empId) ||
          isSameEmployee(rec.employeeCode, empCode) ||
          isSameEmployee(rec.employeeCode, empId)
        )
      );

      // Find approved leave requests covering today
      const todayApprovedLeave = safeLeaves.find(req => 
        req && req.status === 'APPROVED' && 
        (isSameEmployee(req.employeeId, empId) ||
         isSameEmployee(req.employeeId, empCode) ||
         isSameEmployee(req.employeeCode, empCode) ||
         isSameEmployee(req.employeeCode, empId)) &&
        todayDateStr >= req.startDate &&
        todayDateStr <= req.endDate
      );

      let status: 'Present' | 'On Leave' | 'Not Checked In' = 'Not Checked In';
      let mode: 'Office' | 'WFH' | 'Client Visit' | 'Outdoor Work' | 'Leave' | 'Sunday/Holiday' | 'Not Checked In' = 'Not Checked In';
      let isLate = false;
      let checkInTime = todayRecord?.checkInTime || null;
      let checkInMode = todayRecord?.checkInMode || null;
      let checkOutTime = todayRecord?.checkOutTime || null;
      let checkOutMode = todayRecord?.checkOutMode || null;

      if (todayRecord && hasActualCheckIn(todayRecord)) {
        status = 'Present';
        const type = (todayRecord.attendanceType || 'OFFICE').toUpperCase();
        if (type === 'WFH') {
          mode = 'WFH';
        } else if (type === 'CLIENT_VISIT') {
          mode = 'Client Visit';
        } else if (type === 'OUTDOOR') {
          mode = 'Outdoor Work';
        } else {
          mode = 'Office';
        }
        
        if (todayRecord.checkInTime && isSalaryLateCheckIn(todayRecord.checkInTime)) {
          isLate = true;
        }
      } else if (todayApprovedLeave) {
        status = 'On Leave';
        mode = 'Leave';
      } else if (isTodaySunday) {
        status = 'Not Checked In';
        mode = 'Sunday/Holiday';
      } else {
        status = 'Not Checked In';
        mode = 'Not Checked In';
      }

      return {
        ...emp,
        todayStatus: status,
        todayMode: mode,
        isLate,
        todayRecord,
        todayApprovedLeave,
        checkInTime,
        checkInMode,
        checkOutTime,
        checkOutMode
      };
    });
  }, [registrations, attendanceRecords, leaves, todayDateStr, isTodaySunday]);

  // 3. APPLY SECURITY VISIBILITY & FILTER CONTROLS
  const securityFilteredWorkforce = useMemo(() => {
    return rawWorkforceList.filter(emp => {
      // Authorized office check
      if (selectedOffice !== 'ALL' && emp.office !== selectedOffice) {
        return false;
      }
      return true;
    });
  }, [rawWorkforceList, selectedOffice]);

  // 4. GENERATE SUMMARY AGGREGATIONS FOR METRIC CARDS
  const stats = useMemo(() => {
    const expectedStaff = securityFilteredWorkforce.length;
    const presentUniqueEmployeeCodes = new Set<string>();

    let wfh = 0;
    let client = 0;
    let outdoor = 0;
    let late = 0;
    let approvedLeave = 0;

    securityFilteredWorkforce.forEach(emp => {
      const codeKey = (emp.employeeCode || emp.id || '').trim();

      if (emp.todayApprovedLeave) {
        approvedLeave++;
      }

      if (emp.todayStatus === 'Present' && emp.todayRecord && hasActualCheckIn(emp.todayRecord)) {
        if (codeKey) {
          presentUniqueEmployeeCodes.add(codeKey);
        }
        if (emp.todayMode === 'WFH') wfh++;
        else if (emp.todayMode === 'Client Visit') client++;
        else if (emp.todayMode === 'Outdoor Work') outdoor++;
      }

      if (emp.isLate) {
        late++;
      }
    });

    const presentToday = presentUniqueEmployeeCodes.size;
    const notCheckedIn = Math.max(0, expectedStaff - presentToday - approvedLeave);
    const absent = notCheckedIn;

    // Diagnostic logging in development mode
    if (typeof window !== 'undefined') {
      console.log('[Office Pulse Calculation Diagnostic]', {
        expectedStaff,
        presentUniqueEmployeeCodes: Array.from(presentUniqueEmployeeCodes),
        presentToday,
        approvedLeave,
        notCheckedIn
      });
    }

    return {
      total: expectedStaff,
      present: presentToday,
      wfh,
      client,
      outdoor,
      late,
      approvedLeave,
      notCheckedIn,
      absent
    };
  }, [securityFilteredWorkforce]);

  // 5. FILTER & SEARCH EMPLOYEES LIST FOR THE TABLE
  const displayedRoster = useMemo(() => {
    return securityFilteredWorkforce.filter(emp => {
      // Text Search Filter (Name or Employee Code)
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const matchesName = emp.name?.toLowerCase().includes(query);
        const matchesCode = emp.employeeCode?.toLowerCase().includes(query);
        if (!matchesName && !matchesCode) return false;
      }

      // Status Badge Card Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'PRESENT' && emp.todayStatus !== 'Present') return false;
        if (statusFilter === 'WFH' && emp.todayMode !== 'WFH') return false;
        if (statusFilter === 'CLIENT' && emp.todayMode !== 'Client Visit') return false;
        if (statusFilter === 'OUTDOOR' && emp.todayMode !== 'Outdoor Work') return false;
        if (statusFilter === 'LATE' && !emp.isLate) return false;
        if (statusFilter === 'NOT_CHECKED_IN' && emp.todayStatus !== 'Not Checked In') return false;
        if (statusFilter === 'ABSENT' && emp.todayStatus !== 'Not Checked In' && (emp.todayStatus as any) !== 'Absent') return false;
      }

      return true;
    });
  }, [securityFilteredWorkforce, searchTerm, statusFilter]);

  // CSV EXPORTER BLOCK (Adheres to clean CSV standard)
  const handleExportCSV = () => {
    try {
      const headers = [
        'Employee Name',
        'Employee Code',
        'Department',
        'Designation',
        'Today\'s Mode',
        'Check-In Time',
        'Check-In Mode',
        'Check-Out Time',
        'Check-Out Mode',
        'Late Status',
        'Attendance Status'
      ];

      const rows = displayedRoster.map(emp => [
        emp.name,
        emp.employeeCode,
        emp.office || 'Raniganj',
        emp.designation || 'Staff',
        emp.todayMode,
        emp.checkInTime || '—',
        emp.checkInMode || '—',
        emp.checkOutTime || '—',
        emp.checkOutMode || '—',
        emp.isLate ? 'LATE' : 'NORMAL',
        emp.todayStatus
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Office_Management_System_OfficePulse_${todayDateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('Failed to generate export file. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-emerald-500 animate-spin" />
        <p className="text-emerald-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Syncing Live Office Pulse...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-inner-tile p-6 rounded-[24px] border border-purple-500/15">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-1">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Premium Overview
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">OFFICE PULSE</h2>
          <p className="text-xs text-purple-200/80 mt-0.5">
            Today's workforce status for <span className="text-amber-300 font-bold">{todayFormattedText}</span>
          </p>
        </div>

        {/* Security Controls & Export */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Locked Badge or Selector for Department Admin / Super Admin */}
          <div className="flex items-center bg-[#1A0B36] px-3.5 py-2 rounded-full border border-purple-500/20 text-xs">
            {isSuperAdmin ? (
              <>
                <Filter className="w-3.5 h-3.5 text-purple-300 mr-2" />
                <span className="text-purple-300/80 mr-2 font-medium">Office:</span>
                <select
                  value={selectedOffice}
                  onChange={(e) => {
                    setSelectedOffice(e.target.value);
                    setStatusFilter('ALL');
                  }}
                  className="bg-transparent text-white font-black focus:outline-none cursor-pointer pr-1"
                >
                  {departments.map(dept => (
                    <option key={dept} value={dept} className="glass-card text-white">
                      {dept === 'ALL' ? 'All Locations' : dept}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400 mr-2" />
                <span className="text-purple-300/80 mr-1.5 font-medium">Department:</span>
                <span className="text-amber-300 font-black">{authorizedOffice}</span>
              </>
            )}
          </div>

          <Button 
            onClick={handleExportCSV}
            className="rounded-full bg-purple-600 hover:bg-purple-500 text-xs py-2 px-4 flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Roster</span>
          </Button>
        </div>
      </div>

      {/* METRIC CARD GRID (Sophisticated, no side borders, mathematical corner nesting) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Present Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'PRESENT' ? 'ALL' : 'PRESENT')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'PRESENT'
              ? 'bg-emerald-500/15 border-emerald-500/50 shadow-[0_4px_20px_rgba(16,185,129,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-emerald-500/30 hover:bg-emerald-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-emerald-400 tracking-wider">Present</span>
            <div className="p-1.5 bg-emerald-500/20 rounded-lg text-emerald-400">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-white">{stats.present}</div>
            <div className="text-[9px] text-purple-200/50">Total Checked In / Leave</div>
          </div>
        </button>

        {/* WFH Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'WFH' ? 'ALL' : 'WFH')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'WFH'
              ? 'bg-sky-500/15 border-sky-500/50 shadow-[0_4px_20px_rgba(14,165,233,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-sky-500/30 hover:bg-sky-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-sky-400 tracking-wider">WFH</span>
            <div className="p-1.5 bg-sky-500/20 rounded-lg text-sky-400">
              <Smartphone className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-white">{stats.wfh}</div>
            <div className="text-[9px] text-purple-200/50">Working From Home</div>
          </div>
        </button>

        {/* Client Visit Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'CLIENT' ? 'ALL' : 'CLIENT')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'CLIENT'
              ? 'bg-amber-500/15 border-amber-500/50 shadow-[0_4px_20px_rgba(245,158,11,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-amber-500/30 hover:bg-amber-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider">Client Visit</span>
            <div className="p-1.5 bg-amber-500/20 rounded-lg text-amber-400">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-white">{stats.client}</div>
            <div className="text-[9px] text-purple-200/50">On Client Premises</div>
          </div>
        </button>

        {/* Outdoor Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'OUTDOOR' ? 'ALL' : 'OUTDOOR')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'OUTDOOR'
              ? 'bg-violet-500/15 border-violet-500/50 shadow-[0_4px_20px_rgba(139,92,246,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-violet-500/30 hover:bg-violet-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-violet-400 tracking-wider">Outdoor</span>
            <div className="p-1.5 bg-violet-500/20 rounded-lg text-violet-400">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-white">{stats.outdoor}</div>
            <div className="text-[9px] text-purple-200/50">Field / Outdoor Work</div>
          </div>
        </button>

        {/* Late Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'LATE' ? 'ALL' : 'LATE')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'LATE'
              ? 'bg-yellow-500/15 border-yellow-500/50 shadow-[0_4px_20px_rgba(234,179,8,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-yellow-500/30 hover:bg-yellow-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-yellow-400 tracking-wider">Late</span>
            <div className="p-1.5 bg-yellow-500/20 rounded-lg text-yellow-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-yellow-400">{stats.late}</div>
            <div className="text-[9px] text-purple-200/50">Check-In after 10:31 AM</div>
          </div>
        </button>

        {/* Not Checked In Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'NOT_CHECKED_IN' ? 'ALL' : 'NOT_CHECKED_IN')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'NOT_CHECKED_IN'
              ? 'bg-zinc-500/20 border-zinc-500/50 shadow-[0_4px_20px_rgba(156,163,175,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-zinc-400/30 hover:bg-zinc-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-zinc-300 tracking-wider">Not Marked</span>
            <div className="p-1.5 bg-zinc-500/20 rounded-lg text-zinc-300">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-zinc-300">{stats.notCheckedIn}</div>
            <div className="text-[9px] text-purple-200/50">Expected today, pending</div>
          </div>
        </button>

        {/* Absent Card */}
        <button
          onClick={() => setStatusFilter(statusFilter === 'ABSENT' ? 'ALL' : 'ABSENT')}
          className={`text-left transition-all duration-300 focus:outline-none rounded-[20px] p-4 border flex flex-col justify-between h-28 ${
            statusFilter === 'ABSENT'
              ? 'bg-rose-500/15 border-rose-500/50 shadow-[0_4px_20px_rgba(244,63,94,0.2)]'
              : 'glass-card border-purple-500/20 hover:border-rose-500/30 hover:bg-rose-500/5'
          }`}
        >
          <div className="flex items-center justify-between w-full">
            <span className="text-[10px] uppercase font-black text-rose-400 tracking-wider">Absent</span>
            <div className="p-1.5 bg-rose-500/20 rounded-lg text-rose-400">
              <CalendarX className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-rose-400">{stats.absent}</div>
            <div className="text-[9px] text-purple-200/50">Missed check-in cutoff</div>
          </div>
        </button>
      </div>

      {/* Main Table & search segment */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
        {/* Search and filter controls */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-purple-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Employee name or code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1A0B36] text-white pl-10 pr-4 py-2 rounded-xl text-xs border border-purple-500/25 placeholder:text-purple-300/40 focus:outline-none focus:border-purple-400/50 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {statusFilter !== 'ALL' && (
              <span className="text-xs bg-purple-500/20 border border-purple-500/30 px-3 py-1.5 rounded-full flex items-center gap-1.5 text-purple-200">
                Filter: <span className="font-bold text-amber-300 uppercase text-[10px]">{statusFilter}</span>
                <button 
                  onClick={() => setStatusFilter('ALL')}
                  className="font-black hover:text-white ml-1 text-purple-300 focus:outline-none"
                >
                  ×
                </button>
              </span>
            )}

            <div className="text-xs text-purple-300">
              Showing <span className="text-white font-bold">{displayedRoster.length}</span> of <span className="text-white font-bold">{securityFilteredWorkforce.length}</span> employees
            </div>
          </div>
        </div>

        {/* ROSTER TABLE / COMPACT LIST (Fully responsive list-to-table UI) */}
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-purple-500/20 scrollbar-track-transparent pb-2">
          <table className="w-full text-left text-xs border-separate border-spacing-0">
            <thead>
              <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold sticky top-0 z-10">
                <th className="p-3 border-b border-purple-500/20 rounded-l-xl whitespace-nowrap">Employee</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Code</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Department</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Designation</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Today's Mode</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-emerald-400">Check-In</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap text-purple-200">Check-Out</th>
                <th className="p-3 border-b border-purple-500/20 whitespace-nowrap">Late Status</th>
                <th className="p-3 border-b border-purple-500/20 rounded-r-xl whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {displayedRoster.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-purple-300/50 font-bold">
                    No workforce records match your active search or filters.
                  </td>
                </tr>
              ) : (
                displayedRoster.map(emp => {
                  // Beautiful colored chips based on Mode
                  let chipStyle = 'bg-purple-500/10 text-purple-300 border-purple-500/20';
                  if (emp.todayMode === 'Office') {
                    chipStyle = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
                  } else if (emp.todayMode === 'WFH') {
                    chipStyle = 'bg-sky-500/10 text-sky-300 border-sky-500/25';
                  } else if (emp.todayMode === 'Client Visit') {
                    chipStyle = 'bg-amber-500/10 text-amber-300 border-amber-500/25';
                  } else if (emp.todayMode === 'Outdoor Work') {
                    chipStyle = 'bg-violet-500/10 text-violet-300 border-violet-500/25';
                  } else if (emp.todayMode === 'Leave') {
                    chipStyle = 'bg-indigo-500/10 text-indigo-300 border-indigo-500/25';
                  } else if (emp.todayMode === 'Sunday/Holiday') {
                    chipStyle = 'bg-teal-500/10 text-teal-300 border-teal-500/25';
                  } else if (emp.todayMode === 'Absent') {
                    chipStyle = 'bg-rose-500/10 text-rose-300 border-rose-500/25';
                  } else if (emp.todayMode === 'Not Checked In') {
                    chipStyle = 'bg-zinc-500/10 text-zinc-300 border-zinc-500/25';
                  }

                  return (
                    <tr key={emp.id} className="hover:bg-purple-500/5 transition-colors">
                      <td className="p-3 font-semibold text-white whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 font-bold text-xs">
                            {emp.name ? emp.name.charAt(0).toUpperCase() : 'E'}
                          </div>
                          <div>
                            <div className="text-white font-bold">{emp.name}</div>
                            <div className="text-[10px] text-purple-300/60 font-medium">{emp.email || 'No email'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 font-mono text-purple-200 whitespace-nowrap">{emp.employeeCode}</td>
                      <td className="p-3 text-white whitespace-nowrap">{emp.office || 'Raniganj'}</td>
                      <td className="p-3 text-purple-200 whitespace-nowrap">{emp.designation || 'Staff'}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold border ${chipStyle}`}>
                          {emp.todayMode}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {emp.checkInTime ? (
                          <div className="flex flex-col">
                            <span className="text-emerald-400 font-bold font-mono">{emp.checkInTime}</span>
                            <span className="text-[9px] text-purple-300/60 font-medium font-mono">{emp.checkInMode || 'GPS'}</span>
                          </div>
                        ) : (
                          <span className="text-purple-300/30">—</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {emp.checkOutTime ? (
                          <div className="flex flex-col">
                            <span className="text-purple-200 font-bold font-mono">{emp.checkOutTime}</span>
                            <span className="text-[9px] text-purple-300/60 font-medium font-mono">{emp.checkOutMode || 'GPS'}</span>
                          </div>
                        ) : emp.checkInTime ? (
                          <span className="text-amber-400/80 text-[10px] font-bold animate-pulse">Checked In</span>
                        ) : (
                          <span className="text-purple-300/30">—</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {emp.isLate ? (
                          <span className="inline-flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            <Clock className="w-3 h-3" /> Late
                          </span>
                        ) : emp.checkInTime ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            On Time
                          </span>
                        ) : (
                          <span className="text-purple-300/30">—</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <Button
                          onClick={() => setSelectedEmployee(emp)}
                          className="bg-purple-600/25 hover:bg-purple-600/50 text-[11px] px-3 py-1.5 h-auto text-purple-200 rounded-full flex items-center gap-1"
                        >
                          <span>Timeline</span>
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* DETAIL MODAL WITH MULTI-EVENT TIMELINE */}
      {selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-card border border-purple-500/30 w-full max-w-lg rounded-[28px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 text-white">
            
            {/* Modal Header */}
            <div className="bg-[#1A0B36] p-6 border-b border-purple-500/15 flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-300 font-bold text-xl">
                  {selectedEmployee.name ? selectedEmployee.name.charAt(0).toUpperCase() : 'E'}
                </div>
                <div>
                  <h3 className="text-lg font-black text-white leading-tight">{selectedEmployee.name}</h3>
                  <p className="text-xs text-purple-300/80 mt-0.5 font-mono">{selectedEmployee.employeeCode}</p>
                </div>
              </div>
              <span className="text-[10px] bg-purple-500/20 border border-purple-500/30 px-2.5 py-1 rounded-full font-black text-amber-300 uppercase tracking-wider">
                {selectedEmployee.todayMode}
              </span>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-purple-500/20">
              
              {/* Profile Details Grid */}
              <div className="grid grid-cols-2 gap-4 bg-[#1A0B36]/50 p-4 rounded-2xl border border-purple-500/10 text-xs">
                <div className="space-y-1">
                  <span className="text-purple-300/60 font-medium block">Department / Office</span>
                  <div className="text-white font-bold flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-purple-300" />
                    <span>{selectedEmployee.office || 'Raniganj'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-purple-300/60 font-medium block">Designation</span>
                  <div className="text-white font-bold flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-purple-300" />
                    <span>{selectedEmployee.designation || 'Staff'}</span>
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t border-purple-500/5">
                  <span className="text-purple-300/60 font-medium block">Email Address</span>
                  <div className="text-white font-bold flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 text-purple-300" />
                    <span className="truncate">{selectedEmployee.email || '—'}</span>
                  </div>
                </div>
                <div className="space-y-1 pt-2 border-t border-purple-500/5">
                  <span className="text-purple-300/60 font-medium block">Mobile Phone</span>
                  <div className="text-white font-bold flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-purple-300" />
                    <span>{selectedEmployee.mobileNumber || '—'}</span>
                  </div>
                </div>
              </div>

              {/* TIMELINE SEGMENT */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs uppercase font-black text-purple-300 tracking-wider">Today's Attendance Timeline</h4>
                  <span className="text-[10px] text-purple-200/50 italic">{todayDateStr}</span>
                </div>

                {selectedEmployee.todayStatus !== 'Present' ? (
                  <div className="p-4 bg-[#1A0B36]/30 rounded-2xl border border-purple-500/10 text-center text-xs text-purple-300/50 py-8">
                    {selectedEmployee.todayMode === 'Absent' ? (
                      <div>
                        <div className="text-rose-400 font-bold mb-1">NO RECORD DETECTED</div>
                        This employee failed to check in before the 10:31 AM cut-off window.
                      </div>
                    ) : selectedEmployee.todayMode === 'Leave' ? (
                      <div>
                        <div className="text-indigo-300 font-bold mb-1">APPROVED PAID LEAVE</div>
                        This employee is currently out of office on approved paid leave.
                      </div>
                    ) : selectedEmployee.todayMode === 'Sunday/Holiday' ? (
                      <div>
                        <div className="text-teal-300 font-bold mb-1">SUNDAY / HOLIDAY REST</div>
                        No attendance recording expected today. Covered under rest rules.
                      </div>
                    ) : (
                      <div>
                        <div className="text-purple-300 font-bold mb-1">NOT MARKED YET</div>
                        Waiting for today's check-in. Cutoff time is 10:31 AM.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-purple-500/20 space-y-5 ml-2.5">
                    
                    {/* Event 1: Check-In */}
                    <div className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[31px] top-0.5 glass-card border-2 border-emerald-400 w-4.5 h-4.5 rounded-full flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">Attendance Check-In</span>
                          <span className="font-mono text-emerald-400 font-black">{selectedEmployee.checkInTime}</span>
                        </div>
                        <div className="text-[10px] text-purple-300/60 mt-0.5">
                          Mode: <span className="text-white font-medium">{selectedEmployee.checkInMode || 'GPS'}</span>
                          {selectedEmployee.isLate && (
                            <span className="text-yellow-400 font-bold ml-2"> (Late Check-In)</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Event 2: Office Exit (If available) */}
                    {selectedEmployee.todayRecord?.exitTime && (
                      <div className="relative">
                        <div className="absolute -left-[31px] top-0.5 glass-card border-2 border-amber-400 w-4.5 h-4.5 rounded-full flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-amber-400 rounded-full"></div>
                        </div>
                        <div className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">Temporary Office Exit</span>
                            <span className="font-mono text-amber-400 font-black">{selectedEmployee.todayRecord.exitTime}</span>
                          </div>
                          <div className="text-[10px] text-purple-300/60 mt-0.5">
                            Geofence status: <span className="text-amber-300 font-medium">Logged Out of Premise</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Event 3: Return to Office (If available) */}
                    {selectedEmployee.todayRecord?.returnTime && (
                      <div className="relative">
                        <div className="absolute -left-[31px] top-0.5 glass-card border-2 border-blue-400 w-4.5 h-4.5 rounded-full flex items-center justify-center">
                          <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                        </div>
                        <div className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">Returned to Office</span>
                            <span className="font-mono text-blue-400 font-black">{selectedEmployee.todayRecord.returnTime}</span>
                          </div>
                          <div className="text-[10px] text-purple-300/60 mt-0.5">
                            Geofence status: <span className="text-sky-300 font-medium">Re-entered Premise</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Event 4: Check-Out (If available) */}
                    <div className="relative">
                      {/* Timeline dot */}
                      <div className={`absolute -left-[31px] top-0.5 glass-card border-2 w-4.5 h-4.5 rounded-full flex items-center justify-center ${
                        selectedEmployee.checkOutTime ? 'border-purple-400' : 'border-purple-500/40'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${selectedEmployee.checkOutTime ? 'bg-purple-400' : 'bg-purple-500/20'}`}></div>
                      </div>
                      <div className="text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`font-bold ${selectedEmployee.checkOutTime ? 'text-white' : 'text-purple-300/40'}`}>Attendance Check-Out</span>
                          {selectedEmployee.checkOutTime ? (
                            <span className="font-mono text-purple-300 font-black">{selectedEmployee.checkOutTime}</span>
                          ) : (
                            <span className="text-[10px] text-amber-400/80 font-bold animate-pulse">Active Session</span>
                          )}
                        </div>
                        {selectedEmployee.checkOutTime && (
                          <div className="text-[10px] text-purple-300/60 mt-0.5">
                            Mode: <span className="text-white font-medium">{selectedEmployee.checkOutMode || 'GPS'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-[#1A0B36] p-4 border-t border-purple-500/15 flex justify-end">
              <Button
                onClick={() => setSelectedEmployee(null)}
                className="rounded-full bg-purple-600 hover:bg-purple-500 text-xs py-2 px-6"
              >
                Close View
              </Button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
