import React from "react";
import { useAdminAuth } from "../../context/AdminAuthContext";

export const UserManagementTab: React.FC = () => {
  console.log("UM_STAGE_1_RENDER");
  console.log("UM_STAGE_2_AUTH_START");
  const auth = useAdminAuth();
  console.log("UM_STAGE_2_AUTH_SUCCESS", {
    authenticated: !!auth,
    role: auth?.role ?? null
  });

  return (
    <div>
      <h1>User Management</h1>
      <p>UM_STAGE_1_SUCCESS</p>
    </div>
  );
};
                  <option value="Pending Approval">Pending Approval</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              {/* Department */}
              <div className="space-y-1">
                <label className="text-purple-300 font-bold block">Department / Office</label>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                >
                  {masterDepts
                    .filter((d) => d.active || d.name === editDepartment)
                    .map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} {!d.active && '(Inactive)'}
                      </option>
                    ))}
                  {editDepartment && !masterDepts.some((d) => d.name === editDepartment) && (
                    <option value={editDepartment}>{editDepartment} (Unmapped)</option>
                  )}
                  <option value="Raniganj">Raniganj (Default)</option>
                </select>
              </div>

              {/* Designation */}
              <div className="space-y-1">
                <label className="text-purple-300 font-bold block">Designation</label>
                <select
                  value={editDesignation}
                  onChange={(e) => setEditDesignation(e.target.value)}
                  className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                >
                  <option value="">-- Select Designation --</option>
                  {masterDesigs
                    .filter((d) => d.active || d.name === editDesignation)
                    .map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name} {!d.active && '(Inactive)'}
                      </option>
                    ))}
                  {editDesignation && !masterDesigs.some((d) => d.name === editDesignation) && (
                    <option value={editDesignation}>{editDesignation} (Unmapped)</option>
                  )}
                  <option value="Executive">Executive</option>
                  <option value="Team Leader">Team Leader</option>
                </select>
              </div>

              {/* Is Team Leader Toggle */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isTlCheck"
                  checked={editIsTeamLeader}
                  onChange={(e) => setEditIsTeamLeader(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500"
                />
                <label htmlFor="isTlCheck" className="text-purple-200 font-bold cursor-pointer">
                  Designate as Team Leader
                </label>
              </div>

              {/* ASSIGN TEAM MEMBERS SECTION */}
              {(editIsTeamLeader || editRole === 'TEAM_LEADER') && (
                <div className="space-y-3 pt-3 border-t border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <label className="text-purple-300 font-bold block text-xs">Assign Team Members</label>
                    <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      {editTeamMemberUids.length} Assigned
                    </span>
                  </div>

                  {/* Member Search & Department Filter */}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={teamMemberSearchTerm}
                      onChange={(e) => setTeamMemberSearchTerm(e.target.value)}
                      className="px-2.5 py-1.5 bg-[#2D1B5A] border border-purple-500/30 rounded-lg text-xs text-white placeholder-purple-300/40 focus:outline-none"
                    />
                    <select
                      value={teamMemberDeptFilter}
                      onChange={(e) => setTeamMemberDeptFilter(e.target.value)}
                      className="px-2.5 py-1.5 bg-[#2D1B5A] border border-purple-500/30 rounded-lg text-xs text-white focus:outline-none"
                    >
                      <option value="ALL">All Depts</option>
                      {departments.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select All / Clear All */}
                  <div className="flex items-center justify-between text-[11px] pt-0.5">
                    <span className="text-purple-300/60 font-medium">Eligible Employees</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAllMembers}
                        className="text-purple-400 hover:text-purple-200 font-bold underline text-[10px]"
                      >
                        Select All
                      </button>
                      <span className="text-purple-500">•</span>
                      <button
                        type="button"
                        onClick={handleClearAllMembers}
                        className="text-purple-400 hover:text-purple-200 font-bold underline text-[10px]"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {/* Member Checkbox List */}
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[#1A0B36] border border-purple-500/20 rounded-xl">
                    {eligibleEmployees.length === 0 ? (
                      <div className="p-3 text-center text-purple-300/50 text-xs">No eligible employees found.</div>
                    ) : (
                      eligibleEmployees.map((emp) => {
                        const isChecked = editTeamMemberUids.includes(emp.id);
                        const currentTl = teamLeaders.find(
                          (tl) => tl.id === emp.assignedTeamLeaderId || tl.id === (emp as any).teamLeaderUid
                        );
                        const assignedToOther = currentTl && currentTl.id !== selectedUser.id;

                        return (
                          <label
                            key={emp.id}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors border ${
                              isChecked
                                ? 'bg-purple-600/20 border-purple-500/40 text-white'
                                : 'bg-[#211044]/50 border-transparent hover:bg-purple-500/10 text-purple-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleMemberSelection(emp.id)}
                                className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-purple-500/40"
                              />
                              <div className="truncate">
                                <div className="font-bold text-xs text-white truncate">{emp.name}</div>
                                <div className="text-[10px] text-purple-300/60 font-mono">
                                  {emp.employeeCode} • {emp.office || 'Raniganj'}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0 ml-2">
                              {assignedToOther ? (
                                <span className="text-[9px] font-bold text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                                  TL: {currentTl.name}
                                </span>
                              ) : currentTl && currentTl.id === selectedUser.id ? (
                                <span className="text-[9px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  In Team
                                </span>
                              ) : (
                                <span className="text-[9px] text-purple-300/40 italic">Unassigned</span>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {editTeamMemberUids.length === 0 && (
                    <div className="text-[11px] text-amber-300/90 italic bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 text-center font-medium">
                      No team members assigned
                    </div>
                  )}
                </div>
              )}

              {/* Assign Team Leader */}
              {!editIsTeamLeader && editRole !== 'TEAM_LEADER' && (
                <div className="space-y-1 pt-1">
                  <label className="text-purple-300 font-bold block">Assign Team Leader</label>
                  <select
                    value={editTeamLeaderId}
                    onChange={(e) => setEditTeamLeaderId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#2D1B5A] border border-purple-500/30 rounded-xl text-white focus:outline-none"
                  >
                    <option value="">No Team Leader Assigned</option>
                    {teamLeaders.map((tl) => (
                      <option key={tl.id} value={tl.id}>
                        {tl.name} ({tl.office || 'Raniganj'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={() => setIsEditModalOpen(false)} variant="secondary" className="flex-1 text-xs">
                Cancel
              </Button>
              <Button
                onClick={handleSaveUser}
                disabled={isSubmitting}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-xs"
              >
                {isSubmitting ? 'Saving...' : 'Update User'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM MODAL */}
      {isDeleteModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#211044] border border-red-500/50 rounded-2xl max-w-sm w-full p-6 space-y-4">
            <div>
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" /> Confirm Deletion
              </h3>
              <p className="text-xs text-purple-200 mt-2">
                Delete this employee and all associated data? This action is permanent and cannot be undone.
              </p>
            </div>

            <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/30 text-xs">
              <span className="text-white font-bold block">{selectedUser.name}</span>
              <span className="text-red-300 font-mono block">{selectedUser.employeeCode}</span>
            </div>

            {statusMessage && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}
              >
                {statusMessage.text}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button onClick={() => setIsDeleteModalOpen(false)} variant="secondary" className="px-4 py-2 text-xs" disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={handleDeleteUser} className="px-4 py-2 text-xs bg-red-600 hover:bg-red-700 text-white border border-red-500" disabled={isSubmitting}>
                {isSubmitting ? 'Deleting...' : 'DELETE'}
              </Button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
