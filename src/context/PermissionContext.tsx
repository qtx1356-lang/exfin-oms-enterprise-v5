import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { AppRole, FeatureKey, RoleFeaturePermissions, DEFAULT_ROLE_PERMISSIONS } from '../types/roles';
import { useAdminAuth } from './AdminAuthContext';
import { useRegistration } from './RegistrationContext';

interface PermissionContextType {
  roles: Record<AppRole, RoleFeaturePermissions>;
  currentRole: AppRole | null;
  loading: boolean;
  hasPermission: (feature: FeatureKey) => boolean;
  hasFeatureAccess: (feature: FeatureKey) => boolean;
  hasRole: (role: AppRole | AppRole[]) => boolean;
  isSuperAdmin: () => boolean;
  isAdmin: () => boolean;
  isHR: () => boolean;
  isTeamLeader: () => boolean;
  isEmployee: () => boolean;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user: adminUser, role: adminRole, loading: adminLoading } = useAdminAuth();
  const { status: regStatus, employeeData } = useRegistration();
  
  const [rolesCache, setRolesCache] = useState<Record<AppRole, RoleFeaturePermissions>>(() => {
    // Start with defaults
    const defaults: any = {};
    Object.keys(DEFAULT_ROLE_PERMISSIONS).forEach(key => {
      defaults[key] = {
        roleId: key as AppRole,
        name: key,
        description: `${key} role`,
        enabled: true,
        permissions: DEFAULT_ROLE_PERMISSIONS[key as AppRole],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
    return defaults;
  });
  
  const [loading, setLoading] = useState(true);

  // Determine active role
  const currentRole = useMemo<AppRole | null>(() => {
    if (adminUser) {
      return adminRole; // 'ADMIN' or 'SUPER_ADMIN' or 'HR' if loaded
    } else if (regStatus === 'Approved' && employeeData) {
      return employeeData.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE';
    }
    return null;
  }, [adminUser, adminRole, regStatus, employeeData]);

  // Sync roles from Firestore
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    
    // Check if we have cached roles in localStorage for fast offline startup
    const localRoles = localStorage.getItem('roles_cache');
    if (localRoles) {
      try {
        setRolesCache(JSON.parse(localRoles));
      } catch (e) {
        console.error('Failed to parse cached roles', e);
      }
    }

    const q = query(collection(db, 'roles'));
    const unsub = onSnapshot(q, (snapshot) => {
      const newRoles = { ...rolesCache };
      snapshot.docs.forEach(doc => {
        const data = doc.data() as RoleFeaturePermissions;
        newRoles[data.roleId] = data;
      });
      setRolesCache(newRoles);
      localStorage.setItem('roles_cache', JSON.stringify(newRoles));
      setLoading(false);
    }, (error) => {
      console.error('Error fetching roles:', error);
      setLoading(false);
    });

    // Priority 5 FIX: Invalidate stale permission cache on network reconnection
    const handleOnline = () => {
      console.log('Permission Context: Network reconnected. Firestore remains authoritative, refreshing permissions...');
      // Clear potentially stale cache and force re-evaluation from server
      const updatedLocal = localStorage.getItem('roles_cache');
      if (updatedLocal) {
        try {
          setRolesCache(JSON.parse(updatedLocal));
        } catch (e) {
          console.error('Failed to parse updated cached roles on reconnect', e);
        }
      }
    };

    window.addEventListener('online', handleOnline);

    return () => {
      unsub();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const hasPermission = (feature: FeatureKey): boolean => {
    if (!currentRole) return false;
    const roleConfig = rolesCache[currentRole];
    if (!roleConfig) return false;
    if (!roleConfig.enabled) return false;
    return roleConfig.permissions[feature] === true;
  };

  const hasFeatureAccess = hasPermission;

  const hasRole = (role: AppRole | AppRole[]): boolean => {
    if (!currentRole) return false;
    if (Array.isArray(role)) {
      return role.includes(currentRole);
    }
    return currentRole === role;
  };

  const isSuperAdmin = () => currentRole === 'SUPER_ADMIN';
  const isAdmin = () => currentRole === 'ADMIN' || currentRole === 'SUPER_ADMIN'; // Usually Super Admin inherits Admin
  const isHR = () => currentRole === 'HR';
  const isTeamLeader = () => currentRole === 'TEAM_LEADER' || currentRole === 'SUPER_ADMIN';
  const isEmployee = () => currentRole === 'EMPLOYEE' || currentRole === 'TEAM_LEADER';

  return (
    <PermissionContext.Provider value={{
      roles: rolesCache,
      currentRole,
      loading: loading || adminLoading,
      hasPermission,
      hasFeatureAccess,
      hasRole,
      isSuperAdmin,
      isAdmin,
      isHR,
      isTeamLeader,
      isEmployee
    }}>
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermission = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermission must be used within a PermissionProvider');
  }
  return context;
};
