import React, { useState, useEffect } from 'react';
import { getDb } from '../../services/firebase/db';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { LeaveRecord } from '../../types/leave';
import { reviewLeaveRequest } from '../../services/leave/leaveService';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { createAuditLog } from '../../services/audit/auditService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  User,
  Building,
  FileText,
  Loader2,
  Check,
  X,
  Info,
  RefreshCw,
} from 'lucide-react';

interface AdminLeaveManagementTabProps {
  activeEmpCodes?: Set<string>;
}

export const AdminLeaveManagementTab: React.FC<AdminLeaveManagementTabProps> = ({ activeEmpCodes }) => {
  const { user, role = 'ADMIN', loginId } = useAdminAuth();
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Firestore Subscription
  useEffect(() => {
    let isMounted = true;
    let unsub = () => {};

    getDb().then((activeDb) => {
      if (!isMounted || !activeDb) {
        setIsLoading(false);
        return;
      }

      const qLeaves = query(collection(activeDb, 'leaves'), limit(500));
      unsub = onSnapshot(qLeaves, (snapshot) => {
        if (!isMounted) return;
        const records: LeaveRecord[] = [];
        snapshot.forEach((doc) => {
          records.push({ id: doc.id, ...doc.data() } as LeaveRecord);
        });
        setLeaves(records);
        setIsLoading(false);
      }, (err) => {
        console.error('Error listening to leaves:', err);
        if (isMounted) setIsLoading(false);
      });
    }).catch(() => {
      if (isMounted) setIsLoading(false);
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal / Action States
  const [selectedLeave, setSelectedLeave] = useState<LeaveRecord | null>(null);
  const [modalType, setModalType] = useState<'APPROVE' | 'REJECT' | 'DETAILS' | null>(null);
  const [adminRemark, setAdminRemark] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Counts
  const pendingCount = leaves.filter((l) => l.status === 'PENDING').length;
  const approvedCount = leaves.filter((l) => l.status === 'APPROVED').length;
  const rejectedCount = leaves.filter((l) => l.status === 'REJECTED').length;
  const totalCount = leaves.length;

  // Filter & Sort Leaves
  const filteredLeaves = leaves.filter((l) => {
    // Status Filter
    if (statusFilter !== 'ALL' && l.status !== statusFilter) {
      return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = l.employeeName?.toLowerCase().includes(q);
      const matchCode = l.employeeCode?.toLowerCase().includes(q);
      const matchReason = l.reason?.toLowerCase().includes(q);
      const matchDept = l.department?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchReason && !matchDept) {
        return false;
      }
    }

    return true;
  });

  // Sort: PENDING requests first, then by date descending
  const sortedLeaves = [...filteredLeaves].sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;

    const timeA = new Date(a.createdAtDeviceTime || a.submittedAtDeviceTime || a.startDate).getTime();
    const timeB = new Date(b.createdAtDeviceTime || b.submittedAtDeviceTime || b.startDate).getTime();
    return timeB - timeA;
  });

  // Open Approval Confirmation
  const handleOpenApproveModal = (leave: LeaveRecord) => {
    setSelectedLeave(leave);
    setAdminRemark('');
    setErrorMsg(null);
    setModalType('APPROVE');
  };

  // Open Rejection Confirmation
  const handleOpenRejectModal = (leave: LeaveRecord) => {
    setSelectedLeave(leave);
    setAdminRemark('');
    setErrorMsg(null);
    setModalType('REJECT');
  };

  // Open Details Modal
  const handleOpenDetailsModal = (leave: LeaveRecord) => {
    setSelectedLeave(leave);
    setModalType('DETAILS');
  };

  // Close Modal
  const closeModal = () => {
    if (isSubmitting) return; // prevent closing while processing
    setSelectedLeave(null);
    setModalType(null);
    setAdminRemark('');
  };

  // Confirm Approval Action
  const handleConfirmApprove = async () => {
    if (!selectedLeave || isSubmitting) return;

    // Prevent approving non-pending request
    if (selectedLeave.status !== 'PENDING') {
      setErrorMsg(`Leave request has already been ${selectedLeave.status.toLowerCase()}.`);
      return;
    }

    setIsSubmitting(true);
    setActionLoadingId(selectedLeave.id);
    setErrorMsg(null);

    const adminName = user?.displayName || loginId || 'Administrator';
    const adminUserId = user?.uid || loginId || 'admin';

    try {
      // 1. Process approval via service (updates Firestore + local + sends multi-channel notification)
      await reviewLeaveRequest(
        selectedLeave.id,
        'ADMIN',
        { id: adminUserId, name: adminName },
        'APPROVE',
        adminRemark.trim()
      );

      // 2. Log Audit Trail
      await createAuditLog({
        action: 'Leave Approval',
        actionCategory: 'Leave',
        performedByUserId: adminUserId,
        performedByName: adminName,
        performedByRole: role,
        employeeCode: selectedLeave.employeeCode,
        targetUserId: selectedLeave.employeeId,
        targetUserName: selectedLeave.employeeName,
        targetRecordId: selectedLeave.id,
        description: `Approved leave request for ${selectedLeave.employeeName} (${selectedLeave.employeeCode}) from ${selectedLeave.startDate} to ${selectedLeave.endDate} (${selectedLeave.totalDays} days)`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL',
        metadata: {
          leaveId: selectedLeave.id,
          totalDays: selectedLeave.totalDays,
          startDate: selectedLeave.startDate,
          endDate: selectedLeave.endDate,
          adminRemark: adminRemark.trim() || null,
        },
      });

      setSuccessMsg(`Leave request for ${selectedLeave.employeeName} has been approved.`);
      setTimeout(() => setSuccessMsg(null), 4000);

      closeModal();
    } catch (err: any) {
      console.error('Failed to approve leave request:', err);
      setErrorMsg(err.message || 'An error occurred while approving the leave request. Please try again.');
    } finally {
      setIsSubmitting(false);
      setActionLoadingId(null);
    }
  };

  // Confirm Rejection Action
  const handleConfirmReject = async () => {
    if (!selectedLeave || isSubmitting) return;

    // Prevent rejecting non-pending request
    if (selectedLeave.status !== 'PENDING') {
      setErrorMsg(`Leave request has already been ${selectedLeave.status.toLowerCase()}.`);
      return;
    }

    setIsSubmitting(true);
    setActionLoadingId(selectedLeave.id);
    setErrorMsg(null);

    const adminName = user?.displayName || loginId || 'Administrator';
    const adminUserId = user?.uid || loginId || 'admin';

    try {
      // 1. Process rejection via service (updates Firestore + local + sends multi-channel notification)
      await reviewLeaveRequest(
        selectedLeave.id,
        'ADMIN',
        { id: adminUserId, name: adminName },
        'REJECT',
        adminRemark.trim()
      );

      // 2. Log Audit Trail
      await createAuditLog({
        action: 'Leave Rejection',
        actionCategory: 'Leave',
        performedByUserId: adminUserId,
        performedByName: adminName,
        performedByRole: role,
        employeeCode: selectedLeave.employeeCode,
        targetUserId: selectedLeave.employeeId,
        targetUserName: selectedLeave.employeeName,
        targetRecordId: selectedLeave.id,
        description: `Rejected leave request for ${selectedLeave.employeeName} (${selectedLeave.employeeCode}) from ${selectedLeave.startDate} to ${selectedLeave.endDate}. Reason: ${adminRemark.trim() || 'None provided'}`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL',
        metadata: {
          leaveId: selectedLeave.id,
          startDate: selectedLeave.startDate,
          endDate: selectedLeave.endDate,
          rejectionReason: adminRemark.trim() || null,
        },
      });

      setSuccessMsg(`Leave request for ${selectedLeave.employeeName} has been rejected.`);
      setTimeout(() => setSuccessMsg(null), 4000);

      closeModal();
    } catch (err: any) {
      console.error('Failed to reject leave request:', err);
      setErrorMsg(err.message || 'An error occurred while rejecting the leave request. Please try again.');
    } finally {
      setIsSubmitting(false);
      setActionLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-10 h-10 text-purple-500 animate-spin" />
        <p className="text-purple-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Fetching Leave Requests...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner / Toast Messages */}
      {successMsg && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-bold flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card
          onClick={() => setStatusFilter('PENDING')}
          className={`p-4 cursor-pointer transition-all border ${
            statusFilter === 'PENDING'
              ? 'bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/10'
              : 'bg-[#250F4C] border-purple-500/20 hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-amber-300 uppercase tracking-wider">Pending</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">{pendingCount}</div>
          <p className="text-[10px] text-purple-300/60 mt-0.5">Requires Action</p>
        </Card>

        <Card
          onClick={() => setStatusFilter('APPROVED')}
          className={`p-4 cursor-pointer transition-all border ${
            statusFilter === 'APPROVED'
              ? 'bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
              : 'bg-[#250F4C] border-purple-500/20 hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-emerald-300 uppercase tracking-wider">Approved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">{approvedCount}</div>
          <p className="text-[10px] text-purple-300/60 mt-0.5">Fully Finalized</p>
        </Card>

        <Card
          onClick={() => setStatusFilter('REJECTED')}
          className={`p-4 cursor-pointer transition-all border ${
            statusFilter === 'REJECTED'
              ? 'bg-rose-500/15 border-rose-500/50 shadow-lg shadow-rose-500/10'
              : 'bg-[#250F4C] border-purple-500/20 hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-rose-300 uppercase tracking-wider">Rejected</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-white mt-1">{rejectedCount}</div>
          <p className="text-[10px] text-purple-300/60 mt-0.5">Declined Requests</p>
        </Card>

        <Card
          onClick={() => setStatusFilter('ALL')}
          className={`p-4 cursor-pointer transition-all border ${
            statusFilter === 'ALL'
              ? 'bg-purple-500/20 border-purple-500/60 shadow-lg shadow-purple-500/10'
              : 'bg-[#250F4C] border-purple-500/20 hover:border-purple-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-purple-200 uppercase tracking-wider">Total</span>
            <Calendar className="w-4 h-4 text-purple-300" />
          </div>
          <div className="text-2xl font-black text-white mt-1">{totalCount}</div>
          <p className="text-[10px] text-purple-300/60 mt-0.5">All Submissions</p>
        </Card>
      </div>

      {/* Main Leave Portal Panel */}
      <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-5 rounded-[24px]">
        {/* Title & Search Bar Header */}
        <div className="flex flex-col md:flex-row gap-4 justify-between md:items-center pb-2 border-b border-purple-500/15">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-5 h-5 text-amber-400" /> Leave Management Portal
            </h3>
            <p className="text-xs text-purple-300/70 mt-0.5">
              Review, approve, or decline employee leave applications with real-time app synchronization
            </p>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-purple-300/50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee, code, reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-purple-300/50 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              statusFilter === 'PENDING'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-[#1A0B36] text-purple-300 hover:bg-purple-500/20 border border-purple-500/20'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            Pending ({pendingCount})
          </button>

          <button
            onClick={() => setStatusFilter('APPROVED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              statusFilter === 'APPROVED'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-[#1A0B36] text-purple-300 hover:bg-purple-500/20 border border-purple-500/20'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Approved ({approvedCount})
          </button>

          <button
            onClick={() => setStatusFilter('REJECTED')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              statusFilter === 'REJECTED'
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                : 'bg-[#1A0B36] text-purple-300 hover:bg-purple-500/20 border border-purple-500/20'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            Rejected ({rejectedCount})
          </button>

          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              statusFilter === 'ALL'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                : 'bg-[#1A0B36] text-purple-300 hover:bg-purple-500/20 border border-purple-500/20'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            All ({totalCount})
          </button>
        </div>

        {/* Leave Records Grid / List */}
        <div className="space-y-4 pt-2">
          {sortedLeaves.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-purple-500/20 rounded-2xl bg-[#1A0B36]/50">
              <Info className="w-10 h-10 text-purple-400/40 mx-auto mb-2" />
              <p className="text-sm font-bold text-white">No Leave Requests Found</p>
              <p className="text-xs text-purple-300/60 mt-1">
                {searchQuery
                  ? `No leaves match your search query "${searchQuery}".`
                  : statusFilter === 'PENDING'
                  ? 'There are currently no pending leave applications awaiting review.'
                  : `No leave applications under "${statusFilter}" status.`}
              </p>
            </div>
          ) : (
            sortedLeaves.map((leave) => {
              const isPending = leave.status === 'PENDING';
              const isLoadingThis = actionLoadingId === leave.id;
              const dateRangeText =
                leave.startDate === leave.endDate
                  ? leave.startDate
                  : `${leave.startDate} to ${leave.endDate}`;

              return (
                <div
                  key={leave.id}
                  className={`p-5 bg-[#1A0B36] rounded-2xl border transition-all space-y-4 ${
                    isPending
                      ? 'border-amber-500/35 hover:border-amber-500/60 shadow-lg shadow-amber-500/5'
                      : 'border-purple-500/20 hover:border-purple-500/40'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-purple-500/15 pb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center font-black text-purple-200 text-sm">
                        {leave.employeeName ? leave.employeeName.charAt(0).toUpperCase() : 'E'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-white text-sm">{leave.employeeName}</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            {leave.employeeCode}
                          </span>
                          {activeEmpCodes && leave.employeeCode && !activeEmpCodes.has(leave.employeeCode) && (
                            <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[9px] font-black uppercase rounded">
                              Deleted
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-purple-300/70 mt-0.5">
                          <Building className="w-3 h-3 text-purple-400" />
                          <span>{leave.department || 'Raniganj'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 ${
                          leave.status === 'PENDING'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : leave.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : leave.status === 'REJECTED'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                        }`}
                      >
                        {leave.status === 'PENDING' && <Clock className="w-3.5 h-3.5 animate-pulse" />}
                        {leave.status === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5" />}
                        {leave.status === 'REJECTED' && <XCircle className="w-3.5 h-3.5" />}
                        {leave.status}
                      </span>
                    </div>
                  </div>

                  {/* Leave Details Body */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-[#15082E] p-3.5 rounded-xl border border-purple-500/10">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-purple-400 block mb-0.5">
                        Leave Date / Range
                      </span>
                      <span className="font-bold text-white">{dateRangeText}</span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-purple-400 block mb-0.5">
                        Duration
                      </span>
                      <span className="font-bold text-amber-300 font-mono">
                        {leave.totalDays} {leave.totalDays === 1 ? 'Day' : 'Days'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-purple-400 block mb-0.5">
                        Submitted On
                      </span>
                      <span className="text-purple-200">
                        {leave.createdAtDeviceTime || leave.submittedAtDeviceTime
                          ? new Date(leave.createdAtDeviceTime || leave.submittedAtDeviceTime).toLocaleString()
                          : 'Recent'}
                      </span>
                    </div>
                  </div>

                  {/* Reason Text */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400 block">Reason for Leave</span>
                    <p className="text-xs text-purple-100 bg-[#15082E] p-3 rounded-xl border border-purple-500/10 italic leading-relaxed">
                      "{leave.reason || 'No reason provided'}"
                    </p>
                  </div>

                  {/* Remarks / Review Info if already reviewed */}
                  {(leave.adminRemark || leave.teamLeaderRemark || leave.adminReviewedAtDeviceTime) && (
                    <div className="p-3 bg-purple-950/40 rounded-xl border border-purple-500/15 text-xs space-y-1">
                      <div className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">
                        Review Details
                      </div>
                      {leave.adminRemark && (
                        <p className="text-purple-200">
                          <strong className="text-white">Admin Note:</strong> {leave.adminRemark}
                        </p>
                      )}
                      {leave.teamLeaderRemark && (
                        <p className="text-purple-200">
                          <strong className="text-white">Team Leader Note:</strong> {leave.teamLeaderRemark}
                        </p>
                      )}
                      {leave.adminReviewedAtDeviceTime && (
                        <p className="text-[10px] text-purple-300/60 font-mono">
                          Reviewed on {new Date(leave.adminReviewedAtDeviceTime).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Action Buttons (For PENDING requests) */}
                  {isPending && (
                    <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-purple-500/15">
                      <Button
                        onClick={() => handleOpenRejectModal(leave)}
                        disabled={isLoadingThis || isSubmitting}
                        className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isLoadingThis ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        REJECT
                      </Button>

                      <Button
                        onClick={() => handleOpenApproveModal(leave)}
                        disabled={isLoadingThis || isSubmitting}
                        className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-black text-xs px-5 py-2.5 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isLoadingThis ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        APPROVE
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* APPROVE CONFIRMATION MODAL */}
      {modalType === 'APPROVE' && selectedLeave && (
        <Dialog isOpen={true} onClose={closeModal} title="Approve Leave Request">
          <div className="space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <p className="text-purple-200">
              Are you sure you want to approve this leave request? This will update the employee's leave balance and send an instant notification.
            </p>

            {/* Leave Details Summary */}
            <div className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/25 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-white text-sm">
                  {selectedLeave.employeeName}
                </span>
                <span className="font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded text-[10px] border border-purple-500/30">
                  {selectedLeave.employeeCode}
                </span>
              </div>

              <div className="text-purple-200 pt-1">
                <strong className="text-purple-400">Date Range:</strong>{' '}
                {selectedLeave.startDate === selectedLeave.endDate
                  ? selectedLeave.startDate
                  : `${selectedLeave.startDate} to ${selectedLeave.endDate}`}{' '}
                <span className="text-amber-300 font-bold">({selectedLeave.totalDays} {selectedLeave.totalDays === 1 ? 'Day' : 'Days'})</span>
              </div>

              <div className="text-purple-200">
                <strong className="text-purple-400">Reason:</strong> "{selectedLeave.reason || 'N/A'}"
              </div>
            </div>

            {/* Optional Admin Remark Input */}
            <div className="space-y-1.5">
              <label className="block text-purple-300 font-bold uppercase text-[10px] tracking-wider">
                Admin Note / Remark (Optional)
              </label>
              <textarea
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                placeholder="Add optional note for employee..."
                rows={2}
                disabled={isSubmitting}
                className="w-full p-3 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400 text-xs"
              />
            </div>

            {/* Modal Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-purple-500/20">
              <Button
                type="button"
                variant="outline"
                onClick={closeModal}
                disabled={isSubmitting}
                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleConfirmApprove}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" /> Confirm Approval
                  </>
                )}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* REJECT CONFIRMATION MODAL */}
      {modalType === 'REJECT' && selectedLeave && (
        <Dialog isOpen={true} onClose={closeModal} title="Reject Leave Request">
          <div className="space-y-4 text-xs">
            {errorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            <p className="text-purple-200">
              Are you sure you want to reject this leave request? The employee will receive an instant notification with the status update.
            </p>

            {/* Leave Details Summary */}
            <div className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/25 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-white text-sm">
                  {selectedLeave.employeeName}
                </span>
                <span className="font-mono text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded text-[10px] border border-purple-500/30">
                  {selectedLeave.employeeCode}
                </span>
              </div>

              <div className="text-purple-200 pt-1">
                <strong className="text-purple-400">Date Range:</strong>{' '}
                {selectedLeave.startDate === selectedLeave.endDate
                  ? selectedLeave.startDate
                  : `${selectedLeave.startDate} to ${selectedLeave.endDate}`}{' '}
                <span className="text-amber-300 font-bold">({selectedLeave.totalDays} {selectedLeave.totalDays === 1 ? 'Day' : 'Days'})</span>
              </div>

              <div className="text-purple-200">
                <strong className="text-purple-400">Reason:</strong> "{selectedLeave.reason || 'N/A'}"
              </div>
            </div>

            {/* Rejection Reason Textarea */}
            <div className="space-y-1.5">
              <label className="block text-purple-300 font-bold uppercase text-[10px] tracking-wider">
                Reason for Rejection (Optional)
              </label>
              <textarea
                value={adminRemark}
                onChange={(e) => setAdminRemark(e.target.value)}
                placeholder="Provide a reason for rejection..."
                rows={3}
                disabled={isSubmitting}
                className="w-full p-3 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-white placeholder-purple-300/40 focus:outline-none focus:border-purple-400 text-xs"
              />
            </div>

            {/* Modal Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-purple-500/20">
              <Button
                type="button"
                variant="outline"
                onClick={closeModal}
                disabled={isSubmitting}
                className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleConfirmReject}
                disabled={isSubmitting}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4" /> Confirm Rejection
                  </>
                )}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
