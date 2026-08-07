import React, { useState, useEffect } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { db } from '../../services/firebase/config';
import { collection, query, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { 
  Users, 
  CheckSquare, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Plus, 
  Filter, 
  Search, 
  Briefcase, 
  MessageSquare, 
  TrendingUp, 
  Calendar, 
  ShieldAlert, 
  Send,
  RotateCcw,
  BarChart3,
  UserCheck,
  Building2,
  ChevronRight,
  Eye
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { TaskRecord, TaskPriority, TaskApprovalStatus, AssignmentType, getEffectiveTaskStatus } from '../../types/planner';
import { getStoredTasks, saveTaskRecord } from '../../services/planner/taskStorage';
import { EfficiencyDashboard } from '../efficiency/EfficiencyDashboard';

interface TeamMember {
  id: string;
  employeeCode: string;
  name: string;
  department?: string;
  office?: string;
  designation?: string;
  status: string;
  mobileNumber?: string;
  selfieUrl?: string;
  teamLeaderId?: string | null;
  teamLeaderCode?: string | null;
  teamLeaderName?: string | null;
}

export const MyTeamScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamTasks, setTeamTasks] = useState<TaskRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'tasks' | 'approvals' | 'reports'>('overview');

  // Filter & Search states
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [memberFilter, setMemberFilter] = useState<string>('All');

  // Task Creation Dialog State
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskAssignmentType, setTaskAssignmentType] = useState<AssignmentType>('EMPLOYEE');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [taskStartDate, setTaskStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskDueDate, setTaskDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [taskDueTime, setTaskDueTime] = useState('18:00');
  const [taskRemark, setTaskRemark] = useState('');

  // Task Approval & Revision Dialog
  const [selectedTaskForReview, setSelectedTaskForReview] = useState<TaskRecord | null>(null);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionRemarkInput, setRevisionRemarkInput] = useState('');

  // Employee Detail Report Modal
  const [selectedMemberForReport, setSelectedMemberForReport] = useState<TeamMember | null>(null);

  const isTeamLeader = Boolean(employeeData?.isTeamLeader);
  const currentLeaderCode = employeeData?.employeeCode || '';
  const currentLeaderId = employeeData?.id || '';

  // Listen to Firestore team members and tasks
  useEffect(() => {
    if (!db || !isTeamLeader) return;

    // 1. Fetch registrations assigned to this team leader
    const unsubRegs = onSnapshot(collection(db, 'registrations'), (snapshot) => {
      const fetchedMembers: TeamMember[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Check if assigned to this team leader
        const matchesLeader = 
          data.teamLeaderCode === currentLeaderCode || 
          data.teamLeaderId === currentLeaderId ||
          (data.teamLeaderId && data.teamLeaderId === docSnap.id);

        if (matchesLeader && data.status === 'Approved') {
          fetchedMembers.push({ id: docSnap.id, ...data } as TeamMember);
        }
      });
      setTeamMembers(fetchedMembers);
    });

    // 2. Fetch tasks created by or assigned to this team
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const allFirestoreTasks: TaskRecord[] = [];
      snapshot.forEach((docSnap) => {
        allFirestoreTasks.push({ id: docSnap.id, ...docSnap.data() } as TaskRecord);
      });

      const localTasks = getStoredTasks();
      const mergedMap = new Map<string, TaskRecord>();
      allFirestoreTasks.forEach((t) => mergedMap.set(t.id, t));
      localTasks.forEach((t) => {
        if (!mergedMap.has(t.id)) mergedMap.set(t.id, t);
      });

      const combined = Array.from(mergedMap.values());
      
      // Filter tasks belonging to this team leader or team members
      const teamMemberCodes = new Set([currentLeaderCode]);
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.teamLeaderCode === currentLeaderCode || data.teamLeaderId === currentLeaderId) {
          if (data.employeeCode) teamMemberCodes.add(data.employeeCode);
        }
      });

      const filteredTeamTasks = combined.filter((t) => {
        // Created by this Team Leader
        if (t.createdBy === currentLeaderId || t.createdBy === currentLeaderCode) return true;
        if (t.teamLeaderCode === currentLeaderCode || t.teamLeaderId === currentLeaderId) return true;
        // Assigned to team members
        const isAssignedToMember = (t.assignedToEmployeeCodes || []).some((code) => teamMemberCodes.has(code));
        return isAssignedToMember;
      });

      filteredTeamTasks.sort((a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime());
      setTeamTasks(filteredTeamTasks);
    });

    return () => {
      unsubRegs();
      unsubTasks();
    };
  }, [db, isTeamLeader, currentLeaderCode, currentLeaderId]);

  if (!isTeamLeader) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center text-white">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4 border border-red-500/30">
          <ShieldAlert className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-black text-red-400 mb-2">Access Restricted</h2>
        <p className="text-xs text-purple-200 max-w-md">
          You are not designated as a Team Leader. The "My Team" module is automatically unlocked when an Administrator assigns you Team Leader status.
        </p>
      </div>
    );
  }

  // Statistics Calculations
  const totalTeamMembers = teamMembers.length;
  const pendingApprovalsCount = teamTasks.filter((t) => t.approvalStatus === 'PENDING_REVIEW').length;
  const pendingTasksCount = teamTasks.filter((t) => getEffectiveTaskStatus(t) === 'PENDING').length;
  const inProgressTasksCount = teamTasks.filter((t) => getEffectiveTaskStatus(t) === 'IN_PROGRESS').length;
  const completedTasksCount = teamTasks.filter((t) => getEffectiveTaskStatus(t) === 'COMPLETED').length;
  const overdueTasksCount = teamTasks.filter((t) => getEffectiveTaskStatus(t) === 'OVERDUE').length;
  const activeTasksCount = pendingTasksCount + inProgressTasksCount + overdueTasksCount;

  const teamCompletionPct = teamTasks.length > 0 ? Math.round((completedTasksCount / teamTasks.length) * 100) : 0;

  // On-time completion rate
  const onTimeCompleted = teamTasks.filter((t) => {
    if (getEffectiveTaskStatus(t) !== 'COMPLETED') return false;
    if (!t.completedAt || !t.dueDate) return true;
    return new Date(t.completedAt).getTime() <= new Date(t.dueDate).getTime();
  }).length;
  const onTimePct = completedTasksCount > 0 ? Math.round((onTimeCompleted / completedTasksCount) * 100) : 100;

  // Revision count
  const revisionRequiredCount = teamTasks.filter((t) => t.approvalStatus === 'REVISION_REQUIRED').length;

  // Handle Task Creation by Team Leader
  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !taskDescription.trim() || !taskDueDate) return;

    const nowIso = new Date().toISOString();
    const taskId = `task_tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let assignedIds: string[] = [];
    let assignedCodes: string[] = [];

    if (taskAssignmentType === 'DEPARTMENT') {
      assignedIds = teamMembers.map((m) => m.id);
      assignedCodes = teamMembers.map((m) => m.employeeCode);
    } else {
      assignedIds = selectedMemberIds;
      assignedCodes = teamMembers
        .filter((m) => selectedMemberIds.includes(m.id) || selectedMemberIds.includes(m.employeeCode))
        .map((m) => m.employeeCode);
    }

    const newTask: TaskRecord = {
      id: taskId,
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assignmentType: taskAssignmentType,
      assignedToEmployeeIds: assignedIds,
      assignedToEmployeeCodes: assignedCodes,
      assignedToDepartment: employeeData?.department || 'Operations',
      teamLeaderId: currentLeaderId,
      teamLeaderCode: currentLeaderCode,
      teamLeaderName: employeeData?.name || 'Team Leader',
      createdBy: currentLeaderId,
      createdByName: `${employeeData?.name || 'Team Leader'} (Team Leader)`,
      priority: taskPriority,
      status: 'PENDING',
      approvalStatus: 'NOT_REQUIRED',
      completionPercentage: 0,
      startDate: taskStartDate,
      dueDate: taskDueDate,
      dueTime: taskDueTime,
      createdAtDeviceTime: nowIso,
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
      comments: [],
      managerRemarks: taskRemark.trim() || null,
      assignedTime: nowIso,
    };

    saveTaskRecord(newTask);

    if (db) {
      try {
        await setDoc(doc(db, 'tasks', taskId), newTask);

        // Send notification to each assigned team member
        for (const code of assignedCodes) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            employeeCode: code,
            type: 'TASK_ASSIGNED',
            title: 'New Team Task Assigned',
            message: `Team Leader ${employeeData?.name} assigned you task "${taskTitle}" (${taskPriority} Priority) due on ${taskDueDate}.`,
            createdAt: nowIso,
            read: false,
          });
        }
      } catch (err) {
        console.error('Error creating team task in Firestore:', err);
      }
    }

    setTaskTitle('');
    setTaskDescription('');
    setSelectedMemberIds([]);
    setTaskRemark('');
    setShowCreateTaskModal(false);
  };

  // Handle Task Approval
  const handleApproveTask = async (task: TaskRecord) => {
    const nowIso = new Date().toISOString();

    const updatedTask: TaskRecord = {
      ...task,
      status: 'COMPLETED',
      approvalStatus: 'APPROVED',
      approvedBy: currentLeaderId,
      approvedByName: employeeData?.name || 'Team Leader',
      approvedAtDeviceTime: nowIso,
      completionPercentage: 100,
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
    };

    saveTaskRecord(updatedTask);

    if (db) {
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          status: 'COMPLETED',
          approvalStatus: 'APPROVED',
          approvedBy: currentLeaderId,
          approvedByName: employeeData?.name || 'Team Leader',
          approvedAtDeviceTime: nowIso,
          completionPercentage: 100,
          updatedAtDeviceTime: nowIso,
        });

        // Send notifications
        for (const empCode of task.assignedToEmployeeCodes || []) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            employeeCode: empCode,
            type: 'TASK_APPROVED',
            title: 'Task Approved! 🎉',
            message: `Your task "${task.title}" has been reviewed and APPROVED by Team Leader ${employeeData?.name}.`,
            createdAt: nowIso,
            read: false,
          });
        }
      } catch (err) {
        console.error('Error approving task in Firestore:', err);
      }
    }

    setSelectedTaskForReview(null);
  };

  // Handle Return for Revision
  const handleReturnForRevision = async () => {
    if (!selectedTaskForReview || !revisionRemarkInput.trim()) return;

    const nowIso = new Date().toISOString();

    const updatedTask: TaskRecord = {
      ...selectedTaskForReview,
      status: 'IN_PROGRESS',
      approvalStatus: 'REVISION_REQUIRED',
      reviewedBy: employeeData?.name || 'Team Leader',
      reviewedAtDeviceTime: nowIso,
      reviewRemark: revisionRemarkInput.trim(),
      revisionCount: (selectedTaskForReview.revisionCount || 0) + 1,
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
      comments: [
        ...(selectedTaskForReview.comments || []),
        {
          id: `comment_tl_${Date.now()}`,
          authorId: currentLeaderId,
          authorName: `${employeeData?.name || 'Team Leader'} (TL)`,
          authorRole: 'TEAM_LEADER',
          content: `REVISION REQUIRED: ${revisionRemarkInput.trim()}`,
          timestamp: nowIso,
        },
      ],
    };

    saveTaskRecord(updatedTask);

    if (db) {
      try {
        await updateDoc(doc(db, 'tasks', selectedTaskForReview.id), {
          status: 'IN_PROGRESS',
          approvalStatus: 'REVISION_REQUIRED',
          reviewedBy: employeeData?.name || 'Team Leader',
          reviewedAtDeviceTime: nowIso,
          reviewRemark: revisionRemarkInput.trim(),
          revisionCount: updatedTask.revisionCount,
          updatedAtDeviceTime: nowIso,
          comments: updatedTask.comments,
        });

        for (const empCode of selectedTaskForReview.assignedToEmployeeCodes || []) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            employeeCode: empCode,
            type: 'REVISION_REQUIRED',
            title: 'Task Returned for Revision ⚠️',
            message: `Team Leader ${employeeData?.name} returned task "${selectedTaskForReview.title}" for revision: "${revisionRemarkInput.trim()}".`,
            createdAt: nowIso,
            read: false,
          });
        }
      } catch (err) {
        console.error('Error returning task for revision:', err);
      }
    }

    setShowRevisionModal(false);
    setSelectedTaskForReview(null);
    setRevisionRemarkInput('');
  };

  // Filtered Tasks
  const filteredTasks = teamTasks.filter((t) => {
    const term = taskSearchTerm.toLowerCase();
    const effStatus = getEffectiveTaskStatus(t);

    const matchesSearch = 
      t.title.toLowerCase().includes(term) ||
      t.description.toLowerCase().includes(term) ||
      (t.assignedToEmployeeCodes || []).some((c) => c.toLowerCase().includes(term));

    const matchesStatus = 
      statusFilter === 'All' ? true :
      statusFilter === 'PENDING_REVIEW' ? t.approvalStatus === 'PENDING_REVIEW' :
      effStatus === statusFilter;

    const matchesPriority = priorityFilter === 'All' || t.priority === priorityFilter;
    
    const matchesMember = memberFilter === 'All' || 
      (t.assignedToEmployeeCodes || []).includes(memberFilter) ||
      (t.assignedToEmployeeIds || []).includes(memberFilter);

    return matchesSearch && matchesStatus && matchesPriority && matchesMember;
  });

  return (
    <div className="flex flex-col gap-5 pb-12 text-white">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#7C3AED]/30 border border-purple-400/40 flex items-center justify-center text-[#A78BFA] shadow-lg">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">MY TEAM</h1>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                TEAM LEADER
              </span>
            </div>
            <p className="text-xs text-purple-300/80">
              Managing team members & work planner reviews for <span className="font-bold text-white">{employeeData?.name}</span>
            </p>
          </div>
        </div>

        <Button
          onClick={() => setShowCreateTaskModal(true)}
          className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold text-xs px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Assign Team Task
        </Button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-[#2D1B5A] rounded-2xl border border-purple-500/20 text-xs font-bold no-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'overview' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-purple-300/70 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> Overview
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'members' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-purple-300/70 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Team Members ({totalTeamMembers})
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'tasks' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-purple-300/70 hover:text-white'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" /> Team Tasks ({teamTasks.length})
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'approvals' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-purple-300/70 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Review Queue
          {pendingApprovalsCount > 0 && (
            <span className="bg-amber-500 text-black text-[10px] px-2 py-0.2 rounded-full font-black animate-pulse">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'reports' ? 'bg-[#7C3AED] text-white shadow-md' : 'text-purple-300/70 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Team Reports
        </button>
      </div>

      {/* OVERVIEW PANEL */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3.5 bg-[#2D1B5A] border border-purple-500/20 text-center">
              <p className="text-[10px] font-bold text-purple-300 uppercase">Total Members</p>
              <p className="text-2xl font-black text-white mt-0.5">{totalTeamMembers}</p>
            </Card>

            <Card className="p-3.5 bg-[#2D1B5A] border border-amber-500/30 text-center">
              <p className="text-[10px] font-bold text-amber-300 uppercase">Pending Approvals</p>
              <p className="text-2xl font-black text-amber-300 mt-0.5">{pendingApprovalsCount}</p>
            </Card>

            <Card className="p-3.5 bg-[#2D1B5A] border border-blue-500/30 text-center">
              <p className="text-[10px] font-bold text-blue-300 uppercase">Active Tasks</p>
              <p className="text-2xl font-black text-blue-300 mt-0.5">{activeTasksCount}</p>
            </Card>

            <Card className="p-3.5 bg-[#2D1B5A] border border-emerald-500/30 text-center">
              <p className="text-[10px] font-bold text-emerald-300 uppercase">Team Completion</p>
              <p className="text-2xl font-black text-emerald-400 mt-0.5">{teamCompletionPct}%</p>
            </Card>
          </div>

          {/* Pending Approvals Quick Alert Banner */}
          {pendingApprovalsCount > 0 && (
            <Card className="p-4 bg-gradient-to-r from-amber-900/30 to-[#2D1B5A] border border-amber-500/40 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-amber-400 animate-pulse flex-shrink-0" />
                <div>
                  <h3 className="font-extrabold text-xs text-amber-200">
                    {pendingApprovalsCount} Task{pendingApprovalsCount > 1 ? 's' : ''} Awaiting Your Team Leader Review!
                  </h3>
                  <p className="text-[11px] text-amber-300/80">
                    Team members completed work items requiring review and sign-off.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setActiveTab('approvals')}
                className="bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-xs px-3 py-1.5 rounded-xl whitespace-nowrap"
              >
                Review Now
              </Button>
            </Card>
          )}

          {/* Team Workload Visual Bar */}
          <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#A78BFA]" /> Team Member Workload Summary
            </h3>

            <div className="space-y-3">
              {teamMembers.length > 0 ? (
                teamMembers.map((member) => {
                  const mTasks = teamTasks.filter((t) => 
                    (t.assignedToEmployeeIds || []).includes(member.id) ||
                    (t.assignedToEmployeeCodes || []).includes(member.employeeCode)
                  );
                  const mCompleted = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'COMPLETED').length;
                  const mOverdue = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'OVERDUE').length;
                  const mActive = mTasks.length - mCompleted;
                  const mPct = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

                  return (
                    <div key={member.id} className="bg-[#211044] p-3 rounded-xl border border-purple-500/10 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-white">{member.name}</span>
                          <span className="text-[10px] text-purple-300/70 font-mono ml-2">({member.employeeCode})</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="text-purple-300">{mTasks.length} Assigned</span>
                          <span className="text-blue-300">{mActive} Active</span>
                          <span className="text-emerald-400 font-bold">{mCompleted} Done ({mPct}%)</span>
                          {mOverdue > 0 && <span className="text-red-400 font-bold">{mOverdue} Overdue</span>}
                        </div>
                      </div>

                      {/* Visual Workload Bar */}
                      <div className="w-full bg-[#2D1B5A] h-2.5 rounded-full overflow-hidden border border-purple-500/20 flex">
                        <div className="bg-emerald-400 h-full" style={{ width: `${mPct}%` }} title={`Completed: ${mPct}%`} />
                        <div className="bg-amber-400 h-full" style={{ width: `${mTasks.length > 0 ? Math.round((mActive / mTasks.length) * 100) : 0}%` }} title={`Active: ${mActive}`} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-purple-300/60 italic text-center py-4">
                  No assigned team members currently found. Use the Admin Panel to designate team membership.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TEAM MEMBERS PANEL */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {teamMembers.map((member) => {
              const mTasks = teamTasks.filter((t) => 
                (t.assignedToEmployeeIds || []).includes(member.id) ||
                (t.assignedToEmployeeCodes || []).includes(member.employeeCode)
              );
              const mCompleted = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'COMPLETED').length;
              const mOverdue = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'OVERDUE').length;
              const mActive = mTasks.length - mCompleted;
              const mPct = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

              return (
                <Card key={member.id} className="p-4 bg-[#2D1B5A] border border-purple-500/20 rounded-2xl flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#211044] border border-purple-500/30 overflow-hidden flex-shrink-0">
                        {member.selfieUrl ? (
                          <img src={member.selfieUrl} alt={member.name} className="w-full h-full object-cover" />
                        ) : (
                          <UserCheck className="w-6 h-6 m-2 text-purple-300" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">{member.name}</h3>
                        <p className="text-[10px] font-mono text-purple-300/80">{member.employeeCode}</p>
                        <p className="text-[10px] text-purple-300/60">{member.department || 'Operations'} • {member.designation || 'Executive'}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      {member.status || 'Approved'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-center text-xs">
                    <div>
                      <p className="text-[9px] text-purple-300 uppercase font-bold">Active</p>
                      <p className="font-bold text-blue-300">{mActive}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-purple-300 uppercase font-bold">Completed</p>
                      <p className="font-bold text-emerald-400">{mCompleted}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-purple-300 uppercase font-bold">Overdue</p>
                      <p className="font-bold text-red-400">{mOverdue}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-purple-500/15">
                    <span className="text-xs font-bold text-purple-200">{mPct}% Work Completed</span>
                    <Button
                      onClick={() => setSelectedMemberForReport(member)}
                      variant="outlined"
                      className="border-purple-500/30 text-purple-200 text-[10px] px-2.5 py-1 rounded-lg"
                    >
                      <Eye className="w-3 h-3 mr-1" /> Workload Report
                    </Button>
                  </div>
                </Card>
              );
            })}

            {teamMembers.length === 0 && (
              <div className="col-span-full py-12">
                <EmptyState
                  icon={Users}
                  title="No Team Members Assigned"
                  description="Ask an Admin to assign employees to your Team Leader profile."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAM TASKS PANEL */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-[#2D1B5A] p-3 rounded-2xl border border-purple-500/20 text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-purple-300/70" />
              <input
                type="text"
                placeholder="Search team tasks..."
                value={taskSearchTerm}
                onChange={(e) => setTaskSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-purple-500/30 bg-[#211044] text-white focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#211044] text-white px-3 py-1.5 rounded-xl border border-purple-500/30 font-bold"
            >
              <option value="All">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="PENDING_REVIEW">PENDING REVIEW</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="OVERDUE">OVERDUE</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-[#211044] text-white px-3 py-1.5 rounded-xl border border-purple-500/30 font-bold"
            >
              <option value="All">All Priorities</option>
              <option value="URGENT">URGENT</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>

          {/* Task Cards List */}
          <div className="space-y-3">
            {filteredTasks.map((t) => {
              const effStatus = getEffectiveTaskStatus(t);

              return (
                <Card key={t.id} className="p-4 bg-[#2D1B5A] border border-purple-500/20 rounded-2xl space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm text-white">{t.title}</h3>
                      <p className="text-xs text-purple-200/80 mt-0.5 line-clamp-2">{t.description}</p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        effStatus === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        effStatus === 'OVERDUE' ? 'bg-red-600/30 text-red-300 border-red-500/40 animate-pulse' :
                        t.approvalStatus === 'PENDING_REVIEW' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse' :
                        'bg-blue-500/20 text-blue-300 border-blue-500/30'
                      }`}>
                        {t.approvalStatus === 'PENDING_REVIEW' ? 'PENDING REVIEW' : effStatus}
                      </span>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        t.priority === 'URGENT' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                        t.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                        'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      }`}>
                        {t.priority} Priority
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 text-xs text-purple-200">
                    <div>
                      <span className="text-purple-300/70 block text-[10px]">Assigned To:</span>
                      <span className="font-bold text-white font-mono">{(t.assignedToEmployeeCodes || []).join(', ') || 'Team'}</span>
                    </div>

                    <div>
                      <span className="text-purple-300/70 block text-[10px]">Due Date:</span>
                      <span className="font-bold text-white">{t.dueDate} {t.dueTime || ''}</span>
                    </div>

                    <div>
                      <span className="text-purple-300/70 block text-[10px]">Progress:</span>
                      <span className="font-bold text-emerald-300">{t.completionPercentage || 0}%</span>
                    </div>
                  </div>

                  {t.reviewRemark && (
                    <div className="p-2.5 bg-amber-900/20 border border-amber-500/30 rounded-xl text-xs text-amber-200">
                      <span className="font-bold block text-amber-300">TL Review Remark:</span>
                      {t.reviewRemark}
                    </div>
                  )}

                  {t.approvalStatus === 'PENDING_REVIEW' && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={() => handleApproveTask(t)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve Completion
                      </Button>

                      <Button
                        onClick={() => {
                          setSelectedTaskForReview(t);
                          setShowRevisionModal(true);
                        }}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Return for Revision
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="py-12">
                <EmptyState
                  icon={CheckSquare}
                  title="No Team Tasks Found"
                  description="Use 'Assign Team Task' to create new work assignments."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* REVIEW QUEUE PANEL */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-[#2D1B5A] rounded-2xl border border-purple-500/20">
            <h2 className="text-xs font-black text-purple-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-amber-400" /> Pending Task Review Queue
            </h2>
            <p className="text-xs text-purple-200/80">
              When team members complete tasks, they enter this queue for your approval or revision request.
            </p>
          </div>

          <div className="space-y-3">
            {teamTasks.filter((t) => t.approvalStatus === 'PENDING_REVIEW').map((t) => (
              <Card key={t.id} className="p-4 bg-[#2D1B5A] border-2 border-amber-500/40 rounded-2xl space-y-3 shadow-xl">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                      PENDING TL REVIEW
                    </span>
                    <h3 className="font-bold text-base text-white mt-1.5">{t.title}</h3>
                    <p className="text-xs text-purple-200/90 mt-1">{t.description}</p>
                  </div>

                  <span className="font-black text-emerald-400 text-sm bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    100% Completed
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-[#211044] p-3 rounded-xl border border-purple-500/20 text-xs text-purple-200">
                  <div>
                    <span className="text-purple-300/70 block text-[10px]">Submitted By:</span>
                    <span className="font-bold text-white font-mono">{(t.assignedToEmployeeCodes || []).join(', ') || 'Employee'}</span>
                  </div>

                  <div>
                    <span className="text-purple-300/70 block text-[10px]">Due Date:</span>
                    <span className="font-bold text-white">{t.dueDate} {t.dueTime || ''}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => handleApproveTask(t)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" /> APPROVE
                  </Button>

                  <Button
                    onClick={() => {
                      setSelectedTaskForReview(t);
                      setShowRevisionModal(true);
                    }}
                    className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" /> RETURN FOR REVISION
                  </Button>
                </div>
              </Card>
            ))}

            {teamTasks.filter((t) => t.approvalStatus === 'PENDING_REVIEW').length === 0 && (
              <div className="py-12">
                <EmptyState
                  icon={CheckCircle}
                  title="Review Queue Clear!"
                  description="No tasks are currently waiting for Team Leader review."
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TEAM REPORTS PANEL */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <Card className="p-5 bg-[#2D1B5A] border border-purple-500/20 rounded-2xl space-y-4">
            <h3 className="text-sm font-black uppercase text-purple-300 tracking-wider flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#A78BFA]" /> Executive Team Performance Metrics
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#211044] p-3.5 rounded-xl border border-purple-500/20 text-center">
                <p className="text-[10px] text-purple-300 font-bold uppercase">Total Team Tasks</p>
                <p className="text-xl font-black text-white">{teamTasks.length}</p>
              </div>

              <div className="bg-[#211044] p-3.5 rounded-xl border border-emerald-500/30 text-center">
                <p className="text-[10px] text-emerald-300 font-bold uppercase">Completed</p>
                <p className="text-xl font-black text-emerald-400">{completedTasksCount}</p>
              </div>

              <div className="bg-[#211044] p-3.5 rounded-xl border border-blue-500/30 text-center">
                <p className="text-[10px] text-blue-300 font-bold uppercase">On-Time Completion</p>
                <p className="text-xl font-black text-blue-300">{onTimePct}%</p>
              </div>

              <div className="bg-[#211044] p-3.5 rounded-xl border border-amber-500/30 text-center">
                <p className="text-[10px] text-amber-300 font-bold uppercase">Revisions Requested</p>
                <p className="text-xl font-black text-amber-300">{revisionRequiredCount}</p>
              </div>
            </div>
          </Card>
          
          <EfficiencyDashboard />
        </div>
      )}

      {/* CREATE TASK DIALOG */}
      <Dialog isOpen={showCreateTaskModal} onClose={() => setShowCreateTaskModal(false)} title="Assign Task to Team">
        <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase block">Task Title *</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Daily Operations Checklist & Audit"
              className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white font-bold text-xs focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase block">Description & Guidelines *</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Provide clear steps for your team member(s)..."
              className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs min-h-[70px] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase block">Priority *</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white font-bold text-xs"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase block">Assignment Scope *</label>
              <select
                value={taskAssignmentType}
                onChange={(e) => setTaskAssignmentType(e.target.value as AssignmentType)}
                className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white font-bold text-xs"
              >
                <option value="EMPLOYEE">Single Team Member</option>
                <option value="MULTIPLE_EMPLOYEES">Multiple Team Members</option>
                <option value="DEPARTMENT">Entire Team</option>
              </select>
            </div>
          </div>

          {taskAssignmentType !== 'DEPARTMENT' && (
            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase block">Select Team Member(s) *</label>
              <div className="max-h-36 overflow-y-auto bg-[#211044] p-2 rounded-xl border border-purple-500/30 space-y-1">
                {teamMembers.map((m) => {
                  const isChecked = selectedMemberIds.includes(m.id) || selectedMemberIds.includes(m.employeeCode);
                  return (
                    <label key={m.id} className="flex items-center gap-2.5 p-2 hover:bg-[#2D1B5A] rounded-lg cursor-pointer">
                      <input
                        type={taskAssignmentType === 'EMPLOYEE' ? 'radio' : 'checkbox'}
                        name="teamAssignee"
                        checked={isChecked}
                        onChange={(e) => {
                          if (taskAssignmentType === 'EMPLOYEE') {
                            setSelectedMemberIds([m.id]);
                          } else {
                            if (e.target.checked) setSelectedMemberIds([...selectedMemberIds, m.id]);
                            else setSelectedMemberIds(selectedMemberIds.filter((id) => id !== m.id));
                          }
                        }}
                        className="accent-[#7C3AED]"
                      />
                      <div>
                        <p className="font-bold text-white text-xs">{m.name}</p>
                        <p className="text-[10px] text-purple-300/70 font-mono">{m.employeeCode}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase block">Due Date *</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase block">Due Time</label>
              <input
                type="time"
                value={taskDueTime}
                onChange={(e) => setTaskDueTime(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-bold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase block">Team Leader Remark</label>
            <input
              type="text"
              value={taskRemark}
              onChange={(e) => setTaskRemark(e.target.value)}
              placeholder="Directives or additional guidance..."
              className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowCreateTaskModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!taskTitle.trim() || !taskDescription.trim() || !taskDueDate || (taskAssignmentType !== 'DEPARTMENT' && selectedMemberIds.length === 0)}
              className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold"
            >
              Assign Task
            </Button>
          </div>
        </div>
      </Dialog>

      {/* RETURN FOR REVISION MODAL */}
      <Dialog isOpen={showRevisionModal} onClose={() => setShowRevisionModal(false)} title="Return Task for Revision">
        <div className="space-y-4 text-xs">
          <p className="text-purple-200">
            Provide specific directives for what the team member needs to fix or update:
          </p>
          <textarea
            value={revisionRemarkInput}
            onChange={(e) => setRevisionRemarkInput(e.target.value)}
            placeholder="e.g. Please update client figures in section 2 and attach updated PDF..."
            className="w-full p-3 rounded-xl border border-amber-500/40 bg-[#211044] text-white text-xs min-h-[90px] focus:outline-none"
          />
          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowRevisionModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleReturnForRevision}
              disabled={!revisionRemarkInput.trim()}
              className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold"
            >
              Confirm Return for Revision
            </Button>
          </div>
        </div>
      </Dialog>

      {/* INDIVIDUAL EMPLOYEE WORKLOAD REPORT MODAL */}
      <Dialog isOpen={!!selectedMemberForReport} onClose={() => setSelectedMemberForReport(null)} title="Employee Workload & Performance Audit">
        {selectedMemberForReport && (() => {
          const mTasks = teamTasks.filter((t) => 
            (t.assignedToEmployeeIds || []).includes(selectedMemberForReport.id) ||
            (t.assignedToEmployeeCodes || []).includes(selectedMemberForReport.employeeCode)
          );
          const mCompleted = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'COMPLETED').length;
          const mOverdue = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'OVERDUE').length;
          const mPending = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'PENDING').length;
          const mInProgress = mTasks.filter((t) => getEffectiveTaskStatus(t) === 'IN_PROGRESS').length;
          const mPct = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

          return (
            <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
              <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-sm text-white">{selectedMemberForReport.name}</h3>
                  <p className="text-[10px] text-purple-300 font-mono">Code: {selectedMemberForReport.employeeCode}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {selectedMemberForReport.department || 'Operations'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/20">
                  <p className="text-[9px] text-purple-300 uppercase font-bold">Assigned</p>
                  <p className="font-black text-white text-sm">{mTasks.length}</p>
                </div>
                <div className="bg-[#211044] p-2.5 rounded-xl border border-emerald-500/20">
                  <p className="text-[9px] text-emerald-300 uppercase font-bold">Completed</p>
                  <p className="font-black text-emerald-400 text-sm">{mCompleted}</p>
                </div>
                <div className="bg-[#211044] p-2.5 rounded-xl border border-blue-500/20">
                  <p className="text-[9px] text-blue-300 uppercase font-bold">In Progress</p>
                  <p className="font-black text-blue-300 text-sm">{mInProgress + mPending}</p>
                </div>
                <div className="bg-[#211044] p-2.5 rounded-xl border border-red-500/20">
                  <p className="text-[9px] text-red-300 uppercase font-bold">Overdue</p>
                  <p className="font-black text-red-400 text-sm">{mOverdue}</p>
                </div>
              </div>

              <div className="p-3 bg-[#211044] rounded-xl border border-purple-500/20">
                <p className="font-bold text-purple-200 mb-1">Completion Rate: {mPct}%</p>
                <div className="w-full bg-[#2D1B5A] h-2.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full" style={{ width: `${mPct}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold text-xs text-purple-300 uppercase">Recent Tasks ({mTasks.length})</h4>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {mTasks.map((t) => (
                    <div key={t.id} className="p-2.5 bg-[#211044] rounded-xl border border-purple-500/10 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">{t.title}</p>
                        <p className="text-[10px] text-purple-300/70">Due: {t.dueDate}</p>
                      </div>
                      <span className="text-[10px] font-bold text-purple-300">{getEffectiveTaskStatus(t)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => setSelectedMemberForReport(null)} className="w-full">
                Close Report
              </Button>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
};
