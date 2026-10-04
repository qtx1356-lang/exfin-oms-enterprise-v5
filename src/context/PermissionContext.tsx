import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { AppRole, FeatureKey, RoleFeaturePermissions, DEFAULT_ROLE_PERMISSIONS } from '../types/roles';
import { useAdminAuth } from './AdminAuthContext';
import { useRegistration } from './RegistrationContext';
import { networkStatusService } from '../services/network/networkStatusService';

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

const getTime = () => new Date().toISOString().substring(11, 23);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  React.useEffect(() => {
    console.log(`[FLICKER-TRACE] PermissionProvider MOUNT ${getTime()}`);
    return () => console.log(`[FLICKER-TRACE] PermissionProvider UNMOUNT ${getTime()}`);
  }, []);

  const { user: adminUser, role: adminRole, loading: adminLoading } = useAdminAuth();
  const { status: regStatus, employeeData, authUser } = useRegistration();
  
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
  
  const [rolesLoading, setRolesLoading] = useState(true);

  // Check whether adminUser is an actual authenticated admin portal account (not an anonymous session)
  const isRealAdminAuth = Boolean(
    adminUser &&
    !adminUser.isAnonymous &&
    (adminRole === 'ADMIN' || adminRole === 'SUPER_ADMIN' || adminRole === 'HR')
  );

  // Determine active role based on authenticated admin or employee registration profile
  const currentRole = useMemo<AppRole | null>(() => {
    if (isRealAdminAuth) {
      return adminRole;
    } else if (regStatus === 'Approved' && employeeData) {
      const explicitRole = (employeeData.role || '').toUpperCase();
      if (explicitRole === 'SUPER_ADMIN') return 'SUPER_ADMIN';
      if (explicitRole === 'ADMIN') return 'ADMIN';
      if (explicitRole === 'HR') return 'HR';
      if (
        explicitRole === 'TEAM_LEADER' ||
        explicitRole === 'MANAGER' ||
        employeeData.isTeamLeader === true ||
        employeeData.isTeamLeader === 'true' ||
        employeeData.isManager === true ||
        employeeData.isManager === 'true'
      ) {
        return 'TEAM_LEADER';
      }
      return 'EMPLOYEE';
    } else if (regStatus === 'Approved') {
      return 'EMPLOYEE';
    }
    return null;
  }, [isRealAdminAuth, adminRole, regStatus, employeeData]);

  // Sync roles from Firestore
  useEffect(() => {
    let isMounted = true;
    let timerId: NodeJS.Timeout | null = null;

    if (!db || typeof db !== 'object') {
      console.warn('PermissionContext: db is not a valid object!', db);
      setRolesLoading(false);
      return;
    }
    
    // Check if we have cached roles in localStorage for fast offline startup
    const localRoles = localStorage.getItem('roles_cache');
    if (localRoles) {
      try {
        setRolesCache(JSON.parse(localRoles));
        setRolesLoading(false);
      } catch (e) {
        console.error('Failed to parse cached roles', e);
      }
    } else if (regStatus === 'Approved') {
      // For employees with default permissions, don't block offline startup
      setRolesLoading(false);
    }

    // Bounded initialization wait: 5000 ms
    timerId = setTimeout(() => {
      if (!isMounted) return;
      console.log('Permission initialization timed out');
      setRolesLoading(false);
    }, 5000);

    let unsub = () => {};
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      setRolesLoading(false);
      return unsub;
    }

    try {
      const q = query(collection(db, 'roles'));
      unsub = onSnapshot(q, (snapshot) => {
        if (!isMounted) return;
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
        const newRoles = { ...rolesCache };
        snapshot.docs.forEach(docSnap => {
          const data = docSnap.data() as RoleFeaturePermissions;
          const rawKey = data?.roleId || docSnap.id;
          const roleKey = (typeof rawKey === 'string' ? rawKey.toUpperCase() : '') as AppRole;
          if (roleKey && DEFAULT_ROLE_PERMISSIONS[roleKey]) {
            newRoles[roleKey] = {
              roleId: roleKey,
              name: data.name || roleKey,
              description: data.description || `${roleKey} role`,
              enabled: data.enabled !== false,
              permissions: {
                ...DEFAULT_ROLE_PERMISSIONS[roleKey],
                ...(data.permissions || {}),
              },
              createdAt: data.createdAt || new Date().toISOString(),
              updatedAt: data.updatedAt || new Date().toISOString(),
            };
          }
        });
        setRolesCache(newRoles);
        localStorage.setItem('roles_cache', JSON.stringify(newRoles));
        setRolesLoading(false);
      }, (error) => {
        if (!isMounted) return;
        console.error('Error fetching roles:', error);
        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }
        setRolesLoading(false);
      });
    } catch (error) {
      console.error('Failed to initialize roles snapshot listener:', error);
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      setRolesLoading(false);
    }

    // Invalidate stale permission cache on network reconnection
    const unsubscribeNetwork = networkStatusService.subscribe((status) => {
      if (status.isOnline) {
        console.log('Permission Context: Network reconnected. Firestore remains authoritative, refreshing permissions...');
        const updatedLocal = localStorage.getItem('roles_cache');
        if (updatedLocal) {
          try {
            setRolesCache(JSON.parse(updatedLocal));
          } catch (e) {
            console.error('Failed to parse updated cached roles on reconnect', e);
          }
        }
      }
    });

    return () => {
      isMounted = false;
      if (timerId) clearTimeout(timerId);
      unsub();
      unsubscribeNetwork();
    };
  }, []);

  const hasPermission = (feature: FeatureKey): boolean => {
    if (!currentRole) {
      console.debug('[AUTH DEBUG] Authorization check failed: no currentRole', {
        feature,
        userId: authUser?.uid || employeeData?.id || null,
        employeeCode: employeeData?.employeeCode || null,
        regStatus,
        result: false,
      });
      return false;
    }

    // Super Admin safeguards: Super Admin always retains core management features
    if (currentRole === 'SUPER_ADMIN') {
      const isCritical = ['userManagement', 'roleManagement', 'featurePermissions', 'systemHealth', 'systemSettings', 'myTeam'].includes(feature);
      if (isCritical) {
        console.debug('[AUTH DEBUG] Authorization granted: SUPER_ADMIN critical feature', {
          feature,
          role: currentRole,
          result: true,
        });
        return true;
      }
    }

    const roleConfig = rolesCache[currentRole];
    let isAllowed = false;
    let source = 'default';

    if (!roleConfig) {
      isAllowed = DEFAULT_ROLE_PERMISSIONS[currentRole]?.[feature] === true;
      source = 'default_no_config';
    } else if (!roleConfig.enabled) {
      isAllowed = false;
      source = 'role_disabled';
    } else {
      const val = roleConfig.permissions?.[feature];
      if (val !== undefined) {
        isAllowed = val === true;
        source = 'firestore_roles';
      } else {
        isAllowed = DEFAULT_ROLE_PERMISSIONS[currentRole]?.[feature] === true;
        source = 'default_fallback';
      }
    }

    console.debug('[AUTH DEBUG] Authorization check', {
      feature,
      userId: authUser?.uid || employeeData?.id || null,
      employeeCode: employeeData?.employeeCode || null,
      role: currentRole,
      source,
      result: isAllowed,
    });

    return isAllowed;
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
  const isHR = React.useCallback(() => currentRole === 'HR' || currentRole === 'SUPER_ADMIN', [currentRole]);
  const isTeamLeader = React.useCallback(() => currentRole === 'TEAM_LEADER' || currentRole === 'ADMIN' || currentRole === 'SUPER_ADMIN', [currentRole]);
  const isEmployee = React.useCallback(() => currentRole === 'EMPLOYEE' || currentRole === 'TEAM_LEADER' || currentRole === 'ADMIN' || currentRole === 'SUPER_ADMIN', [currentRole]);

  // Loading is true while authentication and registration profile are hydrating
  const isAuthHydrating = isRealAdminAuth ? adminLoading : regStatus === 'loading';
  const effectiveLoading = isAuthHydrating || (rolesLoading && Object.keys(rolesCache).length === 0);

  const contextValue = useMemo(
    () => ({
      roles: rolesCache,
      currentRole,
      loading: effectiveLoading,
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
      effectiveLoading,
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
