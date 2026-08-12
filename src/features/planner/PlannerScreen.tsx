import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy,
  where
} from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { 
  TaskRecord, 
  TaskPriority, 
  TaskStatus, 
  TaskComment, 
  getEffectiveTaskStatus 
} from '../../types/planner';
import { 
  getStoredTasks, 
  saveTaskRecord, 
  saveMultipleTaskRecords 
} from '../../services/planner/taskStorage';

import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';

import { 
  Briefcase, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  MessageSquare, 
  Send, 
  ChevronRight, 
  User, 
  Users, 
  Building2, 
  Sliders, 
  Filter, 
  CheckSquare, 
  Sparkles,
  Layers
} from 'lucide-react';

export const PlannerScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const { tasks: realtimeTasks, isOnline, syncState, updateTaskOptimistically, triggerManualSync } = useRealtimeSync();

  const empCode = employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN';
  const empId = employeeData?.id || empCode;
  const empName = employeeData?.name || 'Employee';
  const empDept = employeeData?.department || 'Operations';

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // View & Filter States
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');

  // Selected Task Modal
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [completionInput, setCompletionInput] = useState<number>(0);
  const [commentInput, setCommentInput] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Filter tasks assigned to this employee or department
  const isAssigned = (t: TaskRecord) => {
    const matchEmpId = t.assignedToEmployeeIds?.includes(empId) || t.assignedToEmployeeIds?.includes(empCode);
    const matchEmpCode = t.assignedToEmployeeCodes?.includes(empCode);
    const matchDept = t.assignedToDepartment === empDept || (t.assignmentType === 'DEPARTMENT' && t.assignedToDepartment === empDept);
    return matchEmpId || matchEmpCode || matchDept;
  };

  const tasks = realtimeTasks.filter(isAssigned);

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    await triggerManualSync();
    setIsSyncing(false);
  };

  // Open Task Modal
  const handleOpenTask = (task: TaskRecord) => {
    setSelectedTask(task);
    setCompletionInput(task.completionPercentage || 0);
    setCommentInput('');
  };

  // Update Task Progress & Status (OPTIMISTIC UI)
  const handleSaveTaskProgress = async () => {
    if (!selectedTask) return;
    setIsUpdating(true);

    try {
      const newCompletion = Number(completionInput);
      let newStatus: TaskStatus = selectedTask.status;

      if (newCompletion === 100) {
        newStatus = 'COMPLETED';
      } else if (newCompletion > 0 && selectedTask.status === 'PENDING') {
        newStatus = 'IN_PROGRESS';
      }

      const nowIso = new Date().toISOString();

      const updatedComments = [...(selectedTask.comments || [])];
      if (commentInput.trim()) {
        const newComment: TaskComment = {
          id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          authorId: empCode,
          authorName: empName,
          authorRole: 'EMPLOYEE',
          content: commentInput.trim(),
          timestamp: nowIso,
        };
        updatedComments.push(newComment);
      }

      const updatedRecord: TaskRecord = {
        ...selectedTask,
        completionPercentage: newCompletion,
        status: newStatus,
        approvalStatus: newCompletion === 100 ? 'PENDING_REVIEW' : selectedTask.approvalStatus,
        comments: updatedComments,
        completedAt: newCompletion === 100 ? (selectedTask.completedAt || nowIso) : null,
        completedBy: newCompletion === 100 ? (selectedTask.completedBy || empName) : null,
        startedTime: selectedTask.startedTime || (newCompletion > 0 ? nowIso : null),
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Pending Sync',
      };

      // Immediate optimistic update
      await updateTaskOptimistically(updatedRecord);
      setSelectedTask(null);
    } catch (err) {
      console.error('Error updating task:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Post Comment Only
  const handleAddComment = () => {
    if (!selectedTask || !commentInput.trim()) return;
    const nowIso = new Date().toISOString();

    const newComment: TaskComment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      authorId: empCode,
      authorName: empName,
      authorRole: 'EMPLOYEE',
      content: commentInput.trim(),
      timestamp: nowIso,
    };

    const updatedTask: TaskRecord = {
      ...selectedTask,
      comments: [...(selectedTask.comments || []), newComment],
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Pending Sync',
    };

    updateTaskOptimistically(updatedTask);
    setSelectedTask(updatedTask);
    setCommentInput('');
  };

  // Conflict Resolution Handler
  const handleResolveConflict = async (choice: 'LOCAL' | 'SERVER') => {
    if (!selectedTask || !selectedTask.conflictDetails) return;
    setIsUpdating(true);

    try {
      const nowIso = new Date().toISOString();
      let resolvedTask: TaskRecord;

      if (choice === 'LOCAL') {
        resolvedTask = {
          ...selectedTask,
          hasConflict: false,
          conflictDetails: null,
          updatedAtDeviceTime: nowIso,
          syncStatus: 'Pending Sync',
        };
      } else {
        const serverVer = selectedTask.conflictDetails.serverVersion;
        resolvedTask = {
          ...selectedTask,
          ...serverVer,
          hasConflict: false,
          conflictDetails: null,
          updatedAtDeviceTime: nowIso,
          syncStatus: 'Synced',
        };
      }

      await updateTaskOptimistically(resolvedTask);
      setSelectedTask(null);
    } catch (err) {
      console.error('Error resolving task conflict:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Helper Badge Renderers
  const getPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'URGENT':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/30">URGENT</span>;
      case 'HIGH':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">HIGH</span>;
      case 'MEDIUM':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">MEDIUM</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">LOW</span>;
    }
  };

  const getStatusBadge = (task: TaskRecord) => {
    if (task.approvalStatus === 'PENDING_REVIEW') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">UNDER REVIEW</span>;
    }
    if (task.approvalStatus === 'REVISION_REQUIRED') {
      return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-500/20 text-red-300 border border-red-500/30">REVISION REQUIRED</span>;
    }

    const effectiveStatus = getEffectiveTaskStatus(task);

    switch (effectiveStatus) {
      case 'COMPLETED':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">COMPLETED</span>;
      case 'OVERDUE':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-red-600/30 text-red-300 border border-red-500/40 animate-pulse">OVERDUE</span>;
      case 'IN_PROGRESS':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">IN PROGRESS</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">PENDING</span>;
    }
  };

  // Metrics Calculations
  const todayDateStr = new Date().toISOString().split('T')[0];

  const todayTasks = tasks.filter((t) => t.dueDate && t.dueDate.startsWith(todayDateStr));
  const pendingCount = tasks.filter((t) => getEffectiveTaskStatus(t) === 'PENDING').length;
  const inProgressCount = tasks.filter((t) => getEffectiveTaskStatus(t) === 'IN_PROGRESS').length;
  const completedCount = tasks.filter((t) => getEffectiveTaskStatus(t) === 'COMPLETED').length;
  const overdueCount = tasks.filter((t) => getEffectiveTaskStatus(t) === 'OVERDUE').length;

  const pendingSyncCount = tasks.filter((t) => t.syncStatus === 'Pending Sync').length;

  // Filtered List
  const filteredTasks = tasks.filter((t) => {
    const effStatus = getEffectiveTaskStatus(t);
    const matchesStatus = statusFilter === 'All' || effStatus === statusFilter;
    const matchesPriority = priorityFilter === 'All' || t.priority === priorityFilter;
    return matchesStatus && matchesPriority;
  });

  // Weekly Overview calculation
  const getDaysOfWeek = () => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + 1; // Monday
    const days = [];
    for (let i = 0; i < 7; i++) {
      const next = new Date(curr.getTime());
      next.setDate(first + i);
      const dateStr = next.toISOString().split('T')[0];
      const dayName = next.toLocaleDateString('en-US', { weekday: 'short' });
      const dayTasks = tasks.filter((t) => t.dueDate && t.dueDate.startsWith(dateStr));
      days.push({
        dateStr,
        dayName,
        dayNum: next.getDate(),
        total: dayTasks.length,
        completed: dayTasks.filter((t) => getEffectiveTaskStatus(t) === 'COMPLETED').length,
      });
    }
    return days;
  };

  const weekDays = getDaysOfWeek();

  // Completion progress calculation
  const totalAssignedTasks = tasks.length;
  const overallProgressPct = totalAssignedTasks > 0 ? Math.round((completedCount / totalAssignedTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 pb-12 text-white max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2 pb-2 border-b border-indigo-500/20">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-indigo-400" /> Work Planner
          </h1>
          <p className="text-xs text-indigo-200/80 font-medium mt-0.5">
            Department & Employee task assignments for <span className="text-indigo-300 font-bold">{empDept}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              <WifiOff className="w-3.5 h-3.5" /> OFFLINE
            </span>
          ) : pendingSyncCount > 0 ? (
            <button 
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} /> 
              {isSyncing ? 'Syncing...' : `${pendingSyncCount} Pending Sync`}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Synced
            </span>
          )}
        </div>
      </div>

      {/* Feature Card: TODAY'S WORK */}
      <Card className="p-5 bg-gradient-to-br from-[#121B36] via-[#18244A] to-[#10172E] border border-indigo-500/30 shadow-xl rounded-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Task Overview</span>
              <h2 className="text-lg font-black text-white leading-none mt-0.5">TODAY'S WORK PROGRESS</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            <div className="text-right">
              <p className="text-xs font-bold text-indigo-200">Completion Rate</p>
              <p className="text-2xl font-black text-white font-mono">{overallProgressPct}%</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-[#0F1629] h-3 rounded-full overflow-hidden border border-indigo-500/20 p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-indigo-300/80">
            <span>{completedCount} of {totalAssignedTasks} tasks completed</span>
            <span>{pendingCount + inProgressCount} remaining</span>
          </div>
        </div>
      </Card>

      {/* Summary Stat Grid */}
      <div className="grid grid-cols-5 gap-2">
        <Card className="p-3 bg-[#18244A]/80 border border-indigo-500/30 shadow-md flex flex-col justify-between text-center rounded-xl">
          <p className="text-[9px] font-black uppercase text-indigo-300/80">Today</p>
          <p className="text-lg font-black text-white mt-0.5">{todayTasks.length}</p>
        </Card>

        <Card className="p-3 bg-[#18244A]/80 border border-amber-500/30 shadow-md flex flex-col justify-between text-center rounded-xl">
          <p className="text-[9px] font-black uppercase text-amber-300">Pending</p>
          <p className="text-lg font-black text-amber-300 mt-0.5">{pendingCount}</p>
        </Card>

        <Card className="p-3 bg-[#18244A]/80 border border-blue-500/30 shadow-md flex flex-col justify-between text-center rounded-xl">
          <p className="text-[9px] font-black uppercase text-blue-300">In Progress</p>
          <p className="text-lg font-black text-blue-300 mt-0.5">{inProgressCount}</p>
        </Card>

        <Card className="p-3 bg-[#18244A]/80 border border-emerald-500/30 shadow-md flex flex-col justify-between text-center rounded-xl">
          <p className="text-[9px] font-black uppercase text-emerald-300">Done</p>
          <p className="text-lg font-black text-emerald-400 mt-0.5">{completedCount}</p>
        </Card>

        <Card className="p-3 bg-[#18244A]/80 border border-rose-500/30 shadow-md flex flex-col justify-between text-center rounded-xl">
          <p className="text-[9px] font-black uppercase text-rose-300">Overdue</p>
          <p className="text-lg font-black text-rose-400 mt-0.5">{overdueCount}</p>
        </Card>
      </div>

      {/* View Mode Toggle & Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-[#211044] p-1.5 rounded-2xl border border-purple-500/20">
          <div className="flex items-center gap-1 w-full">
            <button
              onClick={() => setViewMode('daily')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                viewMode === 'daily'
                  ? 'bg-[#7C3AED] text-white shadow-md'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Daily View
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                viewMode === 'weekly'
                  ? 'bg-[#7C3AED] text-white shadow-md'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Weekly Overview
            </button>
          </div>
        </div>

        {/* Weekly View Strip */}
        {viewMode === 'weekly' && (
          <div className="grid grid-cols-7 gap-1.5 bg-[#211044] p-2.5 rounded-2xl border border-purple-500/20 text-center">
            {weekDays.map((day) => (
              <div 
                key={day.dateStr}
                className={`p-2 rounded-xl border flex flex-col items-center justify-between ${
                  day.dateStr === todayDateStr
                    ? 'bg-[#7C3AED]/30 border-purple-400/50'
                    : 'bg-[#2D1B5A]/60 border-purple-500/10'
                }`}
              >
                <span className="text-[10px] font-bold text-purple-300/80">{day.dayName}</span>
                <span className="text-xs font-black text-white my-0.5">{day.dayNum}</span>
                <span className="text-[9px] font-extrabold text-purple-200 bg-purple-500/20 px-1.5 py-0.5 rounded-full border border-purple-500/30">
                  {day.completed}/{day.total}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <span className="text-[10px] font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
            <Filter className="w-3 h-3 text-[#A78BFA]" /> Filter:
          </span>

          {['All', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                statusFilter === status
                  ? 'bg-[#7C3AED] text-white border-purple-400/50 shadow-md'
                  : 'bg-[#211044] text-purple-300/80 border-purple-500/20 hover:bg-[#2D1B5A]'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center justify-between">
          <span>Tasks ({filteredTasks.length})</span>
          {pendingSyncCount > 0 && (
            <span className="text-[10px] font-bold text-amber-300">
              * Local changes pending cloud sync
            </span>
          )}
        </h2>

        {filteredTasks.length > 0 ? (
          filteredTasks.map((task) => {
            const effectiveStatus = getEffectiveTaskStatus(task);

            return (
              <Card
                key={task.id}
                onClick={() => handleOpenTask(task)}
                className="p-4 bg-[#2D1B5A] border border-purple-500/20 shadow-md hover:border-purple-500/50 cursor-pointer transition-all space-y-3 group"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-sm text-white group-hover:text-purple-200 transition-colors">
                        {task.title}
                      </h3>
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task)}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-purple-300/80">
                      <span className="flex items-center gap-1 font-semibold">
                        <Clock className="w-3 h-3 text-[#A78BFA]" /> Due: {task.dueDate} {task.dueTime ? `at ${task.dueTime}` : ''}
                      </span>
                      <span className="flex items-center gap-1 font-semibold text-purple-200">
                        {task.assignmentType === 'DEPARTMENT' ? (
                          <Building2 className="w-3 h-3 text-blue-400" />
                        ) : (
                          <User className="w-3 h-3 text-purple-400" />
                        )}
                        {task.assignedToDepartment || 'General'}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="w-5 h-5 text-purple-400 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                </div>

                <p className="text-xs text-purple-200/90 line-clamp-2 bg-[#211044]/60 p-2 rounded-xl border border-purple-500/10">
                  {task.description}
                </p>

                {task.approvalStatus === 'REVISION_REQUIRED' && task.reviewRemark && (
                  <div className="p-2.5 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-200">
                    <span className="font-extrabold text-red-300 block mb-0.5">⚠️ TL REVISION REQUESTED:</span>
                    {task.reviewRemark}
                  </div>
                )}

                {/* Progress Bar & Footer */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-purple-300/80">
                    <span>Progress</span>
                    <span className="text-white font-extrabold">{task.completionPercentage || 0}%</span>
                  </div>
                  <div className="w-full bg-[#211044] h-2 rounded-full overflow-hidden border border-purple-500/20">
                    <div
                      className={`h-full transition-all duration-300 ${
                        effectiveStatus === 'COMPLETED'
                          ? 'bg-emerald-400'
                          : effectiveStatus === 'OVERDUE'
                          ? 'bg-red-500'
                          : 'bg-[#7C3AED]'
                      }`}
                      style={{ width: `${task.completionPercentage || 0}%` }}
                    />
                  </div>
                </div>

                {/* Footer notes */}
                <div className="flex justify-between items-center text-[10px] text-purple-300/60 pt-1 border-t border-purple-500/10">
                  <span>Assigned by {task.createdByName || 'Admin'}</span>
                  <span className="flex items-center gap-1 text-purple-300">
                    <MessageSquare className="w-3 h-3" /> {(task.comments || []).length} comments
                  </span>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="py-8 bg-[#211044] rounded-2xl border border-dashed border-purple-500/20">
            <EmptyState
              icon={CheckSquare}
              title="No tasks found"
              description="You have no work planner tasks assigned for the selected criteria."
            />
          </div>
        )}
      </div>

      {/* Task Details & Update Progress Dialog */}
      <Dialog
        isOpen={!!selectedTask}
        onClose={() => !isUpdating && setSelectedTask(null)}
        title="Task Audit & Update Progress"
      >
        {selectedTask && (() => {
          let displaySyncStatus = selectedTask.syncStatus as string;
          if (selectedTask.syncStatus === 'Synced') displaySyncStatus = 'SYNCED';
          else if (selectedTask.syncStatus === 'Sync Failed') displaySyncStatus = 'SYNC ERROR';
          else if (selectedTask.syncStatus === 'Pending Sync') {
            if (!navigator.onLine) displaySyncStatus = 'WAITING FOR CONNECTION';
            else displaySyncStatus = isUpdating ? 'SYNCING' : 'RETRYING';
          }

          return (
          <div className="space-y-4 text-xs">
            {/* Sync Issue Banner */}
            {selectedTask.syncStatus === 'Sync Failed' && (
              <div className="p-3 bg-amber-950/40 border border-amber-500/50 rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-amber-200 leading-relaxed">
                  Unable to sync latest task update. We'll retry automatically.
                </p>
              </div>
            )}

            {/* Task Header info */}
            <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 space-y-2">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <h3 className="font-extrabold text-base text-white">{selectedTask.title}</h3>
                  <p className="text-[10px] text-purple-300/80 font-semibold mt-0.5">
                    Dept: {selectedTask.assignedToDepartment} • Assigned by {selectedTask.createdByName}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {getPriorityBadge(selectedTask.priority)}
                  {getStatusBadge(selectedTask)}
                </div>
              </div>

              <div className="p-2.5 bg-[#2D1B5A] rounded-xl text-purple-100 text-xs leading-relaxed border border-purple-500/20">
                {selectedTask.description}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-purple-200">
                <div>
                  <span className="text-purple-300/70 font-bold block">Due Date</span>
                  <span className="font-semibold text-white">{selectedTask.dueDate} {selectedTask.dueTime || ''}</span>
                </div>
                <div>
                  <span className="text-purple-300/70 font-bold block">Sync Status</span>
                  <span className="font-semibold text-purple-200">{displaySyncStatus}</span>
                </div>
              </div>
            </div>

            {/* Manager Remarks if present */}
            {selectedTask.managerRemarks && (
              <div className="p-3 bg-purple-900/30 border border-purple-500/40 rounded-2xl text-purple-200 space-y-1">
                <p className="font-extrabold text-purple-300 text-[10px] uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" /> Manager Remarks
                </p>
                <p className="text-xs">{selectedTask.managerRemarks}</p>
              </div>
            )}

            {/* Employee Interactive Progress Slider */}
            <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 space-y-3">
              <div className="flex justify-between items-center">
                <label className="font-extrabold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#A78BFA]" /> Completion Percentage
                </label>
                <span className="text-sm font-black text-[#A78BFA] bg-purple-500/20 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                  {completionInput}%
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={completionInput}
                onChange={(e) => setCompletionInput(Number(e.target.value))}
                className="w-full accent-[#7C3AED] cursor-pointer"
              />

              <div className="flex justify-between gap-1">
                {[0, 25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setCompletionInput(pct)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all border ${
                      completionInput === pct
                        ? 'bg-[#7C3AED] text-white border-purple-400'
                        : 'bg-[#2D1B5A] text-purple-300 border-purple-500/20'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {completionInput === 100 && (
                <p className="text-[11px] font-bold text-emerald-300 bg-emerald-500/20 p-2 rounded-xl border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 
                  100% completion will automatically mark task as COMPLETED.
                </p>
              )}
            </div>

            {/* Comments Thread */}
            <div className="space-y-2">
              <h4 className="font-extrabold text-xs text-purple-300/80 uppercase tracking-wider">
                Comments & Discussion ({selectedTask.comments?.length || 0})
              </h4>

              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {(selectedTask.comments || []).length > 0 ? (
                  selectedTask.comments.map((c) => (
                    <div
                      key={c.id}
                      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                        c.authorRole === 'ADMIN'
                          ? 'bg-purple-900/40 border-purple-500/30'
                          : 'bg-[#211044] border-purple-500/20'
                      }`}
                    >
                      <div className="flex justify-between items-center text-[10px] font-bold">
                        <span className={c.authorRole === 'ADMIN' ? 'text-amber-300' : 'text-purple-300'}>
                          {c.authorName} ({c.authorRole})
                        </span>
                        <span className="text-purple-300/60 font-mono">
                          {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-purple-100">{c.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-purple-300/60 italic text-center py-2">No comments yet.</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Add a comment or update note..."
                  className="flex-1 px-3 py-2 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
                />
                <Button 
                  type="button" 
                  onClick={handleAddComment} 
                  disabled={!commentInput.trim()}
                  className="px-3 bg-purple-700 hover:bg-purple-600 text-white font-bold"
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Dialog Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSaveTaskProgress}
                disabled={isUpdating}
                className="w-full py-3 bg-[#7C3AED] hover:bg-[#6D28D9] font-bold rounded-2xl"
              >
                {isUpdating ? 'Saving...' : 'Save Task Progress'}
              </Button>
            </div>
          </div>
          );
        })()}
      </Dialog>
    </div>
  );
};
