import React, { useState, useEffect } from 'react';
import { db } from '../../services/firebase/config';
import { collection, doc, setDoc, getDocs, onSnapshot, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import {
  calculatePresentDays,
  getLeaveYear,
  SalaryRecord,
  SalaryEmployeeConfig,
  SalaryLeaveAudit,
  PresentDaysResult
} from '../../services/salary/salaryService';
import {
  Calculator,
  Calendar,
  Coins,
  Check,
  RefreshCw,
  UserCheck,
  AlertCircle,
  User,
  Edit2,
  Save,
  Download,
  Info,
  Sliders,
  AlertTriangle,
  History,
  FileSpreadsheet
} from 'lucide-react';

interface EmployeeWithSalary {
  id: string; // registration doc ID
  employeeCode: string;
  name: string;
  office: string;
  status: string;
  baseSalary: number; // monthly base salary
}

export const SalaryManagementTab: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeWithSalary[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<Record<string, SalaryRecord>>({}); // keyed by ${employeeCode}
  
  // Custom salary configs from DB (salary_employee_configs), keyed by employeeCode
  const [employeeConfigs, setEmployeeConfigs] = useState<Record<string, SalaryEmployeeConfig>>({});
  
  // Paid leave audit records for the selected leave year, keyed by employeeCode -> list of audits
  const [leaveAudits, setLeaveAudits] = useState<Record<string, SalaryLeaveAudit[]>>({});
  
  // Attendance records for the selected month prefix
  const [attendanceRecords, setAttendanceRecords] = useState<Record<string, any[]>>({}); // keyed by employeeCode
  
  // Approved leaves covering the selected month
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<any[]>([]);

  // Selected Month & Year
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  
  // Local input overrides for editable salary fields, keyed by employeeCode -> string representation
  const [overrideBaseSalaries, setOverrideBaseSalaries] = useState<Record<string, string>>({});
  const [overridePaidLeaves, setOverridePaidLeaves] = useState<Record<string, string>>({});
  const [overrideAdvances, setOverrideAdvances] = useState<Record<string, string>>({});
  const [overrideLateFines, setOverrideLateFines] = useState<Record<string, string>>({});

  // Loading and Action statuses
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals / Overlays state
  const [selectedBreakdownCode, setSelectedBreakdownCode] = useState<string | null>(null);
  const [selectedConfigCode, setSelectedConfigCode] = useState<string | null>(null);
  const [selectedAuditCode, setSelectedAuditCode] = useState<string | null>(null);

  // Config modal fields
  const [configBaseSalary, setConfigBaseSalary] = useState<string>('');
  const [configAllocatedLeaves, setConfigAllocatedLeaves] = useState<string>('22');

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  // Derived Values
  const leaveYear = getLeaveYear(selectedMonth, selectedYear);
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  // Show temporary notifications
  const triggerNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // 1. Fetch Approved Employees from Registrations
  useEffect(() => {
    if (!db) return;
    const q = query(collection(db, 'registrations'), where('status', '==', 'Approved'));
    const unsub = onSnapshot(q, (snap) => {
      const list: EmployeeWithSalary[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          employeeCode: data.employeeCode || '',
          name: data.name || '',
          office: data.office || 'Raniganj',
          status: data.status || 'Approved',
          baseSalary: typeof data.baseSalary === 'number' ? data.baseSalary : 0,
        });
      });
      list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
      setEmployees(list);
    });

    return () => unsub();
  }, []);

  // 2. Fetch and synchronize core calculation inputs whenever Selected Period changes
  useEffect(() => {
    if (!db || employees.length === 0) return;

    let active = true;
    setLoading(true);

    const loadData = async () => {
      try {
        const monthStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
        const startOfPrefix = `${selectedYear}-${monthStr}-01`;
        const endOfPrefix = `${selectedYear}-${monthStr}-${daysInMonth}`;

        // A. Load existing saved salaries
        const qSalaries = query(
          collection(db, 'salaries'),
          where('month', '==', selectedMonth),
          where('year', '==', selectedYear)
        );
        const salSnap = await getDocs(qSalaries);
        const salMap: Record<string, SalaryRecord> = {};
        salSnap.forEach((d) => {
          const s = d.data() as SalaryRecord;
          salMap[s.employeeCode] = s;
        });

        // B. Load Salary Employee Configs for current Leave Year
        const qConfigs = query(
          collection(db, 'salary_employee_configs'),
          where('leaveYear', '==', leaveYear)
        );
        const configSnap = await getDocs(qConfigs);
        const configMap: Record<string, SalaryEmployeeConfig> = {};
        configSnap.forEach((d) => {
          const cfg = d.data() as SalaryEmployeeConfig;
          configMap[cfg.employeeCode] = cfg;
        });

        // C. Load Salary Leave Audits for current Leave Year
        const qAudits = query(
          collection(db, 'salary_leave_audits'),
          where('leaveYear', '==', leaveYear)
        );
        const auditSnap = await getDocs(qAudits);
        const auditMap: Record<string, SalaryLeaveAudit[]> = {};
        auditSnap.forEach((d) => {
          const audit = d.data() as SalaryLeaveAudit;
          if (!auditMap[audit.employeeCode]) {
            auditMap[audit.employeeCode] = [];
          }
          auditMap[audit.employeeCode].push(audit);
        });

        // D. Load Attendance records covering this month
        const qAtt = query(
          collection(db, 'attendance'),
          where('date', '>=', startOfPrefix),
          where('date', '<=', endOfPrefix)
        );
        const attSnap = await getDocs(qAtt);
        const attMap: Record<string, any[]> = {};
        attSnap.forEach((d) => {
          const data = d.data();
          const empCode = data.employeeId || data.employeeCode || '';
          if (empCode) {
            if (!attMap[empCode]) {
              attMap[empCode] = [];
            }
            attMap[empCode].push(data);
          }
        });

        // E. Load Approved Leave requests covering this month
        // We fetch all approved leaves and filter overlap in-memory
        const qLeaves = query(collection(db, 'leaves'), where('status', '==', 'APPROVED'));
        const leaveSnap = await getDocs(qLeaves);
        const leavesList: any[] = [];
        leaveSnap.forEach((d) => {
          const l = d.data();
          // Overlap check
          const start = l.startDate || '';
          const end = l.endDate || '';
          const isOverlap = (start <= endOfPrefix && end >= startOfPrefix);
          if (isOverlap) {
            leavesList.push(l);
          }
        });

        const baseSalMap: Record<string, string> = {};
        const paidLeaveMap: Record<string, string> = {};
        const advanceMap: Record<string, string> = {};
        const lateFineMap: Record<string, string> = {};

        employees.forEach((emp) => {
          const cfg = configMap[emp.employeeCode];
          const sal = salMap[emp.employeeCode];

          baseSalMap[emp.employeeCode] = cfg && cfg.baseSalary !== undefined
            ? cfg.baseSalary.toString()
            : (emp.baseSalary || 0).toString();

          paidLeaveMap[emp.employeeCode] = cfg && cfg.allocatedPaidLeaves !== undefined
            ? cfg.allocatedPaidLeaves.toString()
            : '22';

          advanceMap[emp.employeeCode] = sal && sal.advance !== undefined
            ? sal.advance.toString()
            : '0';

          lateFineMap[emp.employeeCode] = sal && sal.lateFine !== undefined
            ? sal.lateFine.toString()
            : '0';
        });

        if (active) {
          setSalaryRecords(salMap);
          setEmployeeConfigs(configMap);
          setLeaveAudits(auditMap);
          setAttendanceRecords(attMap);
          setApprovedLeaveRequests(leavesList);
          setOverrideBaseSalaries((prev) => ({
            ...baseSalMap,
            ...prev
          }));
          setOverridePaidLeaves((prev) => ({
            ...paidLeaveMap,
            ...prev
          }));
          setOverrideAdvances((prev) => ({
            ...advanceMap,
            ...prev
          }));
          setOverrideLateFines((prev) => ({
            ...lateFineMap,
            ...prev
          }));
        }
      } catch (err) {
        console.error('Error fetching salary calculation parameters:', err);
        triggerNotification('error', 'Failed to synchronize salary parameters with Firebase.');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [employees, selectedMonth, selectedYear, leaveYear, daysInMonth]);

  // Helper: Retrieve base salary for an employee (priority: Config -> Registration -> 0)
  const getBaseSalary = (emp: EmployeeWithSalary): number => {
    const config = employeeConfigs[emp.employeeCode];
    if (config && config.baseSalary !== undefined) {
      return config.baseSalary;
    }
    return emp.baseSalary || 0;
  };

  // Helper: Retrieve allocated paid leaves (priority: Config -> 22)
  const getAllocatedLeaves = (emp: EmployeeWithSalary): number => {
    const config = employeeConfigs[emp.employeeCode];
    return config ? config.allocatedPaidLeaves : 22;
  };

  // Helper: Calculate remaining paid leaves for an employee
  const getRemainingLeaves = (emp: EmployeeWithSalary): number => {
    const paidLeaveStr = overridePaidLeaves[emp.employeeCode];
    const allocated = paidLeaveStr !== undefined ? parseInt(paidLeaveStr, 10) || 0 : getAllocatedLeaves(emp);
    const audits = leaveAudits[emp.employeeCode] || [];
    return Math.max(0, allocated - audits.length);
  };

  // Helper: Execute calculations for an employee using the editable local states
  const getCalculationResult = (emp: EmployeeWithSalary): PresentDaysResult => {
    const paidLeaveStr = overridePaidLeaves[emp.employeeCode];
    const allocated = paidLeaveStr !== undefined ? parseInt(paidLeaveStr, 10) || 0 : getAllocatedLeaves(emp);
    const atts = attendanceRecords[emp.employeeCode] || [];
    const audits = leaveAudits[emp.employeeCode] || [];
    return calculatePresentDays(
      emp.employeeCode,
      selectedMonth,
      selectedYear,
      allocated,
      atts,
      approvedLeaveRequests,
      audits
    );
  };

  // Find cut-off date for displaying in the screen
  const getCutOffDateDisplayStr = (): string => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const padZero = (n: number) => String(n).padStart(2, '0');
    const yesterdayStr = `${yesterday.getFullYear()}-${padZero(yesterday.getMonth() + 1)}-${padZero(yesterday.getDate())}`;
    
    const lastDayOfSelectedMonthStr = `${selectedYear}-${padZero(selectedMonth)}-${padZero(daysInMonth)}`;
    const cutOffDateStr = lastDayOfSelectedMonthStr < yesterdayStr ? lastDayOfSelectedMonthStr : yesterdayStr;

    try {
      const parts = cutOffDateStr.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) {
      return cutOffDateStr;
    }
  };

  // Open settings modal for an employee
  const handleOpenConfigModal = (emp: EmployeeWithSalary) => {
    setSelectedConfigCode(emp.employeeCode);
    const currentBaseSalary = getBaseSalary(emp);
    const currentAllocated = getAllocatedLeaves(emp);
    
    setConfigBaseSalary(currentBaseSalary > 0 ? currentBaseSalary.toString() : '');
    setConfigAllocatedLeaves(currentAllocated.toString());
  };

  // Save Settings Modal
  const handleSaveConfig = async () => {
    if (!db || !selectedConfigCode) return;

    const emp = employees.find(e => e.employeeCode === selectedConfigCode);
    if (!emp) return;

    const parsedBase = parseFloat(configBaseSalary);
    const parsedAllocated = parseInt(configAllocatedLeaves, 10);

    if (isNaN(parsedBase) || parsedBase <= 0) {
      triggerNotification('error', 'Gross/Base Salary is required and must be a valid positive number.');
      return;
    }

    if (isNaN(parsedAllocated) || parsedAllocated < 0) {
      triggerNotification('error', 'Paid Leave Allocation must be a non-negative integer.');
      return;
    }

    setSavingId(selectedConfigCode);
    try {
      const configId = `${emp.employeeCode}_${leaveYear}`;
      const configDoc: SalaryEmployeeConfig = {
        id: configId,
        employeeCode: emp.employeeCode,
        leaveYear,
        baseSalary: parsedBase,
        allocatedPaidLeaves: parsedAllocated
      };

      // 1. Save config document
      await setDoc(doc(db, 'salary_employee_configs', configId), configDoc);

      // 2. Sync into employee's registration document to preserve existing baseSalary mapping
      await setDoc(doc(db, 'registrations', emp.id), { baseSalary: parsedBase }, { merge: true });

      // Update Local State
      setEmployeeConfigs(prev => ({
        ...prev,
        [emp.employeeCode]: configDoc
      }));

      // Update baseSalary in loaded list
      setEmployees(prev => prev.map(e => e.employeeCode === emp.employeeCode ? { ...e, baseSalary: parsedBase } : e));

      triggerNotification('success', `One-time salary configuration saved for ${emp.name}.`);
      setSelectedConfigCode(null);
    } catch (err) {
      console.error('Error saving salary configuration:', err);
      triggerNotification('error', 'Failed to save salary configuration.');
    } finally {
      setSavingId(null);
    }
  };

  // Generate / Regenerate single employee salary record
  const handleGenerateSalary = async (emp: EmployeeWithSalary) => {
    if (!db) return;

    const baseSalStr = overrideBaseSalaries[emp.employeeCode];
    const paidLeaveStr = overridePaidLeaves[emp.employeeCode];
    const advanceStr = overrideAdvances[emp.employeeCode];
    const lateFineStr = overrideLateFines[emp.employeeCode];

    // Check for blank/missing values
    if (!baseSalStr || baseSalStr.trim() === '') {
      triggerNotification('error', `Gross/Base Salary is required for ${emp.name}.`);
      return;
    }
    if (!paidLeaveStr || paidLeaveStr.trim() === '') {
      triggerNotification('error', `Paid Leave Allocation is required for ${emp.name}.`);
      return;
    }
    if (!advanceStr || advanceStr.trim() === '') {
      triggerNotification('error', `Advance is required for ${emp.name}. Enter ₹0 if there is no advance.`);
      return;
    }
    if (!lateFineStr || lateFineStr.trim() === '') {
      triggerNotification('error', `Late Fine is required. Enter ₹0 if there is no fine for ${emp.name}.`);
      return;
    }

    const baseSalary = parseFloat(baseSalStr);
    const allocatedPaidLeaves = parseInt(paidLeaveStr, 10);
    const advanceVal = parseFloat(advanceStr);
    const lateFineVal = parseFloat(lateFineStr);

    if (isNaN(baseSalary) || baseSalary <= 0) {
      triggerNotification('error', `Gross/Base Salary must be a valid positive number for ${emp.name}.`);
      return;
    }
    if (isNaN(allocatedPaidLeaves) || allocatedPaidLeaves < 0) {
      triggerNotification('error', `Paid Leave Allocation must be a valid non-negative integer for ${emp.name}.`);
      return;
    }
    if (isNaN(advanceVal) || advanceVal < 0) {
      triggerNotification('error', `Advance must be a valid non-negative number for ${emp.name}.`);
      return;
    }
    if (isNaN(lateFineVal) || lateFineVal < 0) {
      triggerNotification('error', `Late Fine must be a valid non-negative number for ${emp.name}.`);
      return;
    }

    setSavingId(emp.employeeCode);

    try {
      // Create local configs to save persistently
      const localConfig: SalaryEmployeeConfig = {
        id: `${emp.employeeCode}_${leaveYear}`,
        employeeCode: emp.employeeCode,
        leaveYear,
        baseSalary,
        allocatedPaidLeaves
      };

      const atts = attendanceRecords[emp.employeeCode] || [];
      const audits = leaveAudits[emp.employeeCode] || [];

      // 1. Calculate PRESENT-days & leave audits to add/remove
      const calcResult = calculatePresentDays(
        emp.employeeCode,
        selectedMonth,
        selectedYear,
        allocatedPaidLeaves,
        atts,
        approvedLeaveRequests,
        audits
      );

      const remainingLeaves = Math.max(
        0,
        allocatedPaidLeaves - (audits.filter(a => a.month !== selectedMonth).length + calcResult.paidLeaveDays)
      );

      // 2. Perform financial calculations
      const rawSalary = (baseSalary / daysInMonth) * calcResult.totalPresentDays;
      const salaryBeforeDeductions = Math.round(rawSalary * 100) / 100;
      const finalSalary = Math.max(0, Math.round((salaryBeforeDeductions - advanceVal - lateFineVal) * 100) / 100);

      const recordId = `${emp.employeeCode}_${selectedYear}_${selectedMonth}`;
      
      // Batch update for atomicity
      const batch = writeBatch(db);

      // A. Write Salary Record
      const salaryRec: SalaryRecord = {
        id: recordId,
        employeeCode: emp.employeeCode,
        employeeName: emp.name,
        month: selectedMonth,
        year: selectedYear,
        baseSalary,
        daysInMonth,
        officePresentDays: calcResult.officeDays,
        wfhDays: calcResult.wfhDays,
        clientVisitDays: calcResult.clientVisitDays,
        outdoorDays: calcResult.outdoorDays,
        paidLeaveDays: calcResult.paidLeaveDays,
        sundayHolidayDays: calcResult.sundayHolidayDays,
        totalPresentDays: calcResult.totalPresentDays,
        advance: advanceVal,
        lateDays: calcResult.lateDays,
        lateFine: lateFineVal,
        salaryBeforeDeductions,
        salaryBeforeAdvance: salaryBeforeDeductions, // compat
        finalSalary,
        generationTimestamp: new Date().toISOString(),
        allocatedPaidLeaves: allocatedPaidLeaves,
        usedPaidLeaves: calcResult.paidLeaveDays,
        remainingPaidLeaves: remainingLeaves,
        attendanceCutOffDate: calcResult.cutOffDateStr
      };
      batch.set(doc(db, 'salaries', recordId), salaryRec);

      // B. Save configuration doc persistently
      batch.set(doc(db, 'salary_employee_configs', localConfig.id), localConfig);

      // C. Sync into employee registration baseSalary
      batch.set(doc(db, 'registrations', emp.id), { baseSalary }, { merge: true });

      // D. Create Paid Leave Audits
      const newAudits = [...audits];

      for (const date of calcResult.datesConvertedToPaidLeave) {
        const auditId = `${emp.employeeCode}_${date}`;
        const auditRec: SalaryLeaveAudit = {
          id: auditId,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          date,
          month: selectedMonth,
          year: selectedYear,
          leaveYear,
          daysConsumed: 1,
          reason: 'salary attendance calculation'
        };
        batch.set(doc(db, 'salary_leave_audits', auditId), auditRec);
        newAudits.push(auditRec);
      }

      // E. Delete removed Paid Leave Audits
      for (const date of calcResult.datesRemovedFromPaidLeave) {
        const auditId = `${emp.employeeCode}_${date}`;
        batch.delete(doc(db, 'salary_leave_audits', auditId));
        const index = newAudits.findIndex(a => a.date === date);
        if (index > -1) {
          newAudits.splice(index, 1);
        }
      }

      // Commit Batch Transactionally
      await batch.commit();

      // Update local states immediately
      setSalaryRecords((prev) => ({
        ...prev,
        [emp.employeeCode]: salaryRec
      }));

      setEmployeeConfigs((prev) => ({
        ...prev,
        [emp.employeeCode]: localConfig
      }));

      setLeaveAudits((prev) => ({
        ...prev,
        [emp.employeeCode]: newAudits
      }));

      triggerNotification('success', `Salary generated successfully for ${emp.name}: ₹${finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    } catch (err) {
      console.error('Error generating salary record:', err);
      triggerNotification('error', `Failed to generate salary for ${emp.name}.`);
    } finally {
      setSavingId(null);
    }
  };

  // Batch generate salaries for all approved employees with valid configurations
  const handleGenerateAllSalaries = async () => {
    if (!db || employees.length === 0) return;

    // Validate that ALL employees have valid, populated configurations
    for (const emp of employees) {
      const baseSalStr = overrideBaseSalaries[emp.employeeCode];
      const paidLeaveStr = overridePaidLeaves[emp.employeeCode];
      const advanceStr = overrideAdvances[emp.employeeCode];
      const lateFineStr = overrideLateFines[emp.employeeCode];

      if (!baseSalStr || baseSalStr.trim() === '') {
        triggerNotification('error', `Gross/Base Salary is required for ${emp.name} before batch processing.`);
        return;
      }
      if (!paidLeaveStr || paidLeaveStr.trim() === '') {
        triggerNotification('error', `Paid Leave Allocation is required for ${emp.name} before batch processing.`);
        return;
      }
      if (!advanceStr || advanceStr.trim() === '') {
        triggerNotification('error', `Advance is required for ${emp.name} before batch processing. Enter ₹0 if there is no advance.`);
        return;
      }
      if (!lateFineStr || lateFineStr.trim() === '') {
        triggerNotification('error', `Late Fine is required for ${emp.name} before batch processing. Enter ₹0 if there is no fine.`);
        return;
      }

      const baseSalary = parseFloat(baseSalStr);
      const allocatedPaidLeaves = parseInt(paidLeaveStr, 10);
      const advanceVal = parseFloat(advanceStr);
      const lateFineVal = parseFloat(lateFineStr);

      if (isNaN(baseSalary) || baseSalary <= 0) {
        triggerNotification('error', `Gross/Base Salary must be a valid positive number for ${emp.name}.`);
        return;
      }
      if (isNaN(allocatedPaidLeaves) || allocatedPaidLeaves < 0) {
        triggerNotification('error', `Paid Leave Allocation must be a valid non-negative integer for ${emp.name}.`);
        return;
      }
      if (isNaN(advanceVal) || advanceVal < 0) {
        triggerNotification('error', `Advance must be a valid non-negative number for ${emp.name}.`);
        return;
      }
      if (isNaN(lateFineVal) || lateFineVal < 0) {
        triggerNotification('error', `Late Fine must be a valid non-negative number for ${emp.name}.`);
        return;
      }
    }

    const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
    const confirmMsg = `Are you sure you want to generate/re-calculate salaries for all approved employees for ${monthLabel} ${selectedYear}?`;
    if (!window.confirm(confirmMsg)) return;

    setBatchSaving(true);
    let successCount = 0;

    try {
      const batch = writeBatch(db);
      const updatedRecords = { ...salaryRecords };
      const updatedConfigs = { ...employeeConfigs };
      const updatedAudits = { ...leaveAudits };

      for (const emp of employees) {
        const baseSalary = parseFloat(overrideBaseSalaries[emp.employeeCode]);
        const allocatedPaidLeaves = parseInt(overridePaidLeaves[emp.employeeCode], 10);
        const advanceVal = parseFloat(overrideAdvances[emp.employeeCode]);
        const lateFineVal = parseFloat(overrideLateFines[emp.employeeCode]);

        const localConfig: SalaryEmployeeConfig = {
          id: `${emp.employeeCode}_${leaveYear}`,
          employeeCode: emp.employeeCode,
          leaveYear,
          baseSalary,
          allocatedPaidLeaves
        };

        const atts = attendanceRecords[emp.employeeCode] || [];
        const audits = leaveAudits[emp.employeeCode] || [];

        // 1. Calculate PRESENT Days
        const calcResult = calculatePresentDays(
          emp.employeeCode,
          selectedMonth,
          selectedYear,
          allocatedPaidLeaves,
          atts,
          approvedLeaveRequests,
          audits
        );

        const remainingLeaves = Math.max(
          0,
          allocatedPaidLeaves - (audits.filter(a => a.month !== selectedMonth).length + calcResult.paidLeaveDays)
        );

        // 2. Perform financial calculations
        const rawSalary = (baseSalary / daysInMonth) * calcResult.totalPresentDays;
        const salaryBeforeDeductions = Math.round(rawSalary * 100) / 100;
        const finalSalary = Math.max(0, Math.round((salaryBeforeDeductions - advanceVal - lateFineVal) * 100) / 100);

        const recordId = `${emp.employeeCode}_${selectedYear}_${selectedMonth}`;

        // A. Write Salary Record
        const salaryRec: SalaryRecord = {
          id: recordId,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          month: selectedMonth,
          year: selectedYear,
          baseSalary,
          daysInMonth,
          officePresentDays: calcResult.officeDays,
          wfhDays: calcResult.wfhDays,
          clientVisitDays: calcResult.clientVisitDays,
          outdoorDays: calcResult.outdoorDays,
          paidLeaveDays: calcResult.paidLeaveDays,
          sundayHolidayDays: calcResult.sundayHolidayDays,
          totalPresentDays: calcResult.totalPresentDays,
          advance: advanceVal,
          lateDays: calcResult.lateDays,
          lateFine: lateFineVal,
          salaryBeforeDeductions,
          salaryBeforeAdvance: salaryBeforeDeductions, // compat
          finalSalary,
          generationTimestamp: new Date().toISOString(),
          allocatedPaidLeaves: allocatedPaidLeaves,
          usedPaidLeaves: calcResult.paidLeaveDays,
          remainingPaidLeaves: remainingLeaves,
          attendanceCutOffDate: calcResult.cutOffDateStr
        };
        batch.set(doc(db, 'salaries', recordId), salaryRec);

        // B. Save Configuration doc persistently
        batch.set(doc(db, 'salary_employee_configs', localConfig.id), localConfig);

        // C. Sync into employee registration baseSalary
        batch.set(doc(db, 'registrations', emp.id), { baseSalary }, { merge: true });

        // D. Create Paid Leave Audits
        const auditsList = [...audits];

        for (const date of calcResult.datesConvertedToPaidLeave) {
          const auditId = `${emp.employeeCode}_${date}`;
          const auditRec: SalaryLeaveAudit = {
            id: auditId,
            employeeCode: emp.employeeCode,
            employeeName: emp.name,
            date,
            month: selectedMonth,
            year: selectedYear,
            leaveYear,
            daysConsumed: 1,
            reason: 'salary attendance calculation'
          };
          batch.set(doc(db, 'salary_leave_audits', auditId), auditRec);
          auditsList.push(auditRec);
        }

        // E. Delete removed Paid Leave Audits
        for (const date of calcResult.datesRemovedFromPaidLeave) {
          const auditId = `${emp.employeeCode}_${date}`;
          batch.delete(doc(db, 'salary_leave_audits', auditId));
          const idx = auditsList.findIndex(a => a.date === date);
          if (idx > -1) {
            auditsList.splice(idx, 1);
          }
        }

        updatedRecords[emp.employeeCode] = salaryRec;
        updatedConfigs[emp.employeeCode] = localConfig;
        updatedAudits[emp.employeeCode] = auditsList;
        successCount++;
      }

      await batch.commit();
      setSalaryRecords(updatedRecords);
      setEmployeeConfigs(updatedConfigs);
      setLeaveAudits(updatedAudits);
      triggerNotification('success', `Successfully generated/updated salaries for ${successCount} employees!`);
    } catch (err) {
      console.error('Error during batch salary generation:', err);
      triggerNotification('error', 'Batch salary generation failed.');
    } finally {
      setBatchSaving(false);
    }
  };

  // Client-side export to CSV
  const handleExportCSV = () => {
    if (employees.length === 0) return;

    const monthLabel = months.find(m => m.value === selectedMonth)?.label || '';
    
    // Header Row
    const headers = [
      'Employee Code',
      'Employee Name',
      'Month',
      'Year',
      'Gross/Base Salary',
      'Days in Month',
      'Office Present',
      'WFH',
      'Client Visit',
      'Outdoor Work',
      'Paid Leave Used',
      'Sunday/Holiday',
      'Total PRESENT Days',
      'Late Days',
      'Late Fine',
      'Salary Before Deductions',
      'Advance',
      'Final Salary',
      'Paid Leave Remaining',
      'Attendance Cut-off Date'
    ];

    const csvRows = [headers.join(',')];

    for (const emp of employees) {
      const baseSalary = parseFloat(overrideBaseSalaries[emp.employeeCode]) || 0;
      const advanceVal = parseFloat(overrideAdvances[emp.employeeCode]) || 0;
      const lateFineVal = parseFloat(overrideLateFines[emp.employeeCode]) || 0;
      const calcResult = getCalculationResult(emp);
      const remainingLeaves = getRemainingLeaves(emp);

      // Financials
      const rawSalary = baseSalary > 0 ? (baseSalary / daysInMonth) * calcResult.totalPresentDays : 0;
      const salaryBeforeDeductions = Math.round(rawSalary * 100) / 100;
      const finalSalary = Math.max(0, Math.round((salaryBeforeDeductions - advanceVal - lateFineVal) * 100) / 100);

      const row = [
        `"${emp.employeeCode}"`,
        `"${emp.name}"`,
        `"${monthLabel}"`,
        selectedYear,
        baseSalary,
        daysInMonth,
        calcResult.officeDays,
        calcResult.wfhDays,
        calcResult.clientVisitDays,
        calcResult.outdoorDays,
        calcResult.paidLeaveDays,
        calcResult.sundayHolidayDays,
        calcResult.totalPresentDays,
        calcResult.lateDays,
        lateFineVal,
        salaryBeforeDeductions,
        advanceVal,
        finalSalary,
        remainingLeaves,
        `"${calcResult.cutOffDateStr}"`
      ];

      csvRows.push(row.join(','));
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Salary_Export_${monthLabel}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerNotification('success', 'Salary spreadsheet exported successfully.');
  };

  return (
    <div className="space-y-6">
      {/* HEADER BAR AND FILTERS */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-[#2D1B5A] p-6 rounded-[24px] border border-purple-500/20 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-base font-black uppercase text-purple-200 tracking-wider flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" /> Salary Disbursal & Generation (Stage 2)
          </h2>
          <p className="text-xs text-purple-300/80">Configure base salaries, track auto-decrementing paid leaves, deduct advances, and process calculations.</p>
        </div>

        {/* Filters/Actions row */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Month Selector */}
          <div className="flex items-center gap-2 bg-[#1F0F3E] px-3 py-2 rounded-xl border border-purple-500/20">
            <Calendar className="w-4 h-4 text-purple-300" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-transparent text-white text-xs font-bold focus:outline-none border-none cursor-pointer"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#1F0F3E] text-white">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-2 bg-[#1F0F3E] px-3 py-2 rounded-xl border border-purple-500/20">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-white text-xs font-bold focus:outline-none border-none cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-[#1F0F3E] text-white">
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Export Action */}
          <button
            onClick={handleExportCSV}
            disabled={employees.length === 0}
            className="bg-[#1F0F3E] border border-purple-500/30 hover:border-purple-400 text-purple-200 hover:text-white px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors duration-200"
            title="Export calculations to CSV"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>

          {/* Generate All */}
          <Button
            size="sm"
            onClick={handleGenerateAllSalaries}
            disabled={loading || batchSaving || employees.length === 0}
            className="bg-amber-500 hover:bg-amber-400 text-black font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10 transition-transform active:scale-95 duration-100"
          >
            {batchSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Calculator className="w-3.5 h-3.5" />
            )}
            Process Configured ({employees.filter(e => getBaseSalary(e) > 0).length})
          </Button>
        </div>
      </div>

      {/* NOTIFICATION TOAST */}
      {notification && (
        <div className={`p-4 rounded-xl text-xs font-bold border flex items-center gap-3 transition-all ${
          notification.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* SUMMARY DASHBOARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Period Card */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block tracking-wider">Leave / Financial Year</span>
            <span className="text-sm font-black text-amber-300 font-mono">
              {leaveYear}
            </span>
            <span className="text-[10px] text-purple-300/60 block mt-1">
              {months.find((m) => m.value === selectedMonth)?.label} ({daysInMonth} Days)
            </span>
          </div>
          <div className="bg-[#1F0F3E] p-3 rounded-2xl border border-purple-500/10">
            <Calendar className="w-5 h-5 text-amber-400" />
          </div>
        </Card>

        {/* Generation Coverage */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block tracking-wider">Disbursal Progress</span>
            <span className="text-sm font-black text-emerald-400">
              {Object.keys(salaryRecords).length} / {employees.length} Generated
            </span>
            <span className="text-[10px] text-purple-300/60 block mt-1">
              Active approved employees list
            </span>
          </div>
          <div className="bg-[#1F0F3E] p-3 rounded-2xl border border-purple-500/10">
            <UserCheck className="w-5 h-5 text-emerald-400" />
          </div>
        </Card>

        {/* Total Advances */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block tracking-wider">Monthly Advance Claims</span>
            <span className="text-sm font-black text-amber-400">
              ₹{(Object.values(salaryRecords) as SalaryRecord[]).reduce((acc: number, curr: SalaryRecord) => acc + (curr.advance || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-purple-300/60 block mt-1">
              Deducted at source
            </span>
          </div>
          <div className="bg-[#1F0F3E] p-3 rounded-2xl border border-purple-500/10">
            <Coins className="w-5 h-5 text-amber-400" />
          </div>
        </Card>

        {/* Disbursed Amount */}
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block tracking-wider">Net Disbursal (Stage 2)</span>
            <span className="text-sm font-black text-white">
              ₹{(Object.values(salaryRecords) as SalaryRecord[]).reduce((acc: number, curr: SalaryRecord) => acc + (curr.finalSalary || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-purple-300/60 block mt-1">
              Paid gross - advance claims
            </span>
          </div>
          <div className="bg-[#1F0F3E] p-3 rounded-2xl border border-purple-500/10">
            <Coins className="w-5 h-5 text-purple-300" />
          </div>
        </Card>
      </div>

      {/* ATTENDANCE CALCULATION CUT-OFF ALERT BANNER */}
      <div className="bg-[#1F0F3E]/80 border border-amber-500/30 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-black uppercase text-amber-300 tracking-wider">Attendance Cut-Off Active</h4>
            <p className="text-[11px] text-purple-200/90 leading-relaxed mt-0.5">
              Salary calculations are limited to the previous completed day: <strong className="text-white font-mono">{getCutOffDateDisplayStr()}</strong>. Current day attendance records are never included in the salary run.
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 px-3 py-1 rounded-full shrink-0 font-mono">
          Through {getCutOffDateDisplayStr()}
        </span>
      </div>

      {/* CORE SALARY LISTING AND CALCULATION GRID */}
      <Card className="p-6 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[24px] shadow-2xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-10 h-10 animate-spin text-purple-400" />
              <p className="text-xs text-purple-200 font-medium">Synchronizing firestore attendance logs and balances...</p>
            </div>
          ) : employees.length === 0 ? (
            <div className="py-16 text-center text-purple-300/60 text-xs font-semibold">
              No approved employees found in registrations directory.
            </div>
          ) : (
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="bg-[#1F0F3E] text-purple-200 uppercase font-extrabold border-b border-purple-500/20">
                  <th className="p-2.5 rounded-l-xl">Employee</th>
                  <th className="p-2.5 text-center">Gross Salary</th>
                  <th className="p-2.5 text-center">Paid Leaves</th>
                  <th className="p-2.5 text-center">Days</th>
                  <th className="p-2.5 text-center">Office</th>
                  <th className="p-2.5 text-center">WFH</th>
                  <th className="p-2.5 text-center">Client</th>
                  <th className="p-2.5 text-center">Outdoor</th>
                  <th className="p-2.5 text-center">Paid Lve</th>
                  <th className="p-2.5 text-center">Sun/Hol</th>
                  <th className="p-2.5 text-center bg-purple-500/10">PRESENT</th>
                  <th className="p-2.5 text-center">Late Days</th>
                  <th className="p-2.5 text-center">Late Fine</th>
                  <th className="p-2.5 text-center">Advance</th>
                  <th className="p-2.5 text-right">Net Salary</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5 text-right rounded-r-xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {employees.map((emp) => {
                  const savedRecord = salaryRecords[emp.employeeCode];
                  const calcResult = getCalculationResult(emp);
                  const remainingLeaves = getRemainingLeaves(emp);

                  // Bind to live editable state overrides
                  const baseSalStr = overrideBaseSalaries[emp.employeeCode] || '0';
                  const baseSalary = parseFloat(baseSalStr) || 0;

                  const paidLeaveStr = overridePaidLeaves[emp.employeeCode] || '22';

                  const currentAdvanceValStr = overrideAdvances[emp.employeeCode] || '0';
                  const currentAdvanceVal = parseFloat(currentAdvanceValStr) || 0;

                  const currentLateFineStr = overrideLateFines[emp.employeeCode] || '0';
                  const currentLateFineVal = parseFloat(currentLateFineStr) || 0;

                  // Financial calculations
                  const rawSalary = baseSalary > 0 ? (baseSalary / daysInMonth) * calcResult.totalPresentDays : 0;
                  const salaryBeforeDeductions = Math.round(rawSalary * 100) / 100;
                  const finalSalary = Math.max(0, Math.round((salaryBeforeDeductions - currentAdvanceVal - currentLateFineVal) * 100) / 100);

                  const isUnconfigured = baseSalary <= 0;
                  const hasHighDeductions = (currentAdvanceVal + currentLateFineVal) > salaryBeforeDeductions;

                  return (
                    <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Employee Core */}
                      <td className="p-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1F0F3E] border border-purple-500/20 flex items-center justify-center">
                            <User className="w-3.5 h-3.5 text-purple-300" />
                          </div>
                          <div>
                            <span className="font-extrabold text-white block leading-tight">{emp.name}</span>
                            <span className="text-[9px] font-mono text-purple-300/70 block leading-none mt-0.5">{emp.employeeCode}</span>
                          </div>
                        </div>
                      </td>

                      {/* Gross Base Salary Input */}
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center bg-[#1F0F3E] border border-purple-500/20 rounded-lg p-1 w-20 mx-auto">
                          <span className="text-purple-400 font-extrabold text-[9px] mr-0.5">₹</span>
                          <input
                            type="number"
                            value={overrideBaseSalaries[emp.employeeCode] !== undefined ? overrideBaseSalaries[emp.employeeCode] : ''}
                            onChange={(e) => setOverrideBaseSalaries(prev => ({
                              ...prev,
                              [emp.employeeCode]: e.target.value
                            }))}
                            placeholder="Salary"
                            className="bg-transparent text-white text-xs font-bold w-full focus:outline-none text-center"
                            min="1"
                          />
                        </div>
                      </td>

                      {/* Paid Leave Allocation Input */}
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center bg-[#1F0F3E] border border-purple-500/20 rounded-lg p-1 w-12 mx-auto">
                          <input
                            type="number"
                            value={overridePaidLeaves[emp.employeeCode] !== undefined ? overridePaidLeaves[emp.employeeCode] : ''}
                            onChange={(e) => setOverridePaidLeaves(prev => ({
                              ...prev,
                              [emp.employeeCode]: e.target.value
                            }))}
                            placeholder="Leaves"
                            className="bg-transparent text-white text-xs font-bold w-full focus:outline-none text-center"
                            min="0"
                          />
                        </div>
                      </td>

                      {/* Days in Month */}
                      <td className="p-2.5 text-center font-bold text-purple-200">
                        {daysInMonth}
                      </td>

                      {/* Office Days */}
                      <td className="p-2.5 text-center font-medium text-white">
                        {calcResult.officeDays}
                      </td>

                      {/* WFH Days */}
                      <td className="p-2.5 text-center font-medium text-white">
                        {calcResult.wfhDays}
                      </td>

                      {/* Client Days */}
                      <td className="p-2.5 text-center font-medium text-white">
                        {calcResult.clientVisitDays}
                      </td>

                      {/* Outdoor Days */}
                      <td className="p-2.5 text-center font-medium text-white">
                        {calcResult.outdoorDays}
                      </td>

                      {/* Paid Leave Used */}
                      <td className="p-2.5 text-center">
                        <span className={`font-bold ${calcResult.paidLeaveDays > 0 ? 'text-amber-400' : 'text-purple-300/60'}`}>
                          {calcResult.paidLeaveDays}
                        </span>
                        <span className="text-[8px] text-purple-300/40 block">
                          Bal: {remainingLeaves}
                        </span>
                      </td>

                      {/* Sunday Holiday Days */}
                      <td className="p-2.5 text-center font-medium text-purple-300/80">
                        {calcResult.sundayHolidayDays}
                      </td>

                      {/* Total PRESENT Days */}
                      <td className="p-2.5 text-center bg-purple-500/5 font-black text-amber-300 text-xs">
                        {calcResult.totalPresentDays}
                      </td>

                      {/* Late Days Column */}
                      <td className="p-2.5 text-center font-bold text-red-300">
                        {calcResult.lateDays}
                      </td>

                      {/* Late Fine Input */}
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center bg-[#1F0F3E] border border-purple-500/20 rounded-lg p-1 w-16 mx-auto">
                          <span className="text-purple-400 font-extrabold text-[9px] mr-0.5">₹</span>
                          <input
                            type="number"
                            value={overrideLateFines[emp.employeeCode] !== undefined ? overrideLateFines[emp.employeeCode] : ''}
                            onChange={(e) => setOverrideLateFines(prev => ({
                              ...prev,
                              [emp.employeeCode]: e.target.value
                            }))}
                            placeholder="Fine"
                            className="bg-transparent text-white text-xs font-bold w-full focus:outline-none text-center"
                            min="0"
                          />
                        </div>
                      </td>

                      {/* Advance input */}
                      <td className="p-2.5 text-center">
                        <div className="flex items-center justify-center bg-[#1F0F3E] border border-purple-500/20 rounded-lg p-1 w-16 mx-auto">
                          <span className="text-purple-400 font-extrabold text-[9px] mr-0.5">₹</span>
                          <input
                            type="number"
                            value={overrideAdvances[emp.employeeCode] !== undefined ? overrideAdvances[emp.employeeCode] : ''}
                            onChange={(e) => setOverrideAdvances(prev => ({
                              ...prev,
                              [emp.employeeCode]: e.target.value
                            }))}
                            placeholder="Advance"
                            className="bg-transparent text-white text-xs font-bold w-full focus:outline-none text-center"
                            min="0"
                          />
                        </div>
                      </td>

                      {/* Net Final Salary */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="flex flex-col items-end">
                          <span className="font-black text-white text-xs">
                            ₹{finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                          {hasHighDeductions && (
                            <span className="text-[7px] bg-red-500/20 text-red-300 font-bold px-1 py-0.5 rounded mt-0.5 flex items-center gap-0.5">
                              <AlertTriangle className="w-2 h-2 shrink-0" /> Review
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Generation Status */}
                      <td className="p-2.5 text-center whitespace-nowrap">
                        {savedRecord ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-300 flex items-center justify-center gap-0.5 w-max mx-auto">
                            <Check className="w-2 h-2" /> Generated
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/10 text-amber-300/80 flex items-center justify-center gap-0.5 w-max mx-auto">
                            Pending
                          </span>
                        )}
                        {savedRecord && (
                          <span className="text-[7px] text-purple-300/40 block mt-0.5 font-mono">
                            {new Date(savedRecord.generationTimestamp).toLocaleDateString()}
                          </span>
                        )}
                      </td>

                      {/* Individual Actions */}
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {/* Info Button */}
                          <button
                            onClick={() => setSelectedBreakdownCode(emp.employeeCode)}
                            className="p-1 text-purple-400 hover:text-white hover:bg-[#1F0F3E] rounded transition-colors"
                            title="See detailed calculation breakdown"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>

                          {/* Audit logs */}
                          <button
                            onClick={() => setSelectedAuditCode(emp.employeeCode)}
                            className="p-1 text-purple-400 hover:text-white hover:bg-[#1F0F3E] rounded transition-colors"
                            title="View paid leave audits"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>

                          {/* Generate Button */}
                          <Button
                            size="xs"
                            onClick={() => handleGenerateSalary(emp)}
                            disabled={savingId === emp.employeeCode}
                            className={`font-black py-1 px-2 rounded-lg text-[9px] uppercase tracking-wider ${
                              savedRecord
                                ? 'bg-purple-950/40 border border-purple-500/20 text-purple-300 hover:text-white'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                            }`}
                          >
                            {savingId === emp.employeeCode ? (
                              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                            ) : savedRecord ? (
                              'Regenerate'
                            ) : (
                              'Generate'
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* MODAL 1: CALCULATION BREAKDOWN */}
      {selectedBreakdownCode && (() => {
        const emp = employees.find(e => e.employeeCode === selectedBreakdownCode);
        if (!emp) return null;
        const baseSalary = parseFloat(overrideBaseSalaries[emp.employeeCode]) || 0;
        const calcResult = getCalculationResult(emp);
        const currentAdvanceValStr = overrideAdvances[emp.employeeCode] || '0';
        const currentAdvanceVal = parseFloat(currentAdvanceValStr) || 0;
        const currentLateFineStr = overrideLateFines[emp.employeeCode] || '0';
        const currentLateFineVal = parseFloat(currentLateFineStr) || 0;
        const rawSalary = baseSalary > 0 ? (baseSalary / daysInMonth) * calcResult.totalPresentDays : 0;
        const salaryBeforeDeductions = Math.round(rawSalary * 100) / 100;
        const finalSalary = Math.max(0, Math.round((salaryBeforeDeductions - currentAdvanceVal - currentLateFineVal) * 100) / 100);
        const hasHighDeductions = (currentAdvanceVal + currentLateFineVal) > salaryBeforeDeductions;

        return (
          <Dialog
            isOpen={true}
            onClose={() => setSelectedBreakdownCode(null)}
            title={`Calculation Breakdown — ${emp.name}`}
          >
            <div className="space-y-5">
              <div className="p-4 bg-[#1F0F3E] rounded-2xl border border-purple-500/20">
                <div className="flex justify-between items-center text-xs text-purple-300 font-bold mb-2 pb-2 border-b border-purple-500/10">
                  <span>Attendance category</span>
                  <span>Days Count</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-purple-300/80">Office Attendance</span>
                    <span className="font-bold text-white">{calcResult.officeDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-300/80">Work From Home (WFH)</span>
                    <span className="font-bold text-white">{calcResult.wfhDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-300/80">Client Visit</span>
                    <span className="font-bold text-white">{calcResult.clientVisitDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-300/80">Outdoor Work</span>
                    <span className="font-bold text-white">{calcResult.outdoorDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-300/80">Paid Leave Converted</span>
                    <span className="font-bold text-amber-400">{calcResult.paidLeaveDays}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-300/80">Sunday / Public Holiday (Unmarked)</span>
                    <span className="font-bold text-white">{calcResult.sundayHolidayDays}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-purple-500/10 font-black text-sm">
                    <span className="text-amber-300">Total PRESENT Days</span>
                    <span className="text-amber-300">{calcResult.totalPresentDays} / {daysInMonth}</span>
                  </div>
                </div>
              </div>

              {/* Financial Calculation Steps */}
              <div className="p-4 bg-[#1F0F3E] text-purple-200 rounded-2xl border border-purple-500/20 text-xs space-y-2.5">
                <h4 className="font-bold text-purple-300 uppercase tracking-wider text-[10px]">Financial Calculation & Cut-off</h4>
                <div className="flex justify-between">
                  <span className="text-purple-300/80">Attendance Cut-off Date</span>
                  <span className="font-bold text-white font-mono">{calcResult.cutOffDateStr}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/80">Gross/Base Salary</span>
                  <span className="font-bold text-white">₹{baseSalary.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/80">Days in selected month</span>
                  <span className="font-bold text-white">{daysInMonth}</span>
                </div>
                <div className="flex justify-between text-purple-300/80">
                  <span>Formula</span>
                  <span className="font-mono text-[10px] text-purple-200">(Base ÷ Days) × PRESENT</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-purple-500/5">
                  <span className="text-purple-300/80">Salary Before Deductions</span>
                  <span className="font-extrabold text-white">₹{salaryBeforeDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/80">Late Days (Check-in &ge; 10:31 AM)</span>
                  <span className="font-bold text-red-300">{calcResult.lateDays} Days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/80">Late Fine</span>
                  <span className="font-extrabold text-red-400">- ₹{currentLateFineVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-purple-300/80">Advance Claim Deductions</span>
                  <span className="font-extrabold text-red-400">- ₹{currentAdvanceVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-purple-500/10 font-black text-sm">
                  <span className="text-white">Net Final Disbursal</span>
                  <span className="text-white">₹{finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {hasHighDeductions && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-300 leading-relaxed font-semibold mt-2">
                    ⚠️ Review Required: Total deductions (Advance + Late Fine: ₹{(currentAdvanceVal + currentLateFineVal).toLocaleString()}) exceed computed salary (₹{salaryBeforeDeductions.toLocaleString()}). Net disbursal is capped at ₹0.00.
                  </div>
                )}
              </div>
            </div>
          </Dialog>
        );
      })()}

      {/* MODAL 2: CONFIG SALARY PARAMETERS */}
      {selectedConfigCode && (() => {
        const emp = employees.find(e => e.employeeCode === selectedConfigCode);
        if (!emp) return null;

        return (
          <Dialog
            isOpen={true}
            onClose={() => setSelectedConfigCode(null)}
            title={`Configure Salary Settings — ${emp.name}`}
          >
            <div className="space-y-4 text-xs">
              <p className="text-purple-300/80 leading-relaxed">
                Configure one-time default parameters for base salary and leave allocations for the leave year <strong className="font-extrabold text-white font-mono">{leaveYear}</strong>.
              </p>

              <div className="space-y-3">
                {/* Gross/Base Salary Input */}
                <div className="space-y-1.5">
                  <label className="font-bold text-purple-200 block">Gross / Base Salary (INR) <span className="text-red-400">*</span></label>
                  <div className="flex items-center bg-[#1F0F3E] border border-purple-500/20 rounded-xl p-2">
                    <span className="text-purple-300 font-extrabold px-1.5">₹</span>
                    <input
                      type="number"
                      value={configBaseSalary}
                      onChange={(e) => setConfigBaseSalary(e.target.value)}
                      placeholder="Enter Gross Monthly Salary"
                      className="bg-transparent text-white w-full font-bold focus:outline-none placeholder:text-purple-300/30 text-xs"
                      min="1"
                    />
                  </div>
                </div>

                {/* Paid Leave Allocation Input */}
                <div className="space-y-1.5">
                  <label className="font-bold text-purple-200 block">Annual Paid Leave Allocation <span className="text-red-400">*</span></label>
                  <div className="flex items-center bg-[#1F0F3E] border border-purple-500/20 rounded-xl p-2">
                    <Sliders className="w-4 h-4 text-purple-400 mx-1.5 shrink-0" />
                    <input
                      type="number"
                      value={configAllocatedLeaves}
                      onChange={(e) => setConfigAllocatedLeaves(e.target.value)}
                      placeholder="22"
                      className="bg-transparent text-white w-full font-bold focus:outline-none placeholder:text-purple-300/30 text-xs"
                      min="0"
                    />
                  </div>
                  <span className="text-[10px] text-purple-300/50 block">Defaults to 22 paid leaves per financial year (1 April - 31 March).</span>
                </div>
              </div>

              {/* Modal footer action */}
              <div className="flex justify-end gap-2 pt-4 border-t border-purple-500/15">
                <Button
                  size="sm"
                  onClick={handleSaveConfig}
                  disabled={savingId === emp.employeeCode}
                  className="bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center justify-center gap-1"
                >
                  {savingId === emp.employeeCode ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Save Configuration
                </Button>
              </div>
            </div>
          </Dialog>
        );
      })()}

      {/* MODAL 3: PAID LEAVE AUDITS TRAIL */}
      {selectedAuditCode && (() => {
        const emp = employees.find(e => e.employeeCode === selectedAuditCode);
        if (!emp) return null;

        const audits = leaveAudits[emp.employeeCode] || [];
        const allocated = getAllocatedLeaves(emp);

        return (
          <Dialog
            isOpen={true}
            onClose={() => setSelectedAuditCode(null)}
            title={`Paid Leave Audits — ${emp.name}`}
          >
            <div className="space-y-4 text-xs">
              <div className="flex justify-between bg-[#1F0F3E] p-3 rounded-xl border border-purple-500/10 text-center font-bold">
                <div>
                  <span className="text-[9px] text-purple-300 uppercase block tracking-wider">Leave Year</span>
                  <span className="text-white font-mono">{leaveYear}</span>
                </div>
                <div>
                  <span className="text-[9px] text-purple-300 uppercase block tracking-wider">Allocated</span>
                  <span className="text-white">{allocated}</span>
                </div>
                <div>
                  <span className="text-[9px] text-purple-300 uppercase block tracking-wider">Consumed</span>
                  <span className="text-amber-400">{audits.length}</span>
                </div>
                <div>
                  <span className="text-[9px] text-purple-300 uppercase block tracking-wider">Remaining</span>
                  <span className="text-emerald-400">{Math.max(0, allocated - audits.length)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-purple-200 uppercase tracking-wider text-[10px]">Detailed Consumption Trail</h4>
                {audits.length === 0 ? (
                  <div className="p-4 text-center text-purple-300/40 bg-[#1F0F3E]/40 border border-purple-500/10 rounded-xl leading-relaxed">
                    No paid leave audits found. Absent days will consume leaves automatically during salary generation if balance permits.
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto divide-y divide-purple-500/10 border border-purple-500/20 bg-[#1F0F3E] rounded-xl">
                    {audits.map((a) => (
                      <div key={a.id} className="p-2.5 flex justify-between items-center hover:bg-white/[0.01]">
                        <div>
                          <span className="font-extrabold text-white block">{new Date(a.date).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <span className="text-[9px] text-purple-300/40 font-mono block">{a.reason}</span>
                        </div>
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 font-extrabold px-2 py-0.5 rounded-full">
                          -{a.daysConsumed} Day
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Dialog>
        );
      })()}
    </div>
  );
};
