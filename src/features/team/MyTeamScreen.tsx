import React, { useState, useEffect, useMemo } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { db } from '../../services/firebase/config';
import { createNotification } from '../../services/notification/notificationService';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, where, limit } from 'firebase/firestore';
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
import { LeaveRecord } from '../../types/leave';
import { reviewLeaveRequest } from '../../services/leave/leaveService';
import { EmptyState } from '../../components/ui/EmptyState';
import { TaskRecord, TaskPriority, TaskApprovalStatus, AssignmentType, getEffectiveTaskStatus, TaskRevision } from '../../types/planner';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'tasks' | 'approvals' | 'reports' | 'leaves'>('overview');

  // Team Leaves states
  const [rawLeaves, setRawLeaves] = useState<LeaveRecord[]>([]);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedLeaveForReview, setSelectedLeaveForReview] = useState<LeaveRecord | null>(null);
  const [leaveReviewRemark, setLeaveReviewRemark] = useState('');
  const [isReviewingLeave, setIsReviewingLeave] = useState(false);

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

  // Listen to Firestore team members and tasks with scoped queries
  useEffect(() => {
    if (!db || !isTeamLeader) return;

    // 1. Fetch registrations assigned to this team leader
    const qRegs = query(
      collection(db, 'registrations'),
      where('status', '==', 'Approved'),
      limit(200)
    );

    const unsubRegs = onSnapshot(qRegs, (snapshot) => {
      const fetchedMembers: TeamMember[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const matchesLeader = 
          (currentLeaderCode && data.teamLeaderCode === currentLeaderCode) || 
          (currentLeaderCode && data.assignedTeamLeaderCode === currentLeaderCode) || 
          (currentLeaderId && data.teamLeaderId === currentLeaderId) ||
          (currentLeaderId && data.assignedTeamLeaderId === currentLeaderId) ||
          (currentLeaderId && data.teamLeaderUid === currentLeaderId) ||
          (Array.isArray(employeeData?.teamMemberUids) && employeeData.teamMemberUids.includes(docSnap.id));

        if (matchesLeader) {
          fetchedMembers.push({ id: docSnap.id, ...data } as TeamMember);
        }
      });
      setTeamMembers(fetchedMembers);
    }, (err) => console.warn('MyTeamScreen regs snapshot error:', err));

    // 2. Fetch tasks for this team leader / team
    const qTasks = query(
      collection(db, 'tasks'),
      limit(200)
    );

    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
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
      
      const teamMemberCodes = new Set([currentLeaderCode]);
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.teamLeaderCode === currentLeaderCode || data.teamLeaderId === currentLeaderId) {
          if (data.employeeCode) teamMemberCodes.add(data.employeeCode);
        }
      });

      const filteredTeamTasks = combined.filter((t) => {
        if (t.createdBy === currentLeaderId || t.createdBy === currentLeaderCode) return true;
        if (t.teamLeaderCode === currentLeaderCode || t.teamLeaderId === currentLeaderId) return true;
        const isAssignedToMember = (t.assignedToEmployeeCodes || []).some((code) => teamMemberCodes.has(code));
        return isAssignedToMember;
      });

      filteredTeamTasks.sort((a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime());
      setTeamTasks(filteredTeamTasks);
    }, (err) => console.warn('MyTeamScreen tasks snapshot error:', err));

    return () => {
      unsubRegs();
      unsubTasks();
    };
  }, [db, isTeamLeader, currentLeaderCode, currentLeaderId]);

  // Fetch leaves assigned to this Team Leader's members
  useEffect(() => {
    if (!db || !isTeamLeader) return;

    const qLeaves = query(collection(db, 'leaves'), limit(200));
    const unsub = onSnapshot(qLeaves, (snapshot) => {
      const fetchedLeaves: LeaveRecord[] = [];
      snapshot.forEach((docSnap) => {
        fetchedLeaves.push(docSnap.data() as LeaveRecord);
      });
      setRawLeaves(fetchedLeaves);
    }, (err) => {
      console.warn('Error listening to team leaves:', err);
    });

    return () => {
      unsub();
    };
  }, [db, isTeamLeader]);

  // Team Leaves computed via useMemo to avoid tearing down the snapshot listener on every teamMembers update
  const teamLeaves = useMemo(() => {
    const memberIds = new Set(teamMembers.map((m) => m.id));
    const memberCodes = new Set(teamMembers.map((m) => m.employeeCode));

    const filtered = rawLeaves.filter((l) => {
      const isMember = memberIds.has(l.employeeId) || memberCodes.has(l.employeeCode);
      const matchesLeader = l.teamLeaderId === currentLeaderId || (l as any).teamLeaderCode === currentLeaderCode;
      return isMember || matchesLeader;
    });

    return [...filtered].sort((a, b) => new Date(b.createdAtDeviceTime || 0).getTime() - new Date(a.createdAtDeviceTime || 0).getTime());
  }, [rawLeaves, teamMembers, currentLeaderId, currentLeaderCode]);

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
  const isCompletedTask = (t: TaskRecord) => getEffectiveTaskStatus(t) === 'Completed' || (t.status || '').toUpperCase() === 'COMPLETED' || t.approvalStatus === 'APPROVED';
  const isOverdueTask = (t: TaskRecord) => getEffectiveTaskStatus(t) === 'Overdue' || (t.status || '').toUpperCase() === 'OVERDUE';
  const isPendingTask = (t: TaskRecord) => getEffectiveTaskStatus(t) === 'Assigned' || (t.status || '').toUpperCase() === 'PENDING';
  const isInProgressTask = (t: TaskRecord) => getEffectiveTaskStatus(t) === 'In Progress' || (t.status || '').toUpperCase() === 'IN_PROGRESS';

  const totalTeamMembers = teamMembers.length;
  const pendingApprovalsCount = teamTasks.filter((t) => t.approvalStatus === 'PENDING_REVIEW' || getEffectiveTaskStatus(t) === 'Submitted').length;
  const pendingTasksCount = teamTasks.filter(isPendingTask).length;
  const inProgressTasksCount = teamTasks.filter(isInProgressTask).length;
  const completedTasksCount = teamTasks.filter(isCompletedTask).length;
  const overdueTasksCount = teamTasks.filter(isOverdueTask).length;
  const activeTasksCount = pendingTasksCount + inProgressTasksCount + overdueTasksCount;

  const teamCompletionPct = teamTasks.length > 0 ? Math.round((completedTasksCount / teamTasks.length) * 100) : 0;

  // On-time completion rate
  const onTimeCompleted = teamTasks.filter((t) => {
    if (!isCompletedTask(t)) return false;
    if (!t.completedAt || !t.dueDate) return true;
    return new Date(t.completedAt).getTime() <= new Date(t.dueDate).getTime();
  }).length;
  const onTimePct = completedTasksCount > 0 ? Math.round((onTimeCompleted / completedTasksCount) * 100) : 100;

  // Revision count
  const revisionRequiredCount = teamTasks.filter((t) => t.approvalStatus === 'REVISION_REQUIRED' || getEffectiveTaskStatus(t) === 'Revision Requested').length;

  // Pending leaves count for current Team Leader
  const pendingTeamLeavesCount = teamLeaves.filter((l) => l.status === 'PENDING' && l.currentApproverRole === 'TEAM_LEADER').length;

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
      status: 'Assigned',
      approvalStatus: 'NOT_REQUIRED',
      completionPercentage: 0,
      startDate: taskStartDate,
      dueDate: taskDueDate,
      dueTime: taskDueTime,
      createdAtDeviceTime: nowIso,
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
      comments: [],
      revisions: [],
      revisionCount: 0,
      history: [{
        id: `hist_${Date.now()}`,
        action: 'CREATED',
        performedBy: currentLeaderCode,
        performedByName: employeeData?.name || 'Team Leader',
        timestamp: nowIso,
        details: `Created and assigned task by Team Leader`
      }],
      managerRemarks: taskRemark.trim() || null,
      assignedTime: nowIso,
    };

    saveTaskRecord(newTask);

    if (db) {
      try {
        await setDoc(doc(db, 'tasks', taskId), newTask);

        // Send notification to each assigned team member
        for (const code of assignedCodes) {
          await createNotification({
            recipientEmployeeCode: code,
            type: 'TASK_ASSIGNED',
            category: 'PLANNER',
            priority: taskPriority === 'HIGH' || taskPriority === 'CRITICAL' || taskPriority === 'URGENT' ? 'HIGH' : 'NORMAL',
            title: 'New Team Task Assigned',
            message: `Team Leader ${employeeData?.name} assigned you task "${taskTitle}" (${taskPriority} Priority) due on ${taskDueDate}.`,
            entityId: taskId,
            entityType: 'TASK',
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
      status: 'Completed',
      approvalStatus: 'APPROVED',
      approvedBy: currentLeaderId,
      approvedByName: employeeData?.name || 'Team Leader',
      approvedAtDeviceTime: nowIso,
      completedAt: task.completedAt || nowIso,
      completedBy: task.completedBy || employeeData?.name || 'Team Leader',
      completionPercentage: 100,
      history: [
        ...(task.history || []),
        {
          id: `hist_${Date.now()}`,
          action: 'COMPLETED',
          performedBy: currentLeaderCode,
          performedByName: employeeData?.name || 'Team Leader',
          timestamp: nowIso,
          details: 'Approved and marked completed by Team Leader'
        }
      ],
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
    };

    saveTaskRecord(updatedTask);

    if (db) {
      try {
        await updateDoc(doc(db, 'tasks', task.id), {
          status: 'Completed',
          approvalStatus: 'APPROVED',
          approvedBy: currentLeaderId,
          approvedByName: employeeData?.name || 'Team Leader',
          approvedAtDeviceTime: nowIso,
          completedAt: updatedTask.completedAt,
          completedBy: updatedTask.completedBy,
          completionPercentage: 100,
          history: updatedTask.history,
          updatedAtDeviceTime: nowIso,
        });

        // Send notifications
        for (const empCode of task.assignedToEmployeeCodes || []) {
          await createNotification({
            recipientEmployeeCode: empCode,
            type: 'TASK_APPROVED',
            category: 'PLANNER',
            priority: 'NORMAL',
            title: 'Task Approved! 🎉',
            message: `Your task "${task.title}" has been reviewed and APPROVED by Team Leader ${employeeData?.name}.`,
            entityId: task.id,
            entityType: 'TASK',
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
    const currentRevisions = selectedTaskForReview.revisions || [];
    const newRevNum = currentRevisions.length + 1;

    const newRevItem: TaskRevision = {
      revisionNumber: newRevNum,
      reason: revisionRemarkInput.trim(),
      requestedBy: currentLeaderId,
      requestedByName: `${employeeData?.name || 'Team Leader'} (TL)`,
      requestedAt: nowIso,
    };

    const updatedTask: TaskRecord = {
      ...selectedTaskForReview,
      status: 'Revision Requested',
      approvalStatus: 'REVISION_REQUIRED',
      reviewedBy: employeeData?.name || 'Team Leader',
      reviewedAtDeviceTime: nowIso,
      reviewRemark: revisionRemarkInput.trim(),
      currentRevisionReason: revisionRemarkInput.trim(),
      revisionCount: newRevNum,
      revisions: [...currentRevisions, newRevItem],
      history: [
        ...(selectedTaskForReview.history || []),
        {
          id: `hist_${Date.now()}`,
          action: 'REVISION_REQUESTED',
          performedBy: currentLeaderCode,
          performedByName: employeeData?.name || 'Team Leader',
          timestamp: nowIso,
          details: `Revision #${newRevNum} requested: "${revisionRemarkInput.trim()}"`
        }
      ],
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
          status: 'Revision Requested',
          approvalStatus: 'REVISION_REQUIRED',
          reviewedBy: employeeData?.name || 'Team Leader',
          reviewedAtDeviceTime: nowIso,
          reviewRemark: revisionRemarkInput.trim(),
          currentRevisionReason: revisionRemarkInput.trim(),
          revisionCount: updatedTask.revisionCount,
          revisions: updatedTask.revisions,
          history: updatedTask.history,
          updatedAtDeviceTime: nowIso,
          comments: updatedTask.comments,
        });

        for (const empCode of selectedTaskForReview.assignedToEmployeeCodes || []) {
          await createNotification({
            recipientEmployeeCode: empCode,
            type: 'REVISION_REQUIRED',
            category: 'PLANNER',
            priority: 'HIGH',
            title: 'Task Returned for Revision ⚠️',
            message: `Team Leader ${employeeData?.name} returned task "${selectedTaskForReview.title}" for revision: "${revisionRemarkInput.trim()}".`,
            entityId: selectedTaskForReview.id,
            entityType: 'TASK',
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

  // Handle reviewing team leaves
  const handleReviewLeave = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedLeaveForReview) return;
    if (action === 'REJECT' && !leaveReviewRemark.trim()) {
      alert('A remark is required when rejecting a leave request.');
      return;
    }
    setIsReviewingLeave(true);
    try {
      await reviewLeaveRequest(
        selectedLeaveForReview.id,
        'TEAM_LEADER',
        { id: currentLeaderId, name: employeeData?.name || 'Team Leader' },
        action,
        leaveReviewRemark
      );
      setSelectedLeaveForReview(null);
      setLeaveReviewRemark('');
    } catch (err: any) {
      alert(err.message || 'Failed to review leave request.');
    } finally {
      setIsReviewingLeave(false);
    }
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
    <div className="flex flex-col gap-5 pb-12 text-[#FFFFFF]">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#101010] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-lg shadow-[#D4AF37]/10">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-[#FFFFFF]">MY TEAM</h1>
              <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-[#D4AF37] text-[#080808] shadow-sm">
                TEAM LEADER
              </span>
            </div>
            <p className="text-xs text-[#8A8A8A]">
              Managing team members & work planner reviews for <span className="font-bold text-[#FFFFFF]">{employeeData?.name}</span>
            </p>
          </div>
        </div>

        <Button
          onClick={() => setShowCreateTaskModal(true)}
          className="bg-[#D4AF37] hover:bg-[#C5A028] text-[#080808] font-extrabold text-xs px-4 py-2.5 rounded-2xl shadow-lg flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Assign Team Task
        </Button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-[#151515] rounded-2xl border border-[#292929] text-xs font-bold no-scrollbar">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'overview' ? 'bg-[#D4AF37] text-[#080808] shadow-md' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> Overview
        </button>

        <button
          onClick={() => setActiveTab('members')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'members' ? 'bg-[#D4AF37] text-[#080808] shadow-md' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
          }`}
        >
          <Users className="w-3.5 h-3.5" /> Team Members ({totalTeamMembers})
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'tasks' ? 'bg-[#D4AF37] text-[#080808] shadow-md' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
          }`}
        >
          <CheckSquare className="w-3.5 h-3.5" /> Team Tasks ({teamTasks.length})
        </button>

        <button
          onClick={() => setActiveTab('approvals')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'approvals' ? 'bg-[#D4AF37] text-[#080808] shadow-md' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> Review Queue
          {pendingApprovalsCount > 0 && (
            <span className="bg-amber-400 text-[#080808] text-[10px] px-2 py-0.2 rounded-full font-black animate-pulse">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'reports' ? 'bg-[#D4AF37] text-[#080808] shadow-md' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Team Reports
        </button>

        <button
          onClick={() => setActiveTab('leaves')}
          className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'leaves' ? 'bg-[#D4AF37] text-[#080808] shadow-md' : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" /> Team Leaves ({teamLeaves.length})
          {pendingTeamLeavesCount > 0 && (
            <span className="bg-amber-400 text-[#080808] text-[10px] px-2 py-0.5 rounded-full font-black ml-1 animate-pulse">
              {pendingTeamLeavesCount}
            </span>
          )}
        </button>
      </div>

      {/* OVERVIEW PANEL */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3.5 bg-[#151515] border border-[#292929] text-center text-[#FFFFFF]">
              <p className="text-[10px] font-bold text-[#8A8A8A] uppercase">Total Members</p>
              <p className="text-2xl font-black text-[#FFFFFF] mt-0.5">{totalTeamMembers}</p>
            </Card>

            <Card className="p-3.5 bg-[#151515] border border-[#292929] text-center text-[#FFFFFF]">
              <p className="text-[10px] font-bold text-amber-400 uppercase">Pending Approvals</p>
              <p className="text-2xl font-black text-amber-400 mt-0.5">{pendingApprovalsCount}</p>
            </Card>

            <Card className="p-3.5 bg-[#151515] border border-[#292929] text-center text-[#FFFFFF]">
              <p className="text-[10px] font-bold text-[#D4AF37] uppercase">Active Tasks</p>
              <p className="text-2xl font-black text-[#D4AF37] mt-0.5">{activeTasksCount}</p>
            </Card>

            <Card className="p-3.5 bg-[#151515] border border-[#292929] text-center text-[#FFFFFF]">
              <p className="text-[10px] font-bold text-emerald-400 uppercase">Team Completion</p>
              <p className="text-2xl font-black text-emerald-400 mt-0.5">{teamCompletionPct}%</p>
            </Card>
          </div>

          {/* Pending Approvals Quick Alert Banner */}
          {pendingApprovalsCount > 0 && (
            <Card className="p-4 bg-[#151515] border border-amber-500/40 rounded-2xl flex items-center justify-between text-[#FFFFFF]">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-amber-400 animate-pulse flex-shrink-0" />
                <div>
                  <h3 className="font-extrabold text-xs text-amber-400">
                    {pendingApprovalsCount} Task{pendingApprovalsCount > 1 ? 's' : ''} Awaiting Your Team Leader Review!
                  </h3>
                  <p className="text-[11px] text-[#8A8A8A]">
                    Team members completed work items requiring review and sign-off.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setActiveTab('approvals')}
                className="bg-[#D4AF37] hover:bg-[#C5A028] text-[#080808] font-extrabold text-xs px-3 py-1.5 rounded-xl whitespace-nowrap cursor-pointer"
              >
                Review Now
              </Button>
            </Card>
          )}

          {/* Team Workload Visual Bar */}
          <Card className="p-4 bg-[#151515] border border-[#292929] space-y-4 text-[#FFFFFF]">
            <h3 className="text-xs font-black uppercase tracking-wider text-[#D4AF37] flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-[#D4AF37]" /> Team Member Workload Summary
            </h3>

            <div className="space-y-3">
              {teamMembers.length > 0 ? (
                teamMembers.map((member) => {
                  const mTasks = teamTasks.filter((t) => 
                    (t.assignedToEmployeeIds || []).includes(member.id) ||
                    (t.assignedToEmployeeCodes || []).includes(member.employeeCode)
                  );
                  const mCompleted = mTasks.filter(isCompletedTask).length;
                  const mOverdue = mTasks.filter(isOverdueTask).length;
                  const mActive = mTasks.length - mCompleted;
                  const mPct = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

                  return (
                    <div key={member.id} className="bg-[#101010] p-3 rounded-xl border border-[#292929] space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <div>
                          <span className="font-bold text-[#FFFFFF]">{member.name}</span>
                          <span className="text-[10px] text-[#8A8A8A] font-mono ml-2">({member.employeeCode})</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <span className="text-[#8A8A8A]">{mTasks.length} Assigned</span>
                          <span className="text-[#D4AF37]">{mActive} Active</span>
                          <span className="text-emerald-400 font-bold">{mCompleted} Done ({mPct}%)</span>
                          {mOverdue > 0 && <span className="text-rose-400 font-bold">{mOverdue} Overdue</span>}
                        </div>
                      </div>

                      {/* Visual Workload Bar */}
                      <div className="w-full bg-[#1B1B1B] h-2.5 rounded-full overflow-hidden border border-[#292929] flex">
                        <div className="bg-emerald-400 h-full" style={{ width: `${mPct}%` }} title={`Completed: ${mPct}%`} />
                        <div className="bg-[#D4AF37] h-full" style={{ width: `${mTasks.length > 0 ? Math.round((mActive / mTasks.length) * 100) : 0}%` }} title={`Active: ${mActive}`} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-[#8A8A8A] italic text-center py-4">
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
              const mCompleted = mTasks.filter(isCompletedTask).length;
              const mOverdue = mTasks.filter(isOverdueTask).length;
              const mActive = mTasks.length - mCompleted;
              const mPct = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

              return (
                <Card key={member.id} className="p-4 bg-[#173A32] border border-[#2A5B50] rounded-2xl flex flex-col justify-between gap-3 text-[#F4FAF7]">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-[#112C26] border border-[#2A5B50] overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {member.selfieUrl ? (
                          <img src={member.selfieUrl} alt={member.name} className="w-full h-full object-cover" />
                        ) : (
                          <UserCheck className="w-6 h-6 text-[#19C7C0]" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-[#F4FAF7]">{member.name}</h3>
                        <p className="text-[10px] font-mono text-[#C7DAD3]">{member.employeeCode}</p>
                        <p className="text-[10px] text-[#C7DAD3]">{member.department || 'Operations'} • {member.designation || 'Executive'}</p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#19C7C0]/20 text-[#19C7C0] border border-[#19C7C0]/30">
                      {member.status || 'Approved'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 bg-[#112C26] p-2.5 rounded-xl border border-[#2A5B50] text-center text-xs">
                    <div>
                      <p className="text-[9px] text-[#C7DAD3] uppercase font-bold">Active</p>
                      <p className="font-bold text-[#19C7C0]">{mActive}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#C7DAD3] uppercase font-bold">Completed</p>
                      <p className="font-bold text-[#35C98A]">{mCompleted}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-[#C7DAD3] uppercase font-bold">Overdue</p>
                      <p className="font-bold text-[#EF6B73]">{mOverdue}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#2A5B50]">
                    <span className="text-xs font-bold text-[#C7DAD3]">{mPct}% Work Completed</span>
                    <Button
                      onClick={() => setSelectedMemberForReport(member)}
                      variant="outlined"
                      className="border-[#2A5B50] text-[#C7DAD3] hover:text-[#19C7C0] hover:border-[#19C7C0] text-[10px] px-2.5 py-1 rounded-lg bg-transparent cursor-pointer"
                    >
                      <Eye className="w-3 h-3 mr-1" /> Workload Report
                    </Button>
                  </div>
                </Card>
              );
            })}

            {teamMembers.length === 0 && (
              <div className="col-span-full py-12 bg-[#173A32] rounded-2xl border border-dashed border-[#2A5B50]">
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
          <div className="flex flex-wrap items-center gap-3 bg-[#173A32] p-3 rounded-2xl border border-[#2A5B50] text-xs">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#C7DAD3]" />
              <input
                type="text"
                placeholder="Search team tasks..."
                value={taskSearchTerm}
                onChange={(e) => setTaskSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] focus:outline-none focus:border-[#19C7C0]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-[#112C26] text-[#F4FAF7] px-3 py-1.5 rounded-xl border border-[#2A5B50] font-bold focus:outline-none focus:border-[#19C7C0]"
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
              className="bg-[#112C26] text-[#F4FAF7] px-3 py-1.5 rounded-xl border border-[#2A5B50] font-bold focus:outline-none focus:border-[#19C7C0]"
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
                <Card key={t.id} className="p-4 bg-[#173A32] border border-[#2A5B50] rounded-2xl space-y-3 text-[#F4FAF7]">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm text-[#F4FAF7]">{t.title}</h3>
                      <p className="text-xs text-[#C7DAD3] mt-0.5 line-clamp-2">{t.description}</p>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        effStatus === 'Completed' ? 'bg-[#35C98A]/20 text-[#35C98A] border-[#35C98A]/30' :
                        effStatus === 'Overdue' ? 'bg-[#EF6B73]/20 text-[#EF6B73] border-[#EF6B73]/40 animate-pulse' :
                        t.approvalStatus === 'PENDING_REVIEW' ? 'bg-[#F2C75C]/20 text-[#F2C75C] border-[#F2C75C]/30 animate-pulse' :
                        'bg-[#19C7C0]/20 text-[#19C7C0] border-[#19C7C0]/30'
                      }`}>
                        {t.approvalStatus === 'PENDING_REVIEW' ? 'PENDING REVIEW' : effStatus}
                      </span>

                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
                        t.priority === 'URGENT' ? 'bg-[#EF6B73]/20 text-[#EF6B73] border-[#EF6B73]/30' :
                        t.priority === 'HIGH' ? 'bg-[#F2C75C]/20 text-[#F2C75C] border-[#F2C75C]/30' :
                        'bg-[#19C7C0]/20 text-[#19C7C0] border-[#19C7C0]/30'
                      }`}>
                        {t.priority} Priority
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#112C26] p-2.5 rounded-xl border border-[#2A5B50] text-xs text-[#C7DAD3]">
                    <div>
                      <span className="text-[#0A4D3C] block text-[10px]">Assigned To:</span>
                      <span className="font-bold text-[#F4FAF7] font-mono">{(t.assignedToEmployeeCodes || []).join(', ') || 'Team'}</span>
                    </div>

                    <div>
                      <span className="text-[#0A4D3C] block text-[10px]">Due Date:</span>
                      <span className="font-bold text-[#F4FAF7]">{t.dueDate} {t.dueTime || ''}</span>
                    </div>

                    <div>
                      <span className="text-[#0A4D3C] block text-[10px]">Progress:</span>
                      <span className="font-bold text-[#19C7C0]">{t.completionPercentage || 0}%</span>
                    </div>
                  </div>

                  {t.reviewRemark && (
                    <div className="p-2.5 bg-[#F2C75C]/15 border border-[#F2C75C]/30 rounded-xl text-xs text-[#F2C75C]">
                      <span className="font-bold block text-[#F2C75C]">TL Review Remark:</span>
                      {t.reviewRemark}
                    </div>
                  )}

                  {t.approvalStatus === 'PENDING_REVIEW' && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        onClick={() => handleApproveTask(t)}
                        className="flex-1 bg-[#35C98A] hover:bg-[#2CB078] text-[#0A2923] font-bold text-xs py-2 cursor-pointer"
                      >
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve Completion
                      </Button>

                      <Button
                        onClick={() => {
                          setSelectedTaskForReview(t);
                          setShowRevisionModal(true);
                        }}
                        className="flex-1 bg-[#F2C75C] hover:bg-[#D9AF43] text-[#0A2923] font-bold text-xs py-2 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" /> Return for Revision
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}

            {filteredTasks.length === 0 && (
              <div className="py-12 bg-[#173A32] rounded-2xl border border-dashed border-[#2A5B50]">
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
          <div className="p-3.5 bg-[#173A32] rounded-2xl border border-[#2A5B50] text-[#F4FAF7]">
            <h2 className="text-xs font-black text-[#C7DAD3] uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#F2C75C]" /> Pending Task Review Queue
            </h2>
            <p className="text-xs text-[#C7DAD3]">
              When team members complete tasks, they enter this queue for your approval or revision request.
            </p>
          </div>

          <div className="space-y-3">
            {teamTasks.filter((t) => t.approvalStatus === 'PENDING_REVIEW').map((t) => (
              <Card key={t.id} className="p-4 bg-[#173A32] border-2 border-[#F2C75C]/40 rounded-2xl space-y-3 shadow-xl text-[#F4FAF7]">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#F2C75C] bg-[#F2C75C]/20 px-2 py-0.5 rounded-full border border-[#F2C75C]/30">
                      PENDING TL REVIEW
                    </span>
                    <h3 className="font-bold text-base text-[#F4FAF7] mt-1.5">{t.title}</h3>
                    <p className="text-xs text-[#C7DAD3] mt-1">{t.description}</p>
                  </div>

                  <span className="font-black text-[#35C98A] text-sm bg-[#35C98A]/10 px-3 py-1 rounded-full border border-[#35C98A]/20">
                    100% Completed
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 bg-[#111217] p-3 rounded-xl border border-[#2A5B50] text-xs text-[#C7DAD3]">
                  <div>
                    <span className="text-[#0A4D3C] block text-[10px]">Submitted By:</span>
                    <span className="font-bold text-[#F4FAF7] font-mono">{(t.assignedToEmployeeCodes || []).join(', ') || 'Employee'}</span>
                  </div>

                  <div>
                    <span className="text-[#0A4D3C] block text-[10px]">Due Date:</span>
                    <span className="font-bold text-[#F4FAF7]">{t.dueDate} {t.dueTime || ''}</span>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => handleApproveTask(t)}
                    className="flex-1 bg-[#35C98A] hover:bg-[#2CB078] text-[#0A2923] font-bold text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" /> APPROVE
                  </Button>

                  <Button
                    onClick={() => {
                      setSelectedTaskForReview(t);
                      setShowRevisionModal(true);
                    }}
                    className="flex-1 bg-[#F2C75C] hover:bg-[#D9AF43] text-[#0A2923] font-bold text-xs py-2.5 rounded-xl shadow-lg cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" /> RETURN FOR REVISION
                  </Button>
                </div>
              </Card>
            ))}

            {teamTasks.filter((t) => t.approvalStatus === 'PENDING_REVIEW').length === 0 && (
              <div className="py-12 bg-[#173A32] rounded-2xl border border-dashed border-[#2A5B50]">
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
          <Card className="p-5 bg-[#173A32] border border-[#2A5B50] rounded-2xl space-y-4 text-[#F4FAF7]">
            <h3 className="text-sm font-black uppercase text-[#C7DAD3] tracking-wider flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#19C7C0]" /> Executive Team Performance Metrics
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#2A5B50] text-center">
                <p className="text-[10px] text-[#C7DAD3] font-bold uppercase">Total Team Tasks</p>
                <p className="text-xl font-black text-[#F4FAF7]">{teamTasks.length}</p>
              </div>

              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#35C98A]/30 text-center">
                <p className="text-[10px] text-[#35C98A] font-bold uppercase">Completed</p>
                <p className="text-xl font-black text-[#35C98A]">{completedTasksCount}</p>
              </div>

              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#19C7C0]/30 text-center">
                <p className="text-[10px] text-[#19C7C0] font-bold uppercase">On-Time Completion</p>
                <p className="text-xl font-black text-[#19C7C0]">{onTimePct}%</p>
              </div>

              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#F2C75C]/30 text-center">
                <p className="text-[10px] text-[#F2C75C] font-bold uppercase">Revisions Requested</p>
                <p className="text-xl font-black text-[#F2C75C]">{revisionRequiredCount}</p>
              </div>
            </div>
          </Card>
          
          <EfficiencyDashboard />
        </div>
      )}

      {/* TEAM LEAVES REVIEW PANEL */}
      {activeTab === 'leaves' && (
        <div className="space-y-4">
          <Card className="p-5 bg-[#173A32] border border-[#2A5B50] rounded-2xl space-y-4 text-[#F4FAF7]">
            <h3 className="text-sm font-black uppercase text-[#C7DAD3] tracking-wider flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#19C7C0]" /> Team Leave Management
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#2A5B50] text-center">
                <p className="text-[10px] text-[#C7DAD3] font-bold uppercase">Total Requests</p>
                <p className="text-xl font-black text-[#F4FAF7]">{teamLeaves.length}</p>
              </div>

              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#F2C75C]/30 text-center">
                <p className="text-[10px] text-[#F2C75C] font-bold uppercase">Pending TL Review</p>
                <p className="text-xl font-black text-[#F2C75C]">{pendingTeamLeavesCount}</p>
              </div>

              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#35C98A]/30 text-center">
                <p className="text-[10px] text-[#35C98A] font-bold uppercase">TL Approved</p>
                <p className="text-xl font-black text-[#35C98A]">
                  {teamLeaves.filter((l) => l.approvalStatus === 'TEAM_LEADER_APPROVED' || l.approvalStatus === 'APPROVED').length}
                </p>
              </div>

              <div className="bg-[#112C26] p-3.5 rounded-xl border border-[#EF6B73]/30 text-center">
                <p className="text-[10px] text-[#EF6B73] font-bold uppercase">Rejected</p>
                <p className="text-xl font-black text-[#EF6B73]">
                  {teamLeaves.filter((l) => l.status === 'REJECTED').length}
                </p>
              </div>
            </div>
          </Card>

          {/* Filters and List */}
          <Card className="p-5 bg-[#173A32] border border-[#2A5B50] rounded-2xl space-y-4 shadow-xl text-[#F4FAF7]">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-[#2A5B50] pb-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#C7DAD3]">
                Team Leave Requests History
              </h4>
              <div className="flex gap-1 bg-[#112C26] p-1 rounded-xl border border-[#2A5B50] text-xs self-start">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setLeaveStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-lg transition-all font-semibold cursor-pointer ${
                      leaveStatusFilter === status
                        ? 'bg-[#19C7C0] text-[#0A2923] shadow-md'
                        : 'text-[#C7DAD3] hover:text-[#F4FAF7]'
                    }`}
                  >
                    {status.charAt(0) + status.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {teamLeaves.filter((l) => {
                if (leaveStatusFilter === 'ALL') return true;
                return l.status === leaveStatusFilter;
              }).length > 0 ? (
                teamLeaves
                  .filter((l) => {
                    if (leaveStatusFilter === 'ALL') return true;
                    return l.status === leaveStatusFilter;
                  })
                  .map((leave) => {
                    const isPendingMyReview = leave.status === 'PENDING' && leave.currentApproverRole === 'TEAM_LEADER';
                    
                    return (
                      <div
                        key={leave.id}
                        onClick={() => setSelectedLeaveForReview(leave)}
                        className="p-4 bg-[#112C26] hover:bg-[#21483E] rounded-2xl border border-[#2A5B50] transition cursor-pointer flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center text-[#F4FAF7]"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-[#F4FAF7]">
                              {leave.employeeName} ({leave.employeeCode})
                            </span>
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                              leave.status === 'APPROVED' ? 'bg-[#35C98A]/20 text-[#35C98A] border border-[#35C98A]/30' :
                              leave.status === 'PENDING' ? 'bg-[#F2C75C]/20 text-[#F2C75C] border border-[#F2C75C]/30' :
                              'bg-[#EF6B73]/20 text-[#EF6B73] border border-[#EF6B73]/30'
                            }`}>
                              {leave.status}
                            </span>
                            {isPendingMyReview && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#19C7C0] text-[#0A2923] animate-pulse">
                                Action Required
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-[#C7DAD3]">
                            Range: {leave.startDate} to {leave.endDate} ({leave.totalDays} Days)
                          </p>
                          <p className="text-[11px] text-[#C7DAD3] leading-tight line-clamp-1">
                            Reason: "{leave.reason}"
                          </p>
                        </div>

                        <div className="flex sm:flex-col items-end gap-2 w-full sm:w-auto justify-between border-t border-[#2A5B50]/30 sm:border-0 pt-2 sm:pt-0">
                          <span className="text-xs text-[#C7DAD3]">
                            {new Date(leave.createdAtDeviceTime).toLocaleDateString()}
                          </span>
                          <span className="text-xs font-bold text-[#19C7C0]">
                            {leave.approvalStatus === 'TEAM_LEADER_APPROVED' ? 'TL Approved &rarr; Admin' : 
                             leave.approvalStatus === 'APPROVED' ? 'Fully Approved' : 
                             leave.approvalStatus}
                          </span>
                        </div>
                      </div>
                    );
                  })
              ) : (
                <div className="py-12 bg-[#173A32] rounded-2xl border border-dashed border-[#2A5B50]">
                  <EmptyState
                    icon={Calendar}
                    title="No Leaves Found"
                    description="No leave requests matched the current filter."
                  />
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TEAM LEAVE REVIEW MODAL */}
      {selectedLeaveForReview && (
        <Dialog
          isOpen={true}
          onClose={() => setSelectedLeaveForReview(null)}
          title="Team Leave Request Audit"
        >
          <div className="space-y-4 text-xs text-[#F4FAF7]">
            <div className="bg-[#112C26] p-4 rounded-2xl border border-[#2A5B50] space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-[#C7DAD3] font-extrabold uppercase tracking-wider">Employee</p>
                  <p className="text-xs font-black text-[#F4FAF7]">{selectedLeaveForReview.employeeName}</p>
                  <p className="text-[10px] text-[#C7DAD3]">Code: {selectedLeaveForReview.employeeCode}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#C7DAD3] font-extrabold uppercase tracking-wider">Department</p>
                  <p className="text-xs font-black text-[#F4FAF7]">{selectedLeaveForReview.department}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#2A5B50]">
                <div>
                  <p className="text-[10px] text-[#C7DAD3] font-extrabold uppercase tracking-wider">Duration</p>
                  <p className="text-xs font-black text-[#F4FAF7]">{selectedLeaveForReview.totalDays} Days</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#C7DAD3] font-extrabold uppercase tracking-wider">Date Range</p>
                  <p className="text-xs font-black text-[#F4FAF7]">{selectedLeaveForReview.startDate} — {selectedLeaveForReview.endDate}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-[#2A5B50]">
                <p className="text-[10px] text-[#C7DAD3] font-extrabold uppercase tracking-wider">Reason</p>
                <p className="text-xs text-[#F4FAF7] leading-normal mt-0.5">"{selectedLeaveForReview.reason}"</p>
              </div>
            </div>

            {/* Existing Remarks Info */}
            {selectedLeaveForReview.teamLeaderRemark && (
              <div className="bg-[#112C26] p-3 rounded-xl border border-[#2A5B50] space-y-1">
                <p className="font-bold text-[#C7DAD3]">Team Leader Remark</p>
                <p className="italic text-[#F4FAF7]">"{selectedLeaveForReview.teamLeaderRemark}"</p>
              </div>
            )}
            
            {selectedLeaveForReview.adminRemark && (
              <div className="bg-[#112C26] p-3 rounded-xl border border-[#2A5B50] space-y-1">
                <p className="font-bold text-[#C7DAD3]">Admin Remark</p>
                <p className="italic text-[#F4FAF7]">"{selectedLeaveForReview.adminRemark}"</p>
              </div>
            )}

            {/* Decision panel if still pending TL action */}
            {selectedLeaveForReview.status === 'PENDING' && selectedLeaveForReview.currentApproverRole === 'TEAM_LEADER' ? (
              <div className="space-y-3.5 pt-2 border-t border-[#2A5B50]">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-[#C7DAD3] mb-1.5">
                    Review Remark / Notes
                  </label>
                  <textarea
                    value={leaveReviewRemark}
                    onChange={(e) => setLeaveReviewRemark(e.target.value)}
                    placeholder="Enter review notes or rejection reason (rejection reason is mandatory)..."
                    rows={3}
                    className="w-full bg-[#112C26] border border-[#2A5B50] focus:border-[#19C7C0] rounded-xl p-3 text-xs text-[#F4FAF7] focus:outline-none placeholder-[#C7DAD3]/50"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => handleReviewLeave('REJECT')}
                    disabled={isReviewingLeave}
                    className="flex-1 bg-[#EF6B73] hover:bg-[#D9555D] text-[#0A2923] font-bold p-3 rounded-xl transition flex justify-center items-center gap-1 shadow-lg cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </Button>
                  
                  <Button
                    onClick={() => handleReviewLeave('APPROVE')}
                    disabled={isReviewingLeave}
                    className="flex-1 bg-[#35C98A] hover:bg-[#2CB078] text-[#0A2923] font-bold p-3 rounded-xl transition flex justify-center items-center gap-1 shadow-lg cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve & Forward
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-2.5 bg-[#112C26] border border-[#2A5B50] rounded-xl text-[#C7DAD3] font-semibold">
                Status: {selectedLeaveForReview.status} — Awaiting: {selectedLeaveForReview.currentApproverRole}
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* CREATE TASK DIALOG */}
      <Dialog isOpen={showCreateTaskModal} onClose={() => setShowCreateTaskModal(false)} title="Assign Task to Team">
        <div className="space-y-4 text-xs text-[#F4FAF7] max-h-[75vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="font-extrabold text-[#C7DAD3] uppercase block">Task Title *</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Daily Operations Checklist & Audit"
              className="w-full p-3 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] font-bold text-xs focus:outline-none focus:border-[#19C7C0]"
            />
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-[#C7DAD3] uppercase block">Description & Guidelines *</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Provide clear steps for your team member(s)..."
              className="w-full p-3 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] text-xs min-h-[70px] focus:outline-none focus:border-[#19C7C0]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-extrabold text-[#C7DAD3] uppercase block">Priority *</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full p-3 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] font-bold text-xs focus:outline-none focus:border-[#19C7C0]"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="URGENT">URGENT</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-[#C7DAD3] uppercase block">Assignment Scope *</label>
              <select
                value={taskAssignmentType}
                onChange={(e) => setTaskAssignmentType(e.target.value as AssignmentType)}
                className="w-full p-3 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] font-bold text-xs focus:outline-none focus:border-[#19C7C0]"
              >
                <option value="EMPLOYEE">Single Team Member</option>
                <option value="MULTIPLE_EMPLOYEES">Multiple Team Members</option>
                <option value="DEPARTMENT">Entire Team</option>
              </select>
            </div>
          </div>

          {taskAssignmentType !== 'DEPARTMENT' && (
            <div className="space-y-1">
              <label className="font-extrabold text-[#C7DAD3] uppercase block">Select Team Member(s) *</label>
              <div className="max-h-36 overflow-y-auto bg-[#112C26] p-2 rounded-xl border border-[#2A5B50] space-y-1">
                {teamMembers.map((m) => {
                  const isChecked = selectedMemberIds.includes(m.id) || selectedMemberIds.includes(m.employeeCode);
                  return (
                    <label key={m.id} className="flex items-center gap-2.5 p-2 hover:bg-[#173A32] rounded-lg cursor-pointer">
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
                        className="accent-[#19C7C0]"
                      />
                      <div>
                        <p className="font-bold text-[#F4FAF7] text-xs">{m.name}</p>
                        <p className="text-[10px] text-[#C7DAD3] font-mono">{m.employeeCode}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-extrabold text-[#C7DAD3] uppercase block">Due Date *</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] text-xs font-bold focus:outline-none focus:border-[#19C7C0]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-[#C7DAD3] uppercase block">Due Time</label>
              <input
                type="time"
                value={taskDueTime}
                onChange={(e) => setTaskDueTime(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] text-xs font-bold focus:outline-none focus:border-[#19C7C0]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-[#C7DAD3] uppercase block">Team Leader Remark</label>
            <input
              type="text"
              value={taskRemark}
              onChange={(e) => setTaskRemark(e.target.value)}
              placeholder="Directives or additional guidance..."
              className="w-full p-3 rounded-xl border border-[#2A5B50] bg-[#112C26] text-[#F4FAF7] text-xs focus:outline-none focus:border-[#19C7C0]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowCreateTaskModal(false)} className="flex-1 text-[#C7DAD3] hover:text-[#F4FAF7] cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={!taskTitle.trim() || !taskDescription.trim() || !taskDueDate || (taskAssignmentType !== 'DEPARTMENT' && selectedMemberIds.length === 0)}
              className="flex-1 bg-[#19C7C0] hover:bg-[#15ADA7] text-[#0A2923] font-bold cursor-pointer"
            >
              Assign Task
            </Button>
          </div>
        </div>
      </Dialog>

      {/* RETURN FOR REVISION MODAL */}
      <Dialog isOpen={showRevisionModal} onClose={() => setShowRevisionModal(false)} title="Return Task for Revision">
        <div className="space-y-4 text-xs text-[#F4FAF7]">
          <p className="text-[#C7DAD3]">
            Provide specific directives for what the team member needs to fix or update:
          </p>
          <textarea
            value={revisionRemarkInput}
            onChange={(e) => setRevisionRemarkInput(e.target.value)}
            placeholder="e.g. Please update client figures in section 2 and attach updated PDF..."
            className="w-full p-3 rounded-xl border border-[#F2C75C]/40 bg-[#112C26] text-[#F4FAF7] text-xs min-h-[90px] focus:outline-none focus:border-[#19C7C0]"
          />
          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowRevisionModal(false)} className="flex-1 text-[#C7DAD3] hover:text-[#F4FAF7] cursor-pointer">
              Cancel
            </Button>
            <Button
              onClick={handleReturnForRevision}
              disabled={!revisionRemarkInput.trim()}
              className="flex-1 bg-[#F2C75C] hover:bg-[#D9AF43] text-[#0A2923] font-bold cursor-pointer"
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
          const mCompleted = mTasks.filter(isCompletedTask).length;
          const mOverdue = mTasks.filter(isOverdueTask).length;
          const mPending = mTasks.filter(isPendingTask).length;
          const mInProgress = mTasks.filter(isInProgressTask).length;
          const mPct = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;

          return (
            <div className="space-y-4 text-xs text-[#F4FAF7] max-h-[75vh] overflow-y-auto pr-1">
              <div className="p-3 bg-[#112C26] rounded-2xl border border-[#2A5B50] flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-sm text-[#F4FAF7]">{selectedMemberForReport.name}</h3>
                  <p className="text-[10px] text-[#C7DAD3] font-mono">Code: {selectedMemberForReport.employeeCode}</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-[#19C7C0]/20 text-[#19C7C0] border border-[#19C7C0]/30">
                  {selectedMemberForReport.department || 'Operations'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-[#112C26] p-2.5 rounded-xl border border-[#2A5B50]">
                  <p className="text-[9px] text-[#C7DAD3] uppercase font-bold">Assigned</p>
                  <p className="font-black text-[#F4FAF7] text-sm">{mTasks.length}</p>
                </div>
                <div className="bg-[#112C26] p-2.5 rounded-xl border border-[#2A5B50]">
                  <p className="text-[9px] text-[#35C98A] uppercase font-bold">Completed</p>
                  <p className="font-black text-[#35C98A] text-sm">{mCompleted}</p>
                </div>
                <div className="bg-[#112C26] p-2.5 rounded-xl border border-[#2A5B50]">
                  <p className="text-[9px] text-[#19C7C0] uppercase font-bold">In Progress</p>
                  <p className="font-black text-[#19C7C0] text-sm">{mInProgress + mPending}</p>
                </div>
                <div className="bg-[#112C26] p-2.5 rounded-xl border border-[#2A5B50]">
                  <p className="text-[9px] text-[#EF6B73] uppercase font-bold">Overdue</p>
                  <p className="font-black text-[#EF6B73] text-sm">{mOverdue}</p>
                </div>
              </div>

              <div className="p-3 bg-[#112C26] rounded-xl border border-[#2A5B50]">
                <p className="font-bold text-[#C7DAD3] mb-1">Completion Rate: {mPct}%</p>
                <div className="w-full bg-[#173A32] h-2.5 rounded-full overflow-hidden border border-[#2A5B50]">
                  <div className="bg-[#35C98A] h-full" style={{ width: `${mPct}%` }} />
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-extrabold text-xs text-[#C7DAD3] uppercase tracking-wider">Recent Tasks ({mTasks.length})</h4>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {mTasks.map((t) => (
                    <div key={t.id} className="p-2.5 bg-[#112C26] rounded-xl border border-[#2A5B50] text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-[#F4FAF7]">{t.title}</p>
                        <p className="text-[10px] text-[#C7DAD3]">Due: {t.dueDate}</p>
                      </div>
                      <span className="text-[10px] font-bold text-[#C7DAD3]">{getEffectiveTaskStatus(t)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <Button onClick={() => setSelectedMemberForReport(null)} className="w-full bg-[#173A32] hover:bg-[#21483E] border border-[#2A5B50] text-[#F4FAF7] py-2.5 cursor-pointer">
                Close Report
              </Button>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
};
