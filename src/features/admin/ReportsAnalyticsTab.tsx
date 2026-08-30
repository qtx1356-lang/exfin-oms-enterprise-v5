import React, { useState, useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { 
  BarChart3, FileText, Download, Printer, Calendar, Users, Filter, 
  TrendingUp, Coins, Clock, MapPin, CheckCircle2, XCircle, AlertCircle, 
  Shield, Compass, Building, Star, ClipboardList, Briefcase, RefreshCw,
  Search, Award, Layers, SearchCode
} from 'lucide-react';
import { exportToCSV, exportToXLSX, printReport } from '../../services/reports/exportService';
import { calculateEfficiency } from '../../services/efficiency/efficiencyCalculator';
import { DEFAULT_WEIGHTAGES } from '../../services/efficiency/efficiencyService';
import { getRecordWorkingMinutes, formatMinutesToDuration } from '../../utils/workHoursCalc';
import { getEffectiveTaskStatus } from '../../types/planner';
import { isAttendanceCheckoutUnresolved, isSameEmployee } from '../../utils/attendanceUtils';

// Define core prop types
interface ReportsAnalyticsTabProps {
  role: 'ADMIN' | 'SUPER_ADMIN';
  authorizedOffice: string;
  registrations: any[];
  attendanceRecords: any[];
  expenseRecords: any[];
  tasks: any[];
  leaves: any[];
  isLoading?: boolean;
}

export const ReportsAnalyticsTab: React.FC<ReportsAnalyticsTabProps> = ({
  role,
  authorizedOffice,
  registrations,
  attendanceRecords,
  expenseRecords,
  tasks,
  leaves,
  isLoading = false
}) => {
  const isSuperAdmin = role === 'SUPER_ADMIN';

  // 1. LOADING & EMPTY STATES
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-12 h-12 text-purple-500 animate-spin" />
        <div className="text-purple-300 font-bold animate-pulse">Initializing Analytical Engine...</div>
      </div>
    );
  }

  if (registrations.length === 0) {
    return (
      <Card className="p-12 glass-card border border-purple-500/20 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-black text-white">No Corporate Data Detected</h3>
        <p className="text-sm text-purple-300 mt-2">The system cannot find any registered employee data to generate analytics.</p>
      </Card>
    );
  }

  // 1. FILTER STATES
  const [selectedOffice, setSelectedOffice] = useState<string>(
    isSuperAdmin ? 'ALL' : authorizedOffice
  );
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string>('ALL');
  const [selectedTeamLeaderCode, setSelectedTeamLeaderCode] = useState<string>('ALL');
  const [searchCode, setSearchCode] = useState<string>('');
  const [performanceRange, setPerformanceRange] = useState<'ALL' | 'HIGH' | 'AVERAGE' | 'NEEDS_ATTENTION'>('ALL');
  
  // Date range presets: Default to last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  const formatDateString = (d: Date) => d.toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(formatDateString(thirtyDaysAgo));
  const [endDate, setEndDate] = useState<string>(formatDateString(today));
  
  // Filter preset utility
  const applyDatePreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(formatDateString(start));
    setEndDate(formatDateString(end));
  };

  // 2. EXTRACT DROPDOWN VALUES BASED ON SECURITY BOUNDARIES
  const departments = useMemo(() => {
    const uniq = Array.from(new Set(registrations.filter(r => r.status === 'Approved').map(r => r.office || 'Raniganj')));
    if (isSuperAdmin) {
      return ['ALL', ...uniq];
    }
    return [authorizedOffice];
  }, [registrations, isSuperAdmin, authorizedOffice]);

  const teamLeadersList = useMemo(() => {
    return registrations.filter(r => r.status === 'Approved' && (r.isTeamLeader || r.role === 'TEAM_LEADER'));
  }, [registrations]);

  const activeEmployeesList = useMemo(() => {
    return registrations.filter(emp => {
      if (emp.status !== 'Approved') return false;
      if (selectedOffice !== 'ALL' && emp.office !== selectedOffice) return false;
      return true;
    });
  }, [registrations, selectedOffice]);

  // Employee Performance Evaluation Matrix for Admin Report
  const employeePerformanceList = useMemo(() => {
    const employeesToEvaluate = registrations.filter(emp => {
      if (emp.status !== 'Approved') return false;
      if (selectedOffice !== 'ALL' && emp.office !== selectedOffice && emp.department !== selectedOffice) return false;
      if (selectedEmployeeCode !== 'ALL' && emp.employeeCode !== selectedEmployeeCode) return false;
      if (selectedTeamLeaderCode !== 'ALL' && emp.teamLeaderCode !== selectedTeamLeaderCode && emp.teamLeaderId !== selectedTeamLeaderCode) return false;
      if (searchCode.trim()) {
        const q = searchCode.toLowerCase();
        const matchesName = (emp.name || '').toLowerCase().includes(q);
        const matchesCode = (emp.employeeCode || '').toLowerCase().includes(q);
        if (!matchesName && !matchesCode) return false;
      }
      return true;
    });

    const evaluated = employeesToEvaluate.map(emp => {
      const eCode = emp.employeeCode;

      const calc = calculateEfficiency(
        emp.id || eCode,
        eCode,
        emp.name || 'Employee',
        emp.department || emp.office || 'Operations',
        emp.teamLeaderId || null,
        startDate,
        endDate,
        tasks,
        attendanceRecords,
        DEFAULT_WEIGHTAGES
      );

      const empAtt = attendanceRecords.filter(r => (isSameEmployee(r.employeeId, eCode) || isSameEmployee(r.employeeCode, eCode) || isSameEmployee(r.employeeId, emp.id) || isSameEmployee(r.employeeCode, emp.id)) && (r.createdAtDeviceTime || r.date || '').split('T')[0] >= startDate && (r.createdAtDeviceTime || r.date || '').split('T')[0] <= endDate);
      let workMins = 0;
      let lateCount = 0;
      let unresolvedCount = 0;

      empAtt.forEach(r => {
        if (isAttendanceCheckoutUnresolved(r)) {
          unresolvedCount++;
        } else {
          workMins += getRecordWorkingMinutes(r);
        }
        if (r.checkInTime) {
          const parts = r.checkInTime.split(' ');
          if (parts.length >= 2) {
            const [h, m] = parts[0].split(':').map(Number);
            const isPM = parts[1].toUpperCase() === 'PM';
            let hour = h;
            if (isPM && hour < 12) hour += 12;
            if (!isPM && hour === 12) hour = 0;
            if (hour * 60 + m > 9 * 60 + 30) lateCount++;
          }
        }
      });

      const totalDays = empAtt.length;
      const punctualityPct = totalDays > 0 ? Math.round(((totalDays - lateCount) / totalDays) * 100) : 100;

      const empTasks = tasks.filter(t => {
        const isAssigned = (t.assignedToEmployeeCodes && t.assignedToEmployeeCodes.includes(eCode)) ||
                           (t.assignedToEmployeeIds && t.assignedToEmployeeIds.includes(eCode)) ||
                           t.assigneeCode === eCode;
        if (!isAssigned) return false;
        const d = t.dueDate || (t.completedAt ? t.completedAt.substring(0, 10) : (t.createdAtDeviceTime || t.date || '').substring(0, 10));
        return d >= startDate && d <= endDate;
      });

      const completedTasks = empTasks.filter(t => getEffectiveTaskStatus(t) === 'Completed').length;
      const overdueTasks = empTasks.filter(t => getEffectiveTaskStatus(t) === 'Overdue').length;
      const revisionsCount = empTasks.reduce((s, t) => s + (t.revisionCount || t.revisions?.length || 0), 0);

      return {
        emp,
        eCode,
        name: emp.name || eCode,
        department: emp.department || emp.office || 'Operations',
        workMins,
        workHoursFormatted: formatMinutesToDuration(workMins),
        unresolvedCount,
        punctualityPct,
        tasksAssigned: empTasks.length,
        completedTasks,
        overdueTasks,
        revisionsCount,
        efficiencyScore: calc.finalScore,
        grade: calc.grade
      };
    });

    evaluated.sort((a, b) => b.efficiencyScore - a.efficiencyScore);

    const ranked = evaluated.map((item, index) => ({
      ...item,
      rank: index + 1
    }));

    if (performanceRange === 'HIGH') {
      return ranked.filter(r => r.efficiencyScore >= 80);
    } else if (performanceRange === 'AVERAGE') {
      return ranked.filter(r => r.efficiencyScore >= 60 && r.efficiencyScore < 80);
    } else if (performanceRange === 'NEEDS_ATTENTION') {
      return ranked.filter(r => r.efficiencyScore < 60);
    }

    return ranked;
  }, [registrations, selectedOffice, selectedEmployeeCode, selectedTeamLeaderCode, searchCode, startDate, endDate, tasks, attendanceRecords, performanceRange]);

  // 3. FILTER DATASETS GRACEFULLY
  const filteredAttendance = useMemo(() => {
    return attendanceRecords.filter(rec => {
      // Date filter
      const recDate = (rec.createdAtDeviceTime || rec.date || '').split('T')[0];
      if (!recDate || recDate < startDate || recDate > endDate) return false;
      
      // Office/Department boundary filter
      const recEmpCode = rec.employeeCode || rec.employeeId;
      const emp = registrations.find(r => r.employeeCode === recEmpCode);
      if (!emp) return false;
      
      if (selectedOffice !== 'ALL' && emp.office !== selectedOffice) return false;
      if (selectedEmployeeCode !== 'ALL' && recEmpCode !== selectedEmployeeCode) return false;
      
      return true;
    });
  }, [attendanceRecords, startDate, endDate, registrations, selectedOffice, selectedEmployeeCode]);

  const filteredExpenses = useMemo(() => {
    return expenseRecords.filter(rec => {
      const recDate = (rec.createdAtDeviceTime || rec.date || '').split('T')[0];
      if (!recDate || recDate < startDate || recDate > endDate) return false;

      const recEmpCode = rec.employeeCode || rec.employeeId;
      const emp = registrations.find(r => r.employeeCode === recEmpCode);
      if (!emp) return false;

      if (selectedOffice !== 'ALL' && emp.office !== selectedOffice) return false;
      if (selectedEmployeeCode !== 'ALL' && recEmpCode !== selectedEmployeeCode) return false;

      return true;
    });
  }, [expenseRecords, startDate, endDate, registrations, selectedOffice, selectedEmployeeCode]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(rec => {
      const recDate = (rec.createdAtDeviceTime || rec.dueDate || rec.date || '').split('T')[0];
      if (!recDate || recDate < startDate || recDate > endDate) return false;

      // Filter by assignee's department and code
      const emp = registrations.find(r => r.employeeCode === rec.assigneeCode || r.id === rec.assigneeId);
      if (!emp) return false;

      if (selectedOffice !== 'ALL' && emp.office !== selectedOffice) return false;
      if (selectedEmployeeCode !== 'ALL' && emp.employeeCode !== selectedEmployeeCode) return false;

      return true;
    });
  }, [tasks, startDate, endDate, registrations, selectedOffice, selectedEmployeeCode]);

  const filteredLeaves = useMemo(() => {
    return leaves.filter(rec => {
      const recDate = (rec.createdAtDeviceTime || rec.startDate || rec.date || '').split('T')[0];
      if (!recDate || recDate < startDate || recDate > endDate) return false;

      if (selectedOffice !== 'ALL' && rec.department !== selectedOffice) return false;
      if (selectedEmployeeCode !== 'ALL' && rec.employeeCode !== selectedEmployeeCode) return false;

      return true;
    });
  }, [leaves, startDate, endDate, selectedOffice, selectedEmployeeCode]);

  // 4. METRIC SUMMARIES
  const metrics = useMemo(() => {
    const totalAttendance = filteredAttendance.length;
    const lates = filteredAttendance.filter(r => r.isLate || r.late).length;
    const earlyOuts = filteredAttendance.filter(r => r.isEarlyCheckout).length;
    const missedOuts = filteredAttendance.filter(r => r.checkInTime && !r.checkOutTime).length;
    
    // Use attendanceType for accurate classification
    const office = filteredAttendance.filter(r => r.attendanceType === 'OFFICE').length;
    const wfh = filteredAttendance.filter(r => r.attendanceType === 'WFH').length;
    const clientVisits = filteredAttendance.filter(r => r.attendanceType === 'CLIENT_VISIT').length;
    const outdoor = filteredAttendance.filter(r => r.attendanceType === 'OUTDOOR').length;

    const totalClaimsCount = filteredExpenses.length;
    const approvedClaims = filteredExpenses.filter(r => r.status === 'APPROVED' || r.status === 'Approved');
    const totalExpensesApprovedAmount = approvedClaims.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
    const pendingClaims = filteredExpenses.filter(r => !r.status || r.status === 'PENDING' || r.status === 'Pending').length;

    const totalTasksCount = filteredTasks.length;
    const completedTasks = filteredTasks.filter(r => r.status === 'COMPLETED').length;
    const overdueTasks = filteredTasks.filter(r => r.status === 'OVERDUE' || (r.status === 'PENDING' && new Date(r.dueDate) < new Date())).length;
    
    const approvedLeavesCount = filteredLeaves.filter(r => r.status === 'APPROVED').length;
    const pendingLeavesCount = filteredLeaves.filter(r => r.status === 'PENDING').length;

    return {
      attendance: { 
        total: totalAttendance, 
        lates, 
        earlyOuts, 
        missedOuts, 
        office,
        wfh, 
        clientVisits,
        outdoor 
      },
      expenses: { total: totalClaimsCount, approvedAmount: totalExpensesApprovedAmount, pending: pendingClaims },
      tasks: { total: totalTasksCount, completed: completedTasks, overdue: overdueTasks },
      leaves: { approved: approvedLeavesCount, pending: pendingLeavesCount }
    };
  }, [filteredAttendance, filteredExpenses, filteredTasks, filteredLeaves]);

  // 5. REGIONAL / DEPARTMENT COMPARISON MATRIX (Super Admin Only)
  const departmentComparison = useMemo(() => {
    if (!isSuperAdmin) return [];
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    
    // Extract unique offices (excluding 'ALL')
    const offices = departments.filter(d => d !== 'ALL');

    return offices.map(officeName => {
      const officeEmployees = registrations.filter(r => r.status === 'Approved' && (r.office === officeName || (!r.office && officeName === 'Raniganj')));
      const officeEmpCodes = officeEmployees.map(r => r.employeeCode);
      
      const officeAttendance = attendanceRecords.filter(r => {
        const recDate = (r.createdAtDeviceTime || r.date || '').split('T')[0];
        return recDate >= startDate && recDate <= endDate && officeEmpCodes.includes(r.employeeCode || r.employeeId);
      });
      const officeLates = officeAttendance.filter(r => r.isLate || r.late).length;
      const attRate = officeEmployees.length > 0 ? ((officeAttendance.length / (officeEmployees.length * diffDays)) * 100).toFixed(1) : '0.0';

      const officeExpenses = expenseRecords.filter(r => {
        const recDate = (r.createdAtDeviceTime || r.date || '').split('T')[0];
        const isAppr = r.status === 'APPROVED' || r.status === 'Approved';
        return recDate >= startDate && recDate <= endDate && officeEmpCodes.includes(r.employeeCode || r.employeeId) && isAppr;
      });
      const totalExpense = officeExpenses.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

      const officeTasks = tasks.filter(r => {
        const recDate = (r.createdAtDeviceTime || r.dueDate || r.date || '').split('T')[0];
        return recDate >= startDate && recDate <= endDate && (officeEmpCodes.includes(r.assigneeCode) || officeEmployees.some(e => e.id === r.assigneeId));
      });
      const completedTasksCount = officeTasks.filter(r => r.status === 'COMPLETED').length;
      const totalTasksCount = officeTasks.length;
      const taskCompRate = totalTasksCount > 0 ? ((completedTasksCount / totalTasksCount) * 100).toFixed(1) : '0.0';

      return {
        name: officeName,
        employees: officeEmployees.length,
        attendanceCount: officeAttendance.length,
        lateCount: officeLates,
        attendanceRate: Math.min(parseFloat(attRate), 100).toFixed(1) + '%',
        totalExpenses: '₹' + totalExpense.toLocaleString('en-IN'),
        tasksAssigned: totalTasksCount,
        taskCompletionRate: taskCompRate + '%'
      };
    });
  }, [isSuperAdmin, departments, registrations, attendanceRecords, expenseRecords, tasks, startDate, endDate]);

  // 6. TREND CHART GENERATION (SVG BASED)
  const trendData = useMemo(() => {
    // Break down date range into 7 intervals (weeks/days)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const intervalDays = Math.max(1, Math.ceil(diffDays / 6));

    const intervals: { label: string; attCount: number; expAmount: number; taskCount: number }[] = [];
    
    for (let i = 0; i <= 6; i++) {
      const currentStart = new Date(start);
      currentStart.setDate(start.getDate() + (i * intervalDays));
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + intervalDays);

      const labelStr = currentStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      const startStr = currentStart.toISOString().split('T')[0];
      const endStr = currentEnd.toISOString().split('T')[0];

      // Filter local
      const att = filteredAttendance.filter(r => {
        const d = (r.createdAtDeviceTime || r.date || '').split('T')[0];
        return d >= startStr && d < endStr;
      }).length;

      const exp = filteredExpenses
        .filter(r => (r.status === 'APPROVED' || r.status === 'Approved') && (r.createdAtDeviceTime || r.date || '').split('T')[0] >= startStr && (r.createdAtDeviceTime || r.date || '').split('T')[0] < endStr)
        .reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

      const tsk = filteredTasks.filter(r => {
        const d = (r.createdAtDeviceTime || r.dueDate || r.date || '').split('T')[0];
        return d >= startStr && d < endStr;
      }).length;

      intervals.push({
        label: labelStr,
        attCount: att,
        expAmount: exp,
        taskCount: tsk
      });
    }

    return intervals;
  }, [filteredAttendance, filteredExpenses, filteredTasks, startDate, endDate]);

  // Max values for SVG scaling
  const chartMaxVal = useMemo(() => {
    const maxAtt = Math.max(...trendData.map(d => d.attCount), 1);
    const maxExp = Math.max(...trendData.map(d => d.expAmount), 1);
    const maxTsk = Math.max(...trendData.map(d => d.taskCount), 1);
    return { maxAtt, maxExp, maxTsk };
  }, [trendData]);

  // 7. SECURE BULK EXPORTS
  const handleExport = (type: 'attendance' | 'expenses' | 'planner' | 'leaves' | 'performance') => {
    const sheetTitle = `${type.toUpperCase()} Secure Report`;
    const periodStr = `${startDate} to ${endDate}`;
    const filterDesc = {
      'Department / Office': selectedOffice,
      'Employee Code': selectedEmployeeCode,
      'Export Author Role': role,
      'Classification': 'SECURE HIGH CONTRAST EXPORT'
    };

    if (type === 'attendance') {
      const headers = ['Record ID', 'Employee Code', 'Date', 'Check-In', 'Check-Out', 'Mode', 'Distance (m)', 'Late', 'Early Out', 'WFH', 'Client Visit', 'Outdoor'];
      const rows = filteredAttendance.map(r => [
        r.id,
        r.employeeCode || r.employeeId,
        (r.createdAtDeviceTime || r.date || '').split('T')[0],
        r.checkInTime || 'N/A',
        r.checkOutTime || 'N/A',
        r.checkInMode || 'Manual',
        r.distance?.toFixed(1) || '0.0',
        (r.isLate || r.late) ? 'YES' : 'NO',
        r.isEarlyCheckout ? 'YES' : 'NO',
        r.attendanceType === 'WFH' ? 'YES' : 'NO',
        r.attendanceType === 'CLIENT_VISIT' ? 'YES' : 'NO',
        r.attendanceType === 'OUTDOOR' ? 'YES' : 'NO'
      ]);
      const summary = [
        { label: 'Total Records', value: metrics.attendance.total },
        { label: 'Late Entries', value: metrics.attendance.lates },
        { label: 'Office Attendance', value: metrics.attendance.office },
        { label: 'WFH Events', value: metrics.attendance.wfh },
        { label: 'Client Visits', value: metrics.attendance.clientVisits },
        { label: 'Outdoor Work', value: metrics.attendance.outdoor }
      ];

      exportToCSV(`Attendance_Report_${startDate}_${endDate}`, headers, rows);
      exportToXLSX(`Attendance_Report_${startDate}_${endDate}`, sheetTitle, periodStr, filterDesc, summary, headers, rows);
    } 
    else if (type === 'expenses') {
      const headers = ['Claim ID', 'Employee Code', 'Category', 'Description', 'Amount (₹)', 'Status', 'Date Submitted', 'Approved By'];
      const rows = filteredExpenses.map(r => [
        r.id,
        r.employeeCode,
        r.category,
        r.description,
        parseFloat(r.amount) || 0,
        r.status,
        r.createdAtDeviceTime.split('T')[0],
        r.reviewedByName || 'N/A'
      ]);
      const summary = [
        { label: 'Total Claims', value: metrics.expenses.total },
        { label: 'Approved Amount', value: `₹${metrics.expenses.approvedAmount.toLocaleString('en-IN')}` },
        { label: 'Pending Claims', value: metrics.expenses.pending }
      ];

      exportToCSV(`Expenses_Report_${startDate}_${endDate}`, headers, rows);
      exportToXLSX(`Expenses_Report_${startDate}_${endDate}`, sheetTitle, periodStr, filterDesc, summary, headers, rows);
    }
    else if (type === 'planner') {
      const headers = ['Task ID', 'Assignee Code', 'Title', 'Priority', 'Status', 'Due Date', 'Created Date', 'Completion Time'];
      const rows = filteredTasks.map(r => [
        r.id,
        r.assigneeCode || 'N/A',
        r.title,
        r.priority || 'MEDIUM',
        r.status,
        r.dueDate ? r.dueDate.split('T')[0] : 'N/A',
        r.createdAtDeviceTime ? r.createdAtDeviceTime.split('T')[0] : 'N/A',
        r.completedAtDeviceTime ? r.completedAtDeviceTime.split('T')[0] : 'Incomplete'
      ]);
      const summary = [
        { label: 'Total Tasks', value: metrics.tasks.total },
        { label: 'Completed Tasks', value: metrics.tasks.completed },
        { label: 'Overdue Tasks', value: metrics.tasks.overdue }
      ];

      exportToCSV(`Tasks_Report_${startDate}_${endDate}`, headers, rows);
      exportToXLSX(`Tasks_Report_${startDate}_${endDate}`, sheetTitle, periodStr, filterDesc, summary, headers, rows);
    }
    else if (type === 'leaves') {
      const headers = ['Request ID', 'Employee Code', 'Type', 'Start Date', 'End Date', 'Reason', 'Status', 'Dept/Office'];
      const rows = filteredLeaves.map(r => [
        r.id,
        r.employeeCode,
        r.leaveType,
        r.startDate,
        r.endDate,
        r.reason,
        r.status,
        r.department || 'N/A'
      ]);
      const summary = [
        { label: 'Total Leaves', value: filteredLeaves.length },
        { label: 'Approved', value: metrics.leaves.approved },
        { label: 'Pending Approval', value: metrics.leaves.pending }
      ];

      exportToCSV(`Leaves_Report_${startDate}_${endDate}`, headers, rows);
      exportToXLSX(`Leaves_Report_${startDate}_${endDate}`, sheetTitle, periodStr, filterDesc, summary, headers, rows);
    }
    else if (type === 'performance') {
      const headers = ['Rank', 'Employee Name', 'Employee Code', 'Department', 'Work Hours', 'Punctuality (%)', 'Completed Tasks', 'Assigned Tasks', 'Overdue Tasks', 'Revisions', 'Efficiency Score (%)', 'Grade'];
      const rows = employeePerformanceList.map(r => [
        r.rank,
        r.name,
        r.eCode,
        r.department,
        r.workHoursFormatted,
        `${r.punctualityPct}%`,
        r.completedTasks,
        r.tasksAssigned,
        r.overdueTasks,
        r.revisionsCount,
        `${r.efficiencyScore}%`,
        r.grade
      ]);
      const summary = [
        { label: 'Employees Evaluated', value: employeePerformanceList.length },
        { label: 'Avg Efficiency Score', value: `${employeePerformanceList.length > 0 ? Math.round(employeePerformanceList.reduce((s, r) => s + r.efficiencyScore, 0) / employeePerformanceList.length) : 0}%` },
        { label: 'High Performers (≥80%)', value: employeePerformanceList.filter(r => r.efficiencyScore >= 80).length }
      ];

      exportToCSV(`Employee_Performance_Report_${startDate}_${endDate}`, headers, rows);
      exportToXLSX(`Employee_Performance_Report_${startDate}_${endDate}`, sheetTitle, periodStr, filterDesc, summary, headers, rows);
    }
  };

  const handlePrintSecurePDF = () => {
    // Generate complete unified summary sheet print
    const headers = ['Metric Section', 'Core Sub-category', 'Total Count / Value', 'Applied Scope / Target Status'];
    const rows = [
      ['Attendance Tracking', 'Total Employee Check-Ins Checked', metrics.attendance.total, 'All Modes (Auto/Manual)'],
      ['Attendance Tracking', 'Late Arrival Penalty Incidents', metrics.attendance.lates, 'Check-In after threshold limits'],
      ['Attendance Tracking', 'Early Checkout Incidents', metrics.attendance.earlyOuts, 'Check-out before standard times'],
      ['Attendance Tracking', 'Active Work From Home (WFH)', metrics.attendance.wfh, 'Approved client/home telemetry'],
      ['Attendance Tracking', 'Outdoor Client Visits Registered', metrics.attendance.clientVisits, 'GPS tracked outbound visits'],
      ['Expenses & Financials', 'Approved Expense Claims Total', `₹${metrics.expenses.approvedAmount.toLocaleString('en-IN')}`, 'Disbursed secure credits'],
      ['Expenses & Financials', 'Pending Verification Claims', metrics.expenses.pending, 'Awaiting finance auditor review'],
      ['Task Planner Engine', 'Corporate Core Tasks Logged', metrics.tasks.total, 'Sprint deliverables assigned'],
      ['Task Planner Engine', 'Completed Deliverables Checked', metrics.tasks.completed, 'Validated deliverables'],
      ['Task Planner Engine', 'Overdue Work / Overrun Tasks', metrics.tasks.overdue, 'Breached original deadlines'],
      ['Leave Systems', 'Approved Leave Day Requests', metrics.leaves.approved, 'Deducted from dynamic balances'],
      ['Leave Systems', 'Pending Action Leave Forms', metrics.leaves.pending, 'Awaiting operations override']
    ];

    const summary = [
      { label: 'Secure Active Present', value: filteredAttendance.length },
      { label: 'Corporate Expense', value: `₹${metrics.expenses.approvedAmount.toLocaleString('en-IN')}` },
      { label: 'Overdue Tasks', value: metrics.tasks.overdue },
      { label: 'Approved Leaves', value: metrics.leaves.approved }
    ];

    printReport(
      'Enterprise General Audit Report',
      `${startDate} to ${endDate}`,
      {
        'Authorized Officer Role': role,
        'Authorized Department Scope': selectedOffice,
        'Target Employee Filter': selectedEmployeeCode,
        'Classification Status': 'CONFIDENTIAL SYSTEM GENERAL LEDGER'
      },
      summary,
      headers,
      rows
    );
  };

  return (
    <div className="space-y-6 text-white pb-12">
      
      {/* SECTION 1: HEADER & ROLE SCOPE BADGE */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-purple-500/20 pb-4">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            Corporate Reports & Analytics
          </h2>
          <p className="text-xs text-purple-300 mt-1">
            Analyze corporate attendance, expenses, and employee deliverables within your authorized scope.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-inner-tile border border-purple-500/30">
          <Shield className="w-4 h-4 text-amber-400 animate-pulse" />
          <div className="text-left">
            <div className="text-[9px] text-purple-300 uppercase font-bold tracking-wider">Access Clearance</div>
            <div className="text-xs font-black text-white">{isSuperAdmin ? 'ADMINISTRATOR (SYSTEM)' : `DEPARTMENT ADMIN (${authorizedOffice})`}</div>
          </div>
        </div>
      </div>

      {/* SECTION 2: ADVANCED FILTER MATRIX */}
      <Card className="p-5 glass-card border border-purple-500/20">
        <div className="flex items-center gap-2 border-b border-purple-500/20 pb-3 mb-4">
          <Filter className="w-4 h-4 text-purple-400" />
          <h3 className="text-xs font-black uppercase tracking-wider text-purple-200">Analytical Filter System</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-bold">
          
          {/* Department Selector */}
          <div className="space-y-1.5">
            <label className="text-purple-300 flex items-center gap-1">
              <Building className="w-3.5 h-3.5" /> Department / Branch
            </label>
            <select
              value={selectedOffice}
              onChange={(e) => {
                setSelectedOffice(e.target.value);
                setSelectedEmployeeCode('ALL'); // Reset employee when office changes
              }}
              disabled={!isSuperAdmin}
              className="w-full px-3 py-2.5 rounded-xl glass-inner-tile border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] disabled:opacity-60"
            >
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept === 'ALL' ? 'All Departments' : dept}</option>
              ))}
            </select>
          </div>

          {/* Team Leader Filter */}
          <div className="space-y-1.5">
            <label className="text-purple-300 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Team / Leader
            </label>
            <select
              value={selectedTeamLeaderCode}
              onChange={(e) => setSelectedTeamLeaderCode(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl glass-inner-tile border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="ALL">All Teams ({teamLeadersList.length} Leaders)</option>
              {teamLeadersList.map(tl => (
                <option key={tl.id} value={tl.employeeCode}>
                  {tl.name} ({tl.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Employee Selector */}
          <div className="space-y-1.5">
            <label className="text-purple-300 flex items-center gap-1">
              <Users className="w-3.5 h-3.5" /> Employee Scopes
            </label>
            <select
              value={selectedEmployeeCode}
              onChange={(e) => setSelectedEmployeeCode(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl glass-inner-tile border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="ALL">All Personnel ({activeEmployeesList.length})</option>
              {activeEmployeesList.map(emp => (
                <option key={emp.id} value={emp.employeeCode}>
                  {emp.name} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Search Employee Code or Name */}
          <div className="space-y-1.5">
            <label className="text-purple-300 flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Code / Name
            </label>
            <input
              type="text"
              placeholder="Filter by code..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl glass-inner-tile border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)] placeholder-purple-300/40"
            />
          </div>

          {/* Start Date */}
          <div className="space-y-1.5">
            <label className="text-purple-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl glass-inner-tile border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

          {/* End Date */}
          <div className="space-y-1.5">
            <label className="text-purple-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl glass-inner-tile border border-[var(--border)] focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>

        </div>

        {/* Date Presets Panel */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-purple-500/10 text-[10px] font-black">
          <button onClick={() => applyDatePreset(7)} className="px-3 py-1.5 rounded-lg glass-inner-tile border border-purple-500/10 hover:bg-[#3B2673] transition">THIS WEEK</button>
          <button onClick={() => applyDatePreset(14)} className="px-3 py-1.5 rounded-lg glass-inner-tile border border-purple-500/10 hover:bg-[#3B2673] transition">LAST 14 DAYS</button>
          <button onClick={() => applyDatePreset(30)} className="px-3 py-1.5 rounded-lg bg-[#3b2673] border border-purple-500/30 text-purple-200">LAST 30 DAYS</button>
          <button onClick={() => applyDatePreset(90)} className="px-3 py-1.5 rounded-lg glass-inner-tile border border-purple-500/10 hover:bg-[#3B2673] transition">LAST 3 MONTHS</button>
        </div>
      </Card>

      {/* SECTION 3: REUSABLE EXPORT CONTROL HUB */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Core Export Downloader Buttons */}
        <Card className="p-5 glass-card border border-purple-500/20 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-purple-500/15 pb-2.5 mb-3">
              <Download className="w-4 h-4 text-purple-300" /> 
              Export Datasets & Workbooks
            </h3>
            <p className="text-xs text-purple-300/80 mb-4 leading-relaxed">
              Export the currently filtered subset of records. Downloads will automatically include standard formatted headers, dates, statuses, and summary rows.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-black">
            <button
              onClick={() => handleExport('attendance')}
              className="flex items-center justify-between p-3 rounded-xl glass-inner-tile hover:bg-[#321c60] border border-purple-500/20 text-purple-100 transition text-left"
            >
              <div>
                <p className="font-black text-white">Attendance Log</p>
                <p className="text-[9px] text-purple-300/60 font-medium">CSV & XLSX Format</p>
              </div>
              <Compass className="w-4 h-4 text-purple-400" />
            </button>

            <button
              onClick={() => handleExport('expenses')}
              className="flex items-center justify-between p-3 rounded-xl glass-inner-tile hover:bg-[#321c60] border border-purple-500/20 text-purple-100 transition text-left"
            >
              <div>
                <p className="font-black text-white">Expense Claims</p>
                <p className="text-[9px] text-purple-300/60 font-medium">CSV & XLSX Format</p>
              </div>
              <Coins className="w-4 h-4 text-purple-400" />
            </button>

            <button
              onClick={() => handleExport('planner')}
              className="flex items-center justify-between p-3 rounded-xl glass-inner-tile hover:bg-[#321c60] border border-purple-500/20 text-purple-100 transition text-left"
            >
              <div>
                <p className="font-black text-white">Task Deliverables</p>
                <p className="text-[9px] text-purple-300/60 font-medium">CSV & XLSX Format</p>
              </div>
              <ClipboardList className="w-4 h-4 text-purple-400" />
            </button>

            <button
              onClick={() => handleExport('leaves')}
              className="flex items-center justify-between p-3 rounded-xl glass-inner-tile hover:bg-[#321c60] border border-purple-500/20 text-purple-100 transition text-left"
            >
              <div>
                <p className="font-black text-white">Leave Registers</p>
                <p className="text-[9px] text-purple-300/60 font-medium">CSV & XLSX Format</p>
              </div>
              <Star className="w-4 h-4 text-purple-400" />
            </button>

            <button
              onClick={() => handleExport('performance')}
              className="col-span-2 flex items-center justify-between p-3 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 border border-purple-400/30 text-purple-100 transition text-left"
            >
              <div>
                <p className="font-black text-amber-300">Employee Performance Report</p>
                <p className="text-[9px] text-purple-200/80 font-medium">CSV & XLSX Full Audit Matrix</p>
              </div>
              <Award className="w-4 h-4 text-amber-400" />
            </button>
          </div>
        </Card>

        {/* Global Print & System PDF Engine */}
        <Card className="p-5 glass-card border border-purple-500/20 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-black text-white flex items-center gap-2 border-b border-purple-500/15 pb-2.5 mb-3">
              <Printer className="w-4 h-4 text-purple-300" />
              Secure PDF & System Printing
            </h3>
            <p className="text-xs text-purple-300/80 mb-4 leading-relaxed">
              Launch a beautifully stylized system print screen structured specifically to act as a secure business audit report sheet with watermark branding. Fits perfectly on portrait A4 paper pages.
            </p>
          </div>

          <button
            onClick={handlePrintSecurePDF}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-black text-sm shadow-xl shadow-purple-950/45 transition"
          >
            <Printer className="w-5 h-5" />
            Print Secure Audit Report Sheet
          </button>
        </Card>

      </div>

      {/* SECTION 3.5: EMPLOYEE PERFORMANCE AUDIT REPORT TABLE */}
      <Card className="p-5 glass-card border border-purple-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-purple-500/20 pb-3">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Employee Performance Audit Report
              </h3>
              <p className="text-xs text-purple-300">
                Filtered Scope: {employeePerformanceList.length} Personnel Evaluated ({startDate} to {endDate})
              </p>
            </div>
          </div>

          {/* Performance Range Filter */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-purple-300 font-bold">Range Filter:</span>
            <select
              value={performanceRange}
              onChange={(e: any) => setPerformanceRange(e.target.value)}
              className="px-3 py-1.5 rounded-xl glass-inner-tile border border-purple-500/30 text-white font-bold focus:outline-none"
            >
              <option value="ALL">All Scores</option>
              <option value="HIGH">High Performers (≥80%)</option>
              <option value="AVERAGE">Average (60% - 79%)</option>
              <option value="NEEDS_ATTENTION">Needs Attention (&lt;60%)</option>
            </select>

            <button
              onClick={() => handleExport('performance')}
              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs flex items-center gap-1 shadow transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-purple-500/30 text-purple-300 font-black uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-3">Rank</th>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Code</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Work Hours</th>
                <th className="py-2.5 px-3">Punctuality</th>
                <th className="py-2.5 px-3">Tasks Done</th>
                <th className="py-2.5 px-3">Overdue</th>
                <th className="py-2.5 px-3">Revisions</th>
                <th className="py-2.5 px-3 text-right">Efficiency Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10 font-bold text-purple-100">
              {employeePerformanceList.map((row) => (
                <tr key={row.eCode} className="hover:bg-purple-500/10 transition">
                  <td className="py-3 px-3 font-mono text-purple-300">
                    #{row.rank}
                  </td>
                  <td className="py-3 px-3 font-black text-white">
                    {row.name}
                  </td>
                  <td className="py-3 px-3 font-mono text-purple-300">
                    {row.eCode}
                  </td>
                  <td className="py-3 px-3 text-purple-200">
                    {row.department}
                  </td>
                  <td className="py-3 px-3 text-white">
                    {row.workHoursFormatted}
                    {row.unresolvedCount > 0 && (
                      <span className="block text-[9px] text-rose-300">({row.unresolvedCount} unresolved)</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-cyan-300">
                    {row.punctualityPct}%
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    {row.completedTasks} / {row.tasksAssigned}
                  </td>
                  <td className="py-3 px-3 text-rose-300">
                    {row.overdueTasks}
                  </td>
                  <td className="py-3 px-3 text-amber-300">
                    {row.revisionsCount}
                  </td>
                  <td className="py-3 px-3 text-right font-black text-amber-300 text-sm">
                    {row.efficiencyScore}% ({row.grade})
                  </td>
                </tr>
              ))}
              {employeePerformanceList.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-purple-300/60 font-medium">
                    No employee performance records match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SECTION 4: ANALYTICS METRIC SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Present Checkins */}
        <Card className="p-4 glass-inner-tile/80 border border-purple-500/20">
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">Attendance logs</p>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black mt-2 text-white">{metrics.attendance.total}</p>
          <div className="mt-2 text-[10px] text-purple-300 font-bold space-y-0.5">
            <div>Office: <span className="text-emerald-400 font-black">{metrics.attendance.office}</span></div>
            <div>WFH: <span className="text-blue-400 font-black">{metrics.attendance.wfh}</span></div>
            <div>Client: <span className="text-purple-400 font-black">{metrics.attendance.clientVisits}</span></div>
            <div>Outdoor: <span className="text-amber-400 font-black">{metrics.attendance.outdoor}</span></div>
          </div>
        </Card>

        {/* Approved Expenses */}
        <Card className="p-4 glass-inner-tile/80 border border-purple-500/20">
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">Approved claims</p>
            <Coins className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-black mt-2 text-emerald-400">₹{metrics.expenses.approvedAmount.toLocaleString('en-IN')}</p>
          <div className="mt-2 text-[10px] text-purple-300 font-bold space-y-0.5">
            <div>Verified Claims: <span className="text-white font-black">{metrics.expenses.total - metrics.expenses.pending}</span></div>
            <div>Awaiting Action: <span className="text-amber-400 font-black animate-pulse">{metrics.expenses.pending}</span></div>
          </div>
        </Card>

        {/* Deliverables/Tasks status */}
        <Card className="p-4 glass-inner-tile/80 border border-purple-500/20">
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">Sprint Planner Status</p>
            <Briefcase className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-black mt-2 text-white">{metrics.tasks.total}</p>
          <div className="mt-2 text-[10px] text-purple-300 font-bold space-y-0.5">
            <div>Completed: <span className="text-emerald-400 font-black">{metrics.tasks.completed}</span></div>
            <div>Overdue Breach: <span className="text-red-400 font-black animate-pulse">{metrics.tasks.overdue}</span></div>
          </div>
        </Card>

        {/* Leave status */}
        <Card className="p-4 glass-inner-tile/80 border border-purple-500/20">
          <div className="flex justify-between items-start">
            <p className="text-[10px] text-purple-300 font-bold uppercase tracking-wider">Leave registers</p>
            <Star className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-black mt-2 text-white">{metrics.leaves.approved + metrics.leaves.pending}</p>
          <div className="mt-2 text-[10px] text-purple-300 font-bold space-y-0.5">
            <div>Approved Leaves: <span className="text-emerald-400 font-black">{metrics.leaves.approved}</span></div>
            <div>Awaiting Action: <span className="text-amber-400 font-black">{metrics.leaves.pending}</span></div>
          </div>
        </Card>

      </div>

      {/* SECTION 5: WEEKLY & MONTHLY TREND VISUALIZATIONS (SVG DRIVEN) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Attendance Trends */}
        <Card className="p-5 glass-card border border-purple-500/20 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-200 flex items-center gap-1.5 border-b border-purple-500/10 pb-2.5 mb-4">
              <TrendingUp className="w-4 h-4 text-purple-400" /> Check-In Trends (Attendance)
            </h3>
            
            {/* Custom Responsive SVG Chart */}
            <div className="h-44 w-full flex items-end justify-between relative mt-4 px-2">
              <div className="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-t border-purple-400 w-full"></div>
                <div className="border-t border-purple-400 w-full"></div>
                <div className="border-t border-purple-400 w-full"></div>
              </div>

              {trendData.map((d, index) => {
                const heightPercent = (d.attCount / chartMaxVal.maxAtt) * 80 + 5; // offset
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group relative z-10">
                    <div 
                      style={{ height: `${heightPercent}%` }} 
                      className="w-4 bg-purple-500 rounded-t-md hover:bg-purple-400 transition-all flex items-end justify-center relative cursor-help"
                    >
                      {/* Tooltip */}
                      <span className="absolute -top-7 bg-black text-[9px] font-black px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
                        {d.attCount} checkins
                      </span>
                    </div>
                    <span className="text-[8px] text-purple-300/80 font-bold mt-2 truncate max-w-full">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-purple-500/10 text-[10px] text-purple-300 font-bold text-center">
            Daily average checkins for current filtered dataset
          </div>
        </Card>

        {/* Expense Disbursement Trends */}
        <Card className="p-5 glass-card border border-purple-500/20 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-200 flex items-center gap-1.5 border-b border-purple-500/10 pb-2.5 mb-4">
              <Coins className="w-4 h-4 text-emerald-400" /> Disbursed Claims Trend
            </h3>
            
            {/* Custom Responsive SVG Chart */}
            <div className="h-44 w-full flex items-end justify-between relative mt-4 px-2">
              <div className="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-t border-emerald-400 w-full"></div>
                <div className="border-t border-emerald-400 w-full"></div>
                <div className="border-t border-emerald-400 w-full"></div>
              </div>

              {trendData.map((d, index) => {
                const heightPercent = (d.expAmount / chartMaxVal.maxExp) * 80 + 5; // offset
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group relative z-10">
                    <div 
                      style={{ height: `${heightPercent}%` }} 
                      className="w-4 bg-emerald-500 rounded-t-md hover:bg-emerald-400 transition-all flex items-end justify-center relative cursor-help"
                    >
                      {/* Tooltip */}
                      <span className="absolute -top-7 bg-black text-[9px] font-black px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
                        ₹{d.expAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <span className="text-[8px] text-purple-300/80 font-bold mt-2 truncate max-w-full">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-purple-500/10 text-[10px] text-purple-300 font-bold text-center">
            Total approved operational credits in range
          </div>
        </Card>

        {/* Task Assignment Trends */}
        <Card className="p-5 glass-card border border-purple-500/20 flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-200 flex items-center gap-1.5 border-b border-purple-500/10 pb-2.5 mb-4">
              <ClipboardList className="w-4 h-4 text-purple-400" /> Deliverables Active Velocity
            </h3>
            
            {/* Custom Responsive SVG Chart */}
            <div className="h-44 w-full flex items-end justify-between relative mt-4 px-2">
              <div className="absolute top-0 bottom-0 left-0 right-0 flex flex-col justify-between pointer-events-none opacity-20">
                <div className="border-t border-purple-400 w-full"></div>
                <div className="border-t border-purple-400 w-full"></div>
                <div className="border-t border-purple-400 w-full"></div>
              </div>

              {trendData.map((d, index) => {
                const heightPercent = (d.taskCount / chartMaxVal.maxTsk) * 80 + 5; // offset
                return (
                  <div key={index} className="flex-1 flex flex-col items-center group relative z-10">
                    <div 
                      style={{ height: `${heightPercent}%` }} 
                      className="w-4 bg-purple-400 rounded-t-md hover:bg-purple-300 transition-all flex items-end justify-center relative cursor-help"
                    >
                      {/* Tooltip */}
                      <span className="absolute -top-7 bg-black text-[9px] font-black px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-50">
                        {d.taskCount} tasks
                      </span>
                    </div>
                    <span className="text-[8px] text-purple-300/80 font-bold mt-2 truncate max-w-full">{d.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-purple-500/10 text-[10px] text-purple-300 font-bold text-center">
            Weekly task volume assigned to field teams
          </div>
        </Card>

      </div>

      {/* SECTION 6: SUPER ADMIN DEPARTMENT COMPARISON MATRIX */}
      {isSuperAdmin && (
        <Card className="p-5 glass-card border border-purple-500/20">
          <div className="flex items-center gap-2 border-b border-purple-500/20 pb-3 mb-4">
            <Building className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-200">Department Regional Summary & Performance Indexes</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-purple-500/30 text-purple-300">
                  <th className="py-2.5 font-black">DEPARTMENT NAME</th>
                  <th className="py-2.5 font-black">ACTIVE PERSONNEL</th>
                  <th className="py-2.5 font-black">CHECK-IN COUNT</th>
                  <th className="py-2.5 font-black">LATE ARRV. TOTAL</th>
                  <th className="py-2.5 font-black">ESTIMATED ATT. RATE</th>
                  <th className="py-2.5 font-black">TOTAL EXPENSES DISBURSED</th>
                  <th className="py-2.5 font-black">SPRINT TASKS</th>
                  <th className="py-2.5 font-black">COMPLETION RATE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10 font-bold text-purple-100">
                {departmentComparison.map(dept => (
                  <tr key={dept.name} className="hover:bg-purple-500/5 transition">
                    <td className="py-3 font-black text-white flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                      {dept.name}
                    </td>
                    <td className="py-3">{dept.employees}</td>
                    <td className="py-3">{dept.attendanceCount}</td>
                    <td className="py-3 text-amber-400">{dept.lateCount}</td>
                    <td className="py-3 text-emerald-400">{dept.attendanceRate}</td>
                    <td className="py-3 font-mono">{dept.totalExpenses}</td>
                    <td className="py-3">{dept.tasksAssigned}</td>
                    <td className="py-3 text-purple-300">{dept.taskCompletionRate}</td>
                  </tr>
                ))}
                {departmentComparison.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-purple-300/50">
                      No registered branches found. Please complete active device registrations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

    </div>
  );
};
