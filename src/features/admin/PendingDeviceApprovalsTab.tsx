import React, { useState, useEffect } from 'react';
import { db } from '../../services/firebase/config';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Smartphone, CheckCircle2, XCircle, Clock, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { createAuditLog, getClientDeviceInfo } from '../../services/audit/auditService';
import { sendNotification } from '../../services/notification/centralNotificationService';
import { ManagedUser } from '../../types/user';

export const PendingDeviceApprovalsTab: React.FC = () => {
  const { user, role = 'ADMIN', loginId } = useAdminAuth();
  const [pendingRegistrations, setPendingRegistrations] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [rejectModalReg, setRejectModalReg] = useState<ManagedUser | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(collection(db, 'registrations'), (snapshot) => {
      const pending: ManagedUser[] = [];
      snapshot.docs.forEach((d) => {
        const data = d.data() as ManagedUser;
        const status = data.status || 'Pending Approval';
        if (status === 'Pending Approval' || (status as string) === 'Pending' || (status as string).toLowerCase().includes('pending')) {
          pending.push({ id: d.id, ...data });
        }
      });
      // Sort by registrationDate desc if available
      pending.sort((a, b) => new Date(b.registrationDate || 0).getTime() - new Date(a.registrationDate || 0).getTime());
      setPendingRegistrations(pending);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load pending registrations:', err);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleApprove = async (reg: ManagedUser) => {
    if (!db) return;
    setActionLoadingId(reg.id);
    try {
      const regRef = doc(db, 'registrations', reg.id);
      await updateDoc(regRef, {
        status: 'Approved',
        approvedAt: new Date().toISOString(),
        approvedBy: user?.displayName || loginId || 'Admin'
      });

      // Create Audit Log
      await createAuditLog({
        action: 'Device Approval',
        actionCategory: 'Authentication',
        performedByUserId: user?.uid || loginId || 'admin',
        performedByName: user?.displayName || loginId || 'Admin',
        performedByRole: role,
        employeeCode: reg.employeeCode || reg.id,
        targetUserId: reg.id,
        targetUserName: reg.name || 'Unknown Employee',
        targetRecordId: reg.id,
        description: `Approved device registration for ${reg.name || 'Employee'} (${reg.employeeCode || reg.id})`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL',
        deviceInfo: {
          model: reg.deviceModel,
          os: `Android ${reg.androidVersion || 'N/A'}`,
          appVersion: reg.appVersion || '1.0.0',
          browser: 'Mobile App',
          deviceType: 'Mobile'
        },
        metadata: {
          deviceId: reg.deviceId,
          mobileNumber: reg.mobileNumber
        }
      });

      // Send push & in-app notification
      try {
        await sendNotification({
          employeeCode: reg.employeeCode || reg.id,
          type: 'DEVICE_APPROVED',
          category: 'DEVICE',
          title: 'Device Approved',
          message: 'Your device registration has been reviewed and approved.',
          priority: 'HIGH',
          allowedChannels: ['IN_APP', 'PUSH'],
          entityId: reg.id,
          entityType: 'REGISTRATION'
        });
      } catch (e) {
        console.warn('Failed to send device approval notification:', e);
      }

    } catch (err: any) {
      console.error('Approval failed:', err);
      alert(err.message || 'Failed to approve device registration.');

      try {
        await createAuditLog({
          action: 'Device Approval',
          actionCategory: 'Authentication',
          performedByUserId: user?.uid || loginId || 'admin',
          performedByName: user?.displayName || loginId || 'Admin',
          performedByRole: role,
          employeeCode: reg.employeeCode || reg.id,
          targetUserId: reg.id,
          targetUserName: reg.name || 'Unknown Employee',
          targetRecordId: reg.id,
          description: `Failed to approve device registration for ${reg.name || 'Employee'}`,
          result: 'FAILED',
          failureReason: err.message || 'Unknown error',
          source: 'ADMIN_PANEL'
        });
      } catch (logErr) {}
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!db || !rejectModalReg) return;
    const reg = rejectModalReg;
    setActionLoadingId(reg.id);

    try {
      const regRef = doc(db, 'registrations', reg.id);
      await updateDoc(regRef, {
        status: 'Rejected',
        rejectionReason: rejectReason.trim() || 'Registration rejected by administrator',
        rejectedAt: new Date().toISOString(),
        rejectedBy: user?.displayName || loginId || 'Admin'
      });

      // Create Audit Log
      await createAuditLog({
        action: 'Device Rejection',
        actionCategory: 'Authentication',
        performedByUserId: user?.uid || loginId || 'admin',
        performedByName: user?.displayName || loginId || 'Admin',
        performedByRole: role,
        employeeCode: reg.employeeCode || reg.id,
        targetUserId: reg.id,
        targetUserName: reg.name || 'Unknown Employee',
        targetRecordId: reg.id,
        description: `Rejected device registration for ${reg.name || 'Employee'}. Reason: ${rejectReason || 'None'}`,
        result: 'SUCCESS',
        source: 'ADMIN_PANEL',
        metadata: {
          rejectionReason: rejectReason,
          deviceId: reg.deviceId
        }
      });

      setRejectModalReg(null);
      setRejectReason('');
    } catch (err: any) {
      console.error('Rejection failed:', err);
      alert(err.message || 'Failed to reject device registration.');

      try {
        await createAuditLog({
          action: 'Device Rejection',
          actionCategory: 'Authentication',
          performedByUserId: user?.uid || loginId || 'admin',
          performedByName: user?.displayName || loginId || 'Admin',
          performedByRole: role,
          employeeCode: reg.employeeCode || reg.id,
          targetUserId: reg.id,
          targetUserName: reg.name || 'Unknown Employee',
          targetRecordId: reg.id,
          description: `Failed to reject device registration for ${reg.name || 'Employee'}`,
          result: 'FAILED',
          failureReason: err.message || 'Unknown error',
          source: 'ADMIN_PANEL'
        });
      } catch (logErr) {}
    } finally {
      setActionLoadingId(null);
    }
  };

  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
    return (
      <Card className="p-8 bg-[#250F4C] border border-rose-500/30 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Access Denied</h3>
        <p className="text-xs text-purple-200">You do not have administrative permissions to review pending device approvals.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2.5">
            <Smartphone className="w-6 h-6 text-amber-400" />
            Pending Device Approvals
          </h1>
          <p className="text-xs text-purple-300/70 mt-1">
            Review and authorize newly registered employee devices seeking access to Office Management System
          </p>
        </div>
        <div className="px-4 py-2 bg-[#250F4C] border border-purple-500/30 rounded-xl flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
          <span className="text-xs font-bold text-white">
            {pendingRegistrations.length} {pendingRegistrations.length === 1 ? 'Device Awaiting Approval' : 'Devices Awaiting Approval'}
          </span>
        </div>
      </div>

      {loading ? (
        <Card className="p-12 text-center bg-[#250F4C] border border-purple-500/20">
          <p className="text-xs text-purple-300/60">Loading pending device registrations...</p>
        </Card>
      ) : pendingRegistrations.length === 0 ? (
        <Card className="p-12 text-center bg-[#250F4C] border border-purple-500/20 space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <h3 className="text-base font-bold text-white">All devices approved</h3>
          <p className="text-xs text-purple-300/70">There are currently no device registrations awaiting administrative approval.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pendingRegistrations.map((reg) => {
            const isIncomplete = !reg.name || !reg.employeeCode;
            return (
              <Card key={reg.id} className="p-5 bg-gradient-to-br from-[#2D1B5A] to-[#211044] border border-purple-500/30 rounded-2xl flex flex-col justify-between space-y-4 shadow-xl">
                {isIncomplete ? (
                  <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Invalid or incomplete registration</span>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-base font-black text-white">{reg.name || 'Unnamed Employee'}</h3>
                      <p className="text-xs font-mono text-amber-300 font-bold">{reg.employeeCode || reg.id}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Pending
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-purple-500/20 text-xs text-purple-200">
                    <div className="flex justify-between">
                      <span className="text-purple-300/60">Mobile Number:</span>
                      <span className="font-semibold text-white">{reg.mobileNumber || 'Not available'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-300/60">Office / Dept:</span>
                      <span className="font-semibold text-white">{reg.office || 'Not available'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-300/60">Device Model:</span>
                      <span className="font-semibold text-white">{reg.deviceModel || 'Not available'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-300/60">Android Version:</span>
                      <span className="font-semibold text-white">{reg.androidVersion ? `Android ${reg.androidVersion}` : 'Not available'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-300/60">App Version:</span>
                      <span className="font-semibold text-white">{reg.appVersion || 'Not available'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-300/60">Registered At:</span>
                      <span className="font-semibold text-white">
                        {reg.registrationDate ? new Date(reg.registrationDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : 'Not available'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-purple-500/20">
                  <Button
                    onClick={() => handleApprove(reg)}
                    disabled={actionLoadingId === reg.id}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2.5 font-bold shadow-lg"
                  >
                    {actionLoadingId === reg.id ? 'Processing...' : 'Approve'}
                  </Button>
                  <Button
                    onClick={() => setRejectModalReg(reg)}
                    disabled={actionLoadingId === reg.id}
                    variant="outline"
                    className="flex-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border-rose-500/40 text-xs py-2.5 font-bold"
                  >
                    Reject
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalReg && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1F103F] border border-purple-500/30 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Reject Device Registration
            </h3>
            <p className="text-xs text-purple-200">
              Are you sure you want to reject the device registration for <strong className="text-white">{rejectModalReg.name}</strong> ({rejectModalReg.employeeCode})?
            </p>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase font-bold text-purple-300">Rejection Reason (Optional)</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={3}
                className="w-full bg-[#1A0B36] border border-purple-500/30 rounded-xl p-3 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-rose-400"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                className="text-xs glass-card border-purple-500/30 text-white"
                onClick={() => {
                  setRejectModalReg(null);
                  setRejectReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRejectConfirm}
                className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Confirm Rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
