import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getDb } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { SalaryRecord } from '../../services/salary/salaryService';
import { 
  FileText, 
  Calendar, 
  ChevronDown, 
  AlertCircle, 
  ArrowLeft, 
  User, 
  Clock, 
  Building, 
  Check, 
  TrendingUp, 
  CreditCard,
  ShieldCheck,
  Briefcase,
  AlertTriangle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const PayslipScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const employeeCode = employeeData?.employeeCode;
  const navigate = useNavigate();
  const [payslips, setPayslips] = useState<SalaryRecord[]>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<SalaryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    if (!employeeCode) {
      setLoading(false);
      return;
    }

    const cacheKey = `cached_payslips_${employeeCode}`;

    // 1. Check employee-specific cache for instant 0ms rendering
    let hasCachedData = false;
    try {
      const cachedRaw = localStorage.getItem(cacheKey);
      if (cachedRaw) {
        const parsed = JSON.parse(cachedRaw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Validate records belong strictly to the current employee
          const validRecords = parsed.filter((r: SalaryRecord) => r && r.employeeCode === employeeCode);
          if (validRecords.length > 0) {
            setPayslips(validRecords);
            setSelectedPayslip((prev) => {
              if (prev && validRecords.some((r) => r.id === prev.id)) {
                return prev;
              }
              return validRecords[0];
            });
            setLoading(false);
            hasCachedData = true;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached payslips:', e);
    }

    // Only show full-screen loading spinner if no cached data exists
    if (!hasCachedData) {
      setLoading(true);
    }

    // 2. Silently refresh latest payslips from Firestore in background
    const fetchPayslips = async () => {
      try {
        const activeDb = await getDb();
        if (!activeDb) return;

        const q = query(
          collection(activeDb, 'salaries'),
          where('employeeCode', '==', employeeCode)
        );
        const querySnapshot = await getDocs(q);
        const list: SalaryRecord[] = [];
        querySnapshot.forEach((doc) => {
          list.push(doc.data() as SalaryRecord);
        });

        // Sort: newest first
        list.sort((a, b) => {
          if (a.year !== b.year) {
            return b.year - a.year;
          }
          return b.month - a.month;
        });

        setPayslips(list);
        if (list.length > 0) {
          setSelectedPayslip((prev) => {
            if (prev) {
              const existing = list.find((p) => p.id === prev.id || (p.month === prev.month && p.year === prev.year));
              if (existing) return existing;
            }
            return list[0];
          });
        } else {
          setSelectedPayslip(null);
        }

        // Cache exclusively for this employee
        try {
          localStorage.setItem(cacheKey, JSON.stringify(list));
        } catch (e) {
          console.warn('Failed to cache employee payslips:', e);
        }
      } catch (err) {
        console.error('Error fetching employee payslips:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPayslips();
  }, [employeeCode]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-[var(--text-primary)]">
        <div className="w-10 h-10 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-[var(--text-secondary)] font-bold">Retrieving secure payslip records...</p>
      </div>
    );
  }

  if (payslips.length === 0) {
    return (
      <div className="flex flex-col gap-4 text-[var(--text-primary)]">
        {/* Header bar */}
        <div className="flex items-center gap-3.5 pt-2">
          <button 
            onClick={() => navigate('/')}
            className="p-2 bg-[var(--app-background-secondary)] border border-[var(--primary)]/20 rounded-xl hover:bg-[var(--primary)]/20 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-black text-[var(--text-primary)] leading-none">Payslips</h1>
        </div>

        <Card className="p-8 bg-[var(--surface-elevated)] border border-[var(--primary)]/20 text-center rounded-[24px] shadow-2xl flex flex-col items-center justify-center min-h-[40vh] mt-2">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-lg font-black text-amber-400 mb-1">Payslip Not Available Yet</h2>
          <p className="text-xs text-[var(--text-secondary)]/80 max-w-sm leading-relaxed mb-6 font-bold">
            Your salary record has not been generated by the administrator for any month yet.
          </p>
          <Button 
            onClick={() => navigate('/')}
            className="bg-[var(--primary)] hover:bg-[var(--primary-light)] text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg transition"
          >
            Go Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const formatCurrency = (val: number) => {
    return val.toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const currentMonthName = selectedPayslip ? MONTH_NAMES[selectedPayslip.month] : '';
  const currentYear = selectedPayslip ? selectedPayslip.year : '';

  return (
    <div className="flex flex-col gap-5 pb-16 text-[var(--text-primary)]">
      {/* Header bar */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3.5">
          <button 
            onClick={() => navigate('/')}
            className="p-2 bg-[var(--surface-inner)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface-elevated)] hover:text-[var(--text-primary)] text-[var(--text-secondary)] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-black text-[var(--text-primary)] leading-none">My Payslip</h1>
        </div>

        {/* Month Selection Selector */}
        {payslips.length > 1 && (
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 bg-[var(--surface-inner)] border border-[var(--border)] px-3.5 py-1.5 rounded-full text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-[var(--primary-light)]" />
              <span>{currentMonthName} {currentYear}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-44 bg-[var(--surface-inner)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-[var(--border)]">
                {payslips.map((slip) => (
                  <button
                    key={slip.id}
                    onClick={() => {
                      setSelectedPayslip(slip);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left p-2.5 text-xs font-bold hover:bg-[var(--surface-elevated)] transition flex items-center justify-between cursor-pointer ${
                      selectedPayslip?.id === slip.id ? 'bg-[var(--surface-elevated)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <span>{MONTH_NAMES[slip.month]} {slip.year}</span>
                    {selectedPayslip?.id === slip.id && (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedPayslip && (
        <div className="flex flex-col gap-4">
          
          {/* Main Payslip Card */}
          <Card className="p-6 bg-[var(--surface-inner)] border border-[var(--border)] rounded-[24px] shadow-2xl space-y-6 relative overflow-hidden">
            
            {/* Decors */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[var(--primary)]/10 to-transparent rounded-bl-full pointer-events-none" />
            
            {/* Payslip Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-[var(--border)] gap-4">
              <div>
                <span className="text-[9px] font-black uppercase text-[var(--primary-light)] tracking-wider">OFFICIAL SALARY SLIP</span>
                <h2 className="text-xl font-black text-[var(--text-primary)] tracking-tight mt-0.5">Office Management System</h2>
                <p className="text-[10px] text-[var(--text-secondary)] font-bold font-mono">Enterprise Operations & Workforce Portal</p>
              </div>
              <div className="text-right sm:text-right flex flex-col sm:items-end">
                <span className="px-3 py-1 rounded-full text-[10px] font-black bg-[var(--primary)]/20 border border-[var(--primary)]/30 text-[var(--primary-light)] uppercase tracking-wide">
                  {currentMonthName} {currentYear}
                </span>
                <span className="text-[9px] text-[var(--text-secondary)] font-bold mt-1.5 block">
                  Generated on {formatDate(selectedPayslip.generationTimestamp)}
                </span>
              </div>
            </div>

            {/* Employee Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--surface-elevated)] p-4 rounded-2xl border border-[var(--border)]">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[var(--primary-light)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Employee Name:</span>
                  <strong className="text-xs font-black text-[var(--text-primary)] ml-auto md:ml-2">{selectedPayslip.employeeName}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-[var(--primary-light)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Employee Code:</span>
                  <strong className="text-xs font-mono font-black text-[var(--text-primary)] ml-auto md:ml-2">{selectedPayslip.employeeCode}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="w-4 h-4 text-[var(--primary-light)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Department:</span>
                  <strong className="text-xs font-black text-[var(--text-primary)] ml-auto md:ml-2">{employeeData?.department || 'Operations'}</strong>
                </div>
              </div>
              <div className="space-y-2.5 md:border-l md:border-[var(--border)] md:pl-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[var(--primary-light)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Designation:</span>
                  <strong className="text-xs font-black text-[var(--text-primary)] ml-auto md:ml-2">{employeeData?.designation || 'Staff Executive'}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[var(--primary-light)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Days in Month:</span>
                  <strong className="text-xs font-mono font-black text-[var(--text-primary)] ml-auto md:ml-2">{selectedPayslip.daysInMonth} Days</strong>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--primary-light)] shrink-0" />
                  <span className="text-xs text-[var(--text-secondary)] font-bold">Calculation Cut-off:</span>
                  <strong className="text-xs font-mono font-black text-amber-300 ml-auto md:ml-2">
                    {selectedPayslip.attendanceCutOffDate ? formatDate(selectedPayslip.attendanceCutOffDate) : 'N/A'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Attendance Breakdown Card */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider">Attendance Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] block font-black uppercase">Office Present</span>
                  <strong className="text-sm font-black text-[var(--text-primary)]">{selectedPayslip.officePresentDays}</strong>
                </div>
                <div className="bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] block font-black uppercase">WFH Days</span>
                  <strong className="text-sm font-black text-[var(--text-primary)]">{selectedPayslip.wfhDays}</strong>
                </div>
                <div className="bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] block font-black uppercase">Client Visit</span>
                  <strong className="text-sm font-black text-[var(--text-primary)]">{selectedPayslip.clientVisitDays}</strong>
                </div>
                <div className="bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] block font-black uppercase">Outdoor Work</span>
                  <strong className="text-sm font-black text-[var(--text-primary)]">{selectedPayslip.outdoorDays}</strong>
                </div>
                <div className="bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] block font-black uppercase">Paid Leaves</span>
                  <strong className="text-sm font-black text-amber-400">{selectedPayslip.paidLeaveDays}</strong>
                </div>
                <div className="bg-[var(--surface-elevated)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="text-[9px] text-[var(--text-secondary)] block font-black uppercase">Sun / Holidays</span>
                  <strong className="text-sm font-black text-[var(--primary-light)]">{selectedPayslip.sundayHolidayDays}</strong>
                </div>
                <div className="bg-[var(--primary)]/15 border border-[var(--primary)]/30 p-2.5 rounded-xl text-center col-span-2 sm:col-span-1">
                  <span className="text-[9px] text-[var(--primary-light)] block font-black uppercase">PRESENT</span>
                  <strong className="text-sm font-black text-white">{selectedPayslip.totalPresentDays}</strong>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded-xl text-center col-span-2 sm:col-span-1">
                  <span className="text-[9px] text-red-300 block font-black uppercase">LATE DAYS</span>
                  <strong className={`text-sm font-black ${selectedPayslip.lateDays > 0 ? 'text-red-300' : 'text-[var(--text-secondary)]'}`}>
                    {selectedPayslip.lateDays}
                  </strong>
                </div>
              </div>
            </div>

            {/* Financial Calculations Statement */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider">Salary Breakdown</h3>
              <div className="p-4 bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border)] text-xs divide-y divide-[var(--border)]">
                
                {/* Gross / Base */}
                <div className="flex justify-between py-2 items-center">
                  <span className="text-[var(--text-secondary)] font-bold">Gross/Base Salary</span>
                  <span className="font-black text-[var(--text-primary)] font-mono">₹{formatCurrency(selectedPayslip.baseSalary)}</span>
                </div>

                {/* Calculation math overview */}
                <div className="flex justify-between py-2 items-center">
                  <span className="text-[var(--text-secondary)] font-bold">Days in Month / PRESENT Days</span>
                  <span className="font-black text-[var(--text-primary)] font-mono">
                    {selectedPayslip.daysInMonth} Days / {selectedPayslip.totalPresentDays} Present
                  </span>
                </div>

                {/* Subtotal */}
                <div className="flex justify-between py-2 items-center">
                  <span className="text-[var(--text-secondary)] font-bold">Salary Before Deductions</span>
                  <span className="font-black text-[var(--text-primary)] font-mono">
                    ₹{formatCurrency(selectedPayslip.salaryBeforeDeductions || selectedPayslip.salaryBeforeAdvance)}
                  </span>
                </div>

                {/* Deductions header */}
                <div className="pt-2">
                  <span className="text-[9px] font-black text-[var(--primary-light)] uppercase tracking-wider block mb-1">Deductions</span>
                  <div className="space-y-1.5 pb-2">
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span className="font-bold">Advance Claim Deductions</span>
                      <span className="font-mono font-black text-red-300">
                        {selectedPayslip.advance > 0 ? `- ₹${formatCurrency(selectedPayslip.advance)}` : '₹0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span className="font-bold">Late Check-in Fine</span>
                      <span className="font-mono font-black text-red-300">
                        {selectedPayslip.lateFine > 0 ? `- ₹${formatCurrency(selectedPayslip.lateFine)}` : '₹0.00'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Net Final Out */}
                <div className="flex justify-between items-center pt-3 mt-1 border-t border-[var(--border)]">
                  <span className="text-xs font-black text-[var(--text-primary)] uppercase tracking-wider">Net Disbursed Salary</span>
                  <div className="text-right">
                    <span className="font-black text-[var(--primary-light)] font-mono text-base tracking-tight block">
                      ₹{formatCurrency(selectedPayslip.finalSalary)}
                    </span>
                    <span className="text-[8px] text-[var(--text-secondary)] font-black uppercase tracking-wide block mt-0.5">
                      Transferred Securely
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Paid Leave Status of Selected Year */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-black uppercase text-[var(--text-secondary)] tracking-wider">Leave Summary (Selected Year)</h3>
              <div className="grid grid-cols-3 gap-3 text-center bg-[var(--surface-elevated)] border border-[var(--border)] p-3.5 rounded-2xl">
                <div>
                  <span className="text-[8px] text-[var(--text-secondary)] block font-black uppercase leading-tight">Paid Leave Allocation</span>
                  <strong className="text-xs font-mono font-black text-[var(--text-primary)] block mt-1">
                    {selectedPayslip.allocatedPaidLeaves ?? 22}
                  </strong>
                </div>
                <div className="border-x border-[var(--border)]">
                  <span className="text-[8px] text-[var(--text-secondary)] block font-black uppercase leading-tight">Paid Leave Used</span>
                  <strong className="text-xs font-mono font-black text-amber-400 block mt-1">
                    {selectedPayslip.usedPaidLeaves ?? 0}
                  </strong>
                </div>
                <div>
                  <span className="text-[8px] text-emerald-400 block font-black leading-tight uppercase">Remaining Leaves</span>
                  <strong className="text-xs font-mono font-black text-emerald-400 block mt-1">
                    {selectedPayslip.remainingPaidLeaves ?? 22}
                  </strong>
                </div>
              </div>
            </div>

            {/* Professional Legal Footnote */}
            <div className="text-center pt-2 border-t border-[var(--border)]">
              <p className="text-[9px] text-[var(--text-secondary)]/60 font-medium leading-relaxed">
                This is a secure, computer-generated document processed by Office Management System. No signature is required. For discrepancies or queries, please submit a profile change request or reach out directly to the HR department.
              </p>
            </div>

          </Card>
        </div>
      )}
    </div>
  );
};
