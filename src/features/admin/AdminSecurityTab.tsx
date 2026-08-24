import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Shield,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Building,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { AdminSecurityUser } from '../../types/adminSecurity';
import { fetchAdminSecurityUsers } from '../../services/admin/adminPasswordService';
import { AdminPasswordManagementModal } from './AdminPasswordManagementModal';
import { ChangePasswordModal } from '../../components/admin/ChangePasswordModal';
import { useAdminAuth } from '../../context/AdminAuthContext';

export const AdminSecurityTab: React.FC = () => {
  const { role, loginId } = useAdminAuth();
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const [adminUsers, setAdminUsers] = useState<AdminSecurityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Modals
  const [selectedAdminForReset, setSelectedAdminForReset] = useState<AdminSecurityUser | null>(null);
  const [showSelfChangeModal, setShowSelfChangeModal] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const users = await fetchAdminSecurityUsers();
      setAdminUsers(users);
    } catch (err) {
      console.error('Failed to load admin security users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filteredUsers = adminUsers.filter((u) => {
    const matchesSearch =
      (u.loginId && u.loginId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.displayName && u.displayName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole = filterRole === 'ALL' || u.role === filterRole;
    const matchesStatus =
      filterStatus === 'ALL' ||
      (filterStatus === 'PENDING_CHANGE' && u.mustChangePassword) ||
      (filterStatus === 'ACTIVE_PASSWORD' && !u.mustChangePassword);

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalAdmins = adminUsers.length;
  const pendingResetCount = adminUsers.filter((u) => u.mustChangePassword).length;
  const activePasswordCount = totalAdmins - pendingResetCount;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-r from-[#210D44] via-[#2A1154] to-[#1E0B3D] border border-purple-500/20 rounded-[28px] shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shadow-lg shrink-0">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Admin Password & Security</h1>
            <p className="text-xs sm:text-sm text-purple-200/70">
              Manage administrator authentication credentials, temporary passwords, and security enforcement
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowSelfChangeModal(true)}
            className="bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" /> Change My Password
          </Button>

          <Button
            onClick={loadUsers}
            disabled={loading}
            variant="secondary"
            className="p-2.5 rounded-xl border-purple-500/30 text-purple-300 hover:text-white"
            title="Refresh Security Status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Security Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 bg-[#210D44]/90 border border-purple-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
            <User className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider block">
              Total Administrators
            </span>
            <span className="text-2xl font-black text-white">{totalAdmins}</span>
          </div>
        </Card>

        <Card className="p-5 bg-[#210D44]/90 border border-emerald-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider block">
              Active / Verified Passwords
            </span>
            <span className="text-2xl font-black text-emerald-400">{activePasswordCount}</span>
          </div>
        </Card>

        <Card className="p-5 bg-[#210D44]/90 border border-amber-500/20 rounded-2xl flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider block">
              Password Reset Pending
            </span>
            <span className="text-2xl font-black text-amber-400">{pendingResetCount}</span>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 bg-[#210D44]/80 border border-purple-500/20 rounded-2xl space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-purple-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by Login ID or Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#170932] border border-purple-500/30 rounded-xl text-xs sm:text-sm text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3 py-2 bg-[#170932] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="HR">HR</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-[#170932] border border-purple-500/30 rounded-xl text-xs text-white focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">All Password States</option>
              <option value="ACTIVE_PASSWORD">Active Passwords</option>
              <option value="PENDING_CHANGE">Temporary / Reset Pending</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Admin User Accounts Table */}
      <Card className="bg-[#210D44]/90 border border-purple-500/20 rounded-[28px] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm text-white">
            <thead className="bg-[#170932] text-purple-300 uppercase text-[10px] tracking-wider border-b border-purple-500/20">
              <tr>
                <th className="py-4 px-5">Administrator</th>
                <th className="py-4 px-4">Role & Office</th>
                <th className="py-4 px-4">Account Status</th>
                <th className="py-4 px-4">Password Status</th>
                <th className="py-4 px-4">Last Changed / Reset</th>
                <th className="py-4 px-5 text-right">Security Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-purple-300">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-400" />
                    Loading administrator security credentials...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-purple-300/70">
                    No administrator records found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((admin) => {
                  const isCurrentSelf = admin.loginId === loginId;
                  return (
                    <tr key={admin.uid} className="hover:bg-white/[0.02] transition-colors">
                      {/* Administrator Info */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-amber-400 font-black text-sm">
                            {admin.loginId.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-extrabold text-white flex items-center gap-2">
                              <span>{admin.loginId}</span>
                              {isCurrentSelf && (
                                <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-black">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-purple-300/70">{admin.email || 'No email'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Office */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                              admin.role === 'SUPER_ADMIN'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : admin.role === 'ADMIN'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                            }`}
                          >
                            {admin.role}
                          </span>
                          <div className="text-[11px] text-purple-300/70 flex items-center gap-1">
                            <Building className="w-3 h-3 text-purple-400" />
                            <span>{admin.authorizedOffice || 'ALL'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Account Status */}
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            admin.active
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${admin.active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {admin.status || (admin.active ? 'Active' : 'Suspended')}
                        </span>
                      </td>

                      {/* Password Status */}
                      <td className="py-4 px-4">
                        {admin.mustChangePassword ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            <span>Reset Required</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Verified</span>
                          </div>
                        )}
                      </td>

                      {/* Last Changed / Reset */}
                      <td className="py-4 px-4 text-xs text-purple-300/80">
                        {admin.passwordResetAt ? (
                          <div>
                            <div className="text-[11px] text-amber-300 font-bold">
                              Reset: {new Date(admin.passwordResetAt).toLocaleDateString()}
                            </div>
                            {admin.passwordResetBy && (
                              <div className="text-[10px] text-purple-400">By: {admin.passwordResetBy}</div>
                            )}
                          </div>
                        ) : admin.passwordChangedAt ? (
                          <div className="text-[11px] text-emerald-300">
                            Changed: {new Date(admin.passwordChangedAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-purple-400/50 text-[11px]">Initial Setup</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-5 text-right">
                        {isSuperAdmin ? (
                          <Button
                            onClick={() => setSelectedAdminForReset(admin)}
                            className="px-3 py-1.5 text-xs font-bold bg-[#170932] hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl transition-all shadow flex items-center gap-1.5 ml-auto"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Reset Password</span>
                          </Button>
                        ) : isCurrentSelf ? (
                          <Button
                            onClick={() => setShowSelfChangeModal(true)}
                            className="px-3 py-1.5 text-xs font-bold bg-[#170932] hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl transition-all shadow flex items-center gap-1.5 ml-auto"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Change</span>
                          </Button>
                        ) : (
                          <span className="text-purple-400/40 text-xs">Super-Admin Only</span>
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

      {/* Super-Admin Reset Password Modal */}
      {selectedAdminForReset && (
        <AdminPasswordManagementModal
          isOpen={!!selectedAdminForReset}
          onClose={() => setSelectedAdminForReset(null)}
          targetAdmin={selectedAdminForReset}
          onSuccess={loadUsers}
        />
      )}

      {/* Self Change Password Modal */}
      {showSelfChangeModal && (
        <ChangePasswordModal
          isOpen={showSelfChangeModal}
          onClose={() => setShowSelfChangeModal(false)}
          isMandatory={false}
        />
      )}
    </div>
  );
};
