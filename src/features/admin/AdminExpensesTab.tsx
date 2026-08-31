import React, { useState, useMemo, useEffect } from 'react';
import { getActiveDbSync } from '../../services/firebase/db_sync';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { ExpenseRecord, ExpenseCategory, EXPENSE_CATEGORIES } from '../../types/expense';
import { 
  approveExpenseClaim, 
  rejectExpenseClaim, 
  isExpensePending, 
  isExpenseApproved, 
  isExpenseRejected 
} from '../../services/expenses/expenseService';
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
  Eye,
  Loader2,
  Calendar,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  X,
  FileText,
  User,
  IndianRupee,
  RefreshCw,
  Building,
  Check
} from 'lucide-react';

interface AdminExpensesTabProps {
  activeEmpCodes?: Set<string>;
}

export const AdminExpensesTab: React.FC<AdminExpensesTabProps> = ({
  activeEmpCodes = new Set(),
}) => {
  const { user, role = 'ADMIN', loginId } = useAdminAuth();
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Firestore Subscription
  useEffect(() => {
    if (!getActiveDbSync()) return;
    const qExpenses = query(collection(getActiveDbSync(), 'expenses'), limit(500));
    const unsub = onSnapshot(qExpenses, (snapshot) => {
      const records: ExpenseRecord[] = [];
      snapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() } as ExpenseRecord);
      });
      setExpenseRecords(records);
      setIsLoading(false);
    }, (err) => {
      console.error('Error listening to expenses:', err);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Processing & Feedback States
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Receipt Modal
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);
  const [previewReceiptTitle, setPreviewReceiptTitle] = useState<string>('');
  const [zoomScale, setZoomScale] = useState<number>(1);

  // Rejection Dialog
  const [rejectModalRecord, setRejectModalRecord] = useState<ExpenseRecord | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Auto-dismiss feedback after 6 seconds
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev));
    }, 6000);
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    let totalCount = expenseRecords.length;
    let totalAmount = 0;
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedCount = 0;
    let approvedAmount = 0;
    let rejectedCount = 0;
    let rejectedAmount = 0;

    expenseRecords.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalAmount += amt;

      if (isExpenseApproved(exp.status)) {
        approvedCount++;
        approvedAmount += amt;
      } else if (isExpenseRejected(exp.status)) {
        rejectedCount++;
        rejectedAmount += amt;
      } else {
        pendingCount++;
        pendingAmount += amt;
      }
    });

    return {
      totalCount,
      totalAmount,
      pendingCount,
      pendingAmount,
      approvedCount,
      approvedAmount,
      rejectedCount,
      rejectedAmount,
    };
  }, [expenseRecords]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return expenseRecords.filter((exp) => {
      // 1. Status Filter
      if (statusFilter === 'PENDING' && !isExpensePending(exp.status)) return false;
      if (statusFilter === 'APPROVED' && !isExpenseApproved(exp.status)) return false;
      if (statusFilter === 'REJECTED' && !isExpenseRejected(exp.status)) return false;

      // 2. Category Filter
      if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) return false;

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchEmpName = (exp.employeeName || '').toLowerCase().includes(q);
        const matchEmpCode = (exp.employeeCode || exp.employeeId || '').toLowerCase().includes(q);
        const matchCategory = (exp.category || '').toLowerCase().includes(q);
        const matchDesc = (exp.description || '').toLowerCase().includes(q);
        const matchMerchant = (exp.merchant || '').toLowerCase().includes(q);
        const matchAmount = String(exp.amount || '').includes(q);
        const matchId = (exp.id || '').toLowerCase().includes(q);

        if (
          !matchEmpName &&
          !matchEmpCode &&
          !matchCategory &&
          !matchDesc &&
          !matchMerchant &&
          !matchAmount &&
          !matchId
        ) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      // Sort Pending items to top, then by date descending
      const aPending = isExpensePending(a.status);
      const bPending = isExpensePending(b.status);
      if (aPending && !bPending) return -1;
      if (!aPending && bPending) return 1;

      const dateA = new Date(a.date || a.createdAtDeviceTime || 0).getTime();
      const dateB = new Date(b.date || b.createdAtDeviceTime || 0).getTime();
      return dateB - dateA;
    });
  }, [expenseRecords, statusFilter, categoryFilter, searchQuery]);

  // Handle Approve
  const handleApprove = async (exp: ExpenseRecord) => {
    if (processingId) return; // Prevent concurrent/duplicate clicks
    setProcessingId(exp.id);

    try {
      await approveExpenseClaim(exp.id, {
        id: user?.uid,
        name: user?.displayName || loginId || 'Admin',
        role: role,
        loginId: loginId || undefined,
      });

      showFeedback(
        'success',
        `Expense claim of ₹${exp.amount.toLocaleString('en-IN')} for ${exp.employeeName} (${exp.employeeCode}) has been successfully approved.`
      );
    } catch (err: any) {
      console.error('Failed to approve expense claim:', err);
      showFeedback(
        'error',
        err.message || 'Failed to approve expense claim. Please check network connection and try again.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Reject Submit
  const handleRejectSubmit = async () => {
    if (!rejectModalRecord || processingId) return;
    setProcessingId(rejectModalRecord.id);

    try {
      await rejectExpenseClaim(rejectModalRecord.id, rejectionReason, {
        id: user?.uid,
        name: user?.displayName || loginId || 'Admin',
        role: role,
        loginId: loginId || undefined,
      });

      showFeedback(
        'success',
        `Expense claim of ₹${rejectModalRecord.amount.toLocaleString('en-IN')} for ${rejectModalRecord.employeeName} has been rejected.`
      );
      setRejectModalRecord(null);
      setRejectionReason('');
    } catch (err: any) {
      console.error('Failed to reject expense claim:', err);
      showFeedback('error', err.message || 'Failed to reject expense claim.');
    } finally {
      setProcessingId(null);
    }
  };

  const openReceiptModal = (url: string, title: string) => {
    setPreviewReceiptUrl(url);
    setPreviewReceiptTitle(title);
    setZoomScale(1);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-purple-500 animate-spin" />
        <p className="text-purple-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Fetching Expenses...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="admin-expenses-tab">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#250F4C] border border-purple-500/20 p-5 rounded-2xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Wallet className="w-6 h-6 text-emerald-400" />
            Expense Claims Audit & Approval
          </h2>
          <p className="text-xs text-purple-200/80 mt-1">
            Review, verify, and authoritatively approve employee reimbursement claims in Indian Rupees (₹).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-purple-300 bg-[#1A0B36] px-3.5 py-2 rounded-xl border border-purple-500/30">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Pending Review: <strong className="text-amber-300 font-bold">{metrics.pendingCount}</strong> claims</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Total Claims */}
        <Card className="p-4 bg-[#250F4C] border border-purple-500/20 space-y-1">
          <div className="text-[11px] font-bold text-purple-300 uppercase tracking-wider">Total Claims</div>
          <div className="text-xl font-black text-white">{metrics.totalCount}</div>
          <div className="text-[11px] text-purple-200/70 font-mono">₹{metrics.totalAmount.toLocaleString('en-IN')} total</div>
        </Card>

        {/* Pending Claims */}
        <Card 
          onClick={() => setStatusFilter('PENDING')}
          className={`p-4 bg-[#250F4C] border transition-all cursor-pointer space-y-1 ${
            statusFilter === 'PENDING' ? 'border-amber-400 shadow-md shadow-amber-500/10' : 'border-purple-500/20 hover:border-amber-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Pending Action</span>
            {metrics.pendingCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            )}
          </div>
          <div className="text-xl font-black text-amber-300">{metrics.pendingCount}</div>
          <div className="text-[11px] text-amber-200/70 font-mono">₹{metrics.pendingAmount.toLocaleString('en-IN')} pending</div>
        </Card>

        {/* Approved Claims */}
        <Card 
          onClick={() => setStatusFilter('APPROVED')}
          className={`p-4 bg-[#250F4C] border transition-all cursor-pointer space-y-1 ${
            statusFilter === 'APPROVED' ? 'border-emerald-400 shadow-md shadow-emerald-500/10' : 'border-purple-500/20 hover:border-emerald-500/40'
          }`}
        >
          <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">Approved</div>
          <div className="text-xl font-black text-emerald-400">{metrics.approvedCount}</div>
          <div className="text-[11px] text-emerald-200/70 font-mono">₹{metrics.approvedAmount.toLocaleString('en-IN')} disbursed</div>
        </Card>

        {/* Rejected Claims */}
        <Card 
          onClick={() => setStatusFilter('REJECTED')}
          className={`p-4 bg-[#250F4C] border transition-all cursor-pointer space-y-1 ${
            statusFilter === 'REJECTED' ? 'border-rose-400 shadow-md shadow-rose-500/10' : 'border-purple-500/20 hover:border-rose-500/40'
          }`}
        >
          <div className="text-[11px] font-bold text-rose-300 uppercase tracking-wider">Rejected</div>
          <div className="text-xl font-black text-rose-400">{metrics.rejectedCount}</div>
          <div className="text-[11px] text-rose-200/70 font-mono">₹{metrics.rejectedAmount.toLocaleString('en-IN')} rejected</div>
        </Card>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          id="admin-expense-feedback"
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-200'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-purple-300 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <Card className="p-4 bg-[#250F4C] border border-purple-500/20 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              id="filter-all-expenses"
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-[#1A0B36] text-purple-300 hover:bg-purple-900/40 border border-purple-500/20'
              }`}
            >
              All ({metrics.totalCount})
            </button>
            <button
              id="filter-pending-expenses"
              type="button"
              onClick={() => setStatusFilter('PENDING')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'PENDING'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-[#1A0B36] text-amber-300 hover:bg-purple-900/40 border border-amber-500/30'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Pending ({metrics.pendingCount})
            </button>
            <button
              id="filter-approved-expenses"
              type="button"
              onClick={() => setStatusFilter('APPROVED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'APPROVED'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-[#1A0B36] text-emerald-300 hover:bg-purple-900/40 border border-emerald-500/30'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approved ({metrics.approvedCount})
            </button>
            <button
              id="filter-rejected-expenses"
              type="button"
              onClick={() => setStatusFilter('REJECTED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'REJECTED'
                  ? 'bg-rose-600 text-white shadow'
                  : 'bg-[#1A0B36] text-rose-300 hover:bg-purple-900/40 border border-rose-500/30'
              }`}
            >
              <XCircle className="w-3.5 h-3.5" />
              Rejected ({metrics.rejectedCount})
            </button>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {/* Category select */}
            <select
              id="category-filter-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-[#1A0B36] border border-purple-500/30 text-xs text-purple-200 rounded-lg px-3 py-2 focus:outline-none focus:border-purple-400"
            >
              <option value="ALL">All Categories</option>
              {EXPENSE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="expense-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee, merchant, ID..."
                className="w-full bg-[#1A0B36] border border-purple-500/30 text-xs text-white placeholder-purple-400/60 rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:border-purple-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Main Expense Table */}
      <Card className="bg-[#250F4C] border border-purple-500/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#1A0B36] text-purple-300 uppercase font-bold border-b border-purple-500/20 tracking-wider">
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Employee</th>
                <th className="p-3.5">Category & Details</th>
                <th className="p-3.5">Description</th>
                <th className="p-3.5 text-center">Receipt</th>
                <th className="p-3.5">Amount</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10 text-white">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-purple-300/60">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Wallet className="w-8 h-8 text-purple-400/40" />
                      <p className="font-semibold text-sm">No expense claims match the selected criteria.</p>
                      <p className="text-xs text-purple-400/60">Try adjusting your filters or search query.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((exp) => {
                  const isPending = isExpensePending(exp.status);
                  const isApproved = isExpenseApproved(exp.status);
                  const isRejected = isExpenseRejected(exp.status);
                  const isProcessing = processingId === exp.id;
                  const receiptImg = exp.receiptUrl || exp.localReceiptData;

                  return (
                    <tr 
                      key={exp.id} 
                      id={`expense-row-${exp.id}`}
                      className="hover:bg-white/[0.03] transition-colors"
                    >
                      {/* Date & ID */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="font-bold text-white">{exp.date || 'N/A'}</div>
                        <div className="text-[10px] text-purple-300/60 font-mono">{exp.id.substring(0, 12)}...</div>
                      </td>

                      {/* Employee Info */}
                      <td className="p-3.5">
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{exp.employeeName || 'Unknown'}</span>
                          {!activeEmpCodes.has(exp.employeeCode) && (
                            <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase rounded">
                              Deleted
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-purple-300 font-mono">{exp.employeeCode || exp.employeeId}</div>
                      </td>

                      {/* Category & Merchant */}
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 bg-purple-900/60 border border-purple-500/30 text-purple-200 rounded text-[11px] font-semibold inline-block">
                          {exp.category}
                        </span>
                        {exp.merchant && (
                          <div className="text-[10px] text-purple-300/80 mt-0.5 font-medium truncate max-w-[140px]">
                            {exp.merchant}
                          </div>
                        )}
                        {exp.receiptNumber && (
                          <div className="text-[9px] text-purple-400/70 font-mono">
                            Bill #{exp.receiptNumber}
                          </div>
                        )}
                      </td>

                      {/* Description */}
                      <td className="p-3.5 max-w-[200px]">
                        <p className="text-purple-200 text-xs line-clamp-2" title={exp.description}>
                          {exp.description || 'No description provided.'}
                        </p>
                      </td>

                      {/* Receipt Preview */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {receiptImg ? (
                          <button
                            type="button"
                            onClick={() => openReceiptModal(receiptImg, `${exp.employeeName} - ₹${exp.amount} (${exp.category})`)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-800/40 hover:bg-purple-700/60 border border-purple-500/30 text-purple-200 hover:text-white rounded-lg text-[11px] font-medium transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>View</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-purple-400/50 italic">None</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="p-3.5 whitespace-nowrap">
                        <span className="font-mono text-sm font-black text-emerald-400">
                          ₹{Number(exp.amount || 0).toLocaleString('en-IN')}
                        </span>
                        {exp.gstAmount ? (
                          <div className="text-[9px] text-purple-300/70 font-mono">
                            GST: ₹{exp.gstAmount}
                          </div>
                        ) : null}
                      </td>

                      {/* Status Badge */}
                      <td className="p-3.5 whitespace-nowrap">
                        {isApproved ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Approved
                            </span>
                            {exp.approvedBy && (
                              <div className="text-[9px] text-purple-300/70 mt-0.5">
                                By {exp.approvedBy}
                              </div>
                            )}
                          </div>
                        ) : isRejected ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              <XCircle className="w-3 h-3 text-rose-400" />
                              Rejected
                            </span>
                            {exp.rejectionReason && (
                              <div className="text-[9px] text-rose-300/70 truncate max-w-[120px] mt-0.5" title={exp.rejectionReason}>
                                {exp.rejectionReason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            <Clock className="w-3 h-3 text-amber-400 animate-pulse" />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3.5 text-right whitespace-nowrap">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* APPROVE BUTTON */}
                            <button
                              id={`btn-approve-expense-${exp.id}`}
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleApprove(exp)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-lg shadow-sm shadow-emerald-950/40 border border-emerald-400/40 transition-all cursor-pointer"
                              title="Approve this expense claim"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              <span>{isProcessing ? 'Saving...' : 'Approve'}</span>
                            </button>

                            {/* REJECT BUTTON */}
                            <button
                              id={`btn-reject-expense-${exp.id}`}
                              type="button"
                              disabled={isProcessing}
                              onClick={() => {
                                setRejectModalRecord(exp);
                                setRejectionReason('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 active:bg-rose-950 disabled:opacity-50 disabled:cursor-not-allowed text-rose-300 hover:text-rose-100 font-semibold text-xs rounded-lg border border-rose-600/40 transition-all cursor-pointer"
                              title="Reject this expense claim"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                          </div>
                        ) : isApproved ? (
                          <span className="text-[11px] text-emerald-400/80 font-medium inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Finalized
                          </span>
                        ) : (
                          <span className="text-[11px] text-rose-400/80 font-medium inline-flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Declined
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* RECEIPT PREVIEW MODAL */}
      <Dialog
        isOpen={!!previewReceiptUrl}
        onClose={() => setPreviewReceiptUrl(null)}
        title={previewReceiptTitle || 'Expense Receipt'}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[#1A0B36] p-2.5 rounded-xl border border-purple-500/20">
            <span className="text-xs text-purple-200">Receipt Document Preview</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.max(0.5, s - 0.25))}
                className="p-1.5 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded-lg text-xs"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono text-purple-300 w-12 text-center">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.min(2.5, s + 0.25))}
                className="p-1.5 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded-lg text-xs"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(1)}
                className="px-2 py-1 bg-purple-900/60 hover:bg-purple-800 text-purple-200 rounded-lg text-xs"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="bg-[#120824] rounded-2xl border border-purple-500/20 p-2 overflow-auto max-h-[60vh] flex items-center justify-center">
            {previewReceiptUrl && (
              <img
                src={previewReceiptUrl}
                alt="Receipt Document"
                style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center center' }}
                className="max-w-full max-h-[500px] object-contain rounded-lg transition-transform duration-150"
              />
            )}
          </div>
        </div>
      </Dialog>

      {/* REJECTION REASON MODAL */}
      <Dialog
        isOpen={!!rejectModalRecord}
        onClose={() => setRejectModalRecord(null)}
        title="Reject Expense Claim"
      >
        <div className="space-y-4 text-white">
          <div className="bg-[#1A0B36] p-4 rounded-xl border border-purple-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-300">Employee:</span>
              <span className="font-bold text-white">{rejectModalRecord?.employeeName} ({rejectModalRecord?.employeeCode})</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-300">Category & Amount:</span>
              <span className="font-bold text-emerald-400">{rejectModalRecord?.category} — ₹{rejectModalRecord?.amount}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-purple-300">Claim Date:</span>
              <span className="text-purple-200">{rejectModalRecord?.date}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-purple-200 uppercase mb-1.5">
              Rejection Reason <span className="text-rose-400">*</span>
            </label>
            <textarea
              id="expense-rejection-reason"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Missing valid GST tax invoice / Invalid category / Exceeds allowed daily limit"
              className="w-full bg-[#1A0B36] border border-purple-500/40 text-xs text-white rounded-xl p-3 focus:outline-none focus:border-rose-400"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRejectModalRecord(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <button
              id="btn-confirm-reject-expense"
              type="button"
              disabled={!rejectionReason.trim() || !!processingId}
              onClick={handleRejectSubmit}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow border border-rose-400/40 transition-all cursor-pointer flex items-center gap-1.5"
            >
              {processingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              <span>Confirm Rejection</span>
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
