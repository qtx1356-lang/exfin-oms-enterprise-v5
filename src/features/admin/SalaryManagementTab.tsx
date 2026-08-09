import React, { useState, useEffect } from 'react';
import { db } from '../../services/firebase/config';
import { collection, doc, setDoc, getDocs, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
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
  Save 
} from 'lucide-react';

interface EmployeeWithSalary {
  id: string; // registration doc ID
  employeeCode: string;
  name: string;
  office: string;
  status: string;
  baseSalary: number; // monthly base salary
}

interface SalaryRecord {
  id: string; // ${employeeCode}_${year}_${month}
  employeeCode: string;
  employeeName: string;
  month: number; // 1-12
  year: number;
  baseSalary: number;
  daysInMonth: number;
  presentDays: number;
  generatedSalary: number;
  generationTimestamp: string;
}

export const SalaryManagementTab: React.FC = () => {
  const [employees, setEmployees] = useState<EmployeeWithSalary[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<Record<string, SalaryRecord>>({}); // keyed by ${employeeCode}
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, number>>({}); // keyed by ${employeeCode}
  
  // Selected Month & Year
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  
  // Manual overrides state
  const [overrideBaseSalaries, setOverrideBaseSalaries] = useState<Record<string, string>>({}); // string input value
  const [overridePresentDays, setOverridePresentDays] = useState<Record<string, string>>({}); // string input value
  const [editingBaseSalaryId, setEditingBaseSalaryId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [batchSaving, setBatchSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  // 1. Get days in selected month
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

  // 2. Listen to Registrations (Employees)
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
      // Sort by employee code
      list.sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));
      setEmployees(list);
    });

    return () => unsub();
  }, []);

  // 3. Load Salary Records and Attendance Logs for Selected Month & Year
  useEffect(() => {
    if (!db || employees.length === 0) return;

    let active = true;
    setLoading(true);

    const loadData = async () => {
      try {
        // A. Load existing salary records
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

        // B. Load attendance logs to calculate default PRESENT days
        const monthStr = selectedMonth < 10 ? `0${selectedMonth}` : `${selectedMonth}`;
        const datePrefix = `${selectedYear}-${monthStr}`;

        // Fetch attendance records for this month prefix
        // Since we cannot do starterAt queries on firestore easily without range,
        // we query all and filter in memory since it's the admin panel and offline-first/indexed queries.
        const attSnap = await getDocs(collection(db, 'attendance'));
        const attCounts: Record<string, number> = {};

        // Initialize counts
        employees.forEach((emp) => {
          attCounts[emp.employeeCode] = 0;
        });

        attSnap.forEach((d) => {
          const data = d.data();
          const date = data.date || '';
          const empId = data.employeeId || data.employeeCode || '';
          if (date.startsWith(datePrefix) && empId) {
            attCounts[empId] = (attCounts[empId] || 0) + 1;
          }
        });

        if (active) {
          setSalaryRecords(salMap);
          setAttendanceCounts(attCounts);

          // Prepopulate manual present days override state with current DB salary values or attendance counts
          const initialPresentOverrides: Record<string, string> = {};
          employees.forEach((emp) => {
            const existingSal = salMap[emp.employeeCode];
            if (existingSal) {
              initialPresentOverrides[emp.employeeCode] = existingSal.presentDays.toString();
            } else {
              initialPresentOverrides[emp.employeeCode] = (attCounts[emp.employeeCode] || 0).toString();
            }
          });
          setOverridePresentDays(initialPresentOverrides);
        }
      } catch (err) {
        console.error('Error loading salaries or attendance:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [employees, selectedMonth, selectedYear]);

  // Show temporary notification
  const triggerNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Save/Update base salary directly to the registration document
  const handleSaveBaseSalary = async (emp: EmployeeWithSalary) => {
    if (!db) return;
    const inputVal = overrideBaseSalaries[emp.employeeCode];
    if (inputVal === undefined) {
      setEditingBaseSalaryId(null);
      return;
    }

    const numericVal = parseFloat(inputVal);
    if (isNaN(numericVal) || numericVal < 0) {
      triggerNotification('error', 'Please enter a valid base salary');
      return;
    }

    setSavingId(emp.employeeCode);
    try {
      const regDocRef = doc(db, 'registrations', emp.id);
      await setDoc(regDocRef, { baseSalary: numericVal }, { merge: true });
      
      triggerNotification('success', `Base salary for ${emp.name} updated to ₹${numericVal.toLocaleString('en-IN')}`);
      setEditingBaseSalaryId(null);
    } catch (err) {
      console.error('Error updating base salary:', err);
      triggerNotification('error', 'Failed to update base salary');
    } finally {
      setSavingId(null);
    }
  };

  // Generate / Update salary for a single employee
  const handleGenerateSalary = async (emp: EmployeeWithSalary) => {
    if (!db) return;

    // Determine values to use
    const baseSal = emp.baseSalary;
    
    const presentDaysStr = overridePresentDays[emp.employeeCode] || '0';
    const parsedPresentDays = parseFloat(presentDaysStr);

    if (isNaN(parsedPresentDays) || parsedPresentDays < 0 || parsedPresentDays > daysInMonth) {
      triggerNotification('error', `Present Days must be a number between 0 and ${daysInMonth}`);
      return;
    }

    // Salary Formula: Generated Salary = (Base Salary ÷ Number of Days in Current Month) × PRESENT Days
    // Rounded to exactly 2 decimal places.
    const rawSalary = baseSal > 0 && daysInMonth > 0 ? (baseSal / daysInMonth) * parsedPresentDays : 0;
    const finalSalary = Math.round(rawSalary * 100) / 100;

    const recordId = `${emp.employeeCode}_${selectedYear}_${selectedMonth}`;
    setSavingId(emp.employeeCode);

    const record: SalaryRecord = {
      id: recordId,
      employeeCode: emp.employeeCode,
      employeeName: emp.name,
      month: selectedMonth,
      year: selectedYear,
      baseSalary: baseSal,
      daysInMonth: daysInMonth,
      presentDays: parsedPresentDays,
      generatedSalary: finalSalary,
      generationTimestamp: new Date().toISOString(),
    };

    try {
      await setDoc(doc(db, 'salaries', recordId), record);
      
      // Update local UI state instantly
      setSalaryRecords((prev) => ({
        ...prev,
        [emp.employeeCode]: record,
      }));

      triggerNotification('success', `Salary generated for ${emp.name}: ₹${finalSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
    } catch (err) {
      console.error('Error saving salary record:', err);
      triggerNotification('error', 'Failed to save salary record');
    } finally {
      setSavingId(null);
    }
  };

  // Batch generate salaries for all loaded employees
  const handleGenerateAllSalaries = async () => {
    if (!db || employees.length === 0) return;

    // Confirm first
    const confirmBatch = window.confirm(`Are you sure you want to generate/update salaries for all ${employees.length} employees for ${months.find(m => m.value === selectedMonth)?.label} ${selectedYear}?`);
    if (!confirmBatch) return;

    setBatchSaving(true);
    try {
      const batch = writeBatch(db);
      const updatedRecords: Record<string, SalaryRecord> = { ...salaryRecords };

      for (const emp of employees) {
        const baseSal = emp.baseSalary;
        const presentDaysStr = overridePresentDays[emp.employeeCode] || '0';
        const parsedPresentDays = parseFloat(presentDaysStr);
        
        // Ensure values are safe
        const safePresentDays = isNaN(parsedPresentDays) || parsedPresentDays < 0 ? 0 : Math.min(parsedPresentDays, daysInMonth);
        const rawSalary = baseSal > 0 && daysInMonth > 0 ? (baseSal / daysInMonth) * safePresentDays : 0;
        const finalSalary = Math.round(rawSalary * 100) / 100;

        const recordId = `${emp.employeeCode}_${selectedYear}_${selectedMonth}`;
        const record: SalaryRecord = {
          id: recordId,
          employeeCode: emp.employeeCode,
          employeeName: emp.name,
          month: selectedMonth,
          year: selectedYear,
          baseSalary: baseSal,
          daysInMonth: daysInMonth,
          presentDays: safePresentDays,
          generatedSalary: finalSalary,
          generationTimestamp: new Date().toISOString(),
        };

        batch.set(doc(db, 'salaries', recordId), record);
        updatedRecords[emp.employeeCode] = record;
      }

      await batch.commit();
      setSalaryRecords(updatedRecords);
      triggerNotification('success', `Successfully generated salaries for all ${employees.length} employees!`);
    } catch (err) {
      console.error('Error batch generating salaries:', err);
      triggerNotification('error', 'Batch salary generation failed');
    } finally {
      setBatchSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION WITH FILTERS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#2D1B5A] p-5 rounded-[22px] border border-purple-500/20 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-sm font-black uppercase text-purple-200 tracking-wider flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-400" /> Salary Generation module (Stage 1)
          </h2>
          <p className="text-xs text-purple-300/80">Configure base salaries, verify attendance logs, and generate compliant salary records.</p>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-[#211044] px-3 py-1.5 rounded-xl border border-purple-500/20">
            <Calendar className="w-3.5 h-3.5 text-purple-300" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-transparent text-white text-xs font-bold focus:outline-none border-none cursor-pointer"
            >
              {months.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#211044] text-white">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#211044] px-3 py-1.5 rounded-xl border border-purple-500/20">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="bg-transparent text-white text-xs font-bold focus:outline-none border-none cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-[#211044] text-white">
                  {y}
                </option>
              ))}
            </select>
          </div>

          <Button
            size="sm"
            onClick={handleGenerateAllSalaries}
            disabled={loading || batchSaving || employees.length === 0}
            className="bg-amber-500 hover:bg-amber-400 text-black font-black py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/10"
          >
            {batchSaving ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Calculator className="w-3.5 h-3.5" />
            )}
            Generate All ({employees.length})
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

      {/* SUMMARY BAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block">Selected Period</span>
            <span className="text-sm font-black text-amber-300">
              {months.find((m) => m.value === selectedMonth)?.label} {selectedYear}
            </span>
          </div>
          <div className="bg-[#211044] p-2 rounded-xl text-xs font-bold text-purple-200">
            {daysInMonth} Days
          </div>
        </Card>

        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block">Salary Records Generated</span>
            <span className="text-sm font-black text-emerald-400">
              {Object.keys(salaryRecords).length} / {employees.length}
            </span>
          </div>
          <div className="bg-[#211044] p-2 rounded-xl">
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
        </Card>

        <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-purple-300 uppercase block">Total Disbursal (Stage 1)</span>
            <span className="text-sm font-black text-white">
              ₹{(Object.values(salaryRecords) as SalaryRecord[]).reduce((acc: number, curr: SalaryRecord) => acc + curr.generatedSalary, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="bg-[#211044] p-2 rounded-xl">
            <Coins className="w-4 h-4 text-amber-300" />
          </div>
        </Card>
      </div>

      {/* SALARY GRID TABLE */}
      <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 text-white rounded-[22px] shadow-2xl">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
              <p className="text-xs text-purple-300">Loading directory and attendance calculations...</p>
            </div>
          ) : employees.length === 0 ? (
            <div className="py-12 text-center text-purple-300/60 text-xs">
              No approved employees found in registrations.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#1A0B36] text-purple-300 uppercase font-extrabold border-b border-purple-500/20">
                  <th className="p-3.5 rounded-l-xl">Employee</th>
                  <th className="p-3.5">Base Salary (INR)</th>
                  <th className="p-3.5 text-center">Days in Month</th>
                  <th className="p-3.5 text-center">PRESENT Days</th>
                  <th className="p-3.5 text-right">Calculated Salary</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right rounded-r-xl">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-500/10">
                {employees.map((emp) => {
                  const existingRec = salaryRecords[emp.employeeCode];
                  
                  // Base Salary logic
                  const isEditingBaseSalary = editingBaseSalaryId === emp.employeeCode;
                  const currentBaseSalaryVal = overrideBaseSalaries[emp.employeeCode] !== undefined 
                    ? overrideBaseSalaries[emp.employeeCode] 
                    : emp.baseSalary.toString();
                  
                  // Present Days logic
                  const currentPresentVal = overridePresentDays[emp.employeeCode] || '0';
                  const numericPresentDays = parseFloat(currentPresentVal) || 0;

                  // Real-time calculation helper
                  const liveSalaryRaw = emp.baseSalary > 0 && daysInMonth > 0 ? (emp.baseSalary / daysInMonth) * numericPresentDays : 0;
                  const liveSalary = Math.round(liveSalaryRaw * 100) / 100;

                  return (
                    <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                      {/* Employee Core */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-[#211044] border border-purple-500/20 flex items-center justify-center">
                            <User className="w-4 h-4 text-purple-300" />
                          </div>
                          <div>
                            <span className="font-extrabold text-white block">{emp.name}</span>
                            <span className="text-[10px] font-mono text-purple-300/70">{emp.employeeCode}</span>
                          </div>
                        </div>
                      </td>

                      {/* Configurable Base Salary */}
                      <td className="p-3.5">
                        {isEditingBaseSalary ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-purple-300 text-xs">₹</span>
                            <input
                              type="number"
                              value={currentBaseSalaryVal}
                              onChange={(e) => setOverrideBaseSalaries(prev => ({
                                ...prev,
                                [emp.employeeCode]: e.target.value
                              }))}
                              className="w-24 px-2 py-1 rounded bg-[#170B38] border border-purple-500/40 text-white text-xs font-bold focus:outline-none focus:ring-1 focus:ring-purple-400"
                              placeholder="0"
                              min="0"
                            />
                            <button
                              onClick={() => handleSaveBaseSalary(emp)}
                              disabled={savingId === emp.employeeCode}
                              className="p-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                              title="Save Base Salary"
                            >
                              {savingId === emp.employeeCode ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <Save className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-white">
                              ₹{emp.baseSalary.toLocaleString('en-IN')}
                            </span>
                            <button
                              onClick={() => {
                                setOverrideBaseSalaries(prev => ({
                                  ...prev,
                                  [emp.employeeCode]: emp.baseSalary.toString()
                                }));
                                setEditingBaseSalaryId(emp.employeeCode);
                              }}
                              className="p-1 text-purple-400 hover:text-white"
                              title="Edit Base Salary"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {emp.baseSalary === 0 && (
                          <span className="text-[10px] text-amber-400/80 block mt-0.5">₹0 Base Salary configured</span>
                        )}
                      </td>

                      {/* Days in Month */}
                      <td className="p-3.5 text-center text-purple-200 font-bold">
                        {daysInMonth}
                      </td>

                      {/* PRESENT Days (Editable Override) */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max={daysInMonth}
                            value={currentPresentVal}
                            onChange={(e) => setOverridePresentDays(prev => ({
                              ...prev,
                              [emp.employeeCode]: e.target.value
                            }))}
                            className="w-14 text-center px-1.5 py-1 rounded bg-[#170B38] border border-purple-500/20 text-white text-xs font-bold focus:outline-none focus:ring-1 focus:ring-purple-400"
                          />
                          <span className="text-[10px] text-purple-300/60 block">
                            / {daysInMonth}
                          </span>
                        </div>
                        {attendanceCounts[emp.employeeCode] !== undefined && (
                          <span className="text-[9px] text-purple-300/40 block mt-0.5">
                            Auto checks: {attendanceCounts[emp.employeeCode]}
                          </span>
                        )}
                      </td>

                      {/* Live Computed Salary */}
                      <td className="p-3.5 text-right">
                        <span className="font-black text-amber-300 text-sm">
                          ₹{liveSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                        {existingRec && existingRec.generatedSalary !== liveSalary && (
                          <span className="text-[9px] text-purple-300/40 block">
                            Saved: ₹{existingRec.generatedSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>

                      {/* Generation Status */}
                      <td className="p-3.5 text-center">
                        {existingRec ? (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 flex items-center justify-center gap-1 w-max mx-auto">
                            <Check className="w-2.5 h-2.5" /> Generated
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-500/10 text-amber-300/80 flex items-center justify-center gap-1 w-max mx-auto">
                            Pending Calculation
                          </span>
                        )}
                        {existingRec && (
                          <span className="text-[8px] text-purple-300/40 block mt-0.5">
                            {new Date(existingRec.generationTimestamp).toLocaleDateString()}
                          </span>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="p-3.5 text-right">
                        <Button
                          size="sm"
                          onClick={() => handleGenerateSalary(emp)}
                          disabled={savingId === emp.employeeCode}
                          className={`font-bold px-3 py-1 rounded-xl text-[11px] ${
                            existingRec 
                              ? 'bg-[#211044] hover:bg-[#1a0c36] text-purple-200 border border-purple-500/30' 
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
                          }`}
                        >
                          {savingId === emp.employeeCode ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : existingRec ? (
                            'Re-calculate'
                          ) : (
                            'Generate'
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
};
