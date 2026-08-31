import React, { useEffect, useState } from 'react';
import { getActiveDbSync } from '../../services/firebase/db_sync';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import {
  Search,
  UserCheck,
  UserX,
  CheckCircle,
  XCircle,
  Clock,
  User,
  Phone,
  Mail,
  Building,
  Briefcase,
  ShieldAlert,
  FileText,
  Check,
  X,
  Eye,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProfileChangeRequest, AuditLogEntry } from '../../types/profile';
import { reviewProfileChangeRequest } from '../../services/profile/profileService';
import { useAdminAuth } from '../../context/AdminAuthContext';

export const EmployeeProfilesTab: React.FC = () => {
  const { user, role = 'ADMIN', loginId } = useAdminAuth();

  const [employees, setEmployees] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<ProfileChangeRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmp, setSelectedEmp] = useState<any | null>(null);

  // Review Dialog State
  const [selectedReq, setSelectedReq] = useState<ProfileChangeRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Listen to Registrations (Employees)
  useEffect(() => {
    if (!getActiveDbSync()) return;
    const qEmps = query(collection(getActiveDbSync(), 'registrations'));
    const unsub = onSnapshot(qEmps, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setEmployees(list);
    });
    return () => unsub();
  }, []);

  // 2. Listen to Profile Change Requests
  useEffect(() => {
    if (!getActiveDbSync()) return;
    const qReqs = query(collection(getActiveDbSync(), 'profile_change_requests'));
    const unsub = onSnapshot(qReqs, (snap) => {
      const list: ProfileChangeRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ProfileChangeRequest));
      list.sort(
        (a, b) =>
          new Date(b.createdAtDeviceTime).getTime() -
          new Date(a.createdAtDeviceTime).getTime()
      );
      setChangeRequests(list);
    });
    return () => unsub();
  }, []);

  // 3. Listen to Audit Logs
  useEffect(() => {
    if (!getActiveDbSync()) return;
    const qAudit = query(collection(getActiveDbSync(), 'audit_logs'));
    const unsub = onSnapshot(qAudit, (snap) => {
      const list: AuditLogEntry[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AuditLogEntry));
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAuditLogs(list);
    });
    return () => unsub();
  }, []);

  const handleReview = async () => {
    if (!selectedReq || !reviewAction) return;
    if (reviewAction === 'REJECT' && !rejectionReason.trim()) {
      alert('A rejection reason is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await reviewProfileChangeRequest(
        selectedReq.id,
        user?.uid || 'ADMIN_USER',
        loginId || user?.email?.split('@')[0] || 'Admin Manager',
        role,
        reviewAction,
        rejectionReason.trim()
      );

      alert(`Profile change request ${reviewAction === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
      setSelectedReq(null);
      setReviewAction(null);
      setRejectionReason('');
    } catch (err: any) {
      alert(err.message || 'Failed to review request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredEmps = employees.filter(
    (e) =>
      e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.mobileNumber?.includes(searchTerm) ||
      e.office?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingRequests = changeRequests.filter((r) => r.status === 'Pending');

  return (
    <div className="space-y-6">
      {/* Search & Header Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 glass-card p-4 rounded-[22px] border border-purple-500/20 shadow-xl">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-purple-300/70" />
          <input
            type="text"
            placeholder="Search employee, code, or office..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 rounded-2xl border border-purple-500/30 glass-inner-tile text-white text-xs font-medium focus:ring-2 focus:ring-[#7C3AED] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="glass-inner-tile px-4 py-2 rounded-xl border border-purple-500/20 text-center">
            <span className="text-[10px] font-bold text-purple-300 uppercase block">Total Employees</span>
            <span className="text-lg font-black text-white">{employees.length}</span>
          </div>

          <div className="glass-inner-tile px-4 py-2 rounded-xl border border-amber-500/30 text-center">
            <span className="text-[10px] font-bold text-amber-300 uppercase block">Pending Requests</span>
            <span className="text-lg font-black text-amber-300">{pendingRequests.length}</span>
          </div>
        </div>
      </div>

      {/* 1. Pending Profile Change Requests */}
      {pendingRequests.length > 0 && (
        <Card className="p-5 glass-card border border-amber-500/30 text-white rounded-[22px] space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
            <h2 className="text-xs font-black uppercase text-amber-300 tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-amber-400" /> Pending Profile Change Requests ({pendingRequests.length})
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="p-4 glass-inner-tile rounded-2xl border border-purple-500/20 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-black text-sm text-white">{req.employeeName}</span>
                    <span className="text-[10px] font-mono text-purple-300/70">{req.employeeCode}</span>
                  </div>

                  <p className="text-xs text-purple-200">
                    Field: <span className="font-extrabold text-amber-300">{req.fieldLabel}</span>
                  </p>
                  <p className="text-xs text-purple-300/80">
                    Old: <span className="line-through text-purple-400">{req.oldValue || 'None'}</span> → New:{' '}
                    <span className="font-bold text-emerald-300">{req.requestedValue}</span>
                  </p>
                  <p className="text-[11px] text-purple-300/60 italic">Reason: "{req.reason}"</p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-purple-500/10">
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedReq(req);
                      setReviewAction('APPROVE');
                      setRejectionReason('');
                    }}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </Button>

                  <Button
                    size="sm"
                    variant="outlined"
                    onClick={() => {
                      setSelectedReq(req);
                      setReviewAction('REJECT');
                      setRejectionReason('');
                    }}
                    className="flex-1 border-red-500/40 text-red-300 hover:bg-red-500/10 font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 2. Employee Directory Grid */}
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider">
          Employee Profiles Directory ({filteredEmps.length})
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmps.map((emp) => (
            <Card
              key={emp.id}
              className="p-4 glass-card border border-purple-500/20 text-white rounded-[22px] space-y-3 hover:border-purple-500/40 transition-all shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-[#170B38] border border-[#7C3AED] overflow-hidden flex items-center justify-center">
                  {emp.selfieUrl || emp.profilePhotoUrl ? (
                    <img src={emp.selfieUrl || emp.profilePhotoUrl} alt={emp.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-purple-300/60" />
                  )}
                </div>

                <div className="overflow-hidden flex-1">
                  <h3 className="font-extrabold text-sm text-white truncate">{emp.name}</h3>
                  <p className="text-[11px] font-bold text-purple-300">{emp.employeeCode}</p>
                  <p className="text-[10px] text-purple-300/60 truncate">{emp.office || 'Raniganj Office'}</p>
                </div>
              </div>

              <div className="space-y-1 text-[11px] border-t border-purple-500/10 pt-2 text-purple-200">
                <p>
                  <Phone className="w-3 h-3 inline mr-1 text-purple-400" />
                  {emp.mobileNumber}
                </p>
                <p>
                  <Briefcase className="w-3 h-3 inline mr-1 text-purple-400" />
                  {emp.isTeamLeader ? 'Team Leader' : 'Executive'}
                </p>
              </div>

              <Button
                variant="outlined"
                size="sm"
                onClick={() => setSelectedEmp(emp)}
                className="w-full border-purple-500/30 text-purple-200 text-xs font-bold rounded-xl py-1.5 flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" /> View Profile Details
              </Button>
            </Card>
          ))}
        </div>
      </div>

      {/* 3. Audit Trail */}
      <Card className="p-5 glass-card border border-purple-500/20 text-white rounded-[22px] space-y-3 shadow-xl">
        <h2 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-2 border-b border-purple-500/10 pb-2">
          <FileText className="w-4 h-4 text-[#A78BFA]" /> Profile Change Audit Trail
        </h2>

        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
          {auditLogs.length > 0 ? (
            auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-2.5 glass-inner-tile rounded-xl border border-purple-500/10 text-xs flex justify-between items-center"
              >
                <div>
                  <span className="font-bold text-white">{log.actorName}</span>{' '}
                  <span className="text-purple-300/70">
                    {log.action === 'APPROVE_PROFILE_CHANGE' ? 'approved' : 'rejected'} profile change for employee{' '}
                  </span>
                  <span className="font-bold text-purple-200">{log.targetEmployeeCode}</span> ({log.fieldChanged})
                </div>
                <span className="text-[10px] font-mono text-purple-300/50">
                  {new Date(log.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-purple-300/50 py-3 text-center">No profile audit records yet.</p>
          )}
        </div>
      </Card>

      {/* Review Dialog */}
      <Dialog
        isOpen={!!selectedReq}
        onClose={() => {
          setSelectedReq(null);
          setReviewAction(null);
        }}
        title={`${reviewAction === 'APPROVE' ? 'Approve' : 'Reject'} Profile Change Request`}
      >
        <div className="space-y-4">
          <p className="text-xs text-purple-200">
            Employee: <span className="font-extrabold text-white">{selectedReq?.employeeName}</span> ({selectedReq?.employeeCode})
          </p>

          <p className="text-xs text-purple-300/80">
            Requested Field: <span className="font-bold text-white">{selectedReq?.fieldLabel}</span>
          </p>

          <div className="p-3 bg-[#170B38] rounded-xl border border-purple-500/20 text-xs space-y-1">
            <p>
              Old Value: <span className="text-purple-400">{selectedReq?.oldValue || 'None'}</span>
            </p>
            <p>
              Requested Value: <span className="font-bold text-emerald-300">{selectedReq?.requestedValue}</span>
            </p>
            <p className="text-[11px] text-purple-300/70 italic">Reason: "{selectedReq?.reason}"</p>
          </div>

          {reviewAction === 'REJECT' && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-purple-300">REJECTION REASON (REQUIRED)</label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State clear reason for rejecting this change request..."
                className="w-full px-3 py-2 rounded-xl glass-inner-tile border border-purple-500/30 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="text"
              onClick={() => {
                setSelectedReq(null);
                setReviewAction(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              disabled={isSubmitting}
              className={reviewAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'}
            >
              {isSubmitting ? 'Processing...' : reviewAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* View Employee Profile Detail Dialog */}
      <Dialog
        isOpen={!!selectedEmp}
        onClose={() => setSelectedEmp(null)}
        title="Employee Profile Details"
      >
        {selectedEmp && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 border-b border-purple-500/10 pb-3">
              <div className="w-16 h-16 rounded-full bg-[#170B38] border border-[#7C3AED] overflow-hidden flex items-center justify-center">
                {selectedEmp.selfieUrl || selectedEmp.profilePhotoUrl ? (
                  <img src={selectedEmp.selfieUrl || selectedEmp.profilePhotoUrl} alt={selectedEmp.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-purple-300/60" />
                )}
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">{selectedEmp.name}</h3>
                <p className="text-xs font-black text-purple-300">{selectedEmp.employeeCode}</p>
                <p className="text-xs text-purple-300/70">{selectedEmp.office || 'Raniganj'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-[#170B38] rounded-xl">
                <span className="text-[10px] text-purple-300/60 font-bold block">MOBILE</span>
                <span className="font-bold text-white">{selectedEmp.mobileNumber}</span>
              </div>

              <div className="p-2.5 bg-[#170B38] rounded-xl">
                <span className="text-[10px] text-purple-300/60 font-bold block">STATUS</span>
                <span className="font-bold text-emerald-300">{selectedEmp.status}</span>
              </div>

              <div className="p-2.5 bg-[#170B38] rounded-xl">
                <span className="text-[10px] text-purple-300/60 font-bold block">TEAM LEADER ROLE</span>
                <span className="font-bold text-purple-200">{selectedEmp.isTeamLeader ? 'Yes' : 'No'}</span>
              </div>

              <div className="p-2.5 bg-[#170B38] rounded-xl">
                <span className="text-[10px] text-purple-300/60 font-bold block">REGISTRATION DATE</span>
                <span className="font-bold text-white">
                  {new Date(selectedEmp.registrationDate).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outlined" onClick={() => setSelectedEmp(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
