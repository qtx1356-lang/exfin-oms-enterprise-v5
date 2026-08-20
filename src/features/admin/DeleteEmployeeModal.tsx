import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Trash2, AlertTriangle, ShieldAlert, CheckCircle2, X } from 'lucide-react';
import { fetchEmployeeDeletionSummary, executeEmployeeDeletion, DeletionSummary } from '../../services/admin/employeeDeletionService';
import { ManagedUser } from '../../types/user';

interface DeleteEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: ManagedUser;
  adminUser: { uid: string; email?: string; displayName?: string; role?: string };
  onSuccess: () => void;
}

export const DeleteEmployeeModal: React.FC<DeleteEmployeeModalProps> = ({
  isOpen,
  onClose,
  employee,
  adminUser,
  onSuccess,
}) => {
  const [step, setStep] = useState<number>(1);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [deletionType, setDeletionType] = useState<'DATA_ONLY' | 'COMPLETE' | null>(null);
  const [confirmCodeInput, setConfirmCodeInput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && employee) {
      setStep(1);
      setDeletionType(null);
      setConfirmCodeInput('');
      setErrorMsg(null);
      setSuccessResult(null);
      setLoadingSummary(true);

      fetchEmployeeDeletionSummary(employee)
        .then((res) => {
          setSummary(res);
          setLoadingSummary(false);
        })
        .catch((err) => {
          console.error(err);
          setLoadingSummary(false);
        });
    }
  }, [isOpen, employee]);

  if (!isOpen) return null;

  const targetCode = employee.employeeCode || employee.id;
  const isCodeMatched = confirmCodeInput.trim() === targetCode;

  const handleExecute = async () => {
    if (!deletionType) return;
    setIsExecuting(true);
    setErrorMsg(null);

    try {
      const res = await executeEmployeeDeletion({
        employee,
        deletionType,
        adminUser,
      });

      setSuccessResult(res.message);
      setIsExecuting(false);
      setStep(5); // Success step
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Employee deletion could not be completed.');
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1F103F] border border-rose-500/30 rounded-3xl w-full max-w-lg p-6 space-y-6 shadow-2xl relative overflow-hidden">
        <button
          onClick={onClose}
          disabled={isExecuting}
          className="absolute top-5 right-5 text-purple-300 hover:text-white p-2 rounded-xl bg-purple-900/30 hover:bg-purple-900/50 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-500/20 rounded-2xl text-rose-400 border border-rose-500/30">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white">Delete Employee</h2>
            <p className="text-xs text-rose-300/80">Secure Super Admin Employee Deletion Workflow</p>
          </div>
        </div>

        {/* Step 1 & 2: Summary */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="p-4 bg-[#2D1B5A] border border-purple-500/30 rounded-2xl space-y-3">
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                <span className="text-xs text-purple-300">Employee Name:</span>
                <span className="text-xs font-bold text-white">{employee.name || 'Unknown'}</span>
              </div>
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                <span className="text-xs text-purple-300">Employee Code:</span>
                <span className="text-xs font-mono font-bold text-amber-400">{targetCode}</span>
              </div>
              <div className="flex justify-between items-center border-b border-purple-500/20 pb-2">
                <span className="text-xs text-purple-300">Status:</span>
                <span className="text-xs font-bold text-emerald-400">{employee.status || 'Active'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-purple-300">Device Model:</span>
                <span className="text-xs font-semibold text-white">{employee.deviceModel || 'Not registered'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-purple-200 uppercase">Associated Records to be Scanned:</h4>
              {loadingSummary ? (
                <div className="p-6 text-center text-xs text-purple-300/60">Scanning employee data sources...</div>
              ) : summary ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-[#1A0B36] border border-purple-500/20 rounded-xl flex justify-between">
                    <span className="text-purple-300">Attendance:</span>
                    <span className="font-bold text-white">{summary.attendanceCount}</span>
                  </div>
                  <div className="p-2.5 bg-[#1A0B36] border border-purple-500/20 rounded-xl flex justify-between">
                    <span className="text-purple-300">Expenses:</span>
                    <span className="font-bold text-white">{summary.expensesCount}</span>
                  </div>
                  <div className="p-2.5 bg-[#1A0B36] border border-purple-500/20 rounded-xl flex justify-between">
                    <span className="text-purple-300">Leaves:</span>
                    <span className="font-bold text-white">{summary.leavesCount}</span>
                  </div>
                  <div className="p-2.5 bg-[#1A0B36] border border-purple-500/20 rounded-xl flex justify-between">
                    <span className="text-purple-300">Tasks:</span>
                    <span className="font-bold text-white">{summary.tasksCount}</span>
                  </div>
                  <div className="p-2.5 bg-[#1A0B36] border border-purple-500/20 rounded-xl flex justify-between">
                    <span className="text-purple-300">Efficiency:</span>
                    <span className="font-bold text-white">{summary.efficiencyCount}</span>
                  </div>
                  <div className="p-2.5 bg-[#1A0B36] border border-purple-500/20 rounded-xl flex justify-between">
                    <span className="text-purple-300">Notifications:</span>
                    <span className="font-bold text-white">{summary.notificationsCount}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button
                variant="outline"
                className="bg-[#2D1B5A] border-purple-500/30 text-white text-xs"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                onClick={() => setStep(2)}
              >
                Proceed to Deletion Options →
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Choose Deletion Type */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white">Select Deletion Scope</h3>
            
            <div className="space-y-3">
              <label 
                onClick={() => setDeletionType('DATA_ONLY')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  deletionType === 'DATA_ONLY' 
                    ? 'bg-purple-600/20 border-purple-400 shadow-lg' 
                    : 'bg-[#2D1B5A] border-purple-500/30 hover:border-purple-400/50'
                }`}
              >
                <input 
                  type="radio" 
                  name="deletionType" 
                  checked={deletionType === 'DATA_ONLY'}
                  onChange={() => setDeletionType('DATA_ONLY')}
                  className="mt-1 accent-purple-500"
                />
                <div className="space-y-1">
                  <div className="text-xs font-black text-white">A. Delete Employee Data Only</div>
                  <p className="text-[11px] text-purple-200">
                    Removes operational business data (attendance, expenses, leaves, tasks, efficiency logs) while preserving the employee profile and device registration identity.
                  </p>
                </div>
              </label>

              <label 
                onClick={() => setDeletionType('COMPLETE')}
                className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                  deletionType === 'COMPLETE' 
                    ? 'bg-rose-600/20 border-rose-500 shadow-lg' 
                    : 'bg-[#2D1B5A] border-rose-500/30 hover:border-rose-400/50'
                }`}
              >
                <input 
                  type="radio" 
                  name="deletionType" 
                  checked={deletionType === 'COMPLETE'}
                  onChange={() => setDeletionType('COMPLETE')}
                  className="mt-1 accent-rose-500"
                />
                <div className="space-y-1">
                  <div className="text-xs font-black text-rose-300">B. Delete Employee Completely</div>
                  <p className="text-[11px] text-purple-200">
                    ⚠ Permanent Deletion. Completely removes the employee profile, registration, device association, and all operational records. The device will require a brand-new approval if registered again.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-between pt-3">
              <Button
                variant="outline"
                className="bg-[#2D1B5A] border-purple-500/30 text-white text-xs"
                onClick={() => setStep(1)}
              >
                ← Back
              </Button>
              <Button
                disabled={!deletionType}
                className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold"
                onClick={() => setStep(3)}
              >
                Continue to Code Confirmation →
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Type Employee Code to Confirm */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>Security Confirmation Required</span>
              </div>
              <p className="text-xs text-purple-200">
                To prevent accidental deletion, please type the exact employee code <strong className="text-amber-400 font-mono">{targetCode}</strong> below to enable confirmation.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-purple-300">Type Employee Code:</label>
              <input
                type="text"
                value={confirmCodeInput}
                onChange={(e) => setConfirmCodeInput(e.target.value)}
                placeholder={`e.g. ${targetCode}`}
                className="w-full px-4 py-3 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-white font-mono text-sm tracking-wider focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-between pt-3">
              <Button
                variant="outline"
                className="bg-[#2D1B5A] border-purple-500/30 text-white text-xs"
                onClick={() => setStep(2)}
              >
                ← Back
              </Button>
              <Button
                disabled={!isCodeMatched}
                className="bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold"
                onClick={() => setStep(4)}
              >
                Proceed to Final Warning →
              </Button>
            </div>
          </div>
        )}

        {/* Step 5: Final Confirmation */}
        {step === 4 && (
          <div className="space-y-4 text-center">
            <div className="w-14 h-14 bg-rose-500/20 border border-rose-500/40 rounded-full flex items-center justify-center mx-auto text-rose-400">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white">Are you absolutely sure?</h3>
              <p className="text-xs text-purple-200">
                You are about to execute <strong className="text-rose-400">{deletionType === 'COMPLETE' ? 'Complete Deletion' : 'Data-Only Deletion'}</strong> for <span className="text-white font-bold">{employee.name}</span> ({targetCode}). This action is logged permanently in the Super Admin audit trail.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs text-left">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-center gap-3 pt-3">
              <Button
                variant="outline"
                disabled={isExecuting}
                className="bg-[#2D1B5A] border-purple-500/30 text-white text-xs"
                onClick={() => setStep(3)}
              >
                Cancel
              </Button>
              <Button
                disabled={isExecuting}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold px-6"
                onClick={handleExecute}
              >
                {isExecuting ? 'Executing Deletion...' : 'Confirm Permanent Deletion'}
              </Button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 5 && (
          <div className="space-y-4 text-center py-4">
            <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-white">Deletion Successful</h3>
              <p className="text-xs text-emerald-300 font-semibold">{successResult}</p>
            </div>

            <div className="p-4 bg-[#2D1B5A] border border-purple-500/20 rounded-2xl text-left space-y-1.5 text-xs text-purple-200">
              <div className="font-bold text-white pb-1 border-b border-purple-500/20">Summary of Actions:</div>
              <div>• Operational business data scanned & removed</div>
              <div>• Audit log recorded permanently</div>
              {deletionType === 'COMPLETE' && <div>• Registration & device association completely wiped</div>}
            </div>

            <div className="pt-3">
              <Button
                className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold py-3"
                onClick={() => {
                  onSuccess();
                  onClose();
                }}
              >
                Close & Return
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
