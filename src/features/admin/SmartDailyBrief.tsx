import React, { useMemo, useState } from 'react';
import { 
  Sparkles, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Activity, 
  UserCheck, 
  Users, 
  ArrowRight, 
  Lightbulb, 
  Calendar, 
  ExternalLink,
  Download,
  RotateCw,
  TrendingUp,
  TrendingDown,
  Moon,
  Sun,
  Coffee,
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { exportToCSV } from '../../services/reports/exportService';
import { isSalaryLateCheckIn } from '../../services/salary/salaryService';
import { hasActualCheckIn, isSameEmployee } from '../../utils/attendanceUtils';

interface SmartDailyBriefProps {
  registrations: any[];
  attendanceRecords: any[];
  leaves: any[];
  role: string;
  authorizedOffice: string;
  adminName: string;
  onNavigateToTab: (tab: any, filter?: string) => void;
}

export const SmartDailyBrief: React.FC<SmartDailyBriefProps> = ({
  registrations,
  attendanceRecords,
  leaves,
  role,
  authorizedOffice,
  adminName,
  onNavigateToTab,
}) => {
  const [lastUpdated, setLastUpdated] = useState<string>(() => {
    return new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastUpdated(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
      setIsRefreshing(false);
    }, 400);
  };

  // --- TIMEZONE-SAFE CURRENT INFRASTRUCTURE ---
  const todayDateStr = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
  }, []);

  const yesterdayDateStr = useMemo(() => {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    }
  }, []);

  const currentLocalHour = useMemo(() => {
    try {
      const kolkataTimeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        hour12: false
      }).format(new Date());
      return parseInt(kolkataTimeStr, 10);
    } catch {
      return new Date().getHours();
    }
  }, []);

  const formattedDateText = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    }
  }, []);

  // Friendly Greeting Picker
  const greetingText = useMemo(() => {
    if (currentLocalHour < 12) return 'Good Morning';
    if (currentLocalHour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, [currentLocalHour]);

  const greetingIcon = useMemo(() => {
    if (currentLocalHour < 12) return <Coffee className="w-5 h-5 text-amber-300" />;
    if (currentLocalHour < 17) return <Sun className="w-5 h-5 text-amber-400" />;
    return <Moon className="w-5 h-5 text-indigo-300" />;
  }, [currentLocalHour]);

  // Is today Sunday?
  const isTodaySunday = useMemo(() => {
    try {
      const d = new Date(todayDateStr);
      return d.getDay() === 0;
    } catch {
      return false;
    }
  }, [todayDateStr]);

  // Past check-in window? (10:31 AM)
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
      return (hours * 60 + minutes) >= (10 * 60 + 31);
    } catch {
      const now = new Date();
      return (now.getHours() * 60 + now.getMinutes()) >= (10 * 60 + 31);
    }
  }, []);

  // --- DERIVE THE AUTHORITATIVE TODAY STATES ---
  const activeEmployees = useMemo(() => {
    const safeRegs = Array.isArray(registrations) ? registrations : [];
    const approved = safeRegs.filter(emp => emp && emp.status === 'Approved');

    // Deduplicate by employeeCode (or id) to ensure 1 authoritative entry per employee
    const seenCodes = new Set<string>();
    const uniqueApproved: typeof approved = [];

    approved.forEach(emp => {
      const codeKey = (emp.employeeCode || emp.id || '').trim();
      if (codeKey && !seenCodes.has(codeKey.toLowerCase())) {
        seenCodes.add(codeKey.toLowerCase());
        uniqueApproved.push(emp);
      } else if (!codeKey) {
        uniqueApproved.push(emp);
      }
    });

    // Also include any users/admins who checked in today but aren't in registrations
    const safeAttendance = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    safeAttendance.forEach(rec => {
      if (rec && rec.date === todayDateStr && hasActualCheckIn(rec)) {
        const codeKey = (rec.employeeId || rec.employeeCode || '').trim();
        if (codeKey && !seenCodes.has(codeKey.toLowerCase())) {
          seenCodes.add(codeKey.toLowerCase());
          uniqueApproved.push({
            id: rec.employeeId || rec.employeeCode || codeKey,
            employeeCode: rec.employeeCode || rec.employeeId || codeKey,
            name: rec.employeeName || codeKey || 'Administrator',
            office: rec.office || 'Raniganj',
            department: rec.department || 'Administration',
            designation: rec.designation || 'Admin',
            status: 'Approved',
            role: 'ADMIN'
          } as any);
        }
      }
    });

    return uniqueApproved;
  }, [registrations, attendanceRecords, todayDateStr]);

  const rawWorkforceList = useMemo(() => {
    const safeAttendance = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const safeLeaves = Array.isArray(leaves) ? leaves : [];

    return activeEmployees.map(emp => {
      const empCode = (emp.employeeCode || emp.id || '').trim();
      const empId = (emp.id || '').trim();

      // Find today's record (defensive check matching employeeCode or id)
      const todayRecord = safeAttendance.find(rec => 
        rec && rec.date === todayDateStr && (
          isSameEmployee(rec.employeeId, empCode) ||
          isSameEmployee(rec.employeeId, empId) ||
          isSameEmployee(rec.employeeCode, empCode) ||
          isSameEmployee(rec.employeeCode, empId)
        )
      );

      // Find yesterday's record for comparison
      const yesterdayRecord = safeAttendance.find(rec => 
        rec && rec.date === yesterdayDateStr && (
          isSameEmployee(rec.employeeId, empCode) ||
          isSameEmployee(rec.employeeId, empId) ||
          isSameEmployee(rec.employeeCode, empCode) ||
          isSameEmployee(rec.employeeCode, empId)
        )
      );

      // Find approved leave today
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

      if (todayRecord && hasActualCheckIn(todayRecord)) {
        status = 'Present';
        const type = (todayRecord.attendanceType || 'OFFICE').toUpperCase();
        if (type === 'WFH') mode = 'WFH';
        else if (type === 'CLIENT_VISIT') mode = 'Client Visit';
        else if (type === 'OUTDOOR') mode = 'Outdoor Work';
        else mode = 'Office';

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
        yesterdayRecord,
        todayApprovedLeave
      };
    });
  }, [activeEmployees, attendanceRecords, leaves, todayDateStr, yesterdayDateStr, isTodaySunday]);

  // Security filtered workforce list
  const securityFilteredWorkforce = useMemo(() => {
    return rawWorkforceList.filter(emp => {
      if (role !== 'SUPER_ADMIN' && authorizedOffice !== 'ALL' && emp.office !== authorizedOffice) {
        return false;
      }
      return true;
    });
  }, [rawWorkforceList, role, authorizedOffice]);

  // Today metrics summary - Authoritative Expected Staff / Present Today / Not Checked In Calculation
  const todaySummary = useMemo(() => {
    const expectedStaff = securityFilteredWorkforce.length;
    const presentUniqueEmployeeCodes = new Set<string>();

    let wfh = 0;
    let client = 0;
    let outdoor = 0;
    let late = 0;
    let approvedLeave = 0;
    let recordsToday = 0;
    let recordsWithActualCheckIn = 0;

    securityFilteredWorkforce.forEach(emp => {
      const codeKey = (emp.employeeCode || emp.id || '').trim();

      if (emp.todayRecord) {
        recordsToday++;
        if (hasActualCheckIn(emp.todayRecord)) {
          recordsWithActualCheckIn++;
        }
      }

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
    // notCheckedIn = expectedStaff - physicalPresentCount - employeesOnApprovedLeave
    const notCheckedIn = Math.max(0, expectedStaff - presentToday - approvedLeave);
    const rate = expectedStaff > 0 ? Math.round((presentToday / expectedStaff) * 100) : 0;

    // Diagnostic logging as requested by specification:
    // [ADMIN TODAY PRESENCE]
    if (typeof window !== 'undefined') {
      console.log('[ADMIN TODAY PRESENCE]', {
        todayDateStr,
        expectedStaff,
        recordsToday,
        recordsWithActualCheckIn,
        physicalPresentEmployees: presentToday,
        wfh,
        client,
        outdoor,
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
      absent: notCheckedIn,
      rate
    };
  }, [securityFilteredWorkforce, todayDateStr]);

  // Yesterday statistics for comparison
  const yesterdaySummary = useMemo(() => {
    const total = securityFilteredWorkforce.length;
    let present = 0;
    securityFilteredWorkforce.forEach(emp => {
      const yesterdayRecord = emp.yesterdayRecord;
      if (yesterdayRecord && hasActualCheckIn(yesterdayRecord)) {
        present++;
      }
    });

    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { rate, present };
  }, [securityFilteredWorkforce]);

  // --- ATTENTION SUMMARY CALCULATION (ATTENDANCE INTELLIGENCE REUSE) ---
  const attentionItems = useMemo(() => {
    const missingCheckoutList: any[] = [];
    const lateList: any[] = [];
    const anomaliesList: any[] = [];
    const correctionsList: any[] = [];

    securityFilteredWorkforce.forEach(emp => {
      const rec = emp.todayRecord;

      // 1. Missing checkouts (only for employees with actual check-in)
      if (rec && hasActualCheckIn(rec) && !rec.checkOutTime) {
        const type = (rec.attendanceType || 'OFFICE').toUpperCase();
        // Exclude OUTDOOR
        if (type !== 'OUTDOOR') {
          let flagged = true;
          // Exclude today's current remote items if before 6:00 PM
          if ((type === 'WFH' || type === 'CLIENT_VISIT') && currentLocalHour < 18) {
            flagged = false;
          }
          // Exclude office check-ins unless exits are logged or final is pending
          if (type === 'OFFICE' && !(rec.exitTime || rec.lastExitTime || rec.currentState === 'PENDING_FINAL_EXIT')) {
            flagged = false;
          }

          if (flagged) {
            missingCheckoutList.push({
              employee: emp,
              record: rec,
              time: rec.checkInTime
            });
          }
        }
      }

      // 2. Late arrivals
      if (emp.isLate && rec && hasActualCheckIn(rec)) {
        lateList.push({
          employee: emp,
          record: rec,
          time: rec.checkInTime
        });
      }

      // 3. Anomalies (such as duplicate entries or time conflicts)
      // Check for duplicate today logs
      const dayLogs = attendanceRecords.filter(r => 
        r.date === todayDateStr && (
          isSameEmployee(r.employeeId, emp.employeeCode) ||
          isSameEmployee(r.employeeId, emp.id) ||
          isSameEmployee(r.employeeCode, emp.employeeCode) ||
          isSameEmployee(r.employeeCode, emp.id)
        )
      );
      if (dayLogs.length > 1) {
        anomaliesList.push({
          employee: emp,
          type: 'DUPLICATE_LOG',
          description: `Multiple attendance logs (${dayLogs.length}) detected today.`
        });
      }

      // 4. Corrections
      if (rec && Array.isArray(rec.correctionHistory) && rec.correctionHistory.length > 0) {
        correctionsList.push({
          employee: emp,
          record: rec,
          corrections: rec.correctionHistory
        });
      }
    });

    return {
      missingCheckouts: missingCheckoutList,
      lates: lateList,
      anomalies: anomaliesList,
      corrections: correctionsList
    };
  }, [securityFilteredWorkforce, attendanceRecords, todayDateStr, currentLocalHour]);

  // --- WEEKLY TREND ANALYSIS (LAST 5 DAYS SPARKLINE) ---
  const weeklyMiniTrend = useMemo(() => {
    const last5Days: { dateStr: string; label: string; rate: number }[] = [];
    const total = securityFilteredWorkforce.length;

    for (let i = 4; i >= 0; i--) {
      try {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const label = d.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short' });

        let presentCount = 0;
        securityFilteredWorkforce.forEach(emp => {
          const rec = attendanceRecords.find(r => 
            r.date === dateStr && (
              isSameEmployee(r.employeeId, emp.employeeCode) ||
              isSameEmployee(r.employeeId, emp.id) ||
              isSameEmployee(r.employeeCode, emp.employeeCode) ||
              isSameEmployee(r.employeeCode, emp.id)
            )
          );

          if (rec && hasActualCheckIn(rec)) {
            presentCount++;
          }
        });

        const rate = total > 0 ? Math.round((presentCount / total) * 100) : 0;
        last5Days.push({ dateStr, label, rate });
      } catch {
        last5Days.push({ dateStr: '', label: `Day ${5-i}`, rate: 50 });
      }
    }

    return last5Days;
  }, [securityFilteredWorkforce, attendanceRecords]);

  // --- DYNAMIC TEXT INSIGHTS ---
  const smartInsights = useMemo(() => {
    const list: { type: 'success' | 'warning' | 'info'; text: string }[] = [];

    // Insight 1: First check-in spotlight
    const todayCheckedInLogs = securityFilteredWorkforce
      .filter(emp => emp.todayRecord && emp.todayRecord.checkInTime)
      .map(emp => ({
        name: emp.name,
        time: emp.todayRecord.checkInTime,
        dateObj: new Date(`${todayDateStr}T${emp.todayRecord.checkInTime}`)
      }))
      .sort((a, b) => {
        // Safe time string compare
        return a.time.localeCompare(b.time);
      });

    if (todayCheckedInLogs.length > 0) {
      const first = todayCheckedInLogs[0];
      list.push({
        type: 'success',
        text: `First Check-in: ${first.name} logged in at ${first.time} today.`
      });
    }

    // Insight 2: WFH remote concentration
    if (todaySummary.wfh > 0) {
      const wfhRate = Math.round((todaySummary.wfh / (todaySummary.present || 1)) * 100);
      list.push({
        type: 'info',
        text: `Remote work balance: ${todaySummary.wfh} employees (${wfhRate}% of present staff) are active on Work From Home today.`
      });
    } else {
      list.push({
        type: 'info',
        text: 'All currently checked-in employees are operating directly on-site.'
      });
    }

    // Insight 3: Performance & punctuality rate
    if (todaySummary.present > 0) {
      const punctualCount = todaySummary.present - todaySummary.late;
      const punctualityRate = Math.round((punctualCount / todaySummary.present) * 100);
      if (punctualityRate >= 90) {
        list.push({
          type: 'success',
          text: `Exceptional punctuality: ${punctualityRate}% of today's present workforce checked in on time.`
        });
      } else if (todaySummary.late > 0) {
        list.push({
          type: 'warning',
          text: `Punctuality focus: ${todaySummary.late} late arrivals (${100 - punctualityRate}% of present staff) identified today.`
        });
      }
    }

    // Fill blank insights if empty
    if (list.length < 3) {
      list.push({
        type: 'success',
        text: 'Unified Governance: All system sensors and network-bound check-ins are communicating properly.'
      });
    }

    return list.slice(0, 3);
  }, [securityFilteredWorkforce, todaySummary, todayDateStr]);

  // --- CSV EXPORT TRIGGER ---
  const handleExportDailyCSV = () => {
    const headers = [
      'Employee Code',
      'Name',
      'Office Branch',
      'Designation',
      'Work Status Today',
      'Today Mode',
      'Check-in Time',
      'Check-out Time',
      'Late?'
    ];

    const rows = securityFilteredWorkforce.map(emp => [
      emp.employeeCode || emp.id || '—',
      emp.name,
      emp.office || '—',
      emp.designation || '—',
      emp.todayStatus,
      emp.todayMode,
      emp.todayRecord?.checkInTime || '—',
      emp.todayRecord?.checkOutTime || '—',
      emp.isLate ? 'YES' : 'NO'
    ]);

    const filename = `Daily_Workforce_Brief_${todayDateStr}`;
    exportToCSV(filename, headers, rows);
  };

  // Compare rates
  const rateDiff = todaySummary.rate - yesterdaySummary.rate;

  return (
    <div id="smart-daily-brief" className="space-y-6">
      {/* WELCOME BANNER WITH METADATA HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-purple-500/10 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {greetingIcon}
            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
              {greetingText}, {adminName} 👋
            </h1>
          </div>
          <p className="text-xs text-purple-200/70">
            Here's today's workforce summary.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Kolkata-safe Today Badge */}
          <div className="px-3.5 py-1.5 bg-[#1E1145] border border-purple-500/30 rounded-xl text-xs font-bold text-purple-300 flex items-center gap-2 shadow-sm font-mono">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>{formattedDateText}</span>
          </div>

          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 border border-purple-500/20 rounded-xl transition-all text-purple-300 disabled:opacity-50"
            title="Refresh brief data"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* CORE STATS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Expected */}
        <div className="p-4 bg-[#23154C] border border-purple-500/20 rounded-xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Expected Staff</span>
            <div className="p-1.5 bg-purple-500/10 rounded-lg text-purple-300">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-white">{todaySummary.total}</div>
            <div className="text-[10px] text-purple-300/50">Approved Registrations</div>
          </div>
        </div>

        {/* Present */}
        <div className="p-4 bg-[#23154C] border border-purple-500/20 rounded-xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Present Today</span>
            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-300">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-emerald-400">{todaySummary.present}</div>
            <div className="text-[10px] text-purple-300/50">Active Checked In</div>
          </div>
        </div>

        {/* Remote (WFH) */}
        <div className="p-4 bg-[#23154C] border border-purple-500/20 rounded-xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Remote (WFH)</span>
            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-300">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-blue-300">{todaySummary.wfh}</div>
            <div className="text-[10px] text-purple-300/50">Working Remotely</div>
          </div>
        </div>

        {/* Not Checked In */}
        <div className="p-4 bg-[#23154C] border border-purple-500/20 rounded-xl flex flex-col justify-between space-y-3">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Not Checked In</span>
            <div className="p-1.5 bg-amber-500/10 rounded-lg text-amber-300">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-amber-300">{todaySummary.notCheckedIn}</div>
            <div className="text-[10px] text-purple-300/50">{todaySummary.approvedLeave > 0 ? `${todaySummary.approvedLeave} on leave • Awaiting logins` : 'Awaiting Logins'}</div>
          </div>
        </div>

        {/* Attendance % & Mini Trend Sparkline */}
        <div className="p-4 bg-[#23154C] border border-purple-500/20 rounded-xl flex flex-col justify-between space-y-2">
          <div className="flex justify-between items-start">
            <span className="text-[10px] text-purple-300/80 font-bold uppercase tracking-wider">Attendance Rate</span>
            <div className="flex items-center gap-1">
              {rateDiff >= 0 ? (
                <span className="text-[10px] font-bold text-emerald-400 flex items-center">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> +{rateDiff}%
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-400 flex items-center">
                  <TrendingDown className="w-3 h-3 mr-0.5" /> {rateDiff}%
                </span>
              )}
            </div>
          </div>
          
          <div className="flex items-end justify-between">
            <div>
              <div className="text-2xl font-black text-white">{todaySummary.rate}%</div>
              <div className="text-[10px] text-purple-300/50">Yesterday: {yesterdaySummary.rate}%</div>
            </div>

            {/* Sparkline Visual SVG */}
            <div className="w-16 h-8 flex items-end">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 60 30">
                <path
                  d={`M ${weeklyMiniTrend.map((day, idx) => `${idx * 15},${30 - (day.rate * 0.25)}`).join(' L ')}`}
                  fill="none"
                  stroke="#A855F7"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {weeklyMiniTrend.map((day, idx) => (
                  <circle
                    key={idx}
                    cx={idx * 15}
                    cy={30 - (day.rate * 0.25)}
                    r="2.5"
                    fill="#F59E0B"
                  />
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN INTELLIGENCE GRID: Priority Actions & Smart Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* NEEDS YOUR ATTENTION / PRIORITY ACTIONS */}
        <Card className="p-5 bg-[#250F4C] border border-purple-500/20 space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" /> Needs Your Attention
            </h3>
            <p className="text-xs text-purple-200/70">
              Immediate operational issues detected from today's logs.
            </p>
          </div>

          <div className="space-y-2.5 my-3">
            {/* Missing Checkout Action Card */}
            <button 
              onClick={() => onNavigateToTab('attendance', 'MISSING_CHECKOUT')}
              className="w-full p-3 bg-[#1A0B36]/80 hover:bg-[#1A0B36] active:scale-[0.99] border border-purple-500/10 hover:border-amber-500/30 rounded-xl flex items-center justify-between transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${attentionItems.missingCheckouts.length > 0 ? 'bg-amber-500/10 text-amber-300' : 'bg-purple-500/5 text-purple-300/40'}`}>
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Missing Checkouts</div>
                  <div className="text-[10px] text-purple-200/60">Awaiting exit signals for office checkout</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                  attentionItems.missingCheckouts.length > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-purple-500/5 text-purple-300/30'
                }`}>
                  {attentionItems.missingCheckouts.length}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400/50 group-hover:text-amber-400 transition-colors group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* Late Arrivals Action Card */}
            <button 
              onClick={() => onNavigateToTab('attendance', 'LATE')}
              className="w-full p-3 bg-[#1A0B36]/80 hover:bg-[#1A0B36] active:scale-[0.99] border border-purple-500/10 hover:border-amber-500/30 rounded-xl flex items-center justify-between transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${attentionItems.lates.length > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-purple-500/5 text-purple-300/40'}`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Late Arrivals</div>
                  <div className="text-[10px] text-purple-200/60">Staff checking in past the 10:31 AM grace limit</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                  attentionItems.lates.length > 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-purple-500/5 text-purple-300/30'
                }`}>
                  {attentionItems.lates.length}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400/50 group-hover:text-amber-400 transition-colors group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* Attendance Anomaly Action Card */}
            <button 
              onClick={() => onNavigateToTab('attendanceIntelligence')}
              className="w-full p-3 bg-[#1A0B36]/80 hover:bg-[#1A0B36] active:scale-[0.99] border border-purple-500/10 hover:border-purple-500/30 rounded-xl flex items-center justify-between transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${attentionItems.anomalies.length > 0 ? 'bg-rose-500/10 text-rose-300' : 'bg-purple-500/5 text-purple-300/40'}`}>
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Attendance Anomalies</div>
                  <div className="text-[10px] text-purple-200/60">Duplicate logs or severe system discrepancies</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                  attentionItems.anomalies.length > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-purple-500/5 text-purple-300/30'
                }`}>
                  {attentionItems.anomalies.length}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400/50 group-hover:text-rose-400 transition-colors group-hover:translate-x-0.5" />
              </div>
            </button>

            {/* Attendance Corrections Action Card */}
            <button 
              onClick={() => onNavigateToTab('attendanceIntelligence')}
              className="w-full p-3 bg-[#1A0B36]/80 hover:bg-[#1A0B36] active:scale-[0.99] border border-purple-500/10 hover:border-purple-500/30 rounded-xl flex items-center justify-between transition-all group text-left"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${attentionItems.corrections.length > 0 ? 'bg-indigo-500/10 text-indigo-300' : 'bg-purple-500/5 text-purple-300/40'}`}>
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-white">Recent Manual Corrections</div>
                  <div className="text-[10px] text-purple-200/60">Manual adjustments applied to today's sheets</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                  attentionItems.corrections.length > 0 ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-purple-500/5 text-purple-300/30'
                }`}>
                  {attentionItems.corrections.length}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-purple-400/50 group-hover:text-indigo-400 transition-colors group-hover:translate-x-0.5" />
              </div>
            </button>
          </div>
        </Card>

        {/* TODAY'S SMART INSIGHTS */}
        <Card className="p-5 bg-[#250F4C] border border-purple-500/20 space-y-4 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-300" /> Today's Smart Insights
            </h3>
            <p className="text-xs text-purple-200/70">
              Heuristic trends extracted automatically from active telemetry logs.
            </p>
          </div>

          <div className="space-y-4 my-auto pt-4">
            {smartInsights.map((insight, idx) => (
              <div 
                key={idx} 
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition-colors ${
                  insight.type === 'success' 
                    ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-200' 
                    : insight.type === 'warning'
                    ? 'bg-amber-500/5 border-amber-500/20 text-amber-200'
                    : 'bg-indigo-500/5 border-indigo-500/10 text-purple-200'
                }`}
              >
                <div className={`p-1.5 rounded-lg shrink-0 ${
                  insight.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : insight.type === 'warning'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-indigo-500/10 text-purple-400'
                }`}>
                  <Lightbulb className="w-4 h-4" />
                </div>
                <p className="text-xs leading-relaxed font-medium">
                  {insight.text}
                </p>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-purple-500/10 flex items-center justify-between">
            <span className="text-[10px] text-purple-300/40 font-mono">INSIGHT_ENGINE_v6.0</span>
            <div className="text-[10px] text-purple-300/60 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              Real-time synchronization active
            </div>
          </div>
        </Card>
      </div>

      {/* QUICK ACTIONS & EXPORTS FOOTER */}
      <Card className="p-4 bg-gradient-to-r from-[#1D113C] to-[#2B1059] border border-purple-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-300">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-black text-white">Quick Control Core</div>
            <div className="text-[10px] text-purple-200/50">Navigate directly or download workforce state</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 w-full sm:w-auto">
          <Button 
            onClick={() => onNavigateToTab('attendance')}
            variant="secondary"
            className="text-xs py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 font-bold"
          >
            <Calendar className="w-3.5 h-3.5 mr-1.5" />
            Attendance Logs
          </Button>

          <Button 
            onClick={() => onNavigateToTab('attendanceIntelligence')}
            variant="secondary"
            className="text-xs py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 font-bold"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Audits & AI
          </Button>

          <Button 
            onClick={handleExportDailyCSV}
            className="text-xs py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
            Export CSV Brief
          </Button>
        </div>
      </Card>

      {/* REFRESH STATUS FOOTER */}
      <div className="flex items-center justify-between text-[10px] text-purple-300/40 font-mono pt-2">
        <span>Last updated: {lastUpdated}</span>
        <span>Secure Local Sandboxed Brief</span>
      </div>
    </div>
  );
};
