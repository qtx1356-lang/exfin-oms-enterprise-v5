import React, { useEffect, useState } from "react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { usePermission } from "../../context/PermissionContext";
import { db } from "../../services/firebase/config";
import { collection, getDocs } from "firebase/firestore";

export const UserManagementTab: React.FC = () => {
  console.log("[UM_PHASE_4] RENDER_START");

  const [queryStarted, setQueryStarted] = useState(false);
  const [queryCompleted, setQueryCompleted] = useState(false);
  const [recordCount, setRecordCount] = useState(0);
  const [queryError, setQueryError] = useState<string | null>(null);

  let auth: any = null;
  let authInit = false;
  try {
    auth = useAdminAuth();
    authInit = true;
    console.log("[UM_PHASE_4] ADMIN_AUTH_RESULT", auth);
  } catch (e) {
    console.error("[UM_PHASE_4] ADMIN_AUTH_ERROR", e);
  }

  let permissions: any = null;
  let permInit = false;
  try {
    permissions = usePermission();
    permInit = true;
    console.log("[UM_PHASE_4] PERMISSION_RESULT", permissions);
  } catch (e) {
    console.error("[UM_PHASE_4] PERMISSION_ERROR", e);
  }

  useEffect(() => {
    const loadData = async () => {
      console.log("[UM_PHASE_4] DATA_LOAD_START");
      setQueryStarted(true);
      try {
        const querySnapshot = await getDocs(collection(db, "registrations"));
        setRecordCount(querySnapshot.size);
        setQueryCompleted(true);
        console.log("[UM_PHASE_4] DATA_LOAD_SUCCESS", querySnapshot.size);
      } catch (e: any) {
        console.error("[UM_PHASE_4] DATA_LOAD_ERROR", e);
        setQueryError(e.message || "Unknown Firestore error");
      }
    };

    if (authInit && permInit) {
      loadData();
    }
  }, [authInit, permInit]);

  console.log("[UM_PHASE_4] RENDER_SUCCESS");

  return (
    <div className="p-4 text-white font-mono text-sm">
      <h1 className="text-xl font-bold mb-4">PHASE 4 — DATA LOAD TEST (UM-PHASE-4-DATA-LOAD)</h1>
      
      <div className="mb-4 p-4 bg-gray-800 rounded">
        <h2 className="font-bold text-lg mb-2">Phase 3 Baseline:</h2>
        <p>Authentication: {authInit && auth?.user ? 'PASS' : 'FAIL'}</p>
        <p>Permission: {permInit && permissions?.isAdmin?.() ? 'PASS' : 'FAIL'}</p>
      </div>

      <div className="mb-4 p-4 bg-gray-800 rounded">
        <h2 className="font-bold text-lg mb-2">Phase 4 — Data Load:</h2>
        <p>Data query started: {queryStarted ? 'YES' : 'NO'}</p>
        <p>Data query completed: {queryCompleted ? 'YES' : 'NO'}</p>
        <p>Records loaded: {recordCount}</p>
        {queryError && (
          <p className="text-red-400 mt-2">Error: {queryError}</p>
        )}
      </div>

      <div className="p-4 bg-gray-800 rounded">
        <h2 className="font-bold text-lg mb-2">Phase 4 Status:</h2>
        <p className={queryCompleted ? "text-emerald-400 font-bold" : "text-amber-400"}>
          PHASE 4: {queryCompleted ? 'PASS' : (queryError ? 'FAIL' : 'WAITING')}
        </p>
      </div>

      <div className="mt-8 p-4 bg-gray-900 rounded opacity-50 text-[10px]">
        <h3 className="font-bold mb-1">useAdminAuth Internal Diagnostics:</h3>
        <p>Loading: {auth?.loading ? 'YES' : 'NO'}</p>
        <p>Role: {auth?.role ?? 'N/A'}</p>
        <p>User ID present: {!!auth?.user?.uid ? 'YES' : 'NO'}</p>
      </div>
    </div>
  );
};

