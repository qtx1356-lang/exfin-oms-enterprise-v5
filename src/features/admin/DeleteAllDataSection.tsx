import React, { useState } from 'react';
import { ShieldAlert, Trash2, AlertTriangle, CheckCircle, RefreshCw, Lock } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { getDb } from '../../services/firebase/config';
import { collection, getDocs, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAdminAuth } from '../../context/AdminAuthContext';

export const DeleteAllDataSection: React.FC = () => {
  const { role, loginId, user } = useAdminAuth();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [resetSummary, setResetSummary] = useState<{
    deletedCounts: Record<string, number>;
    totalDeleted: number;
    timestamp: string;
  } | null>(null);

  if (role !== 'SUPER_ADMIN') {
    return null;
  }

  const handleOpenModal = () => {
    setConfirmText('');
    setResetSummary(null);
    setShowConfirmModal(true);
  };

  const handleExecuteReset = async () => {
    if (confirmText !== 'DELETE') return;
    const activeDb = await getDb();
    if (!activeDb) {
      alert('Firestore database is not initialized.');
      return;
    }

    setIsDeleting(true);
    setProgressMessage('Verifying Super Admin authorization...');

    try {
      if (role !== 'SUPER_ADMIN') {
        throw new Error('Unauthorized: Only Super Admin can execute data reset.');
      }

      setProgressMessage('Scanning Firestore collections for deletion...');

      const deletableCollections = [
        'attendance',
        'attendanceRecords',
        'expenses',
        'leaves',
        'tasks',
        'workPlanner',
        'efficiency',
        'efficiencyRecords',
        'notifications',
        'announcements',
        'campaigns',
        'chats',
        'messages',
        'conversations',
        'salaries',
        'payslips',
        'advances',
        'fines',
        'auditLogs'
      ];

      const deletedCounts: Record<string, number> = {};
      let totalDeleted = 0;

      for (const colName of deletableCollections) {
        setProgressMessage(`Clearing collection: ${colName}...`);
        try {
          const colRef = collection(activeDb, colName);
          const snapshot = await getDocs(colRef);
          
          if (snapshot.empty) {
            deletedCounts[colName] = 0;
            continue;
          }

          let batch = writeBatch(activeDb);
          let countInBatch = 0;
          let colDeleted = 0;

          for (const document of snapshot.docs) {
            batch.delete(document.ref);
            countInBatch++;
            colDeleted++;
            totalDeleted++;

            if (countInBatch >= 400) {
              await batch.commit();
              batch = writeBatch(activeDb);
              countInBatch = 0;
            }
          }

          if (countInBatch > 0) {
            await batch.commit();
          }

          deletedCounts[colName] = colDeleted;
        } catch (colErr: any) {
          console.warn(`Could not clear collection ${colName}:`, colErr);
          deletedCounts[colName] = 0;
        }
      }

      const auditId = `reset_audit_${Date.now()}`;
      try {
        await setDoc(doc(activeDb, 'auditLogs', auditId), {
          id: auditId,
          operation: 'DELETE_ALL_APPLICATION_DATA',
          timestamp: new Date().toISOString(),
          executedBy: loginId || user?.email || 'super_admin',
          totalDeleted,
          collectionsAffected: Object.keys(deletedCounts).filter(k => deletedCounts[k] > 0)
        });
      } catch (auditErr) {
        console.warn('Failed to record audit log:', auditErr);
      }

      setResetSummary({
        deletedCounts,
        totalDeleted,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Data reset error:', err);
      alert(`Reset failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card className="p-6 bg-gradient-to-r from-red-950/40 via-[#2D1B5A] to-[#2D1B5A] border border-red-500/30 text-white rounded-[24px] space-y-4 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Danger Zone</span>
              <h3 className="text-base font-black text-white">Delete All Application Data</h3>
              <p className="text-xs text-purple-300/80">
                Permanently purge employee attendance, expenses, leaves, planner, efficiency, notifications, announcements, and chats.
              </p>
            </div>
          </div>

          <Button
            onClick={handleOpenModal}
            className="bg-red-600 hover:bg-red-500 text-white font-extrabold text-xs px-5 py-3 rounded-2xl shadow-[0_0_20px_rgba(239,68,68,0.3)] transition-all shrink-0"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete All Application Data
          </Button>
        </div>

        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-2.5 text-[11px] text-red-300">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span>
            <strong>Protected:</strong> Device registrations (e.g. EXFRNG002), Firebase Authentication accounts, Admin/Super Admin login mappings, and system configuration are <strong>permanently preserved</strong>.
          </span>
        </div>
      </Card>

      <Dialog
        isOpen={showConfirmModal}
        onClose={() => !isDeleting && setShowConfirmModal(false)}
        title="Delete All Application Data?"
      >
        <div className="space-y-5 text-white">
          {resetSummary ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
                <CheckCircle className="w-8 h-8 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-emerald-300">Application Data Reset Complete</h4>
                  <p className="text-xs text-purple-200/80">Successfully purged {resetSummary.totalDeleted} application records.</p>
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto p-3 bg-black/30 rounded-xl text-xs font-mono">
                <div className="text-amber-400 font-bold mb-1">Deleted Counts by Collection:</div>
                {Object.entries(resetSummary.deletedCounts).map(([col, count]) => (
                  <div key={col} className="flex justify-between py-0.5 border-b border-white/5">
                    <span className="text-purple-300">{col}:</span>
                    <span className="text-white font-bold">{count} records</span>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-white/5 rounded-xl text-[11px] text-purple-200 space-y-1">
                <div className="text-emerald-400 font-bold">✓ Permanently Preserved:</div>
                <div>• Device Registrations (EXFRNG002 safe)</div>
                <div>• Firebase Authentication Accounts</div>
                <div>• Admin & Super Admin Login Credentials</div>
                <div>• System Configuration & Geofence Settings</div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => {
                    setShowConfirmModal(false);
                    window.location.reload();
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-xs font-bold"
                >
                  Close & Refresh Portal
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-black text-sm">
                  <AlertTriangle className="w-5 h-5" /> CRITICAL DESTRUCTIVE ACTION
                </div>
                <p className="text-xs text-purple-200 leading-relaxed">
                  This will permanently delete employee attendance, expenses, leave transactions, planner data, efficiency records, notifications, announcements, chats, salary records, and other application transactional data.
                </p>
                <p className="text-xs text-emerald-300 font-bold">
                  Device registrations, authentication accounts, and system configuration will NOT be deleted.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-purple-300 block">
                  To confirm, type <span className="text-red-400 font-mono font-black">DELETE</span> below:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  disabled={isDeleting}
                  className="w-full px-4 py-3 bg-[#1B0D38] border border-red-500/40 rounded-xl text-white font-mono font-bold tracking-widest text-center focus:outline-none focus:border-red-500"
                />
              </div>

              {isDeleting && (
                <div className="p-4 bg-purple-900/40 border border-purple-500/30 rounded-xl flex items-center gap-3 animate-pulse">
                  <RefreshCw className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-white">Executing Data Purge...</div>
                    <div className="text-[10px] text-purple-300">{progressMessage}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-purple-500/20">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isDeleting}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExecuteReset}
                  disabled={confirmText !== 'DELETE' || isDeleting}
                  className={`text-xs font-extrabold ${
                    confirmText === 'DELETE' && !isDeleting
                      ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg'
                      : 'bg-red-950 text-red-400/40 border border-red-900/40 cursor-not-allowed opacity-50'
                  }`}
                >
                  {isDeleting ? 'Deleting Data...' : 'I UNDERSTAND — DELETE APPLICATION DATA'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
};
