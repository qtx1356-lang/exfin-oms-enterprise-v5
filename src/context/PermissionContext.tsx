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
    let isMounted = true;
    let timerId: NodeJS.Timeout | null = null;

    if (!db) {
      setLoading(false);
      return;
    }
    
    // Check if we have cached roles in localStorage for fast offline startup
    const localRoles = localStorage.getItem('roles_cache');
    if (localRoles) {
      try {
        setRolesCache(JSON.parse(localRoles));
        setLoading(false);
      } catch (e) {
        console.error('Failed to parse cached roles', e);
      }
    } else if (regStatus === 'Approved') {
      // For employees with default permissions, don't block offline startup
      setLoading(false);
    }

    // Bounded initialization wait: 5000 ms
    timerId = setTimeout(() => {
      if (!isMounted) return;
      console.log('Permission initialization timed out');
      setLoading(false);
    }, 5000);

    const q = query(collection(db, 'roles'));
    const unsub = onSnapshot(q, (snapshot) => {
      if (!isMounted) return;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      const newRoles = { ...rolesCache };
      snapshot.docs.forEach(doc => {
        const data = doc.data() as RoleFeaturePermissions;
        newRoles[data.roleId] = data;
      });
      setRolesCache(newRoles);
      localStorage.setItem('roles_cache', JSON.stringify(newRoles));
      setLoading(false);
    }, (error) => {
      if (!isMounted) return;
      console.error('Error fetching roles:', error);
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      setLoading(false);
    });

    // Priority 5 FIX: Invalidate stale permission cache on network reconnection
    const handleOnline = () => {
      console.log('Permission Context: Network reconnected. Firestore remains authoritative, refreshing permissions...');
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
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      unsub();
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const hasPermission = (feature: FeatureKey): boolean => {
    if (!currentRole) return false;
    // Super Admin safeguards: Super Admin always retains core management features
    if (currentRole === 'SUPER_ADMIN') {
      const isCritical = ['userManagement', 'roleManagement', 'featurePermissions', 'systemHealth', 'systemSettings'].includes(feature);
      if (isCritical) return true;
    }
    const roleConfig = rolesCache[currentRole];
    if (!roleConfig) return DEFAULT_ROLE_PERMISSIONS[currentRole]?.[feature] === true;
    if (!roleConfig.enabled) return false;
    const val = roleConfig.permissions?.[feature];
    if (val !== undefined) return val === true;
    return DEFAULT_ROLE_PERMISSIONS[currentRole]?.[feature] === true;
  };

  const hasFeatureAccess = hasPermission;

  const hasRole = React.useCallback((role: AppRole | AppRole[]): boolean => {
    if (!currentRole) return false;
    if (Array.isArray(role)) {
      return role.includes(currentRole);
    }
    return currentRole === role;
  }, [currentRole]);

  const isSuperAdmin = React.useCallback(() => currentRole === 'SUPER_ADMIN', [currentRole]);
  const isAdmin = React.useCallback(() => currentRole === 'ADMIN' || currentRole === 'SUPER_ADMIN', [currentRole]);
  const isHR = React.useCallback(() => currentRole === 'HR', [currentRole]);
  const isTeamLeader = React.useCallback(() => currentRole === 'TEAM_LEADER' || currentRole === 'SUPER_ADMIN', [currentRole]);
  const isEmployee = React.useCallback(() => currentRole === 'EMPLOYEE' || currentRole === 'TEAM_LEADER', [currentRole]);

  const contextValue = useMemo(
    () => ({
      roles: rolesCache,
      currentRole,
      loading: (loading || (adminUser ? adminLoading : false)) && !rolesCache['EMPLOYEE'],
      hasPermission,
      hasFeatureAccess,
      hasRole,
      isSuperAdmin,
      isAdmin,
      isHR,
      isTeamLeader,
      isEmployee
    }),
    [
      rolesCache,
      currentRole,
      loading,
      adminUser,
      adminLoading,
      hasPermission,
      hasFeatureAccess,
      hasRole,
      isSuperAdmin,
      isAdmin,
      isHR,
      isTeamLeader,
      isEmployee
    ]
  );

  return (
    <PermissionContext.Provider value={contextValue}>
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
