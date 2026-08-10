import React, { useEffect, useState } from "react";
import { Edit } from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { usePermission } from "../../context/PermissionContext";
import { db } from "../../services/firebase/config";
import { collection, getDocs } from "firebase/firestore";
import { ProfileEditModal } from "../../components/common/ProfileEditModal";
import { ManagedUser } from "../../types/user";

export const UserManagementTab: React.FC = () => {
  console.log("[UM_PHASE_6A] RENDER_START");

  const [queryStarted, setQueryStarted] = useState(false);
  const [queryCompleted, setQueryCompleted] = useState(false);
  const [employees, setEmployees] = useState<ManagedUser[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);

  // Phase 6 State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null);

  let auth: any = null;
  let authInit = false;
  try {
    auth = useAdminAuth();
    authInit = true;
    console.log("[UM_PHASE_6A] ADMIN_AUTH_RESULT", auth);
  } catch (e) {
    console.error("[UM_PHASE_6A] ADMIN_AUTH_ERROR", e);
  }

  let permissions: any = null;
  let permInit = false;
  try {
    permissions = usePermission();
    permInit = true;
    console.log("[UM_PHASE_6A] PERMISSION_RESULT", permissions);
  } catch (e) {
    console.error("[UM_PHASE_6A] PERMISSION_ERROR", e);
  }

  useEffect(() => {
    if (authInit && permInit && !queryStarted) {
      console.log("[UM_PHASE_6A] DATA_LOAD_START");
      setQueryStarted(true);
      const loadData = async () => {
        try {
          const querySnapshot = await getDocs(collection(db, "registrations"));
          const data = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as ManagedUser[];
          setEmployees(data);
          setQueryCompleted(true);
          console.log("[UM_PHASE_6A] DATA_LOAD_SUCCESS", data.length);
        } catch (e: any) {
          console.error("[UM_PHASE_6A] DATA_LOAD_ERROR", e);
          setQueryError(e.message || "Unknown Firestore error");
        }
      };
      loadData();
    }
  }, [authInit, permInit, queryStarted]);

  console.log("[UM_PHASE_6A] RENDER_SUCCESS");

  const handleEditClick = (user: ManagedUser) => {
    console.log("[UM_PHASE_6A] EDIT_CLICKED", user.id);
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  return (
    <div className="p-4 text-white font-mono text-sm space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-xl font-black text-white uppercase">PHASE 6A — EDIT MODAL</h1>
        <div className="flex gap-2">
          <div className="px-3 py-1 bg-purple-900/40 border border-purple-500/30 rounded-lg text-center text-[10px] font-black text-purple-300">
            UM-PHASE-6A-UI-VISIBLE-2026-08-10-E
          </div>
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold ${queryCompleted ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border border-amber-500/30"}`}>
            PHASE 6A UI: {queryCompleted ? 'PASS' : 'LOADING'}
          </div>
        </div>
      </div>
      
      {queryError && (
        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-xs">
          Error: {queryError}
        </div>
      )}

      <div className="bg-[#1A0B2E] border border-purple-500/20 rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="border-b border-purple-500/20 bg-purple-900/20">
              <th className="px-6 py-4 font-bold text-purple-300">Employee</th>
              <th className="px-6 py-4 font-bold text-purple-300">Code</th>
              <th className="px-6 py-4 font-bold text-purple-300 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-purple-500/10">
            {queryCompleted && employees.length > 0 ? (
              employees.map(emp => (
                <tr key={emp.id} className="hover:bg-purple-900/10 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white text-base">{emp.name || 'Unknown'}</div>
                    <div className="text-[10px] text-purple-300/50">{emp.email || 'No Email'}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-purple-300">{emp.employeeCode || 'N/A'}</td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => handleEditClick(emp)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-xl transition-all shadow-lg hover:shadow-purple-500/20 inline-flex items-center justify-center gap-2"
                      title="Edit Profile"
                    >
                      <Edit className="w-4 h-4 text-white" />
                      <span className="font-bold text-white text-xs">Edit</span>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-purple-300/40">
                  {queryCompleted ? 'No records found' : 'Loading records...'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Profile Edit Modal */}
      {selectedUser && (
        <ProfileEditModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          user={selectedUser}
          onSave={async () => {}} // Disabled for Phase 6A
          departments={[]}
          designations={[]}
        />
      )}

      {/* DIAGNOSTICS FOOTER */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-800/50 border border-purple-500/10 rounded-xl">
          <div className="text-[10px] font-black text-purple-400 mb-1">AUTH STATUS</div>
          <div className="text-xs text-white">{authInit ? "Initialized" : "Pending"}</div>
        </div>
        <div className="p-4 bg-gray-800/50 border border-purple-500/10 rounded-xl">
          <div className="text-[10px] font-black text-purple-400 mb-1">DATA STATUS</div>
          <div className="text-xs text-white">{queryCompleted ? "Loaded" : "Loading..."}</div>
        </div>
      </div>
    </div>
  );
};
