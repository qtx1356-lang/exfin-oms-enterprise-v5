import React, { useState, useEffect, useMemo } from 'react';
import { getActiveDbSync } from '../../services/firebase/db_sync';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { 
  Brain, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Filter, 
  Download, User, Clock, ArrowUpRight, Activity, Building2, Users, 
  CheckCircle, Calendar, WifiOff, FileText, ChevronRight, Info, 
  ShieldCheck, ArrowRight, Eye, ShieldAlert, HeartHandshake, ListCollapse, CheckSquare, RefreshCw
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ManagedUser } from '../../types/user';
import { AttendanceRecord, AttendanceCorrection } from '../../types/attendance';
import { isAttendanceCheckoutUnresolved, isSameEmployee } from '../../utils/attendanceUtils';
import { isSalaryLateCheckIn } from '../../services/salary/salaryService';
import { exportToCSV } from '../../services/reports/exportService';
import { fetchDepartments } from '../../services/organization/organizationService';

interface AttendanceIntelligenceProps {
  role: 'ADMIN' | 'SUPER_ADMIN' | 'HR' | string;
  authorizedOffice: string;
  onViewAttendanceDetails: (record: AttendanceRecord) => void;
  onRectifyAttendance: (record: AttendanceRecord) => void;
}

export const AttendanceIntelligence: React.FC<AttendanceIntelligenceProps> = ({
  role,
  authorizedOffice,
  onViewAttendanceDetails,
  onRectifyAttendance
}) => {
  const isSuperAdmin = role === 'SUPER_ADMIN';

  // State for data
  const [registrations, setRegistrations] = useState<ManagedUser[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
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

    // 2. Attendance (Last 1500 records for intelligence analysis)
    const qAtt = query(collection(getActiveDbSync(), 'attendance'), limit(1500));
    const unsubAtt = onSnapshot(qAtt, (snap) => {
      const list: AttendanceRecord[] = [];
      snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as AttendanceRecord));
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

  // Filters state
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month'>('today');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedLeaderId, setSelectedLeaderId] = useState<string>('ALL');
  const [dbDepartments, setDbDepartments] = useState<string[]>([]);
  
  // Selected item detail state
  const [selectedIssue, setSelectedIssue] = useState<{
    employee: ManagedUser | any;
    record: AttendanceRecord;
    issueType: string;
    description: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    date: string;
    checkIn: string;
    checkOut: string;
    meta?: any;
  } | null>(null);

  // Load configured departments from DB (and merge with employee ones for robustness)
  useEffect(() => {
    let active = true;
    const loadDepts = async () => {
      try {
        const depts = await fetchDepartments();
        if (active) {
          const names = depts.filter(d => d.active).map(d => d.name);
          setDbDepartments(names);
        }
      } catch (err) {
        console.error('Failed to load departments for intelligence filter:', err);
      }
    };
    loadDepts();
    return () => { active = false; };
  }, []);

  // Timezone-safe local date for Kolkata
  const todayDateStr = useMemo(() => {
    try {
      return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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

  // Department list for dropdown
  const allDepartments = useMemo(() => {
    const activeEmps = registrations.filter(r => r.status === 'Approved');
    const empDepts = Array.from(new Set(activeEmps.map(r => r.office || 'Raniganj')));
    const combined = Array.from(new Set(['ALL', ...dbDepartments, ...empDepts]));
    
    // Admin restriction if not Super Admin
    if (!isSuperAdmin) {
      return [authorizedOffice];
    }
    return combined;
  }, [registrations, dbDepartments, isSuperAdmin, authorizedOffice]);

  // Set default department for admins
  useEffect(() => {
    if (!isSuperAdmin && selectedDept !== authorizedOffice) {
      setSelectedDept(authorizedOffice);
    }
  }, [isSuperAdmin, authorizedOffice, selectedDept]);

  // Team leaders list
  const teamLeaders = useMemo(() => {
    const approved = registrations.filter(r => r.status === 'Approved');
    const leaders = approved.filter(r => r.isTeamLeader === true);
    
    // In case no leaders are explicitly flagged, collect leaders who have assigned members
    const assignedLeaderIds = Array.from(new Set(approved.map(r => r.assignedTeamLeaderId).filter(Boolean)));
    const fallbackLeaders = approved.filter(r => assignedLeaderIds.includes(r.id) || assignedLeaderIds.includes(r.employeeCode));
    
    // Merge both
    const finalLeadersMap = new Map<string, ManagedUser>();
    leaders.forEach(l => finalLeadersMap.set(l.id, l));
    fallbackLeaders.forEach(l => finalLeadersMap.set(l.id, l));
    
    return Array.from(finalLeadersMap.values());
  }, [registrations]);

  // Helper date generators for Kolkata timezone
  const getKolkataDate = (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    try {
      return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  };

  const startOfWeekStr = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(now.setDate(diff));
    try {
      return startOfWeek.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    } catch {
      return `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`;
    }
  }, []);

  const startOfMonthStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }, []);

  // Filter records and employees based on the selected criteria
  const { filteredEmployees, dateFilteredRecords, rangeStartDate, rangeEndDate } = useMemo(() => {
    let emps = registrations.filter(r => r.status === 'Approved');
    
    // 1. Department filter
    if (selectedDept !== 'ALL') {
      emps = emps.filter(e => e.office === selectedDept);
    }
    
    // 2. Team Leader filter
    if (selectedLeaderId !== 'ALL') {
      emps = emps.filter(e => 
        e.assignedTeamLeaderId === selectedLeaderId || 
        e.id === selectedLeaderId
      );
    }

    const empCodes = new Set(emps.map(e => e.employeeCode));
    const empIds = new Set(emps.map(e => e.id));

    // Determine Date Limits
    let startDate = todayDateStr;
    let endDate = todayDateStr;

    if (dateRange === 'week') {
      startDate = startOfWeekStr;
      endDate = todayDateStr;
    } else if (dateRange === 'month') {
      startDate = startOfMonthStr;
      endDate = todayDateStr;
    }

    // Filter attendance records to date range and active filtered employees
    const rangeRecords = attendanceRecords.filter(rec => {
      const inDateRange = rec.date >= startDate && rec.date <= endDate;
      if (!inDateRange) return false;
      return empCodes.has(rec.employeeId) || empIds.has(rec.employeeId);
    });

    return {
      filteredEmployees: emps,
      dateFilteredRecords: rangeRecords,
      rangeStartDate: startDate,
      rangeEndDate: endDate
    };
  }, [registrations, attendanceRecords, dateRange, selectedDept, selectedLeaderId, todayDateStr, startOfWeekStr, startOfMonthStr]);

  // Helper: Convert time string "10:30 AM" to minutes from midnight
  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0;
    try {
      const trimmed = timeStr.trim().toUpperCase();
      const match = trimmed.match(/^(\d+):(\d+)(?::\d+)?\s*(AM|PM)?/);
      if (!match) return 0;
      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3];
      if (ampm === 'PM' && hours < 12) {
        hours += 12;
      } else if (ampm === 'AM' && hours === 12) {
        hours = 0;
      }
      return hours * 60 + minutes;
    } catch {
      return 0;
    }
  };

  // Helper: Get delay string for offline sync
  const calculateSyncDelayStr = (deviceTime: string, syncTime: string): string => {
    if (!deviceTime || !syncTime) return "N/A";
    try {
      const devDate = new Date(deviceTime);
      const syncDate = new Date(syncTime);
      const diffMs = syncDate.getTime() - devDate.getTime();
      if (diffMs <= 0) return "0 mins";
      const diffMins = Math.round(diffMs / 60000);
      if (diffMins < 60) {
        return `${diffMins} mins`;
      }
      const hrs = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    } catch {
      return "Unknown";
    }
  };

  // ----------------------------------------------------
  // INTELLIGENCE ENGINE: ANALYZE DATA & COMPILE ISSUES
  // ----------------------------------------------------
  const intelligenceData = useMemo(() => {
    const unresolvedCheckoutsList: any[] = [];
    const missingCheckoutsList: any[] = [];
    const lateArrivalsList: any[] = [];
    const anomaliesList: any[] = [];
    const offlineSyncList: any[] = [];
    const correctionsList: any[] = [];

    // Map of employees for quick lookups
    const empMap = new Map<string, ManagedUser>();
    filteredEmployees.forEach(e => {
      empMap.set(e.employeeCode, e);
      empMap.set(e.id, e);
    });

    dateFilteredRecords.forEach(record => {
      const emp = empMap.get(record.employeeId) || {
        name: record.employeeName || 'Unknown Employee',
        employeeCode: record.employeeId || '—',
        office: record.townCity || 'General'
      } as any;

      const type = record.attendanceType || 'OFFICE';
      const isToday = record.date === todayDateStr;

      // 0. UNRESOLVED / PENDING ADMIN REVIEW DETECTION
      const effectiveStatus = record.checkoutStatus === 'PENDING_ADMIN_REVIEW' ? 'PENDING_ADMIN_REVIEW' : 
                              isAttendanceCheckoutUnresolved(record) ? 'UNRESOLVED' : record.checkoutStatus;

      if (effectiveStatus === 'UNRESOLVED' || effectiveStatus === 'PENDING_ADMIN_REVIEW') {
        const isPendingReview = effectiveStatus === 'PENDING_ADMIN_REVIEW';
        unresolvedCheckoutsList.push({
          employee: emp,
          record,
          issueType: isPendingReview ? 'Pending Review' : 'Unresolved Checkout',
          description: isPendingReview
            ? `Employee submitted proposed checkout: ${record.employeeProposedCheckoutTime || '—'}. Admin review required.`
            : `No reliable exit candidate detected on ${record.date}. Status: UNRESOLVED.`,
          severity: 'CRITICAL',
          date: record.date,
          checkIn: record.checkInTime,
          checkOut: isPendingReview ? `Proposed: ${record.employeeProposedCheckoutTime}` : 'UNRESOLVED',
          proposedTime: record.employeeProposedCheckoutTime,
          status: effectiveStatus
        });
      }

      // 1. MISSING CHECKOUT DETECTION
      let isMissingCo = false;
      if (record.checkInTime && !record.checkOutTime) {
        // If already classified as unresolved, don't double count in missing
        if (effectiveStatus === 'UNRESOLVED' || effectiveStatus === 'PENDING_ADMIN_REVIEW') {
          isMissingCo = false;
        } else {
          isMissingCo = true;
          
          // Exclusions
          if (isToday) {
          // WFH before 6 PM
          if (type === 'WFH' && currentLocalHour < 18) {
            isMissingCo = false;
          }
          // Client Visit before 6 PM
          if (type === 'CLIENT_VISIT' && currentLocalHour < 18) {
            isMissingCo = false;
          }
          // Office employee still actively inside (no exits logged)
          if (type === 'OFFICE') {
            const hasExits = record.exitTime || record.lastExitTime || record.currentState === 'PENDING_FINAL_EXIT';
            if (!hasExits) {
              isMissingCo = false;
            }
          }
        }
        }
        
        // Outdoor legitimately does not require checkout
        if (type === 'OUTDOOR') {
          isMissingCo = false;
        }
      }

      if (isMissingCo) {
        missingCheckoutsList.push({
          employee: emp,
          record,
          issueType: 'Missing Checkout',
          description: `Checked-in at ${record.checkInTime} (${type}) but no check-out was recorded.`,
          severity: 'WARNING',
          date: record.date,
          checkIn: record.checkInTime,
          checkOut: 'Not Recorded'
        });
      }

      // 2. LATE ARRIVALS DETECTION (uses corrected check-in time)
      if (record.checkInTime && isSalaryLateCheckIn(record.checkInTime)) {
        const minsLate = Math.max(0, parseTimeToMinutes(record.checkInTime) - 630); // 10:30 AM
        lateArrivalsList.push({
          employee: emp,
          record,
          issueType: 'Late Arrival',
          description: `Checked-in at ${record.checkInTime}. Threshold is 10:30 AM.`,
          severity: 'INFO',
          date: record.date,
          checkIn: record.checkInTime,
          checkOut: record.checkOutTime || 'Pending',
          minutesLate: minsLate
        });
      }

      // 3. OFFLINE SYNC DETECTION
      if (record.isOffline === true) {
        const delayStr = record.serverSyncTime && record.createdAtDeviceTime
          ? calculateSyncDelayStr(record.createdAtDeviceTime, record.serverSyncTime)
          : '—';
        offlineSyncList.push({
          employee: emp,
          record,
          issueType: 'Offline Event Sync',
          description: `Event queued offline and synchronized later. Original: ${record.checkInTime}.`,
          severity: 'INFO',
          date: record.date,
          checkIn: record.checkInTime,
          checkOut: record.checkOutTime || 'Pending',
          syncTime: record.serverSyncTime ? new Date(record.serverSyncTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
          delay: delayStr
        });
      }

      // 4. CORRECTIONS HISTORY DETECT
      if (Array.isArray(record.correctionHistory) && record.correctionHistory.length > 0) {
        record.correctionHistory.forEach((corr: AttendanceCorrection) => {
          correctionsList.push({
            employee: emp,
            record,
            issueType: 'Attendance Corrected',
            description: `Manual correction applied by ${corr.correctedBy} (${corr.correctedByRole}). Reason: ${corr.reason}`,
            severity: 'INFO',
            date: record.date,
            checkIn: record.checkInTime,
            checkOut: record.checkOutTime || 'Pending',
            correction: corr
          });
        });
      }

      // 5. ATTENDANCE ANOMALIES DETECTION (Conflicting states or impossible time sequence)
      let anomalyReason: string | null = null;
      if (record.checkInTime && record.checkOutTime) {
        const inMins = parseTimeToMinutes(record.checkInTime);
        const outMins = parseTimeToMinutes(record.checkOutTime);
        if (outMins < inMins) {
          anomalyReason = `Checkout time (${record.checkOutTime}) is earlier than check-in time (${record.checkInTime}).`;
        }
      }

      if (!anomalyReason && record.checkInTime && record.exitTime) {
        const inMins = parseTimeToMinutes(record.checkInTime);
        const exitMins = parseTimeToMinutes(record.exitTime);
        if (exitMins < inMins) {
          anomalyReason = `Geofence exit (${record.exitTime}) logged earlier than check-in time (${record.checkInTime}).`;
        }
      }

      if (!anomalyReason && record.exitTime && record.returnTime) {
        const exitMins = parseTimeToMinutes(record.exitTime);
        const returnMins = parseTimeToMinutes(record.returnTime);
        if (returnMins < exitMins) {
          anomalyReason = `Geofence return (${record.returnTime}) logged earlier than geofence exit (${record.exitTime}).`;
        }
      }

      if (!anomalyReason && record.checkOutTime && record.currentState === 'CHECKED_IN') {
        anomalyReason = `Inconsistent record state: Checked Out logged but state remains Checked In.`;
      }

      if (anomalyReason) {
        anomaliesList.push({
          employee: emp,
          record,
          issueType: 'Attendance Anomaly',
          description: anomalyReason,
          severity: 'CRITICAL',
          date: record.date,
          checkIn: record.checkInTime,
          checkOut: record.checkOutTime || 'Pending'
        });
      }
    });

    // 6. EXTRA DETECT: Multiple records on the same day (conflicting logs / duplicates)
    const recordsGroupedByEmpDate: Record<string, AttendanceRecord[]> = {};
    dateFilteredRecords.forEach(r => {
      const key = `${r.employeeId}_${r.date}`;
      if (!recordsGroupedByEmpDate[key]) recordsGroupedByEmpDate[key] = [];
      recordsGroupedByEmpDate[key].push(r);
    });

    Object.entries(recordsGroupedByEmpDate).forEach(([key, list]) => {
      if (list.length > 1) {
        const r = list[0];
        const emp = empMap.get(r.employeeId) || { name: r.employeeName || 'Unknown Employee', employeeCode: r.employeeId } as any;
        anomaliesList.push({
          employee: emp,
          record: r,
          issueType: 'Attendance Anomaly',
          description: `Duplicate attendance records found for this employee on ${r.date}.`,
          severity: 'CRITICAL',
          date: r.date,
          checkIn: r.checkInTime,
          checkOut: r.checkOutTime || 'Pending'
        });
      }
    });

    // Combine all issues
    const allIssues = [
      ...unresolvedCheckoutsList,
      ...anomaliesList,
      ...missingCheckoutsList,
      ...lateArrivalsList,
      ...offlineSyncList,
      ...correctionsList
    ];

    return {
      unresolvedCheckouts: unresolvedCheckoutsList,
      missingCheckouts: missingCheckoutsList,
      lateArrivals: lateArrivalsList,
      anomalies: anomaliesList,
      offlineSyncs: offlineSyncList,
      corrections: correctionsList,
      allIssues
    };
  }, [filteredEmployees, dateFilteredRecords, todayDateStr, currentLocalHour]);

  // ----------------------------------------------------
  // TREND INSIGHTS ENGINE: COMPARE THIS WEEK VS PREVIOUS
  // ----------------------------------------------------
  const trendInsights = useMemo(() => {
    // We calculate stats for This Week (last 7 days: offsets -6 to 0) and Previous Week (offsets -13 to -7)
    // using the exact active employees filtered by department/team leaders
    const approvedEmps = filteredEmployees;
    if (approvedEmps.length === 0) {
      return { status: 'insufficient', msg: 'Not enough data for a reliable trend.' };
    }

    const calculateWeekStats = (startOffset: number, endOffset: number) => {
      const datesList: string[] = [];
      for (let o = startOffset; o <= endOffset; o++) {
        datesList.push(getKolkataDate(o));
      }

      let totalExpectedDays = approvedEmps.length * datesList.length;
      let totalPresents = 0;
      let totalLates = 0;
      let totalAbsents = 0;
      let totalLeaves = 0;
      let totalWfhs = 0;
      let totalClients = 0;

      // Map employee codes & IDs
      const empCodes = new Set(approvedEmps.map(e => e.employeeCode));
      const empIds = new Set(approvedEmps.map(e => e.id));

      // Filter global attendance for these days & employees
      const weekRecords = attendanceRecords.filter(r => 
        datesList.includes(r.date) && 
        (empCodes.has(r.employeeId) || empIds.has(r.employeeId))
      );

      // Group records by employee and date
      const recMap = new Map<string, AttendanceRecord>();
      weekRecords.forEach(r => {
        recMap.set(`${r.employeeId}_${r.date}`, r);
      });

      datesList.forEach(d => {
        // Is Sunday?
        let isSunday = false;
        try {
          isSunday = new Date(d).getDay() === 0;
        } catch {}

        approvedEmps.forEach(emp => {
          const rec = recMap.get(`${emp.employeeCode}_${d}`) || recMap.get(`${emp.id}_${d}`);
          
          if (rec) {
            totalPresents++;
            const type = (rec.attendanceType || 'OFFICE').toUpperCase();
            if (type === 'WFH') totalWfhs++;
            else if (type === 'CLIENT_VISIT') totalClients++;
            
            if (rec.checkInTime && isSalaryLateCheckIn(rec.checkInTime)) {
              totalLates++;
            }
          } else {
            // Check approved leave
            const isLeave = leaves.some(l => 
              l.status === 'APPROVED' && 
              (isSameEmployee(l.employeeId, emp.id) || isSameEmployee(l.employeeId, emp.employeeCode) || isSameEmployee(l.employeeCode, emp.employeeCode) || isSameEmployee(l.employeeCode, emp.id)) &&
              d >= l.startDate && d <= l.endDate
            );

            if (isLeave) {
              totalLeaves++;
              totalPresents++; // counts as present for salary/attendance
            } else if (isSunday) {
              totalPresents++; // Sunday counts as Present under Rule 2
            } else {
              totalAbsents++;
            }
          }
        });
      });

      const presPct = totalExpectedDays > 0 ? Math.round((totalPresents / totalExpectedDays) * 100) : 0;
      const latePct = totalPresents > 0 ? Math.round((totalLates / totalPresents) * 100) : 0;
      const absPct = totalExpectedDays > 0 ? Math.round((totalAbsents / totalExpectedDays) * 100) : 0;
      const leavePct = totalExpectedDays > 0 ? Math.round((totalLeaves / totalExpectedDays) * 100) : 0;
      const wfhPct = totalPresents > 0 ? Math.round((totalWfhs / totalPresents) * 100) : 0;
      const clientPct = totalPresents > 0 ? Math.round((totalClients / totalPresents) * 100) : 0;

      return {
        presentPct: presPct,
        latePct: latePct,
        absentPct: absPct,
        leavePct: leavePct,
        wfhPct: wfhPct,
        clientPct: clientPct,
        totalLates
      };
    };

    const currentWeekStats = calculateWeekStats(-6, 0);
    const prevWeekStats = calculateWeekStats(-13, -7);

    return {
      status: 'success',
      current: currentWeekStats,
      previous: prevWeekStats
    };
  }, [filteredEmployees, attendanceRecords, leaves]);

  // ----------------------------------------------------
  // AUTOMATIC INSIGHTS & REPEATED PATTERNS COMPILER
  // ----------------------------------------------------
  const automaticInsights = useMemo(() => {
    if (trendInsights.status === 'insufficient' || filteredEmployees.length === 0) {
      return {
        textInsights: ["Not enough data for a reliable trend."],
        repeatedPatterns: []
      };
    }

    const { current, previous } = trendInsights as any;
    const insights: string[] = [];
    const patterns: { empName: string; empCode: string; issue: string; count: number; type: 'late' | 'missing' }[] = [];

    // 1. Weekly Attendance comparison
    const attDiff = current.presentPct - previous.presentPct;
    if (attDiff > 0) {
      insights.push(`Overall attendance rate is ${attDiff}% higher than last week (current: ${current.presentPct}%, previous: ${previous.presentPct}%).`);
    } else if (attDiff < 0) {
      insights.push(`Overall attendance rate dropped by ${Math.abs(attDiff)}% compared to last week.`);
    } else {
      insights.push(`Attendance rate has remained stable at ${current.presentPct}% compared to last week.`);
    }

    // 2. Late arrivals comparison
    const lateDiff = current.totalLates - previous.totalLates;
    if (lateDiff < 0) {
      insights.push(`Good trend: Late arrivals decreased by ${Math.abs(lateDiff)} events compared to last week.`);
    } else if (lateDiff > 0) {
      insights.push(`Attention needed: Late arrivals increased by ${lateDiff} events compared to last week.`);
    }

    // 3. Peak Late Day (last 30 days)
    const thirtyDaysAgoStr = getKolkataDate(-30);
    const recentRecords = attendanceRecords.filter(r => r.date >= thirtyDaysAgoStr);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lateDaysCount: Record<string, number> = {};
    recentRecords.forEach(r => {
      if (r.checkInTime && isSalaryLateCheckIn(r.checkInTime)) {
        try {
          const dayName = dayNames[new Date(r.date).getDay()];
          lateDaysCount[dayName] = (lateDaysCount[dayName] || 0) + 1;
        } catch {}
      }
    });

    let peakDay = '';
    let peakCount = 0;
    Object.entries(lateDaysCount).forEach(([day, count]) => {
      if (count > peakCount) {
        peakCount = count;
        peakDay = day;
      }
    });

    if (peakDay && peakCount > 1) {
      insights.push(`${peakDay} is the peak day for late arrivals over the last 30 days (${peakCount} occurrences).`);
    }

    // 4. Best department this week
    const deptStats: Record<string, { total: number; present: number }> = {};
    const empMap = new Map<string, ManagedUser>();
    filteredEmployees.forEach(e => empMap.set(e.employeeCode, e));

    const datesList: string[] = [];
    for (let o = -6; o <= 0; o++) datesList.push(getKolkataDate(o));

    datesList.forEach(d => {
      filteredEmployees.forEach(emp => {
        const dept = emp.office || 'Raniganj';
        if (!deptStats[dept]) deptStats[dept] = { total: 0, present: 0 };
        deptStats[dept].total++;

        const rec = attendanceRecords.find(r => r.date === d && (isSameEmployee(r.employeeId, emp.employeeCode) || isSameEmployee(r.employeeId, emp.id) || isSameEmployee(r.employeeCode, emp.employeeCode) || isSameEmployee(r.employeeCode, emp.id)));
        if (rec) {
          deptStats[dept].present++;
        }
      });
    });

    let bestDept = '';
    let bestDeptRate = 0;
    Object.entries(deptStats).forEach(([dept, stat]) => {
      const rate = stat.total > 0 ? (stat.present / stat.total) * 100 : 0;
      if (rate > bestDeptRate) {
        bestDeptRate = rate;
        bestDept = dept;
      }
    });

    if (bestDept && bestDeptRate > 0) {
      insights.push(`${bestDept} department has the highest attendance rate this week (${Math.round(bestDeptRate)}%).`);
    }

    // 5. Actions needed insight
    const actionsCount = intelligenceData.anomalies.length + intelligenceData.missingCheckouts.length;
    if (actionsCount > 0) {
      insights.push(`${actionsCount} attendance record${actionsCount > 1 ? 's require' : ' requires'} administrative review.`);
    }

    // 6. Repeated Patterns compiling (monthly)
    const empLateCounts: Record<string, { name: string; code: string; lates: number; missings: number }> = {};
    
    recentRecords.forEach(r => {
      const emp = filteredEmployees.find(e => e.employeeCode === r.employeeId || e.id === r.employeeId);
      if (!emp) return;

      if (!empLateCounts[emp.employeeCode]) {
        empLateCounts[emp.employeeCode] = { name: emp.name, code: emp.employeeCode, lates: 0, missings: 0 };
      }

      // Check Late
      if (r.checkInTime && isSalaryLateCheckIn(r.checkInTime)) {
        empLateCounts[emp.employeeCode].lates++;
      }

      // Check Missing Checkout
      if (r.checkInTime && !r.checkOutTime && r.date < todayDateStr && r.attendanceType !== 'OUTDOOR') {
        empLateCounts[emp.employeeCode].missings++;
      }
    });

    Object.values(empLateCounts).forEach(item => {
      if (item.lates > 3) {
        patterns.push({
          empName: item.name,
          empCode: item.code,
          issue: `Late arrivals ${item.lates} times this month`,
          count: item.lates,
          type: 'late'
        });
      }
      if (item.missings > 1) {
        patterns.push({
          empName: item.name,
          empCode: item.code,
          issue: `Unfinished shifts (${item.missings} missing checkouts) this month`,
          count: item.missings,
          type: 'missing'
        });
      }
    });

    return {
      textInsights: insights.slice(0, 5),
      repeatedPatterns: patterns
    };
  }, [filteredEmployees, attendanceRecords, todayDateStr, intelligenceData, trendInsights]);

  // ----------------------------------------------------
  // CSV EXPORT HANDLER
  // ----------------------------------------------------
  const handleExport = () => {
    const headers = [
      'Employee',
      'Employee Code',
      'Date',
      'Issue Type',
      'Mode',
      'Check-In',
      'Check-Out',
      'Severity',
      'Details / Status'
    ];

    const rows = intelligenceData.allIssues.map(issue => [
      issue.employee.name,
      issue.employee.employeeCode || issue.employee.id || '—',
      issue.date,
      issue.issueType,
      issue.record.attendanceType || 'OFFICE',
      issue.checkIn || '—',
      issue.checkOut || '—',
      issue.severity,
      issue.description
    ]);

    const filename = `Attendance_Intelligence_${dateRange}_${selectedDept}_${getKolkataDate(0)}`;
    exportToCSV(filename, headers, rows);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-indigo-500 animate-spin" />
        <p className="text-indigo-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Processing Attendance Intelligence...</p>
      </div>
    );
  }

  return (
    <div id="attendance-intelligence-tab" className="space-y-6">
      {/* FILTER & HEADER CONTROL BLOCK */}
      <Card className="p-4 border border-purple-500/20 bg-gradient-to-br from-[#1E163B] to-[#120D26]">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Brain className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Attendance Intelligence Dashboard</h3>
              <p className="text-xs text-purple-300 font-medium leading-relaxed mt-0.5">
                Automated auditing, anomaly flags, and workforce trend insights
              </p>
            </div>
          </div>
          
          <Button 
            onClick={handleExport}
            className="bg-indigo-600 hover:bg-indigo-500 text-xs px-4 py-2 flex items-center gap-2 self-stretch md:self-auto justify-center"
          >
            <Download className="w-4 h-4" /> Export Audit Log
          </Button>
        </div>

        {/* Filters bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-purple-500/10">
          <div>
            <label className="text-[10px] font-bold text-purple-300/80 uppercase block mb-1.5">Date Range</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-black/40 rounded-xl border border-purple-500/10">
              {(['today', 'week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setDateRange(r)}
                  className={`text-[10px] font-extrabold py-1.5 px-2 rounded-lg capitalize transition-all ${
                    dateRange === r 
                      ? 'bg-purple-600 text-white shadow-md' 
                      : 'text-purple-300/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-purple-300/80 uppercase block mb-1.5">Department Filter</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full text-xs bg-black/40 border border-purple-500/20 text-white rounded-xl px-3 py-2 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
              disabled={!isSuperAdmin}
            >
              {!isSuperAdmin && <option value={authorizedOffice}>{authorizedOffice}</option>}
              {isSuperAdmin && allDepartments.map((dept) => (
                <option key={dept} value={dept}>{dept === 'ALL' ? 'All Departments' : dept}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-purple-300/80 uppercase block mb-1.5">Team Leader Filter</label>
            <select
              value={selectedLeaderId}
              onChange={(e) => setSelectedLeaderId(e.target.value)}
              className="w-full text-xs bg-black/40 border border-purple-500/20 text-white rounded-xl px-3 py-2 focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="ALL">All Teams</option>
              {teamLeaders.map((tl) => (
                <option key={tl.id} value={tl.id}>
                  {tl.name} ({tl.office || 'Raniganj'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* METRIC SUMMARIES */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Metric 1 */}
        <div className="p-3.5 rounded-2xl border border-red-500/20 bg-gradient-to-b from-red-500/5 to-transparent flex flex-col justify-between h-24">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-red-300/80 uppercase">Anomalies</span>
            <div className="w-5 h-5 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
              <ShieldAlert className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-white">{intelligenceData.anomalies.length}</div>
            <div className="text-[9px] text-red-400 font-medium">Critical Errors</div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-3.5 rounded-2xl border border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent flex flex-col justify-between h-24">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-amber-300/80 uppercase">Unresolved Out</span>
            <div className="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-white">{intelligenceData.unresolvedCheckouts.length}</div>
            <div className="text-[9px] text-amber-400 font-medium">Action Required</div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-3.5 rounded-2xl border border-indigo-500/20 bg-gradient-to-b from-indigo-500/5 to-transparent flex flex-col justify-between h-24">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-indigo-300/80 uppercase">Lates</span>
            <div className="w-5 h-5 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-white">{intelligenceData.lateArrivals.length}</div>
            <div className="text-[9px] text-indigo-400 font-medium">Post 10:31 AM</div>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-3.5 rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/5 to-transparent flex flex-col justify-between h-24">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-blue-300/80 uppercase">Offline Events</span>
            <div className="w-5 h-5 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400">
              <WifiOff className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-white">{intelligenceData.offlineSyncs.length}</div>
            <div className="text-[9px] text-blue-400 font-medium">Synced Later</div>
          </div>
        </div>

        {/* Metric 5 */}
        <div className="p-3.5 rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent flex flex-col justify-between h-24 col-span-2 md:col-span-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-emerald-300/80 uppercase">Corrections</span>
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <HeartHandshake className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-xl font-black text-white">{intelligenceData.corrections.length}</div>
            <div className="text-[9px] text-emerald-400 font-medium">Recent Edits</div>
          </div>
        </div>
      </div>

      {/* TRENDS & AUTO INSIGHTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend comparison column */}
        <Card className="p-4 border border-purple-500/10 bg-[#161033] lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Attendance Trends</h4>
          </div>

          {trendInsights.status === 'insufficient' ? (
            <div className="text-xs text-purple-300/60 p-4 text-center">
              Not enough data for a reliable trend analysis.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Trend metric 1: Attendance Present Rate */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-purple-300 font-medium">Present Rate</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-black">{(trendInsights as any).current.presentPct}%</span>
                    {((trendInsights as any).current.presentPct - (trendInsights as any).previous.presentPct) >= 0 ? (
                      <span className="text-emerald-400 text-[10px] flex items-center"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{((trendInsights as any).current.presentPct - (trendInsights as any).previous.presentPct)}%</span>
                    ) : (
                      <span className="text-red-400 text-[10px] flex items-center"><TrendingDown className="w-2.5 h-2.5 mr-0.5" />{((trendInsights as any).current.presentPct - (trendInsights as any).previous.presentPct)}%</span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(trendInsights as any).current.presentPct}%` }}></div>
                </div>
              </div>

              {/* Trend metric 2: Late rate */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-purple-300 font-medium">Late Rate of Present</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-black">{(trendInsights as any).current.latePct}%</span>
                    {((trendInsights as any).current.latePct - (trendInsights as any).previous.latePct) <= 0 ? (
                      <span className="text-emerald-400 text-[10px] flex items-center"><TrendingDown className="w-2.5 h-2.5 mr-0.5" />-{Math.abs((trendInsights as any).current.latePct - (trendInsights as any).previous.latePct)}%</span>
                    ) : (
                      <span className="text-red-400 text-[10px] flex items-center"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{((trendInsights as any).current.latePct - (trendInsights as any).previous.latePct)}%</span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${(trendInsights as any).current.latePct}%` }}></div>
                </div>
              </div>

              {/* Trend metric 3: Absence rate */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-purple-300 font-medium">Unapproved Absence</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-black">{(trendInsights as any).current.absentPct}%</span>
                    {((trendInsights as any).current.absentPct - (trendInsights as any).previous.absentPct) <= 0 ? (
                      <span className="text-emerald-400 text-[10px] flex items-center"><TrendingDown className="w-2.5 h-2.5 mr-0.5" />-{Math.abs((trendInsights as any).current.absentPct - (trendInsights as any).previous.absentPct)}%</span>
                    ) : (
                      <span className="text-red-400 text-[10px] flex items-center"><TrendingUp className="w-2.5 h-2.5 mr-0.5" />+{((trendInsights as any).current.absentPct - (trendInsights as any).previous.absentPct)}%</span>
                    )}
                  </div>
                </div>
                <div className="w-full bg-black/40 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full rounded-full" style={{ width: `${(trendInsights as any).current.absentPct}%` }}></div>
                </div>
              </div>

              {/* Additional small stats */}
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-purple-500/10 text-center">
                <div className="p-2 bg-black/25 rounded-xl">
                  <p className="text-[9px] text-purple-300/60 uppercase font-bold">WFH Rate</p>
                  <p className="text-sm font-black text-white">{(trendInsights as any).current.wfhPct}%</p>
                </div>
                <div className="p-2 bg-black/25 rounded-xl">
                  <p className="text-[9px] text-purple-300/60 uppercase font-bold">Client Visit</p>
                  <p className="text-sm font-black text-white">{(trendInsights as any).current.clientPct}%</p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Textual insights & patterns */}
        <Card className="p-4 border border-purple-500/10 bg-[#161033] lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <h4 className="text-xs font-black text-white uppercase tracking-wider">Automated Intelligence & Patterns</h4>
            </div>

            <div className="space-y-2.5">
              {automaticInsights.textInsights.map((ins, index) => (
                <div key={index} className="flex gap-2.5 items-start p-2.5 rounded-xl bg-black/20 border border-purple-500/5 hover:border-purple-500/15 transition-all text-xs text-purple-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                  <span>{ins}</span>
                </div>
              ))}
              {automaticInsights.textInsights.length === 0 && (
                <p className="text-xs text-purple-300/60 p-4 text-center">No deep insights compiled for this range yet.</p>
              )}
            </div>
          </div>

          {/* Repeated Patterns */}
          <div className="mt-4 pt-4 border-t border-purple-500/10">
            <h5 className="text-[10px] font-black text-purple-300/70 uppercase tracking-widest mb-2.5">Monthly Repeated Patterns</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {automaticInsights.repeatedPatterns.slice(0, 4).map((p, idx) => (
                <div key={idx} className="p-2.5 rounded-xl bg-black/30 border border-purple-500/10 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-black text-white truncate max-w-[120px]">{p.empName}</span>
                    <span className="text-[9px] font-mono text-purple-300">{p.empCode}</span>
                  </div>
                  <p className="text-[10px] text-purple-200 mt-1 leading-tight flex items-center gap-1.5">
                    {p.type === 'late' ? <Clock className="w-3 h-3 text-indigo-400" /> : <AlertTriangle className="w-3 h-3 text-yellow-400" />}
                    {p.issue}
                  </p>
                </div>
              ))}
              {automaticInsights.repeatedPatterns.length === 0 && (
                <div className="col-span-2 text-[10px] text-purple-300/50 italic py-1">
                  ✓ No critical repetitive compliance issues found this month.
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* TODAY'S ATTENTION ITEMS / DRILL-DOWN LOGS */}
      <Card className="p-4 border border-purple-500/15 bg-gradient-to-br from-[#120D26] to-[#171035] shadow-xl">
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-purple-500/10">
          <div className="flex items-center gap-2">
            <ListCollapse className="w-4 h-4 text-purple-400" />
            <h4 className="text-xs font-black text-white uppercase tracking-wider">
              Audit Logs: Attention & Event Details ({intelligenceData.allIssues.length})
            </h4>
          </div>
          <span className="text-[10px] text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold">
            Filter: {dateRange.toUpperCase()}
          </span>
        </div>

        {intelligenceData.allIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-lg font-bold mb-3">
              ✓
            </div>
            <p className="text-sm font-bold text-white">No attendance issues requiring attention.</p>
            <p className="text-xs text-purple-300/60 max-w-sm mt-1">
              All filtered employees have complete checkouts, correct geofencing logs, and on-time arrivals.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop Table View */}
            <table className="w-full text-left border-collapse hidden md:table">
              <thead>
                <tr className="border-b border-purple-500/10 text-[10px] font-black text-purple-300 uppercase tracking-widest bg-black/20">
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">In / Out</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Status / Summary</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {intelligenceData.allIssues.map((issue, index) => (
                  <tr 
                    key={index} 
                    className="border-b border-purple-500/5 hover:bg-white/5 transition-colors text-xs text-white"
                  >
                    <td className="py-3 px-3">
                      <div className="font-bold">{issue.employee.name}</div>
                      <div className="text-[10px] text-purple-300/70 font-mono">{issue.employee.employeeCode || issue.employee.id || '—'}</div>
                    </td>
                    <td className="py-3 px-3 font-medium text-purple-200">{issue.date}</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                        issue.issueType === 'Pending Review'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : issue.issueType === 'Unresolved Checkout'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : issue.issueType === 'Attendance Anomaly' 
                          ? 'bg-red-500/10 text-red-300 border-red-500/30' 
                          : issue.issueType === 'Missing Checkout'
                          ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                          : issue.issueType === 'Late Arrival'
                          ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                          : issue.issueType === 'Offline Event Sync'
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {issue.issueType}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-[10px]">
                      <span className="text-emerald-400">{issue.checkIn || '—'}</span>
                      <span className="text-white/40 mx-1">→</span>
                      <span className="text-purple-300">{issue.checkOut || '—'}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`text-[10px] font-black ${
                        issue.severity === 'CRITICAL' ? 'text-red-400' :
                        issue.severity === 'WARNING' ? 'text-yellow-400' : 'text-blue-400'
                      }`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-purple-300/80 leading-relaxed truncate max-w-xs" title={issue.description}>
                      {issue.description}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {(issue.issueType === 'Pending Review' || issue.issueType === 'Unresolved Checkout' || issue.issueType === 'Missing Checkout') ? (
                          <Button
                            onClick={() => {
                              onRectifyAttendance(issue.record);
                            }}
                            className="bg-amber-500 hover:bg-amber-400 text-black text-[10px] py-1 px-2.5 rounded-lg flex items-center gap-1 font-black shadow-sm"
                          >
                            <CheckSquare className="w-3 h-3" /> REVIEW
                          </Button>
                        ) : null}
                        <Button
                          onClick={() => {
                            setSelectedIssue(issue);
                          }}
                          className="bg-black/40 hover:bg-black/60 text-white/90 text-[10px] py-1 px-2 border border-purple-500/20 rounded-lg flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Inspect
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile Responsive List View */}
            <div className="block md:hidden space-y-3">
              {intelligenceData.allIssues.map((issue, index) => (
                <div 
                  key={index} 
                  className="p-3.5 rounded-2xl border border-purple-500/10 bg-black/20 space-y-2.5 text-xs"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-extrabold text-white text-sm">{issue.employee.name}</div>
                      <div className="text-[10px] text-purple-300/70 font-mono mt-0.5">{issue.employee.employeeCode || issue.employee.id || '—'}</div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold border ${
                      issue.issueType === 'Pending Review'
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                        : issue.issueType === 'Unresolved Checkout'
                        ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        : issue.issueType === 'Attendance Anomaly' 
                        ? 'bg-red-500/10 text-red-300 border-red-500/30' 
                        : issue.issueType === 'Missing Checkout'
                        ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30'
                        : issue.issueType === 'Late Arrival'
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                        : issue.issueType === 'Offline Event Sync'
                        ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                        : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {issue.issueType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] py-1.5 px-2 bg-black/30 rounded-xl font-medium text-purple-200">
                    <div>
                      <span className="text-purple-300/60 block text-[9px] uppercase font-bold">Date</span>
                      {issue.date}
                    </div>
                    <div>
                      <span className="text-purple-300/60 block text-[9px] uppercase font-bold">Log (In → Out)</span>
                      <span className="text-emerald-400">{issue.checkIn || '—'}</span> → <span className="text-purple-300">{issue.checkOut || '—'}</span>
                    </div>
                  </div>

                  <div className="text-purple-300 leading-relaxed text-xs">
                    {issue.description}
                  </div>

                  <div className="flex justify-between items-center pt-2.5 border-t border-purple-500/5">
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${
                      issue.severity === 'CRITICAL' ? 'text-red-400' :
                      issue.severity === 'WARNING' ? 'text-yellow-400' : 'text-blue-400'
                    }`}>
                      {issue.severity}
                    </span>

                    <Button
                      onClick={() => {
                        setSelectedIssue(issue);
                      }}
                      className="bg-black/40 hover:bg-black/60 text-white/90 text-[10px] py-1 px-3 border border-purple-500/20 rounded-lg flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> Inspect Details
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* DETAIL AUDIT MODAL */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-b from-[#1E153D] to-[#110B24] shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 bg-black/40 border-b border-purple-500/10 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-black text-white uppercase tracking-wider">Attendance Audit Detail</h4>
              </div>
              <button 
                onClick={() => setSelectedIssue(null)}
                className="p-1 rounded-full text-purple-300 hover:text-white hover:bg-white/10 transition-colors text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-5 space-y-4">
              {/* Profile Block */}
              <div className="flex items-center gap-3 p-3 bg-black/30 rounded-2xl border border-purple-500/5">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-black text-white text-base shadow-inner">
                  {selectedIssue.employee.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h5 className="font-extrabold text-white text-sm">{selectedIssue.employee.name}</h5>
                  <p className="text-[10px] text-purple-300 font-mono uppercase mt-0.5">
                    Code: {selectedIssue.employee.employeeCode || selectedIssue.employee.id || '—'} • Dept: {selectedIssue.employee.office || 'Operations'}
                  </p>
                </div>
              </div>

              {/* Error Status Indicator */}
              <div className={`p-3.5 rounded-2xl border flex items-start gap-3 ${
                selectedIssue.severity === 'CRITICAL' 
                  ? 'border-red-500/30 bg-red-500/5 text-red-300' 
                  : selectedIssue.severity === 'WARNING'
                  ? 'border-yellow-500/30 bg-yellow-500/5 text-yellow-300'
                  : 'border-blue-500/30 bg-blue-500/5 text-blue-300'
              }`}>
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-black uppercase tracking-wider">{selectedIssue.issueType}</p>
                  <p className="text-xs mt-1 leading-relaxed font-medium text-white/90">
                    {selectedIssue.description}
                  </p>
                </div>
              </div>

              {/* Data Table */}
              <div className="bg-black/40 rounded-2xl border border-purple-500/10 p-3.5 space-y-2.5">
                <div className="grid grid-cols-2 text-xs">
                  <span className="text-purple-300/70 font-medium">Date:</span>
                  <span className="text-white font-extrabold text-right">{selectedIssue.date}</span>
                </div>
                <div className="grid grid-cols-2 text-xs">
                  <span className="text-purple-300/70 font-medium">Mode:</span>
                  <span className="text-white font-extrabold text-right capitalize">
                    {selectedIssue.record.attendanceType || 'OFFICE'}
                  </span>
                </div>
                <div className="grid grid-cols-2 text-xs">
                  <span className="text-purple-300/70 font-medium">Check-In Time:</span>
                  <span className="text-emerald-400 font-mono font-bold text-right">
                    {selectedIssue.checkIn || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-2 text-xs">
                  <span className="text-purple-300/70 font-medium">Check-Out State:</span>
                  <span className="text-purple-300 font-mono font-bold text-right">
                    {selectedIssue.checkOut || '—'}
                  </span>
                </div>

                {selectedIssue.proposedTime && (
                  <div className="grid grid-cols-2 text-xs pt-2 border-t border-purple-500/5 bg-amber-500/10 p-2 rounded-xl">
                    <span className="text-amber-300 font-bold">Proposed by Employee:</span>
                    <span className="text-amber-200 font-mono font-extrabold text-right">{selectedIssue.proposedTime}</span>
                  </div>
                )}

                {selectedIssue.minutesLate !== undefined && selectedIssue.minutesLate > 0 && (
                  <div className="grid grid-cols-2 text-xs pt-2 border-t border-purple-500/5">
                    <span className="text-purple-300/70 font-medium">Calculated Late:</span>
                    <span className="text-indigo-400 font-bold text-right">{selectedIssue.minutesLate} minutes late</span>
                  </div>
                )}

                {selectedIssue.delay && (
                  <div className="grid grid-cols-2 text-xs pt-2 border-t border-purple-500/5">
                    <span className="text-purple-300/70 font-medium">Sync Delay:</span>
                    <span className="text-indigo-400 font-bold text-right">{selectedIssue.delay}</span>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="grid grid-cols-2 gap-3.5 pt-2">
                <Button
                  onClick={() => {
                    onViewAttendanceDetails(selectedIssue.record);
                    setSelectedIssue(null);
                  }}
                  className="bg-black/40 hover:bg-black/60 text-white/90 text-xs py-2.5 border border-purple-500/20"
                >
                  View Attendance
                </Button>

                <Button
                  onClick={() => {
                    onRectifyAttendance(selectedIssue.record);
                    setSelectedIssue(null);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-xs py-2.5"
                >
                  Rectify Attendance
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
