import React from "react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { usePermission } from "../../context/PermissionContext";

export const UserManagementTab: React.FC = () => {
  console.log("[UM_PHASE_3] RENDER_START");

  let auth: any = null;
  let authInit = false;
  try {
    auth = useAdminAuth();
    authInit = true;
    console.log("[UM_PHASE_3] ADMIN_AUTH_RESULT", auth);
  } catch (e) {
    console.error("[UM_PHASE_3] ADMIN_AUTH_ERROR", e);
  }

  let permissions: any = null;
  let permInit = false;
  try {
    permissions = usePermission();
    permInit = true;
    console.log("[UM_PHASE_3] PERMISSION_RESULT", permissions);
  } catch (e) {
    console.error("[UM_PHASE_3] PERMISSION_ERROR", e);
  }

  console.log("[UM_PHASE_3] RENDER_SUCCESS");

  const canAccess = permissions && typeof permissions.isAdmin === 'function' ? permissions.isAdmin() : false;

  return (
    <div className="p-4 text-white font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">PHASE 3 DIAGNOSTIC</h1>
      
      <div className="mb-4 p-4 bg-gray-800 rounded">
        <h2 className="font-bold text-lg mb-2">useAdminAuth:</h2>
        <p>Hook initialized: {authInit ? 'YES' : 'NO'}</p>
        <p>Loading: {auth?.loading ? 'YES' : 'NO'}</p>
        <p>Authenticated: {!!auth?.user ? 'YES' : 'NO'}</p>
        <p>Role: {auth?.role ?? 'N/A'}</p>
        <p>User ID present: {!!auth?.user?.uid ? 'YES' : 'NO'}</p>
      </div>

      <div className="mb-4 p-4 bg-gray-800 rounded">
        <h2 className="font-bold text-lg mb-2">usePermission:</h2>
        <p>Hook initialized: {permInit ? 'YES' : 'NO'}</p>
        <p>Can access User Management: {permissions && typeof permissions.isAdmin === 'function' ? (permissions.isAdmin() ? 'YES' : 'NO') : 'N/A'}</p>
      </div>

      <div className="p-4 bg-gray-800 rounded">
        <h2 className="font-bold text-lg mb-2">Render Status:</h2>
        <p>PHASE 3: {authInit && permInit ? 'PASS' : 'FAIL'}</p>
      </div>
    </div>
  );
};
