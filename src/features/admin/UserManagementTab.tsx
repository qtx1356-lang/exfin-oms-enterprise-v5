import React, { useEffect, useState } from "react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { usePermission } from "../../context/PermissionContext";
import { db } from "../../services/firebase/config";
import { collection, getDocs } from "firebase/firestore";

export const UserManagementTab: React.FC = () => {
  console.log("[UM_PHASE_5] RENDER_START");

  const [queryStarted, setQueryStarted] = useState(false);
  const [queryCompleted, setQueryCompleted] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);

  let auth: any = null;
  let authInit = false;
  try {
    auth = useAdminAuth();
    authInit = true;
    console.log("[UM_PHASE_5] ADMIN_AUTH_RESULT", auth);
  } catch (e) {
    console.error("[UM_PHASE_5] ADMIN_AUTH_ERROR", e);
  }

  let permissions: any = null;
  let permInit = false;
  try {
    permissions = usePermission();
    permInit = true;
    console.log("[UM_PHASE_5] PERMISSION_RESULT", permissions);
  } catch (e) {
    console.error("[UM_PHASE_5] PERMISSION_ERROR", e);
  }

  useEffect(() => {
    const loadData = async () => {
      console.log("[UM_PHASE_5] DATA_LOAD_START");
      setQueryStarted(true);
      try {
        const querySnapshot = await getDocs(collection(db, "registrations"));
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEmployees(data);
        setQueryCompleted(true);
        console.log("[UM_PHASE_5] DATA_LOAD_SUCCESS", data.length);
      } catch (e: any) {
        console.error("[UM_PHASE_5] DATA_LOAD_ERROR", e);
        setQueryError(e.message || "Unknown Firestore error");
      }
    };

    if (authInit && permInit) {
      loadData();
    }
  }, [authInit, permInit]);

  console.log("[UM_PHASE_5] RENDER_SUCCESS");

  return (
    <div className="p-4 text-white font-mono text-sm space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-black text-white">PHASE 5 — LIST UI (UM-PHASE-5-LIST-UI)</h1>
        <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${queryCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"}`}>
          PHASE 5: {queryCompleted ? 'STABLE' : 'LOADING'}
        </div>
      </div>
      
      {/* EMPLOYEE LIST TABLE */}
      <div className="bg-[#2D1B5A] border border-purple-500/20 rounded-[22px] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-purple-900/40 text-[10px] uppercase tracking-wider font-black text-purple-300/70">
            <tr>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Code</th>
              <th className="px-6 py-4">Role</th>
              <th className="px-6 py-4">Office</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {employees.length > 0 ? (
              employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{emp.name || 'Unknown'}</div>
                    <div className="text-[10px] text-purple-300/50">{emp.email || 'No Email'}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-purple-300">{emp.employeeCode || 'N/A'}</td>
                  <td className="px-6 py-4 text-xs font-bold text-purple-200">{emp.role || 'N/A'}</td>
                  <td className="px-6 py-4 text-xs text-purple-300/80">{emp.office || 'Raniganj'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${emp.status === 'Approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {emp.status || 'Pending'}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-purple-300/40">
                  {queryCompleted ? 'No records found' : 'Loading records...'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* DIAGNOSTICS FOOTER */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-800/50 border border-purple-500/10 rounded-xl">
          <h2 className="font-bold text-xs mb-2 uppercase text-purple-300/60">Auth/Perm Baseline</h2>
          <p className="text-[10px]">Auth: {authInit && auth?.user ? 'PASS' : 'FAIL'}</p>
          <p className="text-[10px]">Perm: {permInit && permissions?.isAdmin?.() ? 'PASS' : 'FAIL'}</p>
        </div>
        <div className="p-4 bg-gray-800/50 border border-purple-500/10 rounded-xl">
          <h2 className="font-bold text-xs mb-2 uppercase text-purple-300/60">Data Baseline</h2>
          <p className="text-[10px]">Query: {queryCompleted ? 'SUCCESS' : (queryError ? 'ERROR' : 'PENDING')}</p>
          <p className="text-[10px]">Records: {employees.length}</p>
        </div>
      </div>

      {queryError && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold">
          CRITICAL ERROR: {queryError}
        </div>
      )}
    </div>
  );
};

