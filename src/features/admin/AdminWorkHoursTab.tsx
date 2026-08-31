import React, { useState, useMemo, useEffect } from 'react';
import { getDb } from '../../services/firebase/config';
import { collection, query, limit, onSnapshot, orderBy } from 'firebase/firestore';
import { AttendanceRecord, AttendanceType } from '../../types/attendance';
import { isAttendanceCheckoutUnresolved, isSameEmployee } from '../../utils/attendanceUtils';
import { Card } from '../../components/ui/Card';
import {
  getKolkataDateStr,
  getKolkataTimeStr,
  getRecordWorkingMinutes,
  formatMinutesToDuration,
  parseDurationToMinutes,
  calculateMonthlySummary,
} from '../../utils/workHoursCalc';
import {
  Calendar as CalendarIcon,
  Clock,
  Briefcase,
  User,
  Activity,
  FileText,
  ChevronLeft,
  Search,
  Filter,
  Download,
  Printer,
  X,
  MapPin,
  Laptop,
  Users,
  CheckCircle,
  TrendingUp,
  RefreshCw
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface AdminWorkHoursTabProps {
  // registrations: any[]; // Now fetched locally
  // attendanceRecords: AttendanceRecord[]; // Now fetched locally
}

export const AdminWorkHoursTab: React.FC<AdminWorkHoursTabProps> = () => {
  const todayStr = getKolkataDateStr();

  // State for data
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Firestore Subscriptions
  useEffect(() => {
    let unsubRegs: (() => void) | null = null;
    let unsubAtt: (() => void) | null = null;
    let cancelled = false;

    getDb().then((activeDb) => {
      if (cancelled || !activeDb) return;

      let regsLoaded = false;
      let attLoaded = false;

      const checkAllLoaded = () => {
        if (regsLoaded && attLoaded) {
          setIsLoading(false);
        }
      };

      // 1. Registrations
      const qRegs = query(collection(activeDb, 'registrations'), limit(500));
      unsubRegs = onSnapshot(qRegs, (snap) => {
        const list: any[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setRegistrations(list);
        regsLoaded = true;
        checkAllLoaded();
      }, () => { regsLoaded = true; checkAllLoaded(); });

      // 2. Attendance (Bounded limit for work hours analysis)
      const qAtt = query(collection(activeDb, 'attendance'), orderBy('date', 'desc'), limit(1500));
      unsubAtt = onSnapshot(qAtt, (snap) => {
        const list: AttendanceRecord[] = [];
        snap.forEach(doc => list.push({ id: doc.id, ...doc.data() } as AttendanceRecord));
        setAttendanceRecords(list);
        attLoaded = true;
        checkAllLoaded();
      }, () => { attLoaded = true; checkAllLoaded(); });
    }).catch(() => {});

    return () => {
      cancelled = true;
      if (unsubRegs) unsubRegs();
      if (unsubAtt) unsubAtt();
    };
  }, []);

  // Selected Month
  const [selectedMonth, setSelectedMonth] = useState<string>(() => todayStr.substring(0, 7)); // "YYYY-MM"
  
  // Selected Date Filter (Optional)
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  // Text Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedTL, setSelectedTL] = useState('ALL');
  const [selectedMode, setSelectedMode] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Selected Employee for Detail View
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'OVERVIEW' | 'EMPLOYEE_DETAIL'>('OVERVIEW');

  // Selected daily record for popup
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Dynamic Departments & Team Leaders list for dropdown filters
  const departments = useMemo(() => {
    const set = new Set<string>();
    registrations.forEach((r) => {
      if (r.department) set.add(r.department);
      else if (r.office) set.add(r.office);
    });
    return Array.from(set);
  }, [registrations]);

  const teamLeaders = useMemo(() => {
    const list: string[] = [];
    registrations.forEach((r) => {
      if (r.isTeamLeader) {
        list.push(r.name);
      }
    });
    return list;
  }, [registrations]);

  // Months lists (last 6 months)
  const monthOptions = useMemo(() => {
    const list = [];
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const val = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).substring(0, 7);
      const label = d.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'long',
        year: 'numeric',
      });
      list.push({ val, label });
    }
    return list;
  }, []);

  // Filtered registrations matching the dropdown selections (Dept, TL, Search query)
  const filteredEmployees = useMemo(() => {
    return registrations.filter((emp) => {
      const name = (emp.name || '').toLowerCase();
      const code = (emp.employeeCode || emp.id || '').toLowerCase();
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = name.includes(searchLower) || code.includes(searchLower);

      const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept || emp.office === selectedDept;
      const matchesTL = selectedTL === 'ALL' || emp.teamLeaderName === selectedTL;

      return matchesSearch && matchesDept && matchesTL;
    });
  }, [registrations, searchQuery, selectedDept, selectedTL]);

  // Map employee details for quick lookup
  const employeeMap = useMemo(() => {
    const map = new Map<string, any>();
    registrations.forEach((r) => {
      const keys = [r.employeeCode, r.id, r.employeeId].filter(Boolean);
      keys.forEach((k) => {
        const str = String(k).trim();
        if (str) {
          map.set(str, r);
          map.set(str.toLowerCase(), r);
          map.set(str.toUpperCase(), r);
        }
      });
    });
    return map;
  }, [registrations]);

  // Main list of attendance records matching month/date filter + other filters
  const filteredRecords = useMemo(() => {
    return attendanceRecords.filter((rec) => {
      // 1. Month/Date filter
      const matchesPeriod = selectedDate ? rec.date === selectedDate : rec.date.startsWith(selectedMonth);
      if (!matchesPeriod) return false;

      // 2. Employee filter (must exist in our filtered employees set)
      const empCode = (rec.employeeId || rec.employeeCode || '').trim();
      const emp = employeeMap.get(empCode) || employeeMap.get(empCode.toLowerCase()) || employeeMap.get(empCode.toUpperCase());
      if (!emp) return false;
      
      const name = (emp.name || '').toLowerCase();
      const code = (empCode || '').toLowerCase();
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = name.includes(searchLower) || code.includes(searchLower);
      if (!matchesSearch) return false;

      const matchesDept = selectedDept === 'ALL' || emp.department === selectedDept || emp.office === selectedDept;
      if (!matchesDept) return false;

      const matchesTL = selectedTL === 'ALL' || emp.teamLeaderName === selectedTL;
      if (!matchesTL) return false;

      // 3. Mode filter
      const matchesMode = selectedMode === 'ALL' || rec.attendanceType === selectedMode;
      if (!matchesMode) return false;

      // 4. Status filter
      const isUnresolved = isAttendanceCheckoutUnresolved(rec);
      const isPendingReview = rec.checkoutStatus === 'PENDING_ADMIN_REVIEW';
      const isCompleted = !!(rec.checkOutTime && rec.checkOutTime !== '--:--' && !isUnresolved && !isPendingReview);

      const matchesStatus =
        selectedStatus === 'ALL' ||
        (selectedStatus === 'Completed' && isCompleted) ||
        (selectedStatus === 'In Progress' && !isCompleted && !isUnresolved && !isPendingReview) ||
        (selectedStatus === 'Unresolved' && (isUnresolved || isPendingReview));
      if (!matchesStatus) return false;

      return true;
    });
  }, [attendanceRecords, selectedMonth, selectedDate, employeeMap, searchQuery, selectedDept, selectedTL, selectedMode, selectedStatus]);

  // Aggregate stats over ALL filtered employees/records for the company summary
  const companySummary = useMemo(() => {
    let totalMinutes = 0;
    const activeEmployeesSet = new Set<string>();
    let totalCompletedDays = 0;

    let officeMinutes = 0;
    let wfhMinutes = 0;
    let clientMinutes = 0;
    let outdoorMinutes = 0;

    filteredRecords.forEach((rec) => {
      const isCompleted = !!(rec.checkOutTime && rec.checkOutTime !== '--:--');
      const isTodayActive = rec.date === todayStr && !isCompleted;

      if (isCompleted || isTodayActive) {
        const mins = getRecordWorkingMinutes(rec);
        if (mins > 0) {
          totalMinutes += mins;
          totalCompletedDays += 1;
          const empCode = rec.employeeId || rec.employeeCode;
          if (empCode) activeEmployeesSet.add(empCode);

          switch (rec.attendanceType) {
            case 'OFFICE':
              officeMinutes += mins;
              break;
            case 'WFH':
              wfhMinutes += mins;
              break;
            case 'CLIENT_VISIT':
              clientMinutes += mins;
              break;
            case 'OUTDOOR':
              outdoorMinutes += mins;
              break;
          }
        }
      }
    });

    const totalEmployeesCount = filteredEmployees.length;

    return {
      totalEmployees: totalEmployeesCount,
      employeesWithAttendance: activeEmployeesSet.size,
      totalMinutes,
      averageMinutesPerEmployee: totalEmployeesCount > 0 ? Math.round(totalMinutes / totalEmployeesCount) : 0,
      averageMinutesPerDay: totalCompletedDays > 0 ? Math.round(totalMinutes / totalCompletedDays) : 0,
      officeMinutes,
      wfhMinutes,
      clientMinutes,
      outdoorMinutes,
    };
  }, [filteredRecords, filteredEmployees, todayStr]);

  // Aggregate stats per employee
  const employeeSummaryTable = useMemo(() => {
    const empDataMap = new Map<string, {
      code: string;
      name: string;
      department: string;
      teamLeader: string;
      workingDays: number;
      totalMins: number;
      officeMins: number;
      wfhMins: number;
      clientMins: number;
      outdoorMins: number;
    }>();

    // Initialize all filtered employees to ensure 0-hour entries show up beautifully
    filteredEmployees.forEach((emp) => {
      const mainCode = emp.employeeCode || emp.id;
      const dataObj = {
        code: mainCode,
        name: emp.name || 'N/A',
        department: emp.department || emp.office || 'N/A',
        teamLeader: emp.teamLeaderName || 'N/A',
        workingDays: 0,
        totalMins: 0,
        officeMins: 0,
        wfhMins: 0,
        clientMins: 0,
        outdoorMins: 0,
      };
      const keys = [emp.employeeCode, emp.id, emp.employeeId].filter(Boolean);
      keys.forEach((k) => {
        const str = String(k).trim();
        if (str) {
          empDataMap.set(str, dataObj);
          empDataMap.set(str.toLowerCase(), dataObj);
          empDataMap.set(str.toUpperCase(), dataObj);
        }
      });
    });

    // Populate actual logs
    filteredRecords.forEach((rec) => {
      const rawCode = (rec.employeeId || rec.employeeCode || '').trim();
      const item = empDataMap.get(rawCode) || empDataMap.get(rawCode.toLowerCase()) || empDataMap.get(rawCode.toUpperCase());
      if (item) {
        const isCompleted = !!(rec.checkOutTime && rec.checkOutTime !== '--:--');
        const isTodayActive = rec.date === todayStr && !isCompleted;

        if (isCompleted || isTodayActive) {
          const mins = getRecordWorkingMinutes(rec);
          if (mins > 0) {
            item.workingDays += 1;
            item.totalMins += mins;

            switch (rec.attendanceType) {
              case 'OFFICE':
                item.officeMins += mins;
                break;
              case 'WFH':
                item.wfhMins += mins;
                break;
              case 'CLIENT_VISIT':
                item.clientMins += mins;
                break;
              case 'OUTDOOR':
                item.outdoorMins += mins;
                break;
            }
          }
        }
      }
    });

    // Deduplicate unique employee objects for final table
    const uniqueItems = Array.from(new Set(empDataMap.values()));
    return uniqueItems.sort((a, b) => b.totalMins - a.totalMins);
  }, [filteredEmployees, filteredRecords, todayStr]);

  // Helper to check if a record belongs to the selected employee
  const isSelectedEmpRecord = (r: AttendanceRecord) => {
    if (!selectedEmp) return false;
    return isSameEmployee(r.employeeId, selectedEmp.employeeCode) ||
           isSameEmployee(r.employeeId, selectedEmp.id) ||
           isSameEmployee(r.employeeCode, selectedEmp.employeeCode) ||
           isSameEmployee(r.employeeCode, selectedEmp.id);
  };

  // Individual Employee Calendar view logs
  const selectedEmpRecords = useMemo(() => {
    if (!selectedEmp) return [];
    return attendanceRecords
      .filter((r) => isSelectedEmpRecord(r) && r.date.startsWith(selectedMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedEmp, attendanceRecords, selectedMonth]);

  const selectedEmpStats = useMemo(() => {
    if (!selectedEmp) return null;
    const filtered = attendanceRecords.filter((r) => isSelectedEmpRecord(r));
    return calculateMonthlySummary(filtered, selectedMonth);
  }, [selectedEmp, attendanceRecords, selectedMonth]);

  const selectedEmpCalendarDays = useMemo(() => {
    if (!selectedEmp) return [];
    const year = parseInt(selectedMonth.split('-')[0], 10);
    const month = parseInt(selectedMonth.split('-')[1], 10) - 1;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const daysArray = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      daysArray.push(null);
    }

    const empRecords = attendanceRecords.filter((r) => isSelectedEmpRecord(r));

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const record = empRecords.find((r) => r.date === dateStr);
      daysArray.push({ day, dateStr, record });
    }

    return daysArray;
  }, [selectedEmp, selectedMonth, attendanceRecords]);

  // CSV Export Function
  const handleExportCSV = () => {
    try {
      let csvContent = 'data:text/csv;charset=utf-8,';
      csvContent += 'Employee Code,Employee Name,Department,Team Leader,Working Days,Total Work Hours,Average/Day,Office Hours,WFH Hours,Client Hours,Outdoor Hours\n';

      employeeSummaryTable.forEach((item) => {
        const avgMins = item.workingDays > 0 ? Math.round(item.totalMins / item.workingDays) : 0;
        const row = [
          `"${item.code}"`,
          `"${item.name}"`,
          `"${item.department}"`,
          `"${item.teamLeader}"`,
          item.workingDays,
          `"${formatMinutesToDuration(item.totalMins)}"`,
          `"${formatMinutesToDuration(avgMins)}"`,
          `"${formatMinutesToDuration(item.officeMins)}"`,
          `"${formatMinutesToDuration(item.wfhMins)}"`,
          `"${formatMinutesToDuration(item.clientMins)}"`,
          `"${formatMinutesToDuration(item.outdoorMins)}"`,
        ].join(',');
        csvContent += row + '\n';
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `Office_Management_System_Work_Hours_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('CSV export failed:', e);
    }
  };

  // PDF Export Function for all records
  const handleExportAllPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      doc.setFillColor(37, 15, 76);
      doc.rect(15, 15, 267, 20, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('OFFICE MANAGEMENT SYSTEM — COMPANY WORK HOURS REPORT', 22, 24);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(200, 200, 255);
      doc.text(`Selected Month: ${selectedMonth} | Department: ${selectedDept} | Generated: ${new Date().toLocaleDateString('en-IN')}`, 22, 30);

      // Header row
      doc.setFillColor(235, 235, 245);
      doc.rect(15, 42, 267, 8, 'F');
      
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      doc.text('Code', 18, 47);
      doc.text('Name', 45, 47);
      doc.text('Department', 90, 47);
      doc.text('Working Days', 140, 47);
      doc.text('Total Work Hours', 170, 47);
      doc.text('Avg/Day', 210, 47);
      doc.text('Office Hours', 240, 47);

      let yPos = 54;
      employeeSummaryTable.forEach((item) => {
        if (yPos > 185) {
          doc.addPage();
          yPos = 20;
          doc.setFillColor(37, 15, 76);
          doc.rect(15, 10, 267, 8, 'F');
          doc.setTextColor(255, 255, 255);
          doc.text('OFFICE MANAGEMENT SYSTEM — COMPANY WORK HOURS REPORT (CONTINUED)', 20, 15);
          yPos = 25;
        }

        const avgMins = item.workingDays > 0 ? Math.round(item.totalMins / item.workingDays) : 0;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        doc.text(item.code, 18, yPos);
        doc.text(item.name, 45, yPos);
        doc.text(item.department, 90, yPos);
        doc.text(String(item.workingDays), 140, yPos);
        doc.text(formatMinutesToDuration(item.totalMins), 170, yPos);
        doc.text(formatMinutesToDuration(avgMins), 210, yPos);
        doc.text(formatMinutesToDuration(item.officeMins), 240, yPos);

        yPos += 6;
      });

      doc.save(`Office_Management_System_Work_Hours_${selectedMonth}.pdf`);
    } catch (e) {
      console.error('PDF export failed:', e);
    }
  };

  // Trigger browser print
  const handlePrint = () => {
    window.print();
  };

  const getRecordStatusDetails = (rec: AttendanceRecord) => {
    const isUnresolved = isAttendanceCheckoutUnresolved(rec);
    const isPendingReview = rec.checkoutStatus === 'PENDING_ADMIN_REVIEW';
    const isCompleted = !!(rec.checkOutTime && rec.checkOutTime !== '--:--' && !isUnresolved && !isPendingReview);
    const isToday = rec.date === todayStr;

    if (isPendingReview) {
      return {
        label: 'Pending Review',
        colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        duration: 'PENDING REVIEW',
      };
    } else if (isUnresolved) {
      return {
        label: 'Unresolved',
        colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        duration: 'UNRESOLVED',
      };
    } else if (isCompleted) {
      return {
        label: 'Completed',
        colorClass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        duration: formatMinutesToDuration(getRecordWorkingMinutes(rec)),
      };
    } else if (isToday) {
      return {
        label: 'In Progress',
        colorClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20 animate-pulse',
        duration: formatMinutesToDuration(getRecordWorkingMinutes(rec)),
      };
    } else {
      return {
        label: 'Unresolved',
        colorClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        duration: 'UNRESOLVED',
      };
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-purple-500 animate-spin" />
        <p className="text-purple-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Syncing Work Hours Directory...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* CSS style block specifically designed to support Print Report requirements */}
      <style>{`
        @media print {
          /* Hide sidebar, filters, dashboard items, action buttons */
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
          /* Ensure table text is fully visible on white print backgrounds */
          #print-area table, #print-area h1, #print-area h2, #print-area h3, #print-area p, #print-area span {
            color: black !important;
            border-color: #ddd !important;
          }
        }
      `}</style>

      {/* ADMIN CONTROLS HEADER */}
      <div className="no-print flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#1F1045]/40 border border-purple-500/20 p-4 rounded-3xl backdrop-blur-md">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Clock className="w-6 h-6 text-purple-400" /> WORK HOURS ANALYTICS
          </h1>
          <p className="text-xs text-purple-200/70 mt-1">
            Enterprise-level read-only analysis dashboard
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {viewMode === 'EMPLOYEE_DETAIL' && (
            <button
              onClick={() => {
                setViewMode('OVERVIEW');
                setSelectedEmp(null);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-purple-950/40 hover:bg-purple-900/40 rounded-2xl border border-purple-500/20 text-xs font-bold text-purple-300 hover:text-white transition-all"
            >
              <ChevronLeft className="w-4 h-4" /> Back to Directory
            </button>
          )}

          <select
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setSelectedDate(''); // Clear date filter when shifting month
            }}
            className="text-xs font-bold text-white bg-[#12072B] border border-purple-500/30 rounded-2xl px-3.5 py-2.5 outline-none cursor-pointer focus:border-purple-400 transition-all shadow-md"
          >
            {monthOptions.map((opt) => (
              <option key={opt.val} value={opt.val}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={handlePrint}
            className="p-2.5 bg-[#2B1B54] hover:bg-[#342263] border border-purple-500/25 rounded-2xl text-purple-300 hover:text-white transition-all shadow-lg flex items-center justify-center"
            title="Print Friendly Report"
          >
            <Printer className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={handleExportCSV}
            className="p-2.5 bg-[#2B1B54] hover:bg-[#342263] border border-purple-500/25 rounded-2xl text-purple-300 hover:text-white transition-all shadow-lg flex items-center justify-center"
            title="Export CSV"
          >
            <Download className="w-4.5 h-4.5 text-emerald-400" />
          </button>

          <button
            onClick={handleExportAllPDF}
            className="p-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-2xl border border-purple-400/30 text-white hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center justify-center"
            title="Export PDF"
          >
            <FileText className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      <div id="print-area" className="space-y-6">
        {viewMode === 'OVERVIEW' ? (
          <>
            {/* COMPANY STATS ROW */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              <Card className="p-4 bg-gradient-to-br from-[#1C1036] to-[#120726] border border-purple-500/20 space-y-1">
                <span className="text-[9.5px] font-black text-purple-400 uppercase block">Total Employees</span>
                <span className="text-xl font-black text-white">{companySummary.totalEmployees}</span>
              </Card>

              <Card className="p-4 bg-gradient-to-br from-[#1C1036] to-[#120726] border border-purple-500/20 space-y-1">
                <span className="text-[9.5px] font-black text-purple-400 uppercase block">Active Employees</span>
                <span className="text-xl font-black text-white">{companySummary.employeesWithAttendance}</span>
              </Card>

              <Card className="p-4 bg-gradient-to-br from-[#1C1036] to-[#120726] border border-purple-500/20 space-y-1">
                <span className="text-[9.5px] font-black text-purple-400 uppercase block">Total Work logged</span>
                <span className="text-xl font-black text-white">{formatMinutesToDuration(companySummary.totalMinutes)}</span>
              </Card>

              <Card className="p-4 bg-gradient-to-br from-[#1C1036] to-[#120726] border border-purple-500/20 space-y-1">
                <span className="text-[9.5px] font-black text-purple-400 uppercase block">Avg Hours / Employee</span>
                <span className="text-xl font-black text-white">{formatMinutesToDuration(companySummary.averageMinutesPerEmployee)}</span>
              </Card>

              <Card className="p-4 bg-gradient-to-br from-[#1C1036] to-[#120726] border border-purple-500/20 space-y-1 col-span-2 lg:col-span-1">
                <span className="text-[9.5px] font-black text-purple-400 uppercase block">Avg Hours / Shift</span>
                <span className="text-xl font-black text-white">{formatMinutesToDuration(companySummary.averageMinutesPerDay)}</span>
              </Card>
            </div>

            {/* BREAKDOWN BY MODE */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 rounded-2xl bg-[#1C1036]/50 border border-emerald-500/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[8.5px] text-purple-400 block font-bold uppercase">Office Hours</span>
                  <span className="text-xs font-black text-white">{formatMinutesToDuration(companySummary.officeMinutes)}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#1C1036]/50 border border-blue-500/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                  <Laptop className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[8.5px] text-purple-400 block font-bold uppercase">WFH Hours</span>
                  <span className="text-xs font-black text-white">{formatMinutesToDuration(companySummary.wfhMinutes)}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#1C1036]/50 border border-purple-500/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[8.5px] text-purple-400 block font-bold uppercase">Client Hours</span>
                  <span className="text-xs font-black text-white">{formatMinutesToDuration(companySummary.clientMinutes)}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-[#1C1036]/50 border border-orange-500/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-400">
                  <Briefcase className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[8.5px] text-purple-400 block font-bold uppercase">Outdoor Hours</span>
                  <span className="text-xs font-black text-white">{formatMinutesToDuration(companySummary.outdoorMinutes)}</span>
                </div>
              </div>
            </div>

            {/* FILTERS CONTAINER */}
            <Card className="no-print p-4 bg-[#250F4C]/80 border border-purple-500/25 space-y-3.5">
              <div className="flex items-center gap-2 text-xs font-black text-purple-300 uppercase tracking-widest">
                <Filter className="w-4 h-4 text-purple-400" /> Filter Work Hours Directory
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {/* Search query */}
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 w-4 h-4 text-purple-400" />
                  <input
                    type="text"
                    placeholder="Search name/code..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs font-bold text-white bg-[#120726] border border-purple-500/20 rounded-xl pl-9 pr-3 py-3 outline-none focus:border-purple-400"
                  />
                </div>

                {/* Dept Filter */}
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="text-xs font-bold text-white bg-[#120726] border border-purple-500/20 rounded-xl px-3 py-3 outline-none"
                >
                  <option value="ALL">Department: All</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>

                {/* Team Leader Filter */}
                <select
                  value={selectedTL}
                  onChange={(e) => setSelectedTL(e.target.value)}
                  className="text-xs font-bold text-white bg-[#120726] border border-purple-500/20 rounded-xl px-3 py-3 outline-none"
                >
                  <option value="ALL">TL: All</option>
                  {teamLeaders.map((tl) => (
                    <option key={tl} value={tl}>
                      {tl}
                    </option>
                  ))}
                </select>

                {/* Mode Filter */}
                <select
                  value={selectedMode}
                  onChange={(e) => setSelectedMode(e.target.value)}
                  className="text-xs font-bold text-white bg-[#120726] border border-purple-500/20 rounded-xl px-3 py-3 outline-none"
                >
                  <option value="ALL">Mode: All</option>
                  <option value="OFFICE">Office Only</option>
                  <option value="WFH">WFH Only</option>
                  <option value="CLIENT_VISIT">Client Visit Only</option>
                  <option value="OUTDOOR">Outdoor Only</option>
                </select>

                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="text-xs font-bold text-white bg-[#120726] border border-purple-500/20 rounded-xl px-3 py-3 outline-none"
                >
                  <option value="ALL">Status: All</option>
                  <option value="Completed">Completed</option>
                  <option value="In Progress">In Progress</option>
                </select>

                {/* Optional Specific Date Filter */}
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs font-bold text-white bg-[#120726] border border-purple-500/20 rounded-xl px-3 py-3 outline-none"
                  title="Specific Date (overrides selected month)"
                />
              </div>
            </Card>

            {/* DIRECTORY TABLE */}
            <Card className="p-5 bg-[#250F4C]/50 border border-purple-500/20">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  Employee-wise Work Hours Breakdown
                </h3>
                <span className="text-[10px] text-purple-300 italic no-print">
                  Click any row to open full monthly calendar and logs
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#1C1036] text-purple-300 font-bold border-b border-purple-500/20 uppercase tracking-wide">
                      <th className="p-3">Employee Name</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Team Leader</th>
                      <th className="p-3 text-center">Active Days</th>
                      <th className="p-3">Total Work Hours</th>
                      <th className="p-3">Avg/Day</th>
                      <th className="p-3">Office Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeSummaryTable.length > 0 ? (
                      employeeSummaryTable.map((item) => {
                        const avgMins = item.workingDays > 0 ? Math.round(item.totalMins / item.workingDays) : 0;
                        return (
                          <tr
                            key={item.code}
                            onClick={() => {
                              const emp = registrations.find((e) => (e.employeeCode || e.id) === item.code);
                              if (emp) {
                                setSelectedEmp(emp);
                                setViewMode('EMPLOYEE_DETAIL');
                              }
                            }}
                            className="border-b border-purple-500/10 hover:bg-[#1E123C] cursor-pointer transition-colors"
                          >
                            <td className="p-3 font-extrabold text-white">{item.name}</td>
                            <td className="p-3 font-mono text-purple-200">{item.code}</td>
                            <td className="p-3 text-purple-200">{item.department}</td>
                            <td className="p-3 text-purple-200">{item.teamLeader}</td>
                            <td className="p-3 text-center text-white font-extrabold">{item.workingDays}</td>
                            <td className="p-3 font-bold text-emerald-400">{formatMinutesToDuration(item.totalMins)}</td>
                            <td className="p-3 text-purple-300">{formatMinutesToDuration(avgMins)}</td>
                            <td className="p-3 text-purple-300">{formatMinutesToDuration(item.officeMins)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-purple-200/50">
                          No matching employee work-hour logs found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : (
          /* SINGLE EMPLOYEE PORTRAIT WORK PROFILE */
          selectedEmp && (
            <div className="space-y-6">
              <Card className="p-5 bg-gradient-to-r from-[#2B1B54] to-[#1E1140] border border-purple-500/35 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white">{selectedEmp.name}</h2>
                    <div className="flex flex-wrap gap-x-3 text-xs text-purple-300 mt-1">
                      <span>Code: <b className="font-mono">{selectedEmp.employeeCode || selectedEmp.id}</b></span>
                      <span>•</span>
                      <span>Dept: <b>{selectedEmp.department || selectedEmp.office || 'N/A'}</b></span>
                      <span>•</span>
                      <span>TL: <b>{selectedEmp.teamLeaderName || 'N/A'}</b></span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={() => {
                    setViewMode('OVERVIEW');
                    setSelectedEmp(null);
                  }}
                  className="no-print px-3.5 py-2.5 bg-purple-950/40 hover:bg-purple-900/40 rounded-2xl border border-purple-500/20 text-xs font-bold text-purple-300"
                >
                  Back to Directory
                </button>
              </Card>

              {/* INDIVIDUAL SUMMARY CARDS */}
              {selectedEmpStats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4 bg-[#1C1036] border border-purple-500/25 space-y-1">
                    <span className="text-[9px] font-black text-purple-400 block">TOTAL HOURS</span>
                    <span className="text-xl font-black text-white">{formatMinutesToDuration(selectedEmpStats.totalMinutes)}</span>
                  </Card>

                  <Card className="p-4 bg-[#1C1036] border border-purple-500/25 space-y-1">
                    <span className="text-[9px] font-black text-purple-400 block">WORKING DAYS</span>
                    <span className="text-xl font-black text-white">{selectedEmpStats.workingDays}</span>
                  </Card>

                  <Card className="p-4 bg-[#1C1036] border border-purple-500/25 space-y-1">
                    <span className="text-[9px] font-black text-purple-400 block">AVG HOURS / DAY</span>
                    <span className="text-xl font-black text-white">{formatMinutesToDuration(selectedEmpStats.averageMinutesPerDay)}</span>
                  </Card>

                  <Card className="p-4 bg-[#1C1036] border border-purple-500/25 space-y-1">
                    <span className="text-[9px] font-black text-purple-400 block">BREAKDOWNS</span>
                    <div className="grid grid-cols-2 gap-1 text-[9px] font-bold text-purple-300">
                      <span>Office: {selectedEmpStats.officeDays}d</span>
                      <span>WFH: {selectedEmpStats.wfhDays}d</span>
                      <span>Client: {selectedEmpStats.clientDays}d</span>
                      <span>Outdoor: {selectedEmpStats.outdoorDays}d</span>
                    </div>
                  </Card>
                </div>
              )}

              {/* MONTHLY CALENDAR BOARD */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 space-y-6">
                  <Card className="p-4 bg-[#1C1036] border border-purple-500/20">
                    <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest mb-3.5 flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4" /> Monthly Board Layout
                    </h3>

                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-purple-400 uppercase mb-2">
                      <div>Sun</div>
                      <div>Mon</div>
                      <div>Tue</div>
                      <div>Wed</div>
                      <div>Thu</div>
                      <div>Fri</div>
                      <div>Sat</div>
                    </div>

                    <div className="grid grid-cols-7 gap-1.5">
                      {selectedEmpCalendarDays.map((item, idx) => {
                        if (!item) return <div key={`empty-${idx}`} className="aspect-square bg-purple-950/10 rounded-xl" />;
                        
                        const { day, record } = item;
                        let bgClass = 'bg-[#120726]/40 text-purple-300/40 border border-purple-500/5 hover:border-purple-500/20';
                        
                        if (record) {
                          const isCompleted = !!(record.checkOutTime && record.checkOutTime !== '--:--');
                          const isToday = record.date === todayStr;

                          if (isToday && !isCompleted) {
                            bgClass = 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/20';
                          } else {
                            switch (record.attendanceType) {
                              case 'OFFICE':
                                bgClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20';
                                break;
                              case 'WFH':
                                bgClass = 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20';
                                break;
                              case 'CLIENT_VISIT':
                                bgClass = 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20';
                                break;
                              case 'OUTDOOR':
                                bgClass = 'bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20';
                                break;
                            }
                          }
                        }

                        return (
                          <button
                            key={`day-${day}`}
                            onClick={() => {
                              if (record) {
                                setSelectedRecord(record);
                                setShowDetailModal(true);
                              }
                            }}
                            disabled={!record}
                            className={`aspect-square rounded-xl p-1 font-bold flex flex-col justify-between items-center transition-all ${bgClass}`}
                          >
                            <span className="text-xs">{day}</span>
                            {record && (
                              <span className="text-[7.5px] uppercase font-extrabold truncate scale-90 w-full text-center">
                                {record.attendanceType === 'CLIENT_VISIT' ? 'Client' : record.attendanceType.toLowerCase()}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                </div>

                {/* DAILY TIMELINE LIST */}
                <div className="lg:col-span-5">
                  <Card className="p-4 bg-[#1C1036] border border-purple-500/20 space-y-3">
                    <h3 className="text-xs font-black text-purple-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="w-4 h-4" /> Shift Log Entries
                    </h3>

                    <div className="space-y-2.5 max-h-[380px] overflow-y-auto">
                      {selectedEmpRecords.length > 0 ? (
                        selectedEmpRecords.map((r) => {
                          const details = getRecordStatusDetails(r);
                          return (
                            <button
                              key={r.id || r.docId}
                              onClick={() => {
                                setSelectedRecord(r);
                                setShowDetailModal(true);
                              }}
                              className="w-full p-3 bg-[#120726]/40 border border-purple-500/15 rounded-xl text-left flex items-center justify-between hover:border-purple-500/35 transition-all cursor-pointer group"
                            >
                              <div>
                                <span className="text-[9.5px] font-black text-purple-400 uppercase block">{r.date}</span>
                                <h4 className="text-xs font-black text-white uppercase">{r.attendanceType}</h4>
                                <div className="text-[9.5px] text-purple-200/50 font-bold mt-0.5">
                                  {r.checkInTime} - {r.checkOutTime || 'In Progress'}
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xs font-black text-white block group-hover:text-purple-300 transition-all">
                                  {details.duration}
                                </span>
                                <span className="text-[8.5px] font-black text-purple-400 block uppercase mt-0.5">
                                  {r.isAdminRectified || r.manualRectified ? 'Admin Corrected' : 'Automatic'}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <p className="text-xs text-center p-6 text-purple-200/50">
                          No logs recorded for this month.
                        </p>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* DAILY POPUP DETAIL */}
      {showDetailModal && selectedRecord && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="glass-inner-tile border border-purple-500/30 rounded-[28px] max-w-sm w-full p-6 space-y-5 shadow-2xl relative text-white">
            <button
              onClick={() => {
                setShowDetailModal(false);
                setSelectedRecord(null);
              }}
              className="absolute top-4 right-4 text-purple-300 hover:text-white p-1 rounded-full hover:bg-purple-500/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1.5 pb-2 border-b border-purple-500/25">
              <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest">
                DAILY ATTENDANCE DETAIL
              </span>
              <h3 className="text-base font-black text-white">{selectedRecord.date}</h3>
            </div>

            <div className="space-y-3 text-xs font-semibold">
              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Employee Code</span>
                <span className="text-white font-mono">{selectedRecord.employeeId || selectedRecord.employeeCode}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Employee Name</span>
                <span className="text-white">{selectedRecord.employeeName || 'N/A'}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Attendance Mode</span>
                <span className="text-white font-black uppercase">{selectedRecord.attendanceType}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Check-in</span>
                <span className="text-white font-black">{selectedRecord.checkInTime}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Check-out</span>
                <span className="text-white font-black">{selectedRecord.checkOutTime || 'In Progress'}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Total Work Hours</span>
                <span className="text-emerald-400 font-black">
                  {getRecordStatusDetails(selectedRecord).duration}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Attendance Source</span>
                <span className="text-purple-200 font-black">
                  {selectedRecord.isAdminRectified || selectedRecord.manualRectified ? 'Admin Corrected' : 'Automatic Attendance'}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-purple-500/10">
                <span className="text-purple-300">Status</span>
                <span className={`px-2 py-0.5 rounded-full border text-[9px] font-black uppercase ${getRecordStatusDetails(selectedRecord).colorClass}`}>
                  {getRecordStatusDetails(selectedRecord).label}
                </span>
              </div>
            </div>

            <button
              onClick={() => {
                setShowDetailModal(false);
                setSelectedRecord(null);
              }}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-2xl text-xs transition-all shadow-lg active:scale-95"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
