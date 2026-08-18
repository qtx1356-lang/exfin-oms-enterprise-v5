import React, { useState } from 'react';
import { ExpenseRecord, ExpenseCategory, EXPENSE_CATEGORIES } from '../../types/expense';
import { reviewExpenseClaim } from '../../services/expenses/expenseService';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  Wallet,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Paperclip,
  Check,
  X,
  AlertTriangle,
  FileText,
  User,
  Calendar,
  IndianRupee,
  Receipt,
  Eye,
  RotateCcw,
  Loader2,
  Info
} from 'lucide-react';

interface AdminExpenseManagementTabProps {
  expenseRecords: ExpenseRecord[];
  activeEmpCodes?: Set<string>;
}

export const AdminExpenseManagementTab: React.FC<AdminExpenseManagementTabProps> = ({
  expenseRecords,
  activeEmpCodes = new Set(),
}) => {
  const { user, role = 'ADMIN', loginId } = useAdminAuth();

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Modal / Action States
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [modalType, setModalType] = useState<'APPROVE' | 'REJECT' | 'DETAILS' | 'RECEIPT' | null>(null);
  const [adminRemark, setAdminRemark] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Receipt Zoom Modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Status Normalizer
  const getNormalizedStatus = (status?: string): 'PENDING' | 'APPROVED' | 'REJECTED' => {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'APPROVED') return 'APPROVED';
    if (s === 'REJECTED') return 'REJECTED';
    return 'PENDING';
  };

  // Metrics
  const totalCount = expenseRecords.length;
  const pendingRecords = expenseRecords.filter((e) => getNormalizedStatus(e.status) === 'PENDING');
  const approvedRecords = expenseRecords.filter((e) => getNormalizedStatus(e.status) === 'APPROVED');
  const rejectedRecords = expenseRecords.filter((e) => getNormalizedStatus(e.status) === 'REJECTED');

  const pendingCount = pendingRecords.length;
  const approvedCount = approvedRecords.length;
  const rejectedCount = rejectedRecords.length;

  const totalClaimedAmount = expenseRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalPendingAmount = pendingRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);
  const totalApprovedAmount = approvedRecords.reduce((acc, curr) => acc + (curr.amount || 0), 0);

  // Filter Expenses
  const filteredExpenses = expenseRecords.filter((exp) => {
    const normStatus = getNormalizedStatus(exp.status);
    if (statusFilter !== 'ALL' && normStatus !== statusFilter) {
      return false;
    }

    if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) {
      return false;
    }

    if (dateFilter && !exp.date?.includes(dateFilter)) {
      return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = exp.employeeName?.toLowerCase().includes(q);
      const matchCode = exp.employeeCode?.toLowerCase().includes(q);
      const matchDesc = exp.description?.toLowerCase().includes(q);
      const matchCat = exp.category?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchDesc && !matchCat) {
        return false;
      }
    }

    return true;
  });

  // Sort: Pending first, then by date descending
  const sortedExpenses = [...filteredExpenses].sort((a, b) => {
    const statusA = getNormalizedStatus(a.status);
    const statusB = getNormalizedStatus(b.status);
    if (statusA === 'PENDING' && statusB !== 'PENDING') return -1;
    if (statusA !== 'PENDING' && statusB === 'PENDING') return 1;

    const timeA = new Date(a.createdAtDeviceTime || a.date).getTime();
    const timeB = new Date(b.createdAtDeviceTime || b.date).getTime();
    return timeB - timeA;
  });

  // Open Approval Modal
  const handleOpenApproveModal = (exp: ExpenseRecord) => {
    setSelectedExpense(exp);
    setAdminRemark('');
    setErrorMsg(null);
    setModalType('APPROVE');
  };

  // Open Rejection Modal
  const handleOpenRejectModal = (exp: ExpenseRecord) => {
    setSelectedExpense(exp);
    setRejectionReason('');
    setAdminRemark('');
    setErrorMsg(null);
    setModalType('REJECT');
  };

  // Open Details Modal
  const handleOpenDetailsModal = (exp: ExpenseRecord) => {
    setSelectedExpense(exp);
    setModalType('DETAILS');
  };

  // Open Receipt Preview
  const handleOpenReceipt = (receiptSrc: string) => {
    setPreviewReceiptUrl(receiptSrc);
    setZoomScale(1);
    setModalType('RECEIPT');
  };

  // Close Modals
  const closeModal = () => {
    if (isSubmitting) return;
    setSelectedExpense(null);
    setModalType(null);
    setAdminRemark('');
    setRejectionReason('');
    setErrorMsg(null);
  };

  // Confirm Approval
  const handleConfirmApprove = async () => {
    if (!selectedExpense || isSubmitting) return;

    const currentNorm = getNormalizedStatus(selectedExpense.status);
    if (currentNorm !== 'PENDING') {
      setErrorMsg(`This expense claim has already been ${currentNorm.toLowerCase()}.`);
      return;
    }

    setIsSubmitting(true);
    setActionLoadingId(selectedExpense.id);
    setErrorMsg(null);

    const adminName = user?.displayName || loginId || 'Administrator';
    const adminUserId = user?.uid || loginId || 'admin';

    try {
      await reviewExpenseClaim(
        selectedExpense.id,
        'APPROVE',
        { id: adminUserId, name: adminName, role },
        undefined,
        adminRemark.trim() || undefined
      );

      setSuccessMsg(`Expense claim of ₹${selectedExpense.amount} for ${selectedExpense.employeeName} approved successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      closeModal();
    } catch (err: any) {
      console.error('Failed to approve expense claim:', err);
      setErrorMsg(err.message || 'Failed to approve expense claim. Please try again.');
    } finally {
      setIsSubmitting(false);
      setActionLoadingId(null);
    }
  };

  // Confirm Rejection
  const handleConfirmReject = async () => {
    if (!selectedExpense || isSubmitting) return;

    if (!rejectionReason.trim()) {
      setErrorMsg('Please specify a rejection reason for the employee.');
      return;
    }

    const currentNorm = getNormalizedStatus(selectedExpense.status);
    if (currentNorm !== 'PENDING') {
      setErrorMsg(`This expense claim has already been ${currentNorm.toLowerCase()}.`);
      return;
    }

    setIsSubmitting(true);
    setActionLoadingId(selectedExpense.id);
    setErrorMsg(null);

    const adminName = user?.displayName || loginId || 'Administrator';
    const adminUserId = user?.uid || loginId || 'admin';

    try {
      await reviewExpenseClaim(
        selectedExpense.id,
        'REJECT',
        { id: adminUserId, name: adminName, role },
        rejectionReason.trim(),
        adminRemark.trim() || undefined
      );

      setSuccessMsg(`Expense claim for ${selectedExpense.employeeName} has been rejected.`);
      setTimeout(() => setSuccessMsg(null), 4000);
      closeModal();
    } catch (err: any) {
      console.error('Failed to reject expense claim:', err);
      setErrorMsg(err.message || 'Failed to reject expense claim. Please try again.');
    } finally {
      setIsSubmitting(false);
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded-2xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Header & Metrics Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 bg-[#1E0E3D] border border-purple-500/20 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-300/70">
            Total Claims
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-white">{totalCount}</span>
            <span className="text-xs font-bold text-purple-300 font-mono">₹{totalClaimedAmount.toLocaleString('en-IN')}</span>
          </div>
        </Card>

        <Card className="p-4 bg-[#1E0E3D] border border-amber-500/30 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
            Pending Audit
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-amber-300">{pendingCount}</span>
            <span className="text-xs font-bold text-amber-200 font-mono">₹{totalPendingAmount.toLocaleString('en-IN')}</span>
          </div>
        </Card>

        <Card className="p-4 bg-[#1E0E3D] border border-emerald-500/30 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
            Approved
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-emerald-400">{approvedCount}</span>
            <span className="text-xs font-bold text-emerald-300 font-mono">₹{totalApprovedAmount.toLocaleString('en-IN')}</span>
          </div>
        </Card>

        <Card className="p-4 bg-[#1E0E3D] border border-rose-500/30 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
            Rejected
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-2xl font-black text-rose-400">{rejectedCount}</span>
            <span className="text-xs font-bold text-rose-300 font-mono">
              {rejectedCount > 0 ? `${rejectedCount} claims` : '0'}
            </span>
          </div>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card className="p-4 bg-[#250F4C] border border-purple-500/20 space-y-3 rounded-2xl">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((tab) => {
              const count = tab === 'ALL' ? totalCount : tab === 'PENDING' ? pendingCount : tab === 'APPROVED' ? approvedCount : rejectedCount;
              const isActive = statusFilter === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                    isActive
                      ? tab === 'PENDING'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                        : tab === 'APPROVED'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                        : tab === 'REJECTED'
                        ? 'bg-rose-600 text-white border-rose-400 shadow-md'
                        : 'bg-[#7C3AED] text-white border-purple-400 shadow-md'
                      : 'bg-[#1A0B36] text-purple-200 border-purple-500/20 hover:bg-[#2D1B5A]'
                  }`}
                >
                  <span>{tab === 'ALL' ? 'All Claims' : tab.charAt(0) + tab.slice(1).toLowerCase()}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? 'bg-black/20 text-white font-black' : 'bg-purple-900/40 text-purple-300'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employee, category, note..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#1A0B36] border border-purple-500/30 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>
        </div>

        {/* Secondary Category & Date Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-purple-500/30 bg-[#1A0B36] text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
          >
            <option value="ALL">All Categories</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl border border-purple-500/30 bg-[#1A0B36] text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="px-2.5 py-2 rounded-xl bg-[#1A0B36] border border-purple-500/30 text-purple-300 hover:text-white text-xs font-bold"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Audit Table */}
      <Card className="p-0 bg-[#250F4C] border border-purple-500/20 overflow-hidden rounded-2xl shadow-xl">
        <div className="p-4 border-b border-purple-500/20 flex items-center justify-between">
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-400" /> Expense Claims Audit
          </h3>
          <span className="text-xs font-semibold text-purple-300">
            Showing {sortedExpenses.length} of {totalCount} records
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold border-b border-purple-500/20">
                <th className="p-3.5">Employee</th>
                <th className="p-3.5">Category & Date</th>
                <th className="p-3.5">Description</th>
                <th className="p-3.5">Amount (₹)</th>
                <th className="p-3.5 text-center">Receipt</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {sortedExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-purple-300/60">
                    <EmptyState
                      icon={Receipt}
                      title="No Expense Claims Found"
                      description="No records match your selected filter criteria."
                    />
                  </td>
                </tr>
              ) : (
                sortedExpenses.map((exp) => {
                  const normStatus = getNormalizedStatus(exp.status);
                  const isPending = normStatus === 'PENDING';
                  const isApproved = normStatus === 'APPROVED';
                  const isRejected = normStatus === 'REJECTED';
                  const receiptSrc = exp.receiptUrl || exp.localReceiptData;

                  return (
                    <tr key={exp.id} className="hover:bg-white/[0.03] transition-colors">
                      {/* Employee Info */}
                      <td className="p-3.5 font-bold text-white align-top">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>{exp.employeeName}</span>
                            {!activeEmpCodes.has(exp.employeeCode) && (
                              <span className="px-1.5 py-0.2 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase rounded">
                                Deleted
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-purple-300/70 font-mono">
                            {exp.employeeCode}
                          </span>
                        </div>
                      </td>

                      {/* Category & Date */}
                      <td className="p-3.5 text-purple-200 align-top">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-extrabold text-white text-xs">{exp.category}</span>
                          <span className="text-[11px] text-purple-300/80 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-purple-400" /> {exp.date}
                          </span>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="p-3.5 text-purple-200 max-w-xs align-top">
                        <p className="line-clamp-2 leading-relaxed text-[11px]">
                          {exp.description}
                        </p>
                      </td>

                      {/* Amount */}
                      <td className="p-3.5 font-black text-white text-sm font-mono align-top">
                        <span className="text-emerald-400">
                          ₹{exp.amount.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Receipt */}
                      <td className="p-3.5 text-center align-top">
                        {receiptSrc ? (
                          <button
                            type="button"
                            onClick={() => handleOpenReceipt(receiptSrc)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 text-[11px] font-bold transition-colors"
                            title="View Attached Receipt"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-purple-300" />
                            <span>View</span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-purple-400/40 italic">None</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 align-top">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border w-max ${
                            isApproved
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : isRejected
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}>
                            {isApproved ? (
                              <><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Approved</>
                            ) : isRejected ? (
                              <><XCircle className="w-3 h-3 text-rose-400" /> Rejected</>
                            ) : (
                              <><Clock className="w-3 h-3 text-amber-400" /> Pending</>
                            )}
                          </span>

                          {/* Approval Details */}
                          {isApproved && (exp.approvedByName || exp.actionedBy) && (
                            <span className="text-[9px] text-emerald-300/70">
                              By {exp.approvedByName || exp.actionedBy}
                            </span>
                          )}

                          {/* Rejection Details */}
                          {isRejected && exp.rejectionReason && (
                            <span className="text-[9px] text-rose-300/80 italic max-w-[140px] truncate" title={exp.rejectionReason}>
                              {exp.rejectionReason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPending ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenApproveModal(exp)}
                                disabled={actionLoadingId === exp.id}
                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center gap-1 shadow-md shadow-emerald-950/40 disabled:opacity-50 transition-transform active:scale-95"
                                title="Approve this claim"
                              >
                                {actionLoadingId === exp.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>Approve</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenRejectModal(exp)}
                                disabled={actionLoadingId === exp.id}
                                className="px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white font-extrabold text-xs flex items-center gap-1 border border-rose-500/30 disabled:opacity-50 transition-transform active:scale-95"
                                title="Reject this claim"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenDetailsModal(exp)}
                              className="px-2.5 py-1.5 rounded-xl bg-[#1A0B36] hover:bg-[#2D1B5A] text-purple-300 border border-purple-500/20 text-xs font-semibold flex items-center gap-1"
                            >
                              <Info className="w-3.5 h-3.5" /> Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal 1: Approve Confirmation Dialog */}
      <Dialog
        isOpen={modalType === 'APPROVE' && !!selectedExpense}
        onClose={closeModal}
        title="Approve Expense Claim"
      >
        {selectedExpense && (
          <div className="space-y-4 text-white">
            <div className="p-4 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-white">
                    {selectedExpense.employeeName}
                  </h4>
                  <p className="text-xs text-emerald-300/80 font-mono">
                    Code: {selectedExpense.employeeCode}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-emerald-400 font-mono">
                    ₹{selectedExpense.amount.toLocaleString('en-IN')}
                  </span>
                  <p className="text-[10px] uppercase font-bold text-emerald-300/70">
                    {selectedExpense.category}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-emerald-500/20 text-xs text-purple-200">
                <span className="font-bold text-white">Date:</span> {selectedExpense.date}
              </div>

              <div className="text-xs text-purple-200/90 leading-relaxed bg-[#1A0B36]/60 p-2.5 rounded-xl">
                <span className="font-bold text-purple-300">Purpose:</span> {selectedExpense.description}
              </div>

              {(selectedExpense.receiptUrl || selectedExpense.localReceiptData) && (
                <div className="flex items-center gap-2 pt-1">
                  <Paperclip className="w-3.5 h-3.5 text-emerald-400" />
                  <button
                    type="button"
                    onClick={() => handleOpenReceipt((selectedExpense.receiptUrl || selectedExpense.localReceiptData)!)}
                    className="text-xs text-emerald-300 font-bold hover:underline"
                  >
                    View Attached Receipt
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider">
                Admin Note / Remarks (Optional)
              </label>
              <textarea
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                placeholder="Add approval comment or accounting note..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-[#1A0B36] border border-purple-500/30 text-white text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="text"
                onClick={closeModal}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isSubmitting}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl py-2.5 flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>Confirm Approval</span>
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal 2: Reject Reason Dialog */}
      <Dialog
        isOpen={modalType === 'REJECT' && !!selectedExpense}
        onClose={closeModal}
        title="Reject Expense Claim"
      >
        {selectedExpense && (
          <div className="space-y-4 text-white">
            <div className="p-4 bg-rose-950/30 border border-rose-500/30 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-white">
                    {selectedExpense.employeeName}
                  </h4>
                  <p className="text-xs text-rose-300/80 font-mono">
                    Code: {selectedExpense.employeeCode}
                  </p>
                </div>
                <span className="text-base font-black text-rose-400 font-mono">
                  ₹{selectedExpense.amount.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-xs text-purple-200">
                <span className="font-bold text-white">Category:</span> {selectedExpense.category} • <span className="font-bold text-white">Date:</span> {selectedExpense.date}
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-200 uppercase tracking-wider flex items-center gap-1">
                <span>Rejection Reason</span>
                <span className="text-rose-400 font-extrabold">*</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Specify why this expense claim is rejected (e.g. invalid receipt, policy limit exceeded, missing proof)..."
                rows={3}
                required
                className="w-full px-3 py-2 rounded-xl bg-[#1A0B36] border border-rose-500/40 text-white text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 text-rose-200 rounded-xl text-xs font-bold">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="text"
                onClick={closeModal}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmitting}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl py-2.5 flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
                <span>Confirm Rejection</span>
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Modal 3: Claim Details Modal */}
      <Dialog
        isOpen={modalType === 'DETAILS' && !!selectedExpense}
        onClose={closeModal}
        title="Expense Claim Details"
      >
        {selectedExpense && (
          <div className="space-y-4 text-white">
            <div className="grid grid-cols-2 gap-3 bg-[#1A0B36] p-4 rounded-2xl border border-purple-500/20">
              <div>
                <span className="text-[10px] text-purple-400 uppercase font-bold">Employee</span>
                <p className="text-xs font-bold text-white">{selectedExpense.employeeName}</p>
                <p className="text-[10px] text-purple-300 font-mono">{selectedExpense.employeeCode}</p>
              </div>

              <div>
                <span className="text-[10px] text-purple-400 uppercase font-bold">Amount</span>
                <p className="text-sm font-black text-emerald-400 font-mono">₹{selectedExpense.amount.toLocaleString('en-IN')}</p>
              </div>

              <div>
                <span className="text-[10px] text-purple-400 uppercase font-bold">Category</span>
                <p className="text-xs font-semibold text-white">{selectedExpense.category}</p>
              </div>

              <div>
                <span className="text-[10px] text-purple-400 uppercase font-bold">Date</span>
                <p className="text-xs font-semibold text-white">{selectedExpense.date}</p>
              </div>
            </div>

            <div className="bg-[#1A0B36] p-4 rounded-2xl border border-purple-500/20 space-y-1">
              <span className="text-[10px] text-purple-400 uppercase font-bold">Description</span>
              <p className="text-xs text-purple-200 leading-relaxed">{selectedExpense.description}</p>
            </div>

            {/* Audit Status History */}
            <div className="bg-[#1A0B36] p-4 rounded-2xl border border-purple-500/20 space-y-2">
              <span className="text-[10px] text-purple-400 uppercase font-bold">Audit Status</span>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black border ${
                  getNormalizedStatus(selectedExpense.status) === 'APPROVED'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : getNormalizedStatus(selectedExpense.status) === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {selectedExpense.status}
                </span>
              </div>

              {selectedExpense.actionedBy && (
                <p className="text-xs text-purple-200">
                  <span className="font-bold text-white">Actioned By:</span> {selectedExpense.actionedBy}
                  {selectedExpense.actionedAt && ` on ${new Date(selectedExpense.actionedAt).toLocaleString()}`}
                </p>
              )}

              {selectedExpense.rejectionReason && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-200">
                  <span className="font-bold text-rose-300">Rejection Reason:</span> {selectedExpense.rejectionReason}
                </div>
              )}

              {selectedExpense.adminRemark && (
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs text-purple-200">
                  <span className="font-bold text-purple-300">Admin Remark:</span> {selectedExpense.adminRemark}
                </div>
              )}
            </div>

            {(selectedExpense.receiptUrl || selectedExpense.localReceiptData) && (
              <div className="pt-1">
                <Button
                  type="button"
                  onClick={() => handleOpenReceipt((selectedExpense.receiptUrl || selectedExpense.localReceiptData)!)}
                  className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold rounded-xl py-2.5 flex items-center justify-center gap-2"
                >
                  <Paperclip className="w-4 h-4" /> View Full Receipt
                </Button>
              </div>
            )}

            <Button
              type="button"
              variant="text"
              onClick={closeModal}
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      </Dialog>

      {/* Modal 4: Receipt Image Zoom Preview Dialog */}
      <Dialog
        isOpen={modalType === 'RECEIPT' && !!previewReceiptUrl}
        onClose={closeModal}
        title="Expense Receipt Preview"
      >
        {previewReceiptUrl && (
          <div className="space-y-4 text-white">
            <div className="relative max-h-[60vh] overflow-auto bg-black/80 rounded-2xl border border-purple-500/30 p-2 flex items-center justify-center">
              <img
                src={previewReceiptUrl}
                alt="Receipt Full View"
                style={{ transform: `scale(${zoomScale})` }}
                className="max-w-full h-auto object-contain transition-transform duration-200 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-purple-300">Zoom:</span>
                {[1, 1.5, 2].map((scale) => (
                  <button
                    key={scale}
                    onClick={() => setZoomScale(scale)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all border ${
                      zoomScale === scale
                        ? 'bg-[#7C3AED] text-white border-purple-400'
                        : 'bg-[#1A0B36] text-purple-300 border-purple-500/20'
                    }`}
                  >
                    {scale}x
                  </button>
                ))}
              </div>

              <Button onClick={closeModal}>Close Preview</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
