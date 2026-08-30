import React, { useState, useMemo } from 'react';
import { useRegistration } from '../../context/RegistrationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { 
  TaskRecord, 
  TaskPriority, 
  CanonicalTaskPriority,
  CanonicalTaskStatus,
  TaskComment,
  TaskRevision,
  TaskHistoryEvent,
  getCanonicalPriority,
  getNormalizedTaskStatus 
} from '../../types/planner';

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
  WifiOff, 
  RefreshCw, 
  MessageSquare, 
  Send, 
  User, 
  Building2, 
  Sliders, 
  Filter, 
  CheckSquare, 
  Sparkles,
  Layers,
  Play,
  RotateCcw,
  History,
  AlertTriangle,
  FileCheck2,
  CalendarClock,
  CalendarCheck,
  Check
} from 'lucide-react';

export const PlannerScreen: React.FC = () => {
  const { employeeData } = useRegistration();
  const { tasks: realtimeTasks, isOnline, updateTaskOptimistically, triggerManualSync } = useRealtimeSync();

  const empCode = (employeeData?.employeeCode || employeeData?.id || 'EMP-UNKNOWN').trim();
  const empId = (employeeData?.id || empCode).trim();
  const empName = employeeData?.name || 'Employee';
  const empDept = employeeData?.department || employeeData?.office || 'Operations';

  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Tab & View Modes
  const [activeCategory, setActiveCategory] = useState<'today' | 'upcoming' | 'overdue' | 'completed' | 'revision' | 'all'>('today');
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Selected Task Modal
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [completionInput, setCompletionInput] = useState<number>(0);
  const [commentInput, setCommentInput] = useState<string>('');
  const [resubmissionNote, setResubmissionNote] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // View Revision Request Details Modal
  const [viewingRevisionsTask, setViewingRevisionsTask] = useState<TaskRecord | null>(null);

  // Filter tasks assigned to this employee or department
  const tasks = useMemo(() => {
    return realtimeTasks.filter((t) => {
      const matchEmpId = t.assignedToEmployeeIds?.some(id => id && (id.trim() === empId || id.trim() === empCode));
      const matchEmpCode = t.assignedToEmployeeCodes?.some(code => code && (code.trim() === empCode || code.trim() === empId));
      const matchDept = t.assignedToDepartment === empDept || (t.assignmentType === 'DEPARTMENT' && t.assignedToDepartment === empDept);
      return matchEmpId || matchEmpCode || matchDept;
    });
  }, [realtimeTasks, empId, empCode, empDept]);

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
    setResubmissionNote('');
  };

  // 1. ACTION: START TASK
  const handleStartTask = async (task: TaskRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsUpdating(true);

    try {
      const nowIso = new Date().toISOString();
      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'STARTED',
        performedBy: empCode,
        performedByName: empName,
        timestamp: nowIso,
        details: 'Started task execution'
      };

      const updatedRecord: TaskRecord = {
        ...task,
        status: 'In Progress',
        startedTime: task.startedTime || nowIso,
        completionPercentage: Math.max(task.completionPercentage || 0, 10),
        history: [...(task.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Pending Sync',
      };

      await updateTaskOptimistically(updatedRecord);
      if (selectedTask?.id === task.id) {
        setSelectedTask(updatedRecord);
      }
    } catch (err) {
      console.error('Error starting task:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // 2. ACTION: SUBMIT TASK (Or Resubmit after revision)
  const handleSubmitTask = async (task: TaskRecord, note?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsUpdating(true);

    try {
      const nowIso = new Date().toISOString();
      const isResubmission = getNormalizedTaskStatus(task) === 'Revision Requested' || (task.revisions && task.revisions.length > 0 && !task.revisions[task.revisions.length - 1].resubmittedAt);

      let updatedRevisions = [...(task.revisions || [])];
      if (isResubmission && updatedRevisions.length > 0) {
        const lastIdx = updatedRevisions.length - 1;
        updatedRevisions[lastIdx] = {
          ...updatedRevisions[lastIdx],
          resubmittedAt: nowIso,
          resubmissionNote: note?.trim() || resubmissionNote.trim() || 'Employee resubmitted completed work'
        };
      }

      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: isResubmission ? 'RESUBMITTED' : 'SUBMITTED',
        performedBy: empCode,
        performedByName: empName,
        timestamp: nowIso,
        details: note?.trim() || resubmissionNote.trim() || (isResubmission ? 'Resubmitted after addressing revision request' : 'Submitted completed deliverable for review')
      };

      const updatedRecord: TaskRecord = {
        ...task,
        status: 'Submitted',
        approvalStatus: 'PENDING_REVIEW',
        completionPercentage: 100,
        submittedAt: nowIso,
        submittedBy: empName,
        revisions: updatedRevisions,
        history: [...(task.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Pending Sync',
      };

      await updateTaskOptimistically(updatedRecord);
      setSelectedTask(null);
    } catch (err) {
      console.error('Error submitting task:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // 3. ACTION: MARK COMPLETED DIRECTLY
  const handleMarkCompleted = async (task: TaskRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsUpdating(true);

    try {
      const nowIso = new Date().toISOString();
      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'COMPLETED',
        performedBy: empCode,
        performedByName: empName,
        timestamp: nowIso,
        details: 'Task marked 100% completed by employee'
      };

      const updatedRecord: TaskRecord = {
        ...task,
        status: 'Completed',
        approvalStatus: 'APPROVED',
        completionPercentage: 100,
        completedAt: nowIso,
        completedBy: empName,
        history: [...(task.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Pending Sync',
      };

      await updateTaskOptimistically(updatedRecord);
      setSelectedTask(null);
    } catch (err) {
      console.error('Error marking task completed:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Update Task Progress via Slider / Modal
  const handleSaveTaskProgress = async () => {
    if (!selectedTask) return;
    setIsUpdating(true);

    try {
      const newCompletion = Number(completionInput);
      const nowIso = new Date().toISOString();

      let newStatus = selectedTask.status;
      if (newCompletion === 100) {
        newStatus = 'Submitted';
      } else if (newCompletion > 0 && (getNormalizedTaskStatus(selectedTask) === 'Assigned' || selectedTask.status === 'PENDING')) {
        newStatus = 'In Progress';
      }

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

      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'PROGRESS_UPDATED',
        performedBy: empCode,
        performedByName: empName,
        timestamp: nowIso,
        details: `Updated completion progress to ${newCompletion}%`
      };

      const updatedRecord: TaskRecord = {
        ...selectedTask,
        completionPercentage: newCompletion,
        status: newStatus,
        startedTime: selectedTask.startedTime || (newCompletion > 0 ? nowIso : null),
        submittedAt: newCompletion === 100 ? (selectedTask.submittedAt || nowIso) : selectedTask.submittedAt,
        submittedBy: newCompletion === 100 ? (selectedTask.submittedBy || empName) : selectedTask.submittedBy,
        comments: updatedComments,
        history: [...(selectedTask.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Pending Sync',
      };

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

  // Helper Badge Renderers
  const getPriorityBadge = (priority: TaskPriority | string) => {
    const canon = getCanonicalPriority(priority);
    switch (canon) {
      case 'Critical':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase tracking-wider flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            Critical
          </span>
        );
      case 'High':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider shadow-sm">
            High
          </span>
        );
      case 'Medium':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase tracking-wider shadow-sm">
            Medium
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black glass-card-inner text-slate-300 border border-white/10 uppercase tracking-wider">
            Low
          </span>
        );
    }
  };

  const getStatusBadge = (task: TaskRecord) => {
    const status = getNormalizedTaskStatus(task);

    switch (status) {
      case 'Completed':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1 shadow-sm">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completed
          </span>
        );
      case 'Revision Requested':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse flex items-center gap-1 shadow-sm">
            <RotateCcw className="w-3 h-3 text-amber-400" /> Revision Requested
          </span>
        );
      case 'Submitted':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1 shadow-sm">
            <FileCheck2 className="w-3 h-3 text-cyan-400" /> Submitted
          </span>
        );
      case 'Overdue':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1 shadow-sm">
            <AlertTriangle className="w-3 h-3 text-rose-400" /> Overdue
          </span>
        );
      case 'In Progress':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1 shadow-sm">
            <Clock className="w-3 h-3 text-indigo-400" /> In Progress
          </span>
        );
      case 'Cancelled':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black glass-card-inner text-slate-400 border border-white/10">
            Cancelled
          </span>
        );
      case 'Assigned':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black glass-card-inner text-slate-300 border border-white/10">
            Assigned
          </span>
        );
    }
  };

  // Date parsing & Category metrics
  const todayDateStr = new Date().toISOString().split('T')[0];

  const categoryCounts = useMemo(() => {
    let today = 0;
    let upcoming = 0;
    let overdue = 0;
    let completed = 0;
    let revision = 0;

    tasks.forEach((t) => {
      const status = getNormalizedTaskStatus(t);
      const dueStr = t.dueDate ? t.dueDate.substring(0, 10) : '';

      if (status === 'Completed') {
        completed++;
      } else if (status === 'Revision Requested') {
        revision++;
      } else if (status === 'Overdue') {
        overdue++;
      }

      if (dueStr === todayDateStr && status !== 'Completed' && status !== 'Cancelled') {
        today++;
      } else if (dueStr > todayDateStr && status !== 'Completed' && status !== 'Cancelled') {
        upcoming++;
      }
    });

    return { today, upcoming, overdue, completed, revision, total: tasks.length };
  }, [tasks, todayDateStr]);

  const pendingSyncCount = tasks.filter((t) => t.syncStatus === 'Pending Sync').length;

  // Filtered List according to active category and priority/status dropdowns
  const categorizedTasks = useMemo(() => {
    return tasks.filter((t) => {
      const status = getNormalizedTaskStatus(t);
      const dueStr = t.dueDate ? t.dueDate.substring(0, 10) : '';
      const canonPriority = getCanonicalPriority(t.priority);

      // Category matching
      if (activeCategory === 'today') {
        if (dueStr !== todayDateStr) return false;
      } else if (activeCategory === 'upcoming') {
        if (dueStr <= todayDateStr || status === 'Completed' || status === 'Cancelled') return false;
      } else if (activeCategory === 'overdue') {
        if (status !== 'Overdue') return false;
      } else if (activeCategory === 'completed') {
        if (status !== 'Completed') return false;
      } else if (activeCategory === 'revision') {
        if (status !== 'Revision Requested') return false;
      }

      // Priority Filter
      if (priorityFilter !== 'All' && canonPriority !== priorityFilter) {
        return false;
      }

      // Status Filter
      if (statusFilter !== 'All' && status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [tasks, activeCategory, todayDateStr, priorityFilter, statusFilter]);

  // Weekly Overview calculation
  const weekDays = useMemo(() => {
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
        completed: dayTasks.filter((t) => getNormalizedTaskStatus(t) === 'Completed').length,
      });
    }
    return days;
  }, [tasks]);

  const completedCount = categoryCounts.completed;
  const totalAssignedTasks = tasks.length;
  const overallProgressPct = totalAssignedTasks > 0 ? Math.round((completedCount / totalAssignedTasks) * 100) : 0;

  return (
    <div className="flex flex-col gap-5 pb-16 text-[var(--text-primary)] max-w-5xl mx-auto font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2 pb-2 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-cyan-400" /> Work Planner
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Operational Deliverables & Tasks for <span className="text-cyan-300 font-bold">{empDept}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {pendingSyncCount > 0 && (
            <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin text-amber-300" /> {pendingSyncCount} offline changes
            </span>
          )}
          <button
            onClick={handleTriggerSync}
            disabled={isSyncing}
            className="p-2 glass-card-inner rounded-xl border border-white/10 hover:border-cyan-400/50 text-slate-300 hover:text-cyan-300 transition-all cursor-pointer shadow-sm"
            title="Manual Sync"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feature Card: WORK COMPLETION SUMMARY */}
      <Card variant="elevated" className="p-5 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl glass-card-inner border border-white/10 flex items-center justify-center shadow-inner">
              <Briefcase className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-cyan-300/80">Sprint Delivery Rate</span>
              <h2 className="text-lg font-black text-white leading-none mt-0.5 tracking-wide">TASK PROGRESS & CADENCE</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400">Completion Score</p>
              <p className="text-2xl font-black text-cyan-300 font-mono">{overallProgressPct}%</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full glass-card-inner h-3.5 rounded-full overflow-hidden border border-white/10 p-0.5">
            <div 
              className="h-full aurora-bg rounded-full transition-all duration-500 shadow-md"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
            <span>{completedCount} of {totalAssignedTasks} tasks completed</span>
            <span className={categoryCounts.overdue > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
              {categoryCounts.overdue > 0 ? `${categoryCounts.overdue} overdue items need attention` : 'All tasks on schedule'}
            </span>
          </div>
        </div>
      </Card>

      {/* Primary Category Switcher Tabs */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <button
          onClick={() => setActiveCategory('today')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'today'
              ? 'aurora-bg border-cyan-400/50 text-white shadow-lg scale-[1.02]'
              : 'glass-card-inner border-white/10 text-slate-400 hover:text-white hover:border-cyan-400/30'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CalendarCheck className="w-3.5 h-3.5" /> Today's
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'today' ? 'text-white' : 'text-slate-200'}`}>{categoryCounts.today}</span>
        </button>

        <button
          onClick={() => setActiveCategory('upcoming')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'upcoming'
              ? 'aurora-bg border-cyan-400/50 text-white shadow-lg scale-[1.02]'
              : 'glass-card-inner border-white/10 text-slate-400 hover:text-white hover:border-cyan-400/30'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CalendarClock className="w-3.5 h-3.5" /> Upcoming
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'upcoming' ? 'text-white' : 'text-cyan-300'}`}>{categoryCounts.upcoming}</span>
        </button>

        <button
          onClick={() => setActiveCategory('overdue')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'overdue'
              ? 'button-gradient-danger border-rose-400 text-white shadow-lg scale-[1.02]'
              : 'glass-card-inner border-white/10 text-rose-400 hover:border-rose-400/40'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Overdue
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'overdue' ? 'text-white' : 'text-rose-400'}`}>{categoryCounts.overdue}</span>
        </button>

        <button
          onClick={() => setActiveCategory('revision')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'revision'
              ? 'button-gradient-gold border-amber-400 text-white shadow-lg scale-[1.02]'
              : 'glass-card-inner border-white/10 text-amber-400 hover:border-amber-400/40'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Revisions
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'revision' ? 'text-white' : 'text-amber-400'}`}>{categoryCounts.revision}</span>
        </button>

        <button
          onClick={() => setActiveCategory('completed')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'completed'
              ? 'button-gradient-success border-emerald-400 text-white shadow-lg scale-[1.02]'
              : 'glass-card-inner border-white/10 text-emerald-400 hover:border-emerald-400/40'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Completed
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'completed' ? 'text-white' : 'text-emerald-400'}`}>{categoryCounts.completed}</span>
        </button>

        <button
          onClick={() => setActiveCategory('all')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'all'
              ? 'aurora-bg border-cyan-400/50 text-white shadow-lg scale-[1.02]'
              : 'glass-card-inner border-white/10 text-slate-400 hover:text-white hover:border-cyan-400/30'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" /> All Tasks
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'all' ? 'text-white' : 'text-slate-200'}`}>{categoryCounts.total}</span>
        </button>
      </div>

      {/* View Mode Toggle & Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between glass-card-elevated p-1.5 rounded-2xl border border-white/10">
          <div className="flex items-center gap-1 w-full">
            <button
              onClick={() => setViewMode('daily')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'daily'
                  ? 'aurora-bg text-white shadow-md font-black border border-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Category View
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'weekly'
                  ? 'aurora-bg text-white shadow-md font-black border border-white/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Weekly Cadence
            </button>
          </div>
        </div>

        {/* Weekly View Strip */}
        {viewMode === 'weekly' && (
          <div className="grid grid-cols-7 gap-1.5 glass-card-elevated p-2.5 rounded-2xl border border-white/10 text-center">
            {weekDays.map((day) => (
              <div 
                key={day.dateStr}
                className={`p-2 rounded-xl border flex flex-col items-center justify-between ${
                  day.dateStr === todayDateStr
                    ? 'bg-cyan-500/20 border-cyan-400/60 shadow-md'
                    : 'glass-card-inner border-white/10'
                }`}
              >
                <span className="text-[10px] font-bold text-slate-400">{day.dayName}</span>
                <span className="text-xs font-black text-white my-0.5">{day.dayNum}</span>
                <span className="text-[9px] font-extrabold text-cyan-300 glass-card-inner px-1.5 py-0.5 rounded-full border border-white/10">
                  {day.completed}/{day.total}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Sub-Filters for Priority & Status */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
              <Filter className="w-3 h-3 text-cyan-400" /> Priority:
            </span>
            {['All', 'Critical', 'High', 'Medium', 'Low'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                  priorityFilter === p
                    ? 'aurora-bg text-white border-cyan-400/50 shadow-md'
                    : 'glass-card-inner text-slate-400 border-white/10 hover:border-cyan-400/30 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {activeCategory === 'all' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar ml-auto">
              <span className="text-[10px] font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                Status:
              </span>
              {['All', 'Assigned', 'In Progress', 'Submitted', 'Completed', 'Revision Requested', 'Overdue', 'Cancelled'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                    statusFilter === s
                      ? 'aurora-bg text-white border-cyan-400/50 shadow-md'
                      : 'glass-card-inner text-slate-400 border-white/10 hover:border-cyan-400/30 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-3">
        <h2 className="text-xs font-extrabold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
          <span>
            {activeCategory === 'today' && "Today's Deliverables"}
            {activeCategory === 'upcoming' && 'Upcoming Deliverables'}
            {activeCategory === 'overdue' && 'Overdue Deliverables'}
            {activeCategory === 'revision' && 'Revision-Requested Deliverables'}
            {activeCategory === 'completed' && 'Completed Deliverables'}
            {activeCategory === 'all' && 'All Deliverables'} ({categorizedTasks.length})
          </span>
        </h2>

        {categorizedTasks.length > 0 ? (
          categorizedTasks.map((task) => {
            const effectiveStatus = getNormalizedTaskStatus(task);
            const revisionsCount = task.revisions?.length || task.revisionCount || 0;
            const assignedDateDisplay = task.assignedTime 
              ? task.assignedTime.substring(0, 10) 
              : task.createdAtDeviceTime 
              ? task.createdAtDeviceTime.substring(0, 10) 
              : task.startDate || 'N/A';

            return (
              <Card
                key={task.id}
                variant="elevated"
                onClick={() => handleOpenTask(task)}
                className={`p-4.5 cursor-pointer transition-all space-y-3 group ${
                  effectiveStatus === 'Revision Requested'
                    ? 'border-amber-500/50 hover:border-amber-400'
                    : effectiveStatus === 'Overdue'
                    ? 'border-rose-500/50 hover:border-rose-400'
                    : effectiveStatus === 'Completed'
                    ? 'border-emerald-500/40 hover:border-emerald-400'
                    : 'hover:border-cyan-400/60'
                }`}
              >
                {/* Top Row: Title, Priority, Status Badge */}
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-white group-hover:text-cyan-300 transition-colors">
                        {task.title}
                      </h3>
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task)}
                    </div>

                    {/* Metadata Grid */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-0.5">
                      <span className="flex items-center gap-1 font-semibold text-slate-300">
                        <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Assigned: {assignedDateDisplay}
                      </span>

                      <span className="flex items-center gap-1 font-semibold text-amber-300">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Due: {task.dueDate} {task.dueTime ? `@ ${task.dueTime}` : ''}
                      </span>

                      {task.expectedCompletionTime && (
                        <span className="flex items-center gap-1 font-semibold text-cyan-300">
                          <Clock className="w-3.5 h-3.5 text-cyan-400" /> Expected: {task.expectedCompletionTime}
                        </span>
                      )}

                      {task.completedAt && (
                        <span className="flex items-center gap-1 font-semibold text-emerald-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Completed: {new Date(task.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}

                      {revisionsCount > 0 && (
                        <span className="flex items-center gap-1 font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/40">
                          <RotateCcw className="w-3 h-3" /> Revisions: {revisionsCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300 line-clamp-2 glass-card-inner p-2.5 rounded-xl border border-white/10">
                  {task.description}
                </p>

                {/* REVISION REQUEST ALERT BANNER */}
                {effectiveStatus === 'Revision Requested' && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-amber-300 text-xs flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400 animate-spin" /> Revision Requested by {task.revisions?.[task.revisions.length - 1]?.requestedByName || 'Supervisor'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRevisionsTask(task);
                        }}
                        className="text-[10px] font-bold text-amber-300 underline hover:text-white cursor-pointer"
                      >
                        View Full History
                      </button>
                    </div>
                    <p className="text-xs text-slate-200 italic">
                      "{task.revisions?.[task.revisions.length - 1]?.reason || task.currentRevisionReason || task.reviewRemark || 'Please review and resubmit with requested corrections.'}"
                    </p>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                    <span>Progress</span>
                    <span className="text-white font-extrabold">{task.completionPercentage || 0}%</span>
                  </div>
                  <div className="w-full glass-card-inner h-2 rounded-full overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-all duration-300 ${
                        effectiveStatus === 'Completed'
                          ? 'bg-emerald-500'
                          : effectiveStatus === 'Overdue'
                          ? 'bg-rose-500'
                          : effectiveStatus === 'Revision Requested'
                          ? 'bg-amber-500'
                          : 'aurora-bg'
                      }`}
                      style={{ width: `${task.completionPercentage || 0}%` }}
                    />
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" /> By {task.createdByName || 'Admin'}
                    </span>
                    {(task.comments || []).length > 0 && (
                      <span className="flex items-center gap-1 text-cyan-300">
                        <MessageSquare className="w-3 h-3 text-cyan-400" /> {(task.comments || []).length} comments
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Action: View Revision Request */}
                    {revisionsCount > 0 && (
                      <Button
                        size="sm"
                        variant="gold"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRevisionsTask(task);
                        }}
                        className="py-1 px-2.5 text-[11px] font-bold flex items-center gap-1 rounded-xl cursor-pointer"
                      >
                        <History className="w-3 h-3" /> Revisions ({revisionsCount})
                      </Button>
                    )}

                    {/* Action: Start Task */}
                    {effectiveStatus === 'Assigned' && (
                      <Button
                        size="sm"
                        variant="filled"
                        onClick={(e) => handleStartTask(task, e)}
                        className="py-1 px-3 text-[11px] font-bold flex items-center gap-1 rounded-xl cursor-pointer shadow-md"
                      >
                        <Play className="w-3 h-3" /> Start Task
                      </Button>
                    )}

                    {/* Action: Submit Task / Resubmit */}
                    {(effectiveStatus === 'In Progress' || effectiveStatus === 'Revision Requested' || effectiveStatus === 'Overdue') && (
                      <Button
                        size="sm"
                        variant="filled"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTask(task);
                        }}
                        className="py-1 px-3 text-[11px] font-bold flex items-center gap-1 rounded-xl cursor-pointer shadow-md"
                      >
                        <Send className="w-3 h-3" /> {effectiveStatus === 'Revision Requested' ? 'Resubmit Task' : 'Submit Task'}
                      </Button>
                    )}

                    {/* Action: Mark Completed */}
                    {effectiveStatus !== 'Completed' && effectiveStatus !== 'Cancelled' && (
                      <Button
                        size="sm"
                        variant="success"
                        onClick={(e) => handleMarkCompleted(task, e)}
                        className="py-1 px-2.5 text-[11px] font-bold flex items-center gap-1 rounded-xl cursor-pointer"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Mark Completed
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="py-12 glass-card-elevated rounded-2xl border border-dashed border-white/10">
            <EmptyState
              icon={CheckSquare}
              title="No tasks in this view"
              description="No tasks match the selected delivery criteria or filter."
            />
          </div>
        )}
      </div>

      {/* Task Details & Update Progress Dialog */}
      <Dialog
        isOpen={!!selectedTask}
        onClose={() => !isUpdating && setSelectedTask(null)}
        title="Task Progress & Deliverable Update"
      >
        {selectedTask && (() => {
          const effectiveStatus = getNormalizedTaskStatus(selectedTask);
          const isRevision = effectiveStatus === 'Revision Requested';

          return (
            <div className="space-y-4 text-xs text-[var(--text-primary)]">
              {/* Task Header info */}
              <div className="p-4 glass-card-elevated rounded-2xl border border-white/10 space-y-3">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-extrabold text-base text-white">{selectedTask.title}</h3>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                      Dept: {selectedTask.assignedToDepartment} • Assigned by {selectedTask.createdByName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getPriorityBadge(selectedTask.priority)}
                    {getStatusBadge(selectedTask)}
                  </div>
                </div>

                <div className="p-3 glass-card-inner rounded-xl text-slate-300 text-xs leading-relaxed border border-white/10">
                  {selectedTask.description}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                  <div className="glass-card-inner p-2 rounded-xl border border-white/10">
                    <span className="text-cyan-400 font-bold block">Due Date & Time</span>
                    <span className="font-semibold text-white">{selectedTask.dueDate} {selectedTask.dueTime || ''}</span>
                  </div>
                  <div className="glass-card-inner p-2 rounded-xl border border-white/10">
                    <span className="text-cyan-400 font-bold block">Assigned Date</span>
                    <span className="font-semibold text-slate-300">
                      {selectedTask.assignedTime?.substring(0, 10) || selectedTask.createdAtDeviceTime?.substring(0, 10) || 'N/A'}
                    </span>
                  </div>
                  {selectedTask.expectedCompletionTime && (
                    <div className="glass-card-inner p-2 rounded-xl border border-white/10">
                      <span className="text-cyan-400 font-bold block">Expected Completion</span>
                      <span className="font-semibold text-cyan-300">{selectedTask.expectedCompletionTime}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Revision note / request banner if revision requested */}
              {isRevision && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-amber-300">Supervisor Revision Instructions:</span>
                  </div>
                  <p className="text-xs text-slate-200 glass-card-inner p-2.5 rounded-xl border border-amber-500/30">
                    {selectedTask.revisions?.[selectedTask.revisions.length - 1]?.reason || selectedTask.currentRevisionReason || selectedTask.reviewRemark || 'Please review deliverable specifications and update.'}
                  </p>
                  <div className="space-y-1 pt-1">
                    <label className="font-bold text-amber-300 text-[11px]">Resubmission Note for Reviewer:</label>
                    <textarea
                      value={resubmissionNote}
                      onChange={(e) => setResubmissionNote(e.target.value)}
                      placeholder="Explain how you addressed the revision request..."
                      className="w-full glass-card-inner border border-amber-500/40 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-amber-400 min-h-[60px]"
                    />
                  </div>
                </div>
              )}

              {/* Employee Interactive Progress Slider */}
              <div className="p-4 glass-card-elevated rounded-2xl border border-white/10 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="font-extrabold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Completion Percentage
                  </label>
                  <span className="text-sm font-black text-cyan-300 glass-card-inner px-2.5 py-0.5 rounded-full border border-cyan-500/40 font-mono">
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
                  className="w-full accent-cyan-400 cursor-pointer"
                />

                <div className="flex justify-between gap-1">
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCompletionInput(pct)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all border cursor-pointer ${
                        completionInput === pct
                          ? 'aurora-bg text-white border-cyan-400/60 font-black shadow-sm'
                          : 'glass-card-inner text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Comments Thread */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-xs text-slate-400 uppercase tracking-wider">
                  Discussion & Notes ({(selectedTask.comments || []).length})
                </h4>

                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                  {(selectedTask.comments || []).length > 0 ? (
                    selectedTask.comments.map((c) => (
                      <div
                        key={c.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                          c.authorRole === 'ADMIN'
                            ? 'bg-cyan-500/15 border-cyan-500/30'
                            : 'glass-card-inner border-white/10'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className={c.authorRole === 'ADMIN' ? 'text-cyan-300' : 'text-emerald-400'}>
                            {c.authorName} ({c.authorRole})
                          </span>
                          <span className="text-slate-400 font-mono">
                            {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-200">{c.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400 italic text-center py-2">No comments yet.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Add progress notes or questions..."
                    className="flex-1 px-3 py-2 rounded-xl border border-white/10 glass-card-inner text-white text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                  <Button 
                    type="button" 
                    variant="filled"
                    onClick={handleAddComment} 
                    disabled={!commentInput.trim()}
                    className="px-3 text-white font-bold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {isRevision ? (
                  <Button
                    variant="gold"
                    onClick={() => handleSubmitTask(selectedTask, resubmissionNote)}
                    disabled={isUpdating}
                    className="flex-1 py-3 text-white font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                  >
                    <RotateCcw className="w-4 h-4" /> {isUpdating ? 'Submitting...' : 'Resubmit Deliverable'}
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleSaveTaskProgress}
                      disabled={isUpdating}
                      variant="tonal"
                      className="flex-1 py-3 text-slate-200 border border-white/10 font-bold rounded-2xl cursor-pointer"
                    >
                      {isUpdating ? 'Saving...' : 'Save Progress'}
                    </Button>
                    <Button
                      variant="filled"
                      onClick={() => handleSubmitTask(selectedTask)}
                      disabled={isUpdating}
                      className="flex-1 py-3 text-white font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <Send className="w-4 h-4" /> Submit Task (100%)
                    </Button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Dialog>

      {/* Revision History Modal */}
      <Dialog
        isOpen={!!viewingRevisionsTask}
        onClose={() => setViewingRevisionsTask(null)}
        title="Deliverable Revision History"
      >
        {viewingRevisionsTask && (
          <div className="space-y-4 text-xs text-[var(--text-primary)]">
            <div className="p-4 glass-card-elevated rounded-2xl border border-white/10">
              <h4 className="font-bold text-sm text-white">{viewingRevisionsTask.title}</h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Total Revisions: <span className="font-bold text-amber-400">{viewingRevisionsTask.revisions?.length || viewingRevisionsTask.revisionCount || 0}</span>
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {(viewingRevisionsTask.revisions || []).length > 0 ? (
                viewingRevisionsTask.revisions!.map((rev, idx) => (
                  <div key={idx} className="p-3 glass-card-inner rounded-xl border border-amber-500/30 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-amber-300">Revision #{idx + 1}</span>
                      <span className="text-slate-400 font-mono">{new Date(rev.requestedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                        <span className="text-[9px] font-black text-amber-300 uppercase tracking-widest block mb-0.5">Supervisor Instruction:</span>
                        <p className="text-slate-200 leading-relaxed italic">"{rev.reason}"</p>
                      </div>
                      {rev.resubmittedAt && (
                        <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                          <span className="text-[9px] font-black text-cyan-300 uppercase tracking-widest block mb-0.5">Your Response:</span>
                          <p className="text-slate-200 leading-relaxed italic">"{rev.resubmissionNote || 'No note provided'}"</p>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 border-t border-white/10">
                      <span>By {rev.requestedByName}</span>
                      {rev.resubmittedAt && <span>Resubmitted: {new Date(rev.resubmittedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 glass-card-inner rounded-2xl border border-dashed border-white/10">
                  <RotateCcw className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-30" />
                  <p className="text-slate-400 italic">No revision history found.</p>
                </div>
              )}
            </div>

            <Button
              variant="tonal"
              onClick={() => setViewingRevisionsTask(null)}
              className="w-full text-slate-200 border border-white/10 rounded-xl font-bold py-2.5 cursor-pointer"
            >
              Close History
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
};

export default PlannerScreen;
