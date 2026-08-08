import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { AppRole, FeatureKey, RoleFeaturePermissions, DEFAULT_ROLE_PERMISSIONS } from '../../types/roles';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Shield, Save, Check, X, Users, Settings } from 'lucide-react';
import { usePermission } from '../../context/PermissionContext';

const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'workPlanner', label: 'Work Planner' },
  { key: 'myTeam', label: 'My Team' },
  { key: 'employeeEfficiency', label: 'Efficiency' },
  { key: 'leave', label: 'Leave' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'reports', label: 'Reports' },
  { key: 'deviceRegistration', label: 'Device Registration' },
  { key: 'employeeManagement', label: 'Employee Management' },
  { key: 'teamManagement', label: 'Team Management' },
  { key: 'roleManagement', label: 'Role Management' },
  { key: 'systemSettings', label: 'System Settings' },
  { key: 'departmentManagement', label: 'Department Management' },
  { key: 'adminManagement', label: 'Admin Management' },
  { key: 'hrManagement', label: 'HR Management' },
];

const ROLES: AppRole[] = ['EMPLOYEE', 'TEAM_LEADER', 'HR', 'ADMIN', 'SUPER_ADMIN'];

export const RBACTab: React.FC = () => {
  const { roles: activeRoles, isSuperAdmin } = usePermission();
  const [localRoles, setLocalRoles] = useState<Record<AppRole, RoleFeaturePermissions>>(activeRoles);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLocalRoles(activeRoles);
  }, [activeRoles]);

  if (!isSuperAdmin()) {
    return (
      <div className="p-8 text-center text-white/70">
        <Shield className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <h2 className="text-xl font-bold">Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  const togglePermission = (role: AppRole, feature: FeatureKey) => {
    // Prevent changing SUPER_ADMIN permissions to avoid lock-out, though we can allow some configuration.
    // Actually, SUPER_ADMIN should probably always have all permissions.
    if (role === 'SUPER_ADMIN') return;

    setLocalRoles(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        permissions: {
          ...prev[role].permissions,
          [feature]: !prev[role].permissions[feature]
        }
      }
    }));
  };

  const saveRoles = async () => {
    setSaving(true);
    setMessage('');
    try {
      if (!db) throw new Error("Firestore is not initialized");
      
      const promises = ROLES.map(role => {
        const roleData = localRoles[role] || DEFAULT_ROLE_PERMISSIONS[role];
        return setDoc(doc(db, 'roles', role), {
          ...roleData,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      });

      await Promise.all(promises);
      setMessage('Permissions saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error("Error saving roles", error);
      setMessage('Failed to save permissions: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">Role & Permissions Management</h2>
          <p className="text-purple-300/70 text-sm mt-1">Configure feature access for each role across the enterprise.</p>
        </div>
        <Button onClick={saveRoles} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-sm font-medium ${message.includes('success') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          {message}
        </div>
      )}

      <Card className="p-0 overflow-hidden bg-[#2D1B5A] border-purple-500/20">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="p-4 border-b border-purple-500/20 text-white font-bold bg-white/5 sticky left-0 z-10">Feature Matrix</th>
                {ROLES.map(role => (
                  <th key={role} className="p-4 border-b border-purple-500/20 text-center text-purple-200 font-bold bg-white/5 min-w-[120px]">
                    {role.replace('_', ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((feature, idx) => (
                <tr key={feature.key} className={idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}>
                  <td className="p-4 border-b border-purple-500/10 text-white/80 font-medium sticky left-0 z-10 whitespace-nowrap bg-[#2D1B5A]">
                    {feature.label}
                  </td>
                  {ROLES.map(role => {
                    const isSuper = role === 'SUPER_ADMIN';
                    const hasPerm = localRoles[role]?.permissions?.[feature.key] ?? false;
                    
                    return (
                      <td key={`${role}-${feature.key}`} className="p-4 border-b border-purple-500/10 text-center">
                        <button
                          onClick={() => togglePermission(role, feature.key)}
                          disabled={isSuper}
                          className={`w-8 h-8 rounded-lg inline-flex items-center justify-center transition-all ${
                            hasPerm 
                              ? 'bg-[#7C3AED] text-white shadow-[0_0_10px_rgba(124,58,237,0.5)]' 
                              : 'bg-black/20 text-purple-300/30 hover:bg-black/40'
                          } ${isSuper ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {hasPerm ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
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
  );
};
