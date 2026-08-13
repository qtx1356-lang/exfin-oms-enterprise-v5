import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Award, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  BarChart3, 
  Sliders, 
  Settings, 
  Download, 
  AlertCircle, 
  Check, 
  RotateCcw, 
  Search, 
  Users, 
  SlidersHorizontal,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  Printer
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { TaskRecord } from '../../types/planner';
import { AttendanceRecord } from '../../types/attendance';
import { EfficiencyBreakdown, EfficiencyGrade, EfficiencySnapshot, EfficiencyWeightages, getEfficiencyGrade } from '../../types/efficiency';
import { calculateEfficiency } from '../../services/efficiency/efficiencyCalculator';
import { DEFAULT_WEIGHTAGES, getSavedWeightages, saveWeightages, getEfficiencySnapshots, saveEfficiencySnapshot } from '../../services/efficiency/efficiencyService';

interface EfficiencyDashboardProps {
  customEmployeeCode?: string; // Admin or TL can pass this to inspect a specific employee
  embedded?: boolean; // True when showing inside Admin/TL panels
}

export const EfficiencyDashboard: React.FC<EfficiencyDashboardProps> = ({ 
  customEmployeeCode,
  embedded = false
}) => {
  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();

  // Determine current active user role
  const isAdmin = Boolean(adminUser);
  const isTeamLeader = Boolean(employeeData?.isTeamLeader);
  const activeEmployeeCode = employeeData?.employeeCode || '';
  
  // Target employee for scoring
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState<string>(customEmployeeCode || activeEmployeeCode);

  // Synchronize prop updates
  useEffect(() => {
    if (customEmployeeCode) {
      setSelectedEmployeeCode(customEmployeeCode);
    }
  }, [customEmployeeCode]);

  // Main UI State
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);
  const [weightages, setWeightages] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [historicalSnapshots, setHistoricalSnapshots] = useState<EfficiencySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);

  // Report generation state
  const [reportState, setReportState] = useState<'idle' | 'preparing' | 'success' | 'failure'>('idle');
  const [reportError, setReportError] = useState<string | null>(null);
  const [generatedPdfBlob, setGeneratedPdfBlob] = useState<Blob | null>(null);
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState<string | null>(null);

  // Clean up object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (generatedPdfUrl) {
        URL.revokeObjectURL(generatedPdfUrl);
      }
    };
  }, [generatedPdfUrl]);

  // Period Selection: WEEKLY, MONTHLY, CUSTOM
  const [periodType, setPeriodType] = useState<'WEEKLY' | 'MONTHLY' | 'CUSTOM'>('MONTHLY');
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState(() => {
    return new Date().toISOString().substring(0, 10);
  });

  // Calculate dates based on selected period
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    const today = new Date();
    let start = '';
    let end = today.toISOString().substring(0, 10);
    let prevStart = '';
    let prevEnd = '';

    if (periodType === 'WEEKLY') {
      const d = new Date();
      d.setDate(today.getDate() - 6);
      start = d.toISOString().substring(0, 10);
      
      const pd1 = new Date(d);
      pd1.setDate(pd1.getDate() - 7);
      prevStart = pd1.toISOString().substring(0, 10);
      
      const pd2 = new Date(d);
      pd2.setDate(pd2.getDate() - 1);
      prevEnd = pd2.toISOString().substring(0, 10);
    } else if (periodType === 'MONTHLY') {
      // 1st of current month
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      start = d.toISOString().substring(0, 10);

      // Previous month
      const pd1 = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      prevStart = pd1.toISOString().substring(0, 10);
      
      const pd2 = new Date(today.getFullYear(), today.getMonth(), 0);
      prevEnd = pd2.toISOString().substring(0, 10);
    } else {
      start = customStartDate;
      end = customEndDate;
      
      // Calculate previous period of equal duration
      try {
        const diffMs = new Date(end).getTime() - new Date(start).getTime();
        const durationDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) || 1;
        
        const pd1 = new Date(start);
        pd1.setDate(pd1.getDate() - durationDays);
        prevStart = pd1.toISOString().substring(0, 10);

        const pd2 = new Date(start);
        pd2.setDate(pd2.getDate() - 1);
        prevEnd = pd2.toISOString().substring(0, 10);
      } catch (err) {
        prevStart = start;
        prevEnd = end;
      }
    }

    return { startDate: start, endDate: end, prevStartDate: prevStart, prevEndDate: prevEnd };
  }, [periodType, customStartDate, customEndDate]);

  // Administration State (for setting weightages)
  const [adminWeights, setAdminWeights] = useState<EfficiencyWeightages>(DEFAULT_WEIGHTAGES);
  const [weightsError, setWeightsError] = useState<string | null>(null);
  const [weightsSuccess, setWeightsSuccess] = useState(false);

  // ----------------------------------------------------
  // DATA SUBSCRIPTIONS (Tasks, Attendance, Registrations)
  // ----------------------------------------------------
  useEffect(() => {
    if (!db) {
      setOfflineMode(true);
      setLoading(false);
      return;
    }

    // Subscribe to weightages
    getSavedWeightages().then(w => {
      setWeightages(w);
      setAdminWeights(w);
    });

    // Subscribe to employees list
    const unsubRegs = onSnapshot(collection(db, 'registrations'), (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllEmployees(list);
    }, (err) => {
      console.warn('Registrations subscription error:', err);
    });

    // Scope queries by selected employee code when available to avoid fetching unneeded company records
    const targetCode = selectedEmployeeCode || activeEmployeeCode;

    const tasksQuery = targetCode 
      ? query(collection(db, 'tasks'), where('assignedToEmployeeCodes', 'array-contains', targetCode), limit(200))
      : query(collection(db, 'tasks'), limit(200));

    const attQuery = targetCode
      ? query(collection(db, 'attendance'), where('employeeId', '==', targetCode), limit(200))
      : query(collection(db, 'attendance'), limit(200));

    // Subscribe to tasks
    const unsubTasks = onSnapshot(tasksQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as TaskRecord[];
      setTasks(list);
    }, (err) => {
      console.warn('Tasks subscription error:', err);
    });

    // Subscribe to attendance
    const unsubAtt = onSnapshot(attQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AttendanceRecord[];
      setAttendance(list);
      setLoading(false);
    }, (err) => {
      console.warn('Attendance subscription error:', err);
      setLoading(false);
    });

    return () => {
      unsubRegs();
      unsubTasks();
      unsubAtt();
    };
  }, []);

  // Fetch historical snapshots whenever selected employee code changes
  useEffect(() => {
    getEfficiencySnapshots(selectedEmployeeCode || undefined).then(snaps => {
      setHistoricalSnapshots(snaps);
    });
  }, [selectedEmployeeCode]);

  // Find targeted employee record
  const selectedEmployee = useMemo(() => {
    return allEmployees.find(e => e.employeeCode === selectedEmployeeCode) || 
           (selectedEmployeeCode === activeEmployeeCode ? employeeData : null);
  }, [allEmployees, selectedEmployeeCode, activeEmployeeCode, employeeData]);

  // ----------------------------------------------------
  // EFFICIENCY SCORE COMPUTATIONS
  // ----------------------------------------------------
  const currentCalculation = useMemo(() => {
    if (!selectedEmployeeCode) return null;
    const emp = selectedEmployee || {
      id: selectedEmployeeCode,
      employeeCode: selectedEmployeeCode,
      name: selectedEmployeeCode,
      department: 'Operations',
      teamLeaderId: null
    };

    return calculateEfficiency(
      emp.id || emp.employeeCode,
      emp.employeeCode,
      emp.name || 'Employee',
      emp.department || 'Operations',
      emp.teamLeaderId || null,
      startDate,
      endDate,
      tasks,
      attendance,
      weightages
    );
  }, [selectedEmployee, selectedEmployeeCode, startDate, endDate, tasks, attendance, weightages]);

  // Calculate previous period for trends
  const previousCalculation = useMemo(() => {
    if (!selectedEmployeeCode) return null;
    const emp = selectedEmployee || {
      id: selectedEmployeeCode,
      employeeCode: selectedEmployeeCode,
      name: selectedEmployeeCode,
      department: 'Operations',
      teamLeaderId: null
    };

    return calculateEfficiency(
      emp.id || emp.employeeCode,
      emp.employeeCode,
      emp.name || 'Employee',
      emp.department || 'Operations',
      emp.teamLeaderId || null,
      prevStartDate,
      prevEndDate,
      tasks,
      attendance,
      weightages
    );
  }, [selectedEmployee, selectedEmployeeCode, prevStartDate, prevEndDate, tasks, attendance, weightages]);

  // Trend Change Indicator
  const trendChange = useMemo(() => {
    if (!currentCalculation || !previousCalculation) return null;
    const diff = currentCalculation.finalScore - previousCalculation.finalScore;
    return diff;
  }, [currentCalculation, previousCalculation]);

  // Filtered employees listing based on privacy permissions
  const authorizedEmployees = useMemo(() => {
    if (isAdmin) {
      return allEmployees.filter(e => e.status === 'Approved');
    }
    if (isTeamLeader) {
      // Show only members of their team
      return allEmployees.filter(e => e.status === 'Approved' && e.teamLeaderCode === activeEmployeeCode);
    }
    // Employee: Only themselves
    return allEmployees.filter(e => e.employeeCode === activeEmployeeCode);
  }, [allEmployees, isAdmin, isTeamLeader, activeEmployeeCode]);

  // Leaderboard Calculation
  const leaderboard = useMemo(() => {
    return authorizedEmployees.map(emp => {
      const calc = calculateEfficiency(
        emp.id || emp.employeeCode,
        emp.employeeCode,
        emp.name || 'Employee',
        emp.department || 'Operations',
        emp.teamLeaderId || null,
        startDate,
        endDate,
        tasks,
        attendance,
        weightages
      );
      return {
        employee: emp,
        score: calc.finalScore,
        grade: calc.grade,
        breakdown: calc.breakdown
      };
    }).sort((a, b) => b.score - a.score);
  }, [authorizedEmployees, startDate, endDate, tasks, attendance, weightages]);

  // Find current selected employee's rank in the leaderboard
  const currentRank = useMemo(() => {
    if (!selectedEmployeeCode || !leaderboard) return null;
    const idx = leaderboard.findIndex(item => item.employee.employeeCode === selectedEmployeeCode);
    return idx !== -1 ? idx + 1 : null;
  }, [leaderboard, selectedEmployeeCode]);

  // Save current score snapshot
  const handleSaveSnapshot = async () => {
    if (!currentCalculation || !selectedEmployeeCode) return;
    const emp = selectedEmployee || {
      id: selectedEmployeeCode,
      employeeCode: selectedEmployeeCode,
      name: selectedEmployeeCode,
      department: 'Operations',
      teamLeaderId: null
    };

    const snapshot: EfficiencySnapshot = {
      employeeId: emp.id || emp.employeeCode,
      employeeCode: emp.employeeCode,
      employeeName: emp.name || 'Employee',
      department: emp.department || 'Operations',
      teamLeaderId: emp.teamLeaderId || null,
      teamLeaderCode: emp.teamLeaderCode || null,
      teamLeaderName: emp.teamLeaderName || null,
      
      periodStart: startDate,
      periodEnd: endDate,
      periodType: periodType,
      
      taskCompletionScore: currentCalculation.breakdown.taskCompletionScore,
      onTimeCompletionScore: currentCalculation.breakdown.onTimeCompletionScore,
      qualityScore: currentCalculation.breakdown.qualityScore,
      punctualityScore: currentCalculation.breakdown.punctualityScore,
      workloadScore: currentCalculation.breakdown.workloadScore,
      
      overduePenalty: currentCalculation.breakdown.overduePenalty,
      revisionPenalty: currentCalculation.breakdown.revisionPenalty,
      
      finalScore: currentCalculation.finalScore,
      grade: currentCalculation.grade,
      
      weightagesUsed: weightages,
      breakdown: currentCalculation.breakdown,
      calculatedAtDeviceTime: new Date().toISOString(),
      serverSyncTime: null
    };

    try {
      await saveEfficiencySnapshot(snapshot);
      // Reload snapshots list
      const snaps = await getEfficiencySnapshots(selectedEmployeeCode);
      setHistoricalSnapshots(snaps);
      alert('Efficiency snapshot saved successfully!');
    } catch (err) {
      alert('Saved locally. Snapshot will be synchronized when online.');
    }
  };

  // Administration: Save updated weightages
  const handleSaveWeightages = async (e: React.FormEvent) => {
    e.preventDefault();
    setWeightsError(null);
    setWeightsSuccess(false);

    const total = adminWeights.taskCompletion + 
                  adminWeights.onTimeCompletion + 
                  adminWeights.quality + 
                  adminWeights.punctuality + 
                  adminWeights.workload;

    if (total !== 100) {
      setWeightsError('Efficiency weightages must total 100%.');
      return;
    }

    try {
      await saveWeightages(
        adminWeights, 
        adminUser?.uid || employeeData?.id || 'ADMIN', 
        adminUser?.email || employeeData?.name || 'Administrator'
      );
      setWeightages(adminWeights);
      setWeightsSuccess(true);
      setTimeout(() => setWeightsSuccess(false), 3000);
    } catch (err) {
      setWeightsError(err instanceof Error ? err.message : 'Failed to save settings.');
    }
  };

  const handleResetWeights = () => {
    setAdminWeights(DEFAULT_WEIGHTAGES);
    setWeightsError(null);
  };

  // Print/Export Report Formatter
  const handleExportReport = async () => {
    if (!currentCalculation || !selectedEmployeeCode) {
      setReportError('No efficiency metrics data is computed. Please select an employee and period first.');
      setReportState('failure');
      return;
    }

    setReportState('preparing');
    setReportError(null);

    // Clean up any stale object URL
    if (generatedPdfUrl) {
      URL.revokeObjectURL(generatedPdfUrl);
      setGeneratedPdfUrl(null);
    }
    setGeneratedPdfBlob(null);

    // Run inside a small timeout to let the loader spin up beautifully
    setTimeout(() => {
      try {
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        const primaryColor = [33, 16, 68]; // #211044
        const accentColor = [124, 58, 237]; // #7C3AED
        const darkGray = [31, 41, 55]; // #1F2937
        const lightGray = [107, 114, 128]; // #6B7280
        const borderGray = [229, 231, 235]; // #E5E7EB
        const lightBackground = [248, 249, 252]; // #F8F9FC

        // 1. Top Solid Header Banner
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(15, 15, 180, 26, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text('EXFIN OMS', 22, 26);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(200, 180, 255);
        doc.text('SMART EFFICIENCY & PERFORMANCE REPORT', 22, 33);

        // Header Meta Info Block
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text(`Period: ${startDate} to ${endDate}`, 145, 26);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 145, 31);
        doc.text(`Type: ${periodType}`, 145, 36);

        // 2. Employee Info Grid Area
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.4);
        doc.line(15, 45, 195, 45);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('EMPLOYEE DOSSIER', 15, 52);

        // Grid Details Row 1
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text('Name:', 15, 60);
        doc.text('Designation:', 110, 60);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(selectedEmployee?.name || 'N/A', 45, 60);
        doc.text(selectedEmployee?.designation || 'Executive', 142, 60);

        // Grid Details Row 2
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text('Employee Code:', 15, 66);
        doc.text('Leader / Supervisor:', 110, 66);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(selectedEmployeeCode || 'N/A', 45, 66);
        doc.text(selectedEmployee?.teamLeaderName || 'None', 142, 66);

        // Grid Details Row 3
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text('Department:', 15, 72);
        doc.text('Office Location:', 110, 72);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(selectedEmployee?.department || 'Operations', 45, 72);
        doc.text(selectedEmployee?.office || 'Default Office', 142, 72);

        // Section Divider
        doc.line(15, 78, 195, 78);

        // 3. Overall Score Snapshot Block
        doc.setFillColor(lightBackground[0], lightBackground[1], lightBackground[2]);
        doc.roundedRect(15, 83, 180, 32, 2, 2, 'F');
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.roundedRect(15, 83, 180, 32, 2, 2, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
        doc.text('OVERALL SCORE STANDING', 22, 91);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(28);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(`${currentCalculation.finalScore}`, 22, 107);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text('/ 100', 44, 107);

        // Progress Bar (Linear visual meter)
        doc.setFillColor(235, 237, 243);
        doc.rect(72, 97, 108, 4.5, 'F');
        doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
        const barFill = Math.max(0, Math.min(100, currentCalculation.finalScore));
        const barWidth = (108 * barFill) / 100;
        if (barWidth > 0) {
          doc.rect(72, 97, barWidth, 4.5, 'F');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text(`Grade Achieved: ${currentCalculation.grade}`, 72, 91);

        // Leaderboard position description
        if (currentRank) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.text(`Standing: Currently ranked #${currentRank} on the team leaderboard`, 72, 107);
        } else {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.text(`Standing: Performance evaluation finalized`, 72, 107);
        }

        // 4. Performance Metrics Table
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('DETAILED PERFORMANCE BREAKDOWN', 15, 125);

        const tableYStart = 130;
        const rowHeight = 11;

        // Table Header Fill
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(15, tableYStart, 180, 8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('Key Performance Metric', 18, tableYStart + 5.2);
        doc.text('Metric Details / Progress Logs', 60, tableYStart + 5.2);
        doc.text('Value', 125, tableYStart + 5.2);
        doc.text('Weight', 145, tableYStart + 5.2);
        doc.text('Weighted Score', 168, tableYStart + 5.2);

        const bd = currentCalculation.breakdown;
        const w = weightages;

        const metricsList = [
          {
            name: 'Task Completion',
            desc: `Completed ${bd.completedTasksCount} of ${bd.assignedTasksCount} assigned tasks`,
            val: bd.taskCompletionScore === -1 ? 'N/A' : `${bd.taskCompletionScore}%`,
            weight: `${w.taskCompletion}%`,
            weighted: bd.taskCompletionScore === -1 ? '0.0 pts' : `${((bd.taskCompletionScore * w.taskCompletion) / 100).toFixed(1)} pts`
          },
          {
            name: 'On-Time Completion',
            desc: `${bd.onTimeTasksCount} tasks completed on or before deadline`,
            val: bd.onTimeCompletionScore === -1 ? 'N/A' : `${bd.onTimeCompletionScore}%`,
            weight: `${w.onTimeCompletion}%`,
            weighted: bd.onTimeCompletionScore === -1 ? '0.0 pts' : `${((bd.onTimeCompletionScore * w.onTimeCompletion) / 100).toFixed(1)} pts`
          },
          {
            name: 'Quality & Approvals',
            desc: `${bd.approvedTasksCount} approved, ${bd.revisionRequiredTasksCount} revisions requested`,
            val: bd.qualityScore === -1 ? 'N/A' : `${bd.qualityScore}%`,
            weight: `${w.quality}%`,
            weighted: bd.qualityScore === -1 ? '0.0 pts' : `${((bd.qualityScore * w.quality) / 100).toFixed(1)} pts`
          },
          {
            name: 'Attendance Punctuality',
            desc: `${bd.attendanceDaysCount} attendance logs, ${bd.lateArrivalsCount} late arrivals`,
            val: bd.punctualityScore === -1 ? 'N/A' : `${bd.punctualityScore}%`,
            weight: `${w.punctuality}%`,
            weighted: bd.punctualityScore === -1 ? '0.0 pts' : `${((bd.punctualityScore * w.punctuality) / 100).toFixed(1)} pts`
          },
          {
            name: 'Workload Capacity',
            desc: `Normalized task workload density index`,
            val: bd.workloadScore === -1 ? 'N/A' : `${bd.workloadScore}%`,
            weight: `${w.workload}%`,
            weighted: bd.workloadScore === -1 ? '0.0 pts' : `${((bd.workloadScore * w.workload) / 100).toFixed(1)} pts`
          }
        ];

        metricsList.forEach((row, idx) => {
          const rowY = tableYStart + 8 + (idx * rowHeight);
          
          // Zebra striping
          if (idx % 2 === 1) {
            doc.setFillColor(lightBackground[0], lightBackground[1], lightBackground[2]);
            doc.rect(15, rowY, 180, rowHeight, 'F');
          }

          // Border
          doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
          doc.line(15, rowY + rowHeight, 195, rowY + rowHeight);

          // Content
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.text(row.name, 18, rowY + 6.5);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
          doc.text(row.desc, 60, rowY + 6.5);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
          doc.text(row.val, 125, rowY + 6.5);
          doc.text(row.weight, 145, rowY + 6.5);
          doc.text(row.weighted, 168, rowY + 6.5);
        });

        // 5. Applied Penalties and Deductions Block
        const penaltyYStart = tableYStart + 8 + (metricsList.length * rowHeight) + 12;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.text('PENALTIES & DEDUCTIONS LOGGED', 15, penaltyYStart);

        // Penalty box 1 (Overdue)
        doc.setFillColor(lightBackground[0], lightBackground[1], lightBackground[2]);
        doc.roundedRect(15, penaltyYStart + 5, 85, 23, 1.5, 1.5, 'F');
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.roundedRect(15, penaltyYStart + 5, 85, 23, 1.5, 1.5, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(190, 40, 40);
        doc.text('Overdue Tasks Impact', 20, penaltyYStart + 11.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(`-${bd.overduePenalty} points deduction`, 20, penaltyYStart + 16.5);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text(`(${bd.overdueTasksCount} overdue tasks identified)`, 20, penaltyYStart + 21.5);

        // Penalty box 2 (Revisions)
        doc.setFillColor(lightBackground[0], lightBackground[1], lightBackground[2]);
        doc.roundedRect(110, penaltyYStart + 5, 85, 23, 1.5, 1.5, 'F');
        doc.roundedRect(110, penaltyYStart + 5, 85, 23, 1.5, 1.5, 'S');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(190, 40, 40);
        doc.text('Revision Request Iterations', 115, penaltyYStart + 11.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(darkGray[0], darkGray[1], darkGray[2]);
        doc.text(`-${bd.revisionPenalty} points deduction`, 115, penaltyYStart + 16.5);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text(`(${bd.totalRevisionRequests} revision cycles logged)`, 115, penaltyYStart + 21.5);

        // 6. Security & Official Footer
        doc.setDrawColor(borderGray[0], borderGray[1], borderGray[2]);
        doc.setLineWidth(0.3);
        doc.line(15, 268, 195, 268);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(lightGray[0], lightGray[1], lightGray[2]);
        doc.text('EXFIN OMS Smart Performance Engine — Verification Complete', 15, 274);
        doc.text('Page 1 of 1', 178, 274);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.2);
        doc.text('This evaluation sheet is calculated natively in real-time. Unauthorized modification violates platform terms.', 15, 279);

        // Output PDF
        const blob = doc.output('blob');
        const blobUrl = URL.createObjectURL(blob);

        setGeneratedPdfBlob(blob);
        setGeneratedPdfUrl(blobUrl);
        setReportState('success');

        // Automatically trigger print dialog on the iframe target
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = blobUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
          setTimeout(() => {
            try {
              iframe.contentWindow?.focus();
              iframe.contentWindow?.print();
            } catch (printErr) {
              console.warn('Iframe printing blocked or failed:', printErr);
            } finally {
              setTimeout(() => {
                try {
                  document.body.removeChild(iframe);
                } catch (e) {}
              }, 5000);
            }
          }, 300);
        };

        // Automatically trigger download fallback for instant feedback
        try {
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = `EXFIN_OMS_Report_${selectedEmployeeCode}_${startDate}_to_${endDate}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        } catch (downloadErr) {
          console.warn('Auto-download failed or was blocked:', downloadErr);
        }

      } catch (err) {
        console.error('PDF Generation Error:', err);
        setReportError(err instanceof Error ? err.message : 'An unexpected error occurred during PDF compiling.');
        setReportState('failure');
      }
    }, 800);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] text-white">
        <div className="w-8 h-8 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-purple-200">Loading efficiency scores...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white max-w-7xl mx-auto print:p-0">
      
      {/* 1. Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#211044]/80 p-5 rounded-[22px] border border-purple-500/20 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#7C3AED]/20 flex items-center justify-center border border-purple-500/30">
            <BarChart3 className="w-5 h-5 text-[#A78BFA]" />
          </div>
          <div>
            <h2 className="text-lg font-black leading-tight">Employee Efficiency Hub</h2>
            <p className="text-xs text-purple-300/70 font-medium">Configure weights, calculate scores, and view trends</p>
          </div>
        </div>

        {/* Date / Period Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={() => setPeriodType('WEEKLY')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${periodType === 'WEEKLY' ? 'bg-[#7C3AED] text-white' : 'bg-[#2D1B5A] text-purple-300 hover:bg-[#3B2673]'}`}
          >
            Weekly
          </button>
          <button 
            onClick={() => setPeriodType('MONTHLY')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${periodType === 'MONTHLY' ? 'bg-[#7C3AED] text-white' : 'bg-[#2D1B5A] text-purple-300 hover:bg-[#3B2673]'}`}
          >
            Monthly
          </button>
          <button 
            onClick={() => setPeriodType('CUSTOM')}
            className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors ${periodType === 'CUSTOM' ? 'bg-[#7C3AED] text-white' : 'bg-[#2D1B5A] text-purple-300 hover:bg-[#3B2673]'}`}
          >
            Custom
          </button>

          {periodType === 'CUSTOM' && (
            <div className="flex items-center gap-1.5 bg-[#2D1B5A] p-1 rounded-xl border border-purple-500/20">
              <input 
                type="date" 
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent text-xs text-white p-1 rounded focus:outline-none"
              />
              <span className="text-purple-300 text-[10px] uppercase font-bold">to</span>
              <input 
                type="date" 
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent text-xs text-white p-1 rounded focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* 2. Employee Selector for Managers & Admins */}
      {(isAdmin || isTeamLeader) && !embedded && (
        <div className="p-4 bg-[#211044]/60 rounded-2xl border border-purple-500/10 flex flex-col md:flex-row items-center gap-3 print:hidden">
          <span className="text-xs font-extrabold text-purple-300 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
            <Users className="w-3.5 h-3.5" /> Inspect Employee:
          </span>
          <select
            value={selectedEmployeeCode}
            onChange={(e) => setSelectedEmployeeCode(e.target.value)}
            className="w-full md:w-80 p-2 rounded-xl border border-purple-500/30 bg-[#2D1B5A] text-white text-xs font-bold focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
          >
            <option value="">-- Select Employee --</option>
            {authorizedEmployees.map(emp => (
              <option key={emp.id} value={emp.employeeCode}>
                {emp.name} ({emp.employeeCode}) — {emp.department || 'Operations'}
              </option>
            ))}
          </select>
          {selectedEmployee && (
            <span className="text-[11px] text-purple-300/80 font-semibold">
              TL: {selectedEmployee.teamLeaderName || 'None'} • Office: {selectedEmployee.office || 'Default'}
            </span>
          )}
        </div>
      )}

      {/* 3. Main Scoring Visualizations */}
      {currentCalculation && selectedEmployeeCode && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Circular score ring card */}
          <Card className="p-6 bg-[#211044]/90 border border-purple-500/30 flex flex-col items-center justify-between min-h-[340px] text-center rounded-[22px]">
            <div>
              <span className="text-xs font-black text-purple-300 uppercase tracking-widest">Efficiency Rating</span>
              <h3 className="text-sm text-purple-200 mt-1 font-bold">
                {selectedEmployee?.name || 'Loading'}
              </h3>
              <p className="text-[10px] font-mono text-purple-400 font-semibold mt-0.5">{startDate} to {endDate}</p>
            </div>

            {/* SVG Arc Progress */}
            <div className="relative my-4 flex items-center justify-center">
              <svg className="w-40 h-40 transform -rotate-90">
                <circle cx="80" cy="80" r="68" className="stroke-[#2D1B5A] fill-none stroke-[10px]" />
                <circle 
                  cx="80" 
                  cy="80" 
                  r="68" 
                  className="stroke-[#7C3AED] fill-none stroke-[10px] transition-all duration-1000" 
                  strokeDasharray={427.2} 
                  strokeDashoffset={427.2 - (427.2 * currentCalculation.finalScore) / 100} 
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-4xl font-black text-white leading-none">{currentCalculation.finalScore}</span>
                <span className="text-[10px] font-extrabold text-purple-300 uppercase tracking-wider mt-1">out of 100</span>
              </div>
            </div>

            <div className="w-full">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#7C3AED]/20 text-purple-300 border border-purple-500/40">
                <Award className="w-3.5 h-3.5 text-yellow-400" /> Grade: {currentCalculation.grade}
              </div>

              {/* Trend Tracker */}
              {trendChange !== null && (
                <div className="flex items-center justify-center gap-1 mt-3.5 text-xs font-bold">
                  <span>Trend vs prev period:</span>
                  {trendChange > 0 ? (
                    <span className="text-emerald-400 flex items-center gap-0.5">
                      <TrendingUp className="w-3.5 h-3.5" /> +{trendChange} pts
                    </span>
                  ) : trendChange < 0 ? (
                    <span className="text-red-400 flex items-center gap-0.5">
                      <TrendingDown className="w-3.5 h-3.5" /> {trendChange} pts
                    </span>
                  ) : (
                    <span className="text-purple-300 font-bold">No change</span>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Core Metric breakdowns */}
          <div className="lg:col-span-2 space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Task Completion */}
              <div className="p-4 bg-[#2D1B5A]/80 border border-purple-500/20 rounded-2xl flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-purple-300 tracking-wider">Task Completion</span>
                    <h4 className="text-2xl font-black">
                      {currentCalculation.breakdown.taskCompletionScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.taskCompletionScore}%`}
                    </h4>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                    <CheckCircle2 className="w-4 h-4 text-blue-300" />
                  </div>
                </div>
                <div className="mt-4 text-[11px] text-purple-300/80">
                  Completed <span className="font-bold text-white">{currentCalculation.breakdown.completedTasksCount}</span> of <span className="font-bold text-white">{currentCalculation.breakdown.assignedTasksCount}</span> assigned tasks.
                </div>
                <div className="w-full bg-[#1A0B36] h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(0, currentCalculation.breakdown.taskCompletionScore)}%` }}
                  />
                </div>
              </div>

              {/* On-Time Completion */}
              <div className="p-4 bg-[#2D1B5A]/80 border border-purple-500/20 rounded-2xl flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-purple-300 tracking-wider">On-Time completion</span>
                    <h4 className="text-2xl font-black">
                      {currentCalculation.breakdown.onTimeCompletionScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.onTimeCompletionScore}%`}
                    </h4>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-[#7C3AED]/20 flex items-center justify-center border border-purple-500/30">
                    <Clock className="w-4 h-4 text-purple-300" />
                  </div>
                </div>
                <div className="mt-4 text-[11px] text-purple-300/80">
                  <span className="font-bold text-white">{currentCalculation.breakdown.onTimeTasksCount}</span> tasks completed on or before due date.
                </div>
                <div className="w-full bg-[#1A0B36] h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-[#7C3AED] h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(0, currentCalculation.breakdown.onTimeCompletionScore)}%` }}
                  />
                </div>
              </div>

              {/* Task Quality / TL Approval */}
              <div className="p-4 bg-[#2D1B5A]/80 border border-purple-500/20 rounded-2xl flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-purple-300 tracking-wider">Quality & Approvals</span>
                    <h4 className="text-2xl font-black">
                      {currentCalculation.breakdown.qualityScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.qualityScore}%`}
                    </h4>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                    <Award className="w-4 h-4 text-emerald-300" />
                  </div>
                </div>
                <div className="mt-4 text-[11px] text-purple-300/80">
                  Approved: <span className="font-bold text-emerald-300">{currentCalculation.breakdown.approvedTasksCount}</span> • Revisions requested: <span className="font-bold text-red-300">{currentCalculation.breakdown.revisionRequiredTasksCount}</span>
                </div>
                <div className="w-full bg-[#1A0B36] h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(0, currentCalculation.breakdown.qualityScore)}%` }}
                  />
                </div>
              </div>

              {/* Attendance & Punctuality */}
              <div className="p-4 bg-[#2D1B5A]/80 border border-purple-500/20 rounded-2xl flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] font-extrabold uppercase text-purple-300 tracking-wider">Attendance Punctuality</span>
                    <h4 className="text-2xl font-black">
                      {currentCalculation.breakdown.punctualityScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.punctualityScore}%`}
                    </h4>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                    <UserCheck className="w-4 h-4 text-amber-300" />
                  </div>
                </div>
                <div className="mt-4 text-[11px] text-purple-300/80">
                  Checked-in: <span className="font-bold text-white">{currentCalculation.breakdown.attendanceDaysCount} days</span> • Late arrivals: <span className="font-bold text-amber-400">{currentCalculation.breakdown.lateArrivalsCount}</span>
                </div>
                <div className="w-full bg-[#1A0B36] h-1.5 rounded-full mt-2.5 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${Math.max(0, currentCalculation.breakdown.punctualityScore)}%` }}
                  />
                </div>
              </div>

            </div>

            {/* Workload Handling Bar */}
            <div className="p-4 bg-[#2D1B5A]/80 border border-purple-500/20 rounded-2xl">
              <div className="flex justify-between items-center mb-1">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-purple-300 tracking-wider">Workload Capacity Handling</span>
                  <p className="text-xs text-purple-300/70">Normalized task workload density ratio</p>
                </div>
                <h4 className="text-xl font-black">
                  {currentCalculation.breakdown.workloadScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.workloadScore}%`}
                </h4>
              </div>
              <div className="w-full bg-[#1A0B36] h-2.5 rounded-full mt-2 overflow-hidden">
                <div 
                  className="bg-purple-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${Math.max(0, currentCalculation.breakdown.workloadScore)}%` }}
                />
              </div>
              
              {/* Detailed Penalties & Offline indicators */}
              <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-purple-500/10 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span>Overdue penalty:</span>
                  <span className="text-red-300">-{currentCalculation.breakdown.overduePenalty} pts</span>
                  <span className="text-[9px] text-purple-300/60 font-mono">({currentCalculation.breakdown.overdueTasksCount} tasks)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <span>Revision penalty:</span>
                  <span className="text-red-300">-{currentCalculation.breakdown.revisionPenalty} pts</span>
                  <span className="text-[9px] text-purple-300/60 font-mono">({currentCalculation.breakdown.totalRevisionRequests} revs)</span>
                </div>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* 4. Action Buttons (Save snapshot / Export Report) */}
      {currentCalculation && selectedEmployeeCode && (
        <div className="flex gap-3 justify-end print:hidden">
          <button 
            onClick={handleExportReport}
            disabled={reportState === 'preparing'}
            className={`flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl border font-bold text-xs transition-all duration-200 active:scale-[0.97] ${
              reportState === 'preparing'
                ? 'bg-[#2D1B5A]/50 border-purple-500/10 text-purple-300/60 cursor-not-allowed'
                : reportState === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'border-purple-500/30 bg-[#2D1B5A] text-purple-200 hover:bg-[#3B2673]'
            }`}
          >
            {reportState === 'preparing' ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                <span>Preparing Report…</span>
              </>
            ) : reportState === 'success' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Report Ready</span>
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" /> 
                <span>Print Report Sheet</span>
              </>
            )}
          </button>
          
          {/* Allow SuperAdmin, Admin, or Team Leader to lock snapshot */}
          {(isAdmin || isTeamLeader) && (
            <button 
              onClick={handleSaveSnapshot}
              className="flex items-center gap-1.5 px-4.5 py-2.5 rounded-xl bg-[#7C3AED] text-white font-black text-xs hover:bg-[#6D28D9] shadow-lg shadow-purple-500/20 active:scale-[0.97] transition-all"
            >
              <Check className="w-4 h-4" /> Lock Historical Snapshot
            </button>
          )}
        </div>
      )}

      {/* Report Generation Modal Overlay */}
      {reportState !== 'idle' && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4 print:hidden">
          <div className="bg-[#211044] border border-purple-500/30 rounded-[28px] max-w-md w-full p-6 shadow-[0_20px_50px_rgba(0,0,0,0.6)] text-center space-y-5">
            
            {reportState === 'preparing' && (
              <div className="py-6 space-y-4">
                <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin mx-auto" />
                <h3 className="text-base font-black text-white">Preparing Report Sheet...</h3>
                <p className="text-xs text-purple-300/80 leading-relaxed max-w-xs mx-auto">
                  Compiling real-time task logs, approvals, penalties, and punctuality indexes into an official EXFIN OMS PDF sheet.
                </p>
              </div>
            )}

            {reportState === 'success' && (
              <div className="space-y-4">
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-white">Report Successfully Compiled!</h3>
                <p className="text-xs text-purple-300/80 leading-relaxed">
                  The efficiency evaluation sheet for <strong className="text-white">{selectedEmployee?.name || 'the employee'}</strong> has been generated offline.
                </p>
                
                <div className="bg-[#2D1B5A]/60 rounded-xl p-3 text-left border border-purple-500/15">
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-purple-300">Total Score:</span>
                    <span className="font-black text-white">{currentCalculation?.finalScore} / 100</span>
                  </div>
                  <div className="flex justify-between text-xs py-1">
                    <span className="text-purple-300">Grade Level:</span>
                    <span className="font-bold text-[#A78BFA]">{currentCalculation?.grade}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => {
                      if (generatedPdfUrl) {
                        // Re-trigger print preview
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = generatedPdfUrl;
                        document.body.appendChild(iframe);
                        iframe.onload = () => {
                          setTimeout(() => {
                            try {
                              iframe.contentWindow?.focus();
                              iframe.contentWindow?.print();
                            } catch (printErr) {
                              console.warn('Manual iframe printing blocked or failed:', printErr);
                            } finally {
                              setTimeout(() => {
                                try {
                                  document.body.removeChild(iframe);
                                } catch (e) {}
                              }, 5000);
                            }
                          }, 300);
                        };
                      }
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-[#7C3AED] text-white font-black text-xs hover:bg-[#6D28D9] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-purple-500/20"
                  >
                    <Printer className="w-4 h-4" /> Open System Print Dialog
                  </button>
                  
                  <button
                    onClick={() => {
                      if (generatedPdfBlob) {
                        // Standard offline anchor-trigger download
                        const link = document.createElement('a');
                        link.href = generatedPdfUrl || '';
                        link.download = `EXFIN_OMS_Report_${selectedEmployeeCode}_${startDate}_to_${endDate}.pdf`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-[#2D1B5A] text-purple-200 border border-purple-500/20 font-bold text-xs hover:bg-[#3B2673] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                  >
                    <Download className="w-4 h-4" /> Save / Download PDF Fallback
                  </button>

                  <button
                    onClick={() => {
                      setReportState('idle');
                      setGeneratedPdfBlob(null);
                      if (generatedPdfUrl) {
                        URL.revokeObjectURL(generatedPdfUrl);
                        setGeneratedPdfUrl(null);
                      }
                    }}
                    className="w-full py-2.5 text-purple-300/70 hover:text-purple-200 font-bold text-xs transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {reportState === 'failure' && (
              <div className="space-y-4">
                <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto text-rose-400">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-base font-black text-white">Report Compilation Failed</h3>
                <p className="text-xs text-rose-300 leading-relaxed px-2">
                  {reportError || 'The PDF engine was unable to compile the metrics layout.'}
                </p>
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setReportState('idle');
                      setReportError(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[#2D1B5A] text-purple-300 font-bold text-xs border border-purple-500/15 hover:bg-[#3B2673]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExportReport}
                    className="flex-1 py-2.5 rounded-xl bg-[#7C3AED] text-white font-black text-xs hover:bg-[#6D28D9]"
                  >
                    Retry Compile
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* 5. Historical Snapshots & Leaderboard Tabbed Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:hidden">
        
        {/* Leaderboard (Privacy-compliant) */}
        <div className="lg:col-span-2 bg-[#211044]/80 rounded-[22px] border border-purple-500/20 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-purple-500/25 pb-3">
            <h3 className="text-sm font-black text-white flex items-center gap-1.5">
              <Award className="w-4 h-4 text-yellow-400" /> 
              {isAdmin ? 'Corporate Leaderboard' : isTeamLeader ? 'My Team Ranking' : 'My Score Standing'}
            </h3>
            <span className="text-[10px] text-purple-300 font-mono">{startDate} - {endDate}</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {leaderboard.map((item, index) => {
              const isSelf = item.employee.employeeCode === activeEmployeeCode;
              return (
                <div 
                  key={item.employee.id}
                  onClick={() => {
                    if (isAdmin || isTeamLeader) {
                      setSelectedEmployeeCode(item.employee.employeeCode);
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelf ? 'bg-[#7C3AED]/20 border-purple-500/50' : 'bg-[#2D1B5A]/40 border-purple-500/10 hover:bg-[#2D1B5A]/60'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-black text-xs text-purple-300">
                      #{index + 1}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold flex items-center gap-1">
                        {item.employee.name}
                        {isSelf && <span className="text-[9px] bg-[#7C3AED]/50 text-purple-200 px-1.5 rounded">You</span>}
                      </h4>
                      <p className="text-[10px] text-purple-300/60 font-mono">{item.employee.employeeCode} • {item.employee.department || 'Operations'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-xs font-black block">{item.score} pts</span>
                      <span className="text-[9px] text-purple-300/50 font-bold uppercase">{item.grade}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-purple-300/40" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Historical Snapshots */}
        <div className="bg-[#211044]/80 rounded-[22px] border border-purple-500/20 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-purple-500/25 pb-3">
            <h3 className="text-sm font-black text-white">Historical Snapshots</h3>
            <span className="text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">Archive</span>
          </div>

          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {historicalSnapshots.length === 0 ? (
              <div className="py-8 text-center text-xs text-purple-300/50 font-bold">
                No historical snapshots archived yet
              </div>
            ) : (
              historicalSnapshots.map(snap => (
                <div 
                  key={snap.id} 
                  className="p-3 bg-[#2D1B5A]/40 rounded-xl border border-purple-500/10 text-xs flex justify-between items-center"
                >
                  <div>
                    <h4 className="font-bold">{snap.periodType} Efficiency</h4>
                    <p className="text-[10px] font-mono text-purple-300/50">{snap.periodStart} - {snap.periodEnd}</p>
                    <p className="text-[9px] text-purple-300/40 mt-1">Weights: TC:{snap.weightagesUsed?.taskCompletion || 0}%, Q:{snap.weightagesUsed?.quality || 0}%</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-[#A78BFA] block">{snap.finalScore}</span>
                    <span className="text-[9px] font-black uppercase text-purple-300/60">{snap.grade}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 6. Admin Weightages Management Panel */}
      {isAdmin && (
        <Card className="p-6 bg-[#211044]/90 border border-purple-500/30 rounded-[22px] print:hidden">
          <div className="flex items-center justify-between border-b border-purple-500/20 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-300" />
              <h3 className="text-sm font-black">Weightage Administration</h3>
            </div>
            <span className="text-[9px] font-extrabold bg-[#7C3AED]/20 text-purple-200 px-2 py-0.5 rounded-full border border-purple-500/30 uppercase">
              AUTHORIZED ROLE REQUIRED
            </span>
          </div>

          <form onSubmit={handleSaveWeightages} className="space-y-4 text-xs font-semibold">
            {weightsError && (
              <div className="p-2.5 bg-red-950/40 border border-red-500/30 text-red-200 rounded-xl flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>{weightsError}</span>
              </div>
            )}
            
            {weightsSuccess && (
              <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 rounded-xl flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Efficiency weightages saved successfully!</span>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] text-purple-300 uppercase block">Task Completion (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100"
                  value={adminWeights.taskCompletion}
                  onChange={(e) => setAdminWeights({ ...adminWeights, taskCompletion: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 rounded-xl bg-[#2D1B5A] border border-purple-500/20 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-purple-300 uppercase block">On-Time Completion (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100"
                  value={adminWeights.onTimeCompletion}
                  onChange={(e) => setAdminWeights({ ...adminWeights, onTimeCompletion: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 rounded-xl bg-[#2D1B5A] border border-purple-500/20 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-purple-300 uppercase block">Task Quality (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100"
                  value={adminWeights.quality}
                  onChange={(e) => setAdminWeights({ ...adminWeights, quality: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 rounded-xl bg-[#2D1B5A] border border-purple-500/20 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-purple-300 uppercase block">Punctuality (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100"
                  value={adminWeights.punctuality}
                  onChange={(e) => setAdminWeights({ ...adminWeights, punctuality: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 rounded-xl bg-[#2D1B5A] border border-purple-500/20 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-purple-300 uppercase block">Workload (%)</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100"
                  value={adminWeights.workload}
                  onChange={(e) => setAdminWeights({ ...adminWeights, workload: parseInt(e.target.value) || 0 })}
                  className="w-full p-2 rounded-xl bg-[#2D1B5A] border border-purple-500/20 focus:outline-none focus:ring-1 focus:ring-[#7C3AED]"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] text-purple-300/80">
                Sum of weightages: <span className={`font-black ${adminWeights.taskCompletion + adminWeights.onTimeCompletion + adminWeights.quality + adminWeights.punctuality + adminWeights.workload === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {adminWeights.taskCompletion + adminWeights.onTimeCompletion + adminWeights.quality + adminWeights.punctuality + adminWeights.workload}%
                </span> (must be exactly 100%)
              </span>

              <div className="flex gap-2">
                <button 
                  type="button" 
                  onClick={handleResetWeights}
                  className="px-4 py-1.5 rounded-xl border border-purple-500/30 bg-[#2D1B5A] font-bold text-[11px] text-purple-200 hover:bg-[#3B2673]"
                >
                  Reset Default
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-1.5 rounded-xl bg-[#7C3AED] text-white font-black text-[11px] hover:bg-[#6D28D9]"
                >
                  Save Configuration
                </button>
              </div>
            </div>
          </form>
        </Card>
      )}

      {/* 7. PRINT ONLY: Static Report Sheet */}
      <div className="hidden print:block bg-white text-slate-900 p-8 space-y-6 text-sm rounded-none border-none">
        <div className="text-center pb-6 border-b border-slate-300">
          <h1 className="text-2xl font-black uppercase text-purple-950 tracking-wider">EXFIN OMS ENTERPRISE v6.0</h1>
          <h2 className="text-lg font-extrabold text-slate-700">EMPLOYEE EFFICIENCY SHEET</h2>
          <p className="text-xs text-slate-500 font-mono mt-1">Generated: {new Date().toLocaleDateString()} • System Synced</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-200">
          <div>
            <p><span className="font-bold">Employee Name:</span> {selectedEmployee?.name || 'N/A'}</p>
            <p><span className="font-bold">Employee Code:</span> {selectedEmployee?.employeeCode || 'N/A'}</p>
            <p><span className="font-bold">Department:</span> {selectedEmployee?.department || 'Operations'}</p>
          </div>
          <div className="text-right">
            <p><span className="font-bold">Rating Period:</span> {startDate} to {endDate}</p>
            <p><span className="font-bold">Format Type:</span> {periodType} Report</p>
            <p><span className="font-bold">Team Leader:</span> {selectedEmployee?.teamLeaderName || 'None'}</p>
          </div>
        </div>

        {currentCalculation && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-4 bg-slate-100 rounded-xl">
              <div>
                <span className="text-xs font-black uppercase text-slate-500">Overall Efficiency Score</span>
                <h3 className="text-4xl font-black text-purple-950 leading-none mt-1">{currentCalculation.finalScore} / 100</h3>
              </div>
              <div className="text-right">
                <span className="text-xs font-black uppercase text-slate-500">Grade Standing</span>
                <h3 className="text-2xl font-black text-emerald-700 leading-none mt-1">{currentCalculation.grade}</h3>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-base text-slate-800 border-b pb-1">Performance Breakdowns</h4>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-left text-xs font-bold text-slate-600">
                    <th className="p-2 border">Weighted Factors</th>
                    <th className="p-2 border text-center">Score Ratio</th>
                    <th className="p-2 border text-center">Config Weight</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-2 border font-bold">Task Completion</td>
                    <td className="p-2 border text-center font-mono">{currentCalculation.breakdown.taskCompletionScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.taskCompletionScore}%`}</td>
                    <td className="p-2 border text-center font-mono">{weightages.taskCompletion}%</td>
                  </tr>
                  <tr>
                    <td className="p-2 border font-bold">On-Time Completion</td>
                    <td className="p-2 border text-center font-mono">{currentCalculation.breakdown.onTimeCompletionScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.onTimeCompletionScore}%`}</td>
                    <td className="p-2 border text-center font-mono">{weightages.onTimeCompletion}%</td>
                  </tr>
                  <tr>
                    <td className="p-2 border font-bold">Quality & Approval Ratings</td>
                    <td className="p-2 border text-center font-mono">{currentCalculation.breakdown.qualityScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.qualityScore}%`}</td>
                    <td className="p-2 border text-center font-mono">{weightages.quality}%</td>
                  </tr>
                  <tr>
                    <td className="p-2 border font-bold">Punctuality & Check-ins</td>
                    <td className="p-2 border text-center font-mono">{currentCalculation.breakdown.punctualityScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.punctualityScore}%`}</td>
                    <td className="p-2 border text-center font-mono">{weightages.punctuality}%</td>
                  </tr>
                  <tr>
                    <td className="p-2 border font-bold">Workload Handling Capacity</td>
                    <td className="p-2 border text-center font-mono">{currentCalculation.breakdown.workloadScore === -1 ? 'NO DATA' : `${currentCalculation.breakdown.workloadScore}%`}</td>
                    <td className="p-2 border text-center font-mono">{weightages.workload}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
              <div>
                <h5 className="font-bold text-slate-800">Assigned Penalties</h5>
                <p>• Overdue tasks penalty: <span className="text-red-700 font-bold">-{currentCalculation.breakdown.overduePenalty} pts</span> ({currentCalculation.breakdown.overdueTasksCount} overdue)</p>
                <p>• Repeated revision penalty: <span className="text-red-700 font-bold">-{currentCalculation.breakdown.revisionPenalty} pts</span> ({currentCalculation.breakdown.totalRevisionRequests} revisions)</p>
              </div>

              <div>
                <h5 className="font-bold text-slate-800 text-right">Sign-off Signatures</h5>
                <div className="flex justify-between items-end h-14 mt-2">
                  <div className="text-center w-1/2">
                    <div className="border-b border-slate-400 mx-2"></div>
                    <span className="text-[10px] text-slate-500">Employee Signature</span>
                  </div>
                  <div className="text-center w-1/2">
                    <div className="border-b border-slate-400 mx-2"></div>
                    <span className="text-[10px] text-slate-500">Manager Sign-off</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
