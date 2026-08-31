import React, { useState, useEffect } from 'react';
import { getActiveDbSync } from '../../services/firebase/db_sync';
import { AppRole, RoleFeaturePermissions, DEFAULT_ROLE_PERMISSIONS } from '../../types/roles';
import { FEATURE_REGISTRY, FeatureDefinition } from '../../config/featureRegistry';
import { saveRolePermissionsToFirestore } from '../../services/rbac/rbacService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Shield, Save, Check, X, Lock, RefreshCw, AlertTriangle, Monitor, Smartphone } from 'lucide-react';
import { usePermission } from '../../context/PermissionContext';
import { useAdminAuth } from '../../context/AdminAuthContext';

const ROLES_LIST: AppRole[] = ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'ADMIN', 'SUPER_ADMIN'];

export const RBACTab: React.FC = () => {
  const { roles: activeRoles, isSuperAdmin } = usePermission();
  const { user: adminUser, loginId } = useAdminAuth();

  const [localRoles, setLocalRoles] = useState<Record<AppRole, RoleFeaturePermissions>>(activeRoles);
  const [selectedMobileRole, setSelectedMobileRole] = useState<AppRole>('EMPLOYEE');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Filter roles based on permissions
  const ROLES = ROLES_LIST.filter(r => isSuperAdmin() || r !== 'SUPER_ADMIN');

  useEffect(() => {
    setLocalRoles(activeRoles);
  }, [activeRoles]);

  if (!isSuperAdmin()) {
    return (
      <div className="p-8 text-center text-white/70">
        <Shield className="w-12 h-12 mx-auto mb-4 opacity-50 text-red-400" />
        <h2 className="text-xl font-bold text-white">Access Denied</h2>
        <p className="text-purple-200/70 text-sm mt-1">Administrator authorization is required to access Role & Feature Permissions.</p>
      </div>
    );
  }

  const togglePermission = (role: AppRole, feature: FeatureDefinition) => {
    // Super Admin critical permissions protection
    if (role === 'SUPER_ADMIN' && feature.isCriticalForSuperAdmin) {
      return; // Locked
    }

    setLocalRoles(prev => {
      const currentRoleObj = prev[role] || {
        roleId: role,
        name: role,
        description: `${role} role`,
        enabled: true,
        permissions: { ...DEFAULT_ROLE_PERMISSIONS[role] },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const currentPerms = currentRoleObj.permissions || {};
      const currentVal = currentPerms[feature.id] ?? (feature.defaultRoles[role] || false);

      return {
        ...prev,
        [role]: {
          ...currentRoleObj,
          permissions: {
            ...currentPerms,
            [feature.id]: !currentVal,
          },
        },
      };
    });
  };

  const handleSaveClick = () => {
    setShowConfirmModal(true);
  };

  const confirmSaveRoles = async () => {
    setShowConfirmModal(false);
    setSaving(true);
    setMessage(null);

    try {
      const actorEmail = loginId || adminUser?.email || 'super_admin@company.internal';
      const actorUid = adminUser?.uid || 'SUPER_ADMIN_UID';

      for (const role of ROLES) {
        const roleData = localRoles[role] || { permissions: DEFAULT_ROLE_PERMISSIONS[role] };
        const currentPerms = roleData.permissions || {};

        // Guarantee Super Admin retains critical permissions
        if (role === 'SUPER_ADMIN') {
          FEATURE_REGISTRY.forEach(feat => {
            if (feat.isCriticalForSuperAdmin) {
              currentPerms[feat.id] = true;
            }
          });
        }

        await saveRolePermissionsToFirestore(
          role,
          currentPerms,
          actorEmail,
          actorUid,
          activeRoles[role]?.permissions
        );
      }

      setMessage({ type: 'success', text: 'All role feature permissions updated and synchronized successfully!' });
      setTimeout(() => setMessage(null), 4000);
    } catch (error: any) {
      console.error('Error saving role permissions:', error);
      setMessage({ type: 'error', text: 'Failed to save permissions: ' + (error.message || 'Unknown error') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-400" />
            <h2 className="text-2xl font-black text-white">Feature Permissions & Role Matrix</h2>
          </div>
          <p className="text-purple-300/70 text-xs sm:text-sm mt-1">
            Configure feature-level security access across {isSuperAdmin() ? 'Employee, Team Leader, HR, Admin, and Super Admin' : 'Employee, Team Leader, HR, and Admin'} roles.
          </p>
        </div>
        <Button onClick={handleSaveClick} disabled={saving} className="gap-2 bg-purple-600 hover:bg-purple-500 shrink-0">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Synchronizing...' : 'Save Permissions'}
        </Button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-2 ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-500/10 text-red-400 border border-red-500/30'
          }`}
        >
          {message.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="glass-inner-tile border border-purple-500/30 rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">Confirm Permission Changes</h3>
            </div>
            <p className="text-xs text-purple-200/80 leading-relaxed">
              Updating feature permissions will modify access policies enterprise-wide. Active users will have their cached permissions updated automatically.
            </p>
            <div className="flex gap-3 pt-2">
              <Button onClick={() => setShowConfirmModal(false)} variant="secondary" className="flex-1 text-xs">
                Cancel
              </Button>
              <Button onClick={confirmSaveRoles} className="flex-1 bg-purple-600 hover:bg-purple-500 text-xs">
                Apply & Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP MATRIX VIEW (md and up) */}
      <div className="hidden md:block">
        <Card className="p-0 overflow-hidden glass-card border-purple-500/20">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 border-b border-purple-500/20 text-white font-bold glass-inner-tile sticky left-0 z-20 min-w-[220px]">
                    Feature Module
                  </th>
                  {ROLES.map(role => (
                    <th
                      key={role}
                      className="p-4 border-b border-purple-500/20 text-center text-purple-200 font-extrabold glass-inner-tile min-w-[130px] uppercase text-xs tracking-wider"
                    >
                      {role.replace('_', ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_REGISTRY.map((feature, idx) => (
                  <tr key={feature.id} className={idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}>
                    <td className="p-4 border-b border-purple-500/10 sticky left-0 z-10 whitespace-nowrap glass-card">
                      <div className="font-bold text-white text-xs sm:text-sm">{feature.name}</div>
                      <div className="text-[10px] text-purple-300/60 max-w-xs truncate">{feature.description}</div>
                    </td>
                    {ROLES.map(role => {
                      const isSuper = role === 'SUPER_ADMIN';
                      const isLocked = isSuper && feature.isCriticalForSuperAdmin;
                      const hasPerm =
                        localRoles[role]?.permissions?.[feature.id] ?? feature.defaultRoles[role] ?? false;

                      return (
                        <td key={`${role}-${feature.id}`} className="p-4 border-b border-purple-500/10 text-center">
                          <button
                            onClick={() => togglePermission(role, feature)}
                            disabled={isLocked}
                            title={isLocked ? 'Protected System Privilege' : `Toggle ${feature.name} for ${role}`}
                            className={`w-9 h-9 rounded-xl inline-flex items-center justify-center transition-all ${
                              hasPerm
                                ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(124,58,237,0.5)]'
                                : 'bg-black/30 text-purple-300/20 hover:bg-black/50'
                            } ${isLocked ? 'opacity-60 cursor-not-allowed bg-amber-600/30 text-amber-300' : ''}`}
                          >
                            {isLocked ? (
                              <Lock className="w-4 h-4 text-amber-300" />
                            ) : hasPerm ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <X className="w-5 h-5" />
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* MOBILE CARD VIEW (sm and below) */}
      <div className="block md:hidden space-y-4">
        {/* Role Selector Tabs */}
        <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-none">
          {ROLES.map(role => (
            <button
              key={role}
              onClick={() => setSelectedMobileRole(role)}
              className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedMobileRole === role
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                  : 'glass-inner-tile text-purple-300/70 hover:bg-white/5 border border-purple-500/20'
              }`}
            >
              {role.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Feature List for Selected Role */}
        <div className="space-y-3">
          {FEATURE_REGISTRY.map(feature => {
            const isSuper = selectedMobileRole === 'SUPER_ADMIN';
            const isLocked = isSuper && feature.isCriticalForSuperAdmin;
            const hasPerm =
              localRoles[selectedMobileRole]?.permissions?.[feature.id] ?? feature.defaultRoles[selectedMobileRole] ?? false;

            return (
              <Card
                key={feature.id}
                className="p-4 glass-card border-purple-500/20 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-bold text-white text-xs">{feature.name}</div>
                  <div className="text-[10px] text-purple-300/60 mt-0.5">{feature.description}</div>
                  <div className="text-[9px] text-purple-400 font-mono mt-1 uppercase tracking-wider">{feature.category}</div>
                </div>

                <button
                  onClick={() => togglePermission(selectedMobileRole, feature)}
                  disabled={isLocked}
                  className={`px-3 py-2 rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shrink-0 transition-all ${
                    hasPerm
                      ? 'bg-purple-600 text-white shadow-md'
                      : 'bg-black/30 text-purple-300/40 hover:bg-black/50'
                  } ${isLocked ? 'opacity-60 cursor-not-allowed bg-amber-600/30 text-amber-300' : ''}`}
                >
                  {isLocked ? (
                    <>
                      <Lock className="w-3.5 h-3.5 text-amber-300" />
                      Locked
                    </>
                  ) : hasPerm ? (
                    <>
                      <Check className="w-4 h-4" />
                      Enabled
                    </>
                  ) : (
                    <>
                      <X className="w-4 h-4" />
                      Disabled
                    </>
                  )}
                </button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
