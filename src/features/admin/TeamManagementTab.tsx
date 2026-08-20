import React, { useEffect, useState } from 'react';
import {
  Users,
  Search,
  UserPlus,
  UserMinus,
  CheckSquare,
  Square,
  ArrowLeft,
  ShieldCheck,
  Building2,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { db } from '../../services/firebase/config';
import {
  collection,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  addDoc,
} from 'firebase/firestore';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

interface Employee {
  id: string;
  name: string;
  employeeCode?: string;
  office?: string;
  designation?: string;
  role?: string;
  status?: string;
  isTeamLeader?: boolean;
  assignedTeamLeaderId?: string | null;
  teamLeaderUid?: string | null;
  teamLeaderId?: string | null;
  assignedTeamLeaderName?: string | null;
  teamLeaderName?: string | null;
  assignedTeamLeaderCode?: string | null;
  teamLeaderCode?: string | null;
  teamMemberUids?: string[];
  mobileNumber?: string;
  email?: string;
}

export const TeamManagementTab: React.FC = () => {
  const { role, loginId, user: adminUser } = useAdminAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Team Leader to manage
  const [selectedLeader, setSelectedLeader] = useState<Employee | null>(null);

  // Search & Filters for Team Leader List
  const [leaderSearch, setLeaderSearch] = useState('');

  // Search & Filters for Member Assignment View
  const [currentMemberSearch, setCurrentMemberSearch] = useState('');
  const [availableMemberSearch, setAvailableMemberSearch] = useState('');
  const [availableFilter, setAvailableFilter] = useState<'ALL' | 'UNASSIGNED' | 'ASSIGNED'>('ALL');

  // Multi-select state
  const [selectedAvailableIds, setSelectedAvailableIds] = useState<string[]>([]);
  const [selectedCurrentIds, setSelectedCurrentIds] = useState<string[]>([]);

  // Feedback banner state
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Subscribe to employees real-time
  useEffect(() => {
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'registrations'), (snap) => {
      const list: Employee[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Employee);
      });
      setEmployees(list);
      setLoading(false);

      // Keep selected leader updated if open
      if (selectedLeader) {
        const updatedLeader = list.find((e) => e.id === selectedLeader.id);
        if (updatedLeader) {
          setSelectedLeader(updatedLeader);
        }
      }
    });

    return () => unsub();
  }, [selectedLeader?.id]);

  // Auto-dismiss message
  useEffect(() => {
    if (actionMessage) {
      const timer = setTimeout(() => setActionMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionMessage]);

  // List of Team Leaders
  const teamLeaders = employees.filter(
    (e) => e.isTeamLeader === true || e.role === 'TEAM_LEADER'
  );

  const filteredLeaders = teamLeaders.filter((tl) => {
    const q = leaderSearch.toLowerCase();
    const name = (tl.name || '').toLowerCase();
    const code = (tl.employeeCode || '').toLowerCase();
    const office = (tl.office || '').toLowerCase();
    return name.includes(q) || code.includes(q) || office.includes(q);
  });

  // Calculate current team members for a given leader
  const getLeaderMembers = (leader: Employee) => {
    return employees.filter((e) => {
      if (e.id === leader.id) return false; // cannot be member of self
      const matchesId =
        e.assignedTeamLeaderId === leader.id ||
        e.teamLeaderUid === leader.id ||
        e.teamLeaderId === leader.id;
      const matchesCode =
        leader.employeeCode &&
        (e.teamLeaderCode === leader.employeeCode ||
          e.assignedTeamLeaderCode === leader.employeeCode);
      const matchesArray =
        Array.isArray(leader.teamMemberUids) && leader.teamMemberUids.includes(e.id);
      return matchesId || matchesCode || matchesArray;
    });
  };

  // If a leader is selected, calculate current and available members
  const currentMembers = selectedLeader ? getLeaderMembers(selectedLeader) : [];
  const currentMemberIds = currentMembers.map((m) => m.id);

  const filteredCurrentMembers = currentMembers.filter((m) => {
    const q = currentMemberSearch.toLowerCase();
    const name = (m.name || '').toLowerCase();
    const code = (m.employeeCode || '').toLowerCase();
    const desig = (m.designation || '').toLowerCase();
    return name.includes(q) || code.includes(q) || desig.includes(q);
  });

  // Available employees to assign
  const availableEmployees = employees.filter((e) => {
    if (!selectedLeader) return false;
    if (e.id === selectedLeader.id) return false; // Exclude leader
    if (e.role === 'SUPER_ADMIN' || e.role === 'ADMIN') return false; // Exclude admins
    if (currentMemberIds.includes(e.id)) return false; // Exclude already in current team
    return true;
  });

  const filteredAvailableEmployees = availableEmployees.filter((e) => {
    const q = availableMemberSearch.toLowerCase();
    const name = (e.name || '').toLowerCase();
    const code = (e.employeeCode || '').toLowerCase();
    const desig = (e.designation || '').toLowerCase();
    const office = (e.office || '').toLowerCase();

    const matchesQuery = name.includes(q) || code.includes(q) || desig.includes(q) || office.includes(q);
    if (!matchesQuery) return false;

    const isAssigned = !!(e.assignedTeamLeaderId || e.teamLeaderUid || e.teamLeaderId);
    if (availableFilter === 'UNASSIGNED' && isAssigned) return false;
    if (availableFilter === 'ASSIGNED' && !isAssigned) return false;

    return true;
  });

  // Toggle selection for available employees
  const toggleAvailableSelect = (id: string) => {
    setSelectedAvailableIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllAvailable = () => {
    if (selectedAvailableIds.length === filteredAvailableEmployees.length) {
      setSelectedAvailableIds([]);
    } else {
      setSelectedAvailableIds(filteredAvailableEmployees.map((e) => e.id));
    }
  };

  // Toggle selection for current members
  const toggleCurrentSelect = (id: string) => {
    setSelectedCurrentIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAllCurrent = () => {
    if (selectedCurrentIds.length === filteredCurrentMembers.length) {
      setSelectedCurrentIds([]);
    } else {
      setSelectedCurrentIds(filteredCurrentMembers.map((m) => m.id));
    }
  };

  // ASSIGN SELECTED EMPLOYEES
  const handleAssignSelected = async () => {
    if (!selectedLeader || selectedAvailableIds.length === 0) return;
    setIsProcessing(true);
    setActionMessage(null);

    const nowIso = new Date().toISOString();
    const leaderId = selectedLeader.id;
    const leaderName = selectedLeader.name || 'Team Leader';
    const leaderCode = selectedLeader.employeeCode || leaderId;

    try {
      let updatedLeaderUids = Array.isArray(selectedLeader.teamMemberUids)
        ? [...selectedLeader.teamMemberUids]
        : [];

      for (const memberId of selectedAvailableIds) {
        const member = employees.find((e) => e.id === memberId);
        if (!member) continue;

        const prevTlId =
          member.assignedTeamLeaderId || member.teamLeaderUid || member.teamLeaderId;

        // If member was under another Team Leader, remove from old Team Leader's teamMemberUids
        if (prevTlId && prevTlId !== leaderId) {
          try {
            const oldTlRef = doc(db, 'registrations', prevTlId);
            const oldTlSnap = await getDoc(oldTlRef);
            if (oldTlSnap.exists()) {
              const oldTlData = oldTlSnap.data();
              const oldUids: string[] = Array.isArray(oldTlData.teamMemberUids)
                ? oldTlData.teamMemberUids
                : [];
              const updatedOldUids = oldUids.filter((id) => id !== memberId);
              await updateDoc(oldTlRef, { teamMemberUids: updatedOldUids, updatedAt: nowIso });
            }
          } catch (err) {
            console.warn('Error removing from previous Team Leader:', err);
          }
        }

        // Update member record with new Team Leader info
        const memberRef = doc(db, 'registrations', memberId);
        await updateDoc(memberRef, {
          assignedTeamLeaderId: leaderId,
          teamLeaderUid: leaderId,
          teamLeaderId: leaderId,
          assignedTeamLeaderName: leaderName,
          teamLeaderName: leaderName,
          assignedTeamLeaderCode: leaderCode,
          teamLeaderCode: leaderCode,
          updatedAt: nowIso,
          updatedBy: adminUser?.email || loginId || 'Admin',
        });

        // Add to leader's teamMemberUids array
        if (!updatedLeaderUids.includes(memberId)) {
          updatedLeaderUids.push(memberId);
        }

        // Send notification to assigned member
        try {
          await addDoc(collection(db, 'notifications'), {
            id: `NOTIF_${Date.now()}_${memberId.slice(0, 5)}`,
            recipientUserId: memberId,
            recipientEmployeeCode: member.employeeCode || 'ALL',
            recipientRole: member.role || 'EMPLOYEE',
            title: 'Team Assignment Update',
            message: `You have been assigned to Team Leader ${leaderName} (${leaderCode}).`,
            type: 'TEAM_UPDATE',
            read: false,
            createdAtDeviceTime: nowIso,
            syncStatus: 'Synced',
          });
        } catch (notifErr) {
          console.warn('Notification error:', notifErr);
        }
      }

      // Update Team Leader document teamMemberUids
      const leaderRef = doc(db, 'registrations', leaderId);
      await updateDoc(leaderRef, {
        teamMemberUids: updatedLeaderUids,
        updatedAt: nowIso,
      });

      const count = selectedAvailableIds.length;
      setActionMessage({
        type: 'success',
        text: `Successfully assigned ${count} employee${count > 1 ? 's' : ''} to ${leaderName}.`,
      });
      setSelectedAvailableIds([]);
    } catch (error: any) {
      console.error('Error assigning employees:', error);
      setActionMessage({
        type: 'error',
        text: `Failed to assign employees: ${error.message || 'Unknown error'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // REMOVE SELECTED EMPLOYEES
  const handleRemoveSelected = async () => {
    if (!selectedLeader || selectedCurrentIds.length === 0) return;
    setIsProcessing(true);
    setActionMessage(null);

    const nowIso = new Date().toISOString();
    const leaderId = selectedLeader.id;
    const leaderName = selectedLeader.name || 'Team Leader';

    try {
      let updatedLeaderUids = Array.isArray(selectedLeader.teamMemberUids)
        ? [...selectedLeader.teamMemberUids]
        : [];

      for (const memberId of selectedCurrentIds) {
        const member = employees.find((e) => e.id === memberId);

        // Update member record to remove Team Leader
        const memberRef = doc(db, 'registrations', memberId);
        await updateDoc(memberRef, {
          assignedTeamLeaderId: null,
          teamLeaderUid: null,
          teamLeaderId: null,
          assignedTeamLeaderName: null,
          teamLeaderName: null,
          assignedTeamLeaderCode: null,
          teamLeaderCode: null,
          updatedAt: nowIso,
          updatedBy: adminUser?.email || loginId || 'Admin',
        });

        // Remove from leader's teamMemberUids array
        updatedLeaderUids = updatedLeaderUids.filter((id) => id !== memberId);

        // Send notification to unassigned member
        if (member) {
          try {
            await addDoc(collection(db, 'notifications'), {
              id: `NOTIF_${Date.now()}_${memberId.slice(0, 5)}`,
              recipientUserId: memberId,
              recipientEmployeeCode: member.employeeCode || 'ALL',
              recipientRole: member.role || 'EMPLOYEE',
              title: 'Team Assignment Update',
              message: `You have been removed from ${leaderName}'s team.`,
              type: 'TEAM_UPDATE',
              read: false,
              createdAtDeviceTime: nowIso,
              syncStatus: 'Synced',
            });
          } catch (notifErr) {
            console.warn('Notification error:', notifErr);
          }
        }
      }

      // Update Team Leader document teamMemberUids
      const leaderRef = doc(db, 'registrations', leaderId);
      await updateDoc(leaderRef, {
        teamMemberUids: updatedLeaderUids,
        updatedAt: nowIso,
      });

      const count = selectedCurrentIds.length;
      setActionMessage({
        type: 'success',
        text: `Successfully removed ${count} employee${count > 1 ? 's' : ''} from ${leaderName}'s team.`,
      });
      setSelectedCurrentIds([]);
    } catch (error: any) {
      console.error('Error removing employees:', error);
      setActionMessage({
        type: 'error',
        text: `Failed to remove employees: ${error.message || 'Unknown error'}`,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Feedback Alert Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 border shadow-lg animate-fadeIn ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
              : 'bg-rose-950/80 border-rose-500/40 text-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-bold">{actionMessage.text}</span>
        </div>
      )}

      {/* VIEW 1: TEAM LEADER LIST VIEW */}
      {!selectedLeader ? (
        <div className="space-y-6">
          <div className="bg-[#1A0B36]/80 p-6 rounded-3xl border border-amber-500/20 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-amber-400" />
                <h2 className="text-xl font-black text-white">Admin Team Management</h2>
              </div>
              <p className="text-xs text-purple-300/80 mt-1">
                Assign and manage employees under Team Leaders. Changes sync directly to Employee App &quot;My Team&quot;.
              </p>
            </div>

            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search Team Leader by name or code..."
                value={leaderSearch}
                onChange={(e) => setLeaderSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-medium placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {filteredLeaders.length === 0 ? (
            <Card className="p-8 text-center bg-[#180A33] border border-purple-500/20 rounded-3xl">
              <Users className="w-12 h-12 text-purple-400/40 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">No Team Leaders Found</h3>
              <p className="text-xs text-purple-300/70 mt-1 max-w-md mx-auto">
                No active employees have <code className="text-amber-300 bg-black/30 px-1.5 py-0.5 rounded">isTeamLeader = true</code> or role set to Team Leader. Assign Team Leader role in User Management first.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredLeaders.map((tl) => {
                const members = getLeaderMembers(tl);
                return (
                  <Card
                    key={tl.id}
                    className="p-5 bg-gradient-to-b from-[#1F0D42] to-[#170932] border border-amber-500/20 hover:border-amber-500/50 rounded-3xl shadow-xl transition-all duration-200 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center font-black text-white text-lg shadow-md shrink-0">
                            {tl.name ? tl.name.charAt(0).toUpperCase() : 'T'}
                          </div>
                          <div>
                            <h3 className="text-base font-black text-white leading-tight">{tl.name}</h3>
                            <span className="text-[11px] font-mono text-amber-300 font-bold block mt-0.5">
                              {tl.employeeCode || tl.id}
                            </span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Team Leader
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-purple-200/80 mb-4 bg-black/20 p-3 rounded-2xl border border-purple-500/10">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="truncate">{tl.office || 'Raniganj'}</span>
                        </div>
                        {tl.designation && (
                          <div className="flex items-center gap-2">
                            <Briefcase className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                            <span className="truncate">{tl.designation}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-purple-500/20 flex items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-purple-400/80 uppercase block">Team Members</span>
                        <span className="text-lg font-black text-amber-400">{members.length}</span>
                      </div>
                      <Button
                        onClick={() => {
                          setSelectedLeader(tl);
                          setSelectedAvailableIds([]);
                          setSelectedCurrentIds([]);
                        }}
                        className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg gap-1.5"
                      >
                        <UserCheck className="w-4 h-4" />
                        Manage Team
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* VIEW 2: DEDICATED MANAGE TEAM VIEW FOR SELECTED LEADER */
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="bg-[#1A0B36]/90 p-5 rounded-3xl border border-amber-500/30 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <button
                onClick={() => {
                  setSelectedLeader(null);
                  setSelectedAvailableIds([]);
                  setSelectedCurrentIds([]);
                }}
                className="p-2.5 rounded-2xl bg-purple-900/40 text-amber-300 hover:bg-amber-500 hover:text-black border border-amber-500/30 transition-all shrink-0"
                title="Back to Team Leaders"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-white truncate">{selectedLeader.name}</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Team Leader
                  </span>
                </div>
                <p className="text-xs text-purple-300/80 font-mono mt-0.5">
                  Code: {selectedLeader.employeeCode || selectedLeader.id} • Department: {selectedLeader.office || 'Raniganj'}
                </p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 px-4 py-2 rounded-2xl flex items-center gap-3 shrink-0">
              <div>
                <span className="text-[10px] font-bold text-amber-300/80 uppercase block">Total Team Members</span>
                <span className="text-xl font-black text-amber-400">{currentMembers.length}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* LEFT COLUMN: CURRENT TEAM MEMBERS */}
            <div className="bg-[#170932] border border-purple-500/20 rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-purple-500/20 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      Current Team Members ({currentMembers.length})
                    </h3>
                    <p className="text-[11px] text-purple-300/70">Employees assigned to {selectedLeader.name}</p>
                  </div>

                  {filteredCurrentMembers.length > 0 && (
                    <button
                      onClick={toggleSelectAllCurrent}
                      className="text-[11px] text-purple-300 hover:text-white font-bold flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-purple-500/20"
                    >
                      {selectedCurrentIds.length === filteredCurrentMembers.length ? (
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-purple-400" />
                      )}
                      Select All
                    </button>
                  )}
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter current team..."
                    value={currentMemberSearch}
                    onChange={(e) => setCurrentMemberSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-medium placeholder-purple-400/60 focus:outline-none focus:border-purple-400"
                  />
                </div>

                {/* List of current members */}
                <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-purple-900">
                  {filteredCurrentMembers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-purple-300/60 bg-black/20 rounded-2xl border border-purple-500/10">
                      No team members assigned yet or match search query.
                    </div>
                  ) : (
                    filteredCurrentMembers.map((member) => {
                      const isSelected = selectedCurrentIds.includes(member.id);
                      return (
                        <div
                          key={member.id}
                          onClick={() => toggleCurrentSelect(member.id)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-rose-950/30 border-rose-500/50 text-white'
                              : 'bg-black/20 border-purple-500/15 hover:border-purple-500/40 text-purple-100'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-1 rounded-lg shrink-0 ${isSelected ? 'text-rose-400' : 'text-purple-400'}`}>
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-white truncate">{member.name}</p>
                              <p className="text-[10px] font-mono text-purple-300/80 truncate">
                                {member.employeeCode || member.id} • {member.designation || member.office || 'Raniganj'}
                              </p>
                            </div>
                          </div>

                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 shrink-0">
                            Assigned
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action button to remove selected */}
              <div className="pt-3 border-t border-purple-500/20">
                <Button
                  onClick={handleRemoveSelected}
                  disabled={selectedCurrentIds.length === 0 || isProcessing}
                  className={`w-full py-2.5 rounded-xl text-xs font-black gap-2 transition-all ${
                    selectedCurrentIds.length > 0
                      ? 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white shadow-lg'
                      : 'bg-white/5 text-purple-400/50 border border-purple-500/10 cursor-not-allowed'
                  }`}
                >
                  <UserMinus className="w-4 h-4" />
                  Remove Selected ({selectedCurrentIds.length})
                </Button>
              </div>
            </div>

            {/* RIGHT COLUMN: AVAILABLE EMPLOYEES TO ASSIGN */}
            <div className="bg-[#170932] border border-purple-500/20 rounded-3xl p-5 shadow-xl flex flex-col justify-between space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 border-b border-purple-500/20 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-amber-400" />
                      Available Employees ({filteredAvailableEmployees.length})
                    </h3>
                    <p className="text-[11px] text-purple-300/70">Select employees to assign under {selectedLeader.name}</p>
                  </div>

                  {filteredAvailableEmployees.length > 0 && (
                    <button
                      onClick={toggleSelectAllAvailable}
                      className="text-[11px] text-purple-300 hover:text-white font-bold flex items-center gap-1 bg-white/5 px-2.5 py-1 rounded-lg border border-purple-500/20"
                    >
                      {selectedAvailableIds.length === filteredAvailableEmployees.length ? (
                        <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-purple-400" />
                      )}
                      Select All
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search by name, code..."
                      value={availableMemberSearch}
                      onChange={(e) => setAvailableMemberSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-medium placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <select
                    value={availableFilter}
                    onChange={(e: any) => setAvailableFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#211044] border border-purple-500/30 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                  >
                    <option value="ALL">All Available</option>
                    <option value="UNASSIGNED">Unassigned Only</option>
                    <option value="ASSIGNED">Assigned to Other TL</option>
                  </select>
                </div>

                {/* List of available employees */}
                <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-purple-900">
                  {filteredAvailableEmployees.length === 0 ? (
                    <div className="p-6 text-center text-xs text-purple-300/60 bg-black/20 rounded-2xl border border-purple-500/10">
                      No available employees match search query.
                    </div>
                  ) : (
                    filteredAvailableEmployees.map((emp) => {
                      const isSelected = selectedAvailableIds.includes(emp.id);
                      const currentTlName = emp.assignedTeamLeaderName || emp.teamLeaderName;
                      return (
                        <div
                          key={emp.id}
                          onClick={() => toggleAvailableSelect(emp.id)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500/60 text-white'
                              : 'bg-black/20 border-purple-500/15 hover:border-purple-500/40 text-purple-100'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-1 rounded-lg shrink-0 ${isSelected ? 'text-amber-400' : 'text-purple-400'}`}>
                              {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-extrabold text-white truncate">{emp.name}</p>
                              <p className="text-[10px] font-mono text-purple-300/80 truncate">
                                {emp.employeeCode || emp.id} • {emp.designation || emp.office || 'Raniganj'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            {currentTlName ? (
                              <span className="text-[9px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30 block">
                                TL: {currentTlName}
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-purple-300/60 bg-white/5 px-2 py-0.5 rounded-full border border-purple-500/10 block">
                                Unassigned
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action button to assign selected */}
              <div className="pt-3 border-t border-purple-500/20">
                <Button
                  onClick={handleAssignSelected}
                  disabled={selectedAvailableIds.length === 0 || isProcessing}
                  className={`w-full py-2.5 rounded-xl text-xs font-black gap-2 transition-all ${
                    selectedAvailableIds.length > 0
                      ? 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black shadow-lg'
                      : 'bg-white/5 text-purple-400/50 border border-purple-500/10 cursor-not-allowed'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  Assign Selected ({selectedAvailableIds.length})
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
