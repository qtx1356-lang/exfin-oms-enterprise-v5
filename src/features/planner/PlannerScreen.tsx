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
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/40 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
            Critical
          </span>
        );
      case 'High':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40 uppercase tracking-wider">
            High
          </span>
        );
      case 'Medium':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--emerald)]/20 text-[var(--emerald-bright)] border border-[var(--emerald)]/40 uppercase tracking-wider">
            Medium
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--background-card)] text-[var(--text-secondary)] border border-[var(--border-color)] uppercase tracking-wider">
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
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completed
          </span>
        );
      case 'Revision Requested':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse flex items-center gap-1">
            <RotateCcw className="w-3 h-3 text-amber-400" /> Revision Requested
          </span>
        );
      case 'Submitted':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--emerald)]/20 text-[var(--emerald-bright)] border border-[var(--emerald)]/40 flex items-center gap-1">
            <FileCheck2 className="w-3 h-3 text-[var(--emerald-bright)]" /> Submitted
          </span>
        );
      case 'Overdue':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-400" /> Overdue
          </span>
        );
      case 'In Progress':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-400" /> In Progress
          </span>
        );
      case 'Cancelled':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--background-card-hover)] text-[var(--text-secondary)] border border-[var(--border-color)]">
            Cancelled
          </span>
        );
      case 'Assigned':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[var(--background-card)] text-[var(--text-secondary)] border border-[var(--border-color)]">
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
      <div className="flex items-center justify-between pt-2 pb-2 border-b border-[var(--border-color)]">
        <div>
          <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-[var(--emerald-bright)]" /> Work Planner
          </h1>
          <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
            Operational Deliverables & Tasks for <span className="text-[var(--emerald-bright)] font-bold">{empDept}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Feature Card: WORK COMPLETION SUMMARY */}
      <Card className="p-5 bg-[var(--background-card)] border border-[var(--border-color)] shadow-xl rounded-2xl relative overflow-hidden text-[var(--text-primary)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--background-card-hover)] border border-[var(--border-color)] flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-[var(--emerald-bright)]" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Sprint Delivery Rate</span>
              <h2 className="text-lg font-black text-[var(--text-primary)] leading-none mt-0.5 tracking-wide">TASK PROGRESS & CADENCE</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            <div className="text-right">
              <p className="text-xs font-bold text-[var(--text-secondary)]">Completion Score</p>
              <p className="text-2xl font-black text-[var(--emerald-bright)] font-mono">{overallProgressPct}%</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-[var(--background-card)] h-3 rounded-full overflow-hidden border border-[var(--border-color)] p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-[var(--emerald)] to-[var(--emerald-bright)] rounded-full transition-all duration-500"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-secondary)]">
            <span>{completedCount} of {totalAssignedTasks} tasks completed</span>
            <span className={categoryCounts.overdue > 0 ? 'text-rose-400 font-bold' : 'text-[var(--text-secondary)]'}>
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
              ? 'bg-[var(--emerald)] border-[var(--emerald)] text-white shadow-lg scale-[1.02]'
              : 'bg-[var(--background-card)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--background-card-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CalendarCheck className="w-3.5 h-3.5" /> Today's
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'today' ? 'text-white' : 'text-[var(--text-primary)]'}`}>{categoryCounts.today}</span>
        </button>

        <button
          onClick={() => setActiveCategory('upcoming')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'upcoming'
              ? 'bg-[var(--emerald)] border-[var(--emerald)] text-white shadow-lg scale-[1.02]'
              : 'bg-[var(--background-card)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--background-card-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CalendarClock className="w-3.5 h-3.5" /> Upcoming
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'upcoming' ? 'text-white' : 'text-[var(--emerald-bright)]'}`}>{categoryCounts.upcoming}</span>
        </button>

        <button
          onClick={() => setActiveCategory('overdue')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'overdue'
              ? 'bg-rose-500 border-rose-500 text-white shadow-lg scale-[1.02]'
              : 'bg-[var(--background-card)] border-[var(--border-color)] text-rose-400 hover:bg-[var(--background-card-hover)]'
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
              ? 'bg-amber-500 border-amber-500 text-white shadow-lg scale-[1.02]'
              : 'bg-[var(--background-card)] border-[var(--border-color)] text-amber-400 hover:bg-[var(--background-card-hover)]'
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
              ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg scale-[1.02]'
              : 'bg-[var(--background-card)] border-[var(--border-color)] text-emerald-400 hover:bg-[var(--background-card-hover)]'
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
              ? 'bg-[var(--emerald)] border-[var(--emerald)] text-white shadow-lg scale-[1.02]'
              : 'bg-[var(--background-card)] border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--background-card-hover)] hover:text-[var(--text-primary)]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" /> All Tasks
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'all' ? 'text-white' : 'text-[var(--text-primary)]'}`}>{categoryCounts.total}</span>
        </button>
      </div>

      {/* View Mode Toggle & Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-[var(--background-card)] p-1.5 rounded-2xl border border-[var(--border-color)]">
          <div className="flex items-center gap-1 w-full">
            <button
              onClick={() => setViewMode('daily')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-[var(--emerald)] text-white shadow-md font-black'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Category View
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'weekly'
                  ? 'bg-[var(--emerald)] text-white shadow-md font-black'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Weekly Cadence
            </button>
          </div>
        </div>

        {/* Weekly View Strip */}
        {viewMode === 'weekly' && (
          <div className="grid grid-cols-7 gap-1.5 bg-[var(--background-card)] p-2.5 rounded-2xl border border-[var(--border-color)] text-center">
            {weekDays.map((day) => (
              <div 
                key={day.dateStr}
                className={`p-2 rounded-xl border flex flex-col items-center justify-between ${
                  day.dateStr === todayDateStr
                    ? 'bg-[var(--emerald)]/20 border-[var(--emerald)]'
                    : 'bg-[var(--background-card-hover)] border-[var(--border-color)]'
                }`}
              >
                <span className="text-[10px] font-bold text-[var(--text-secondary)]">{day.dayName}</span>
                <span className="text-xs font-black text-[var(--text-primary)] my-0.5">{day.dayNum}</span>
                <span className="text-[9px] font-extrabold text-[var(--emerald-bright)] bg-[var(--background-card)] px-1.5 py-0.5 rounded-full border border-[var(--border-color)]">
                  {day.completed}/{day.total}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Sub-Filters for Priority & Status */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[10px] font-extrabold text-[var(--emerald-bright)] uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
              <Filter className="w-3 h-3 text-[var(--emerald-bright)]" /> Priority:
            </span>
            {['All', 'Critical', 'High', 'Medium', 'Low'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                  priorityFilter === p
                    ? 'bg-[var(--emerald)] text-white border-[var(--emerald)] shadow-md'
                    : 'bg-[var(--background-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--background-card-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {activeCategory === 'all' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar ml-auto">
              <span className="text-[10px] font-extrabold text-[var(--emerald-bright)] uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                Status:
              </span>
              {['All', 'Assigned', 'In Progress', 'Submitted', 'Completed', 'Revision Requested', 'Overdue', 'Cancelled'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                    statusFilter === s
                      ? 'bg-[var(--emerald)] text-white border-[var(--emerald)] shadow-md'
                      : 'bg-[var(--background-card)] text-[var(--text-secondary)] border-[var(--border-color)] hover:bg-[var(--background-card-hover)] hover:text-[var(--text-primary)]'
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
        <h2 className="text-xs font-extrabold text-[var(--emerald-bright)] uppercase tracking-wider flex items-center justify-between">
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
                onClick={() => handleOpenTask(task)}
                className={`p-4.5 bg-[var(--background-card)] border rounded-2xl shadow-md cursor-pointer transition-all space-y-3 group text-[var(--text-primary)] ${
                  effectiveStatus === 'Revision Requested'
                    ? 'border-amber-500/50 hover:border-amber-500'
                    : effectiveStatus === 'Overdue'
                    ? 'border-rose-500/50 hover:border-rose-500'
                    : effectiveStatus === 'Completed'
                    ? 'border-emerald-500/30 hover:border-emerald-500/60'
                    : 'border-[var(--border-color)] hover:border-[var(--emerald)]'
                }`}
              >
                {/* Top Row: Title, Priority, Status Badge */}
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-[var(--text-primary)] group-hover:text-[var(--emerald-bright)] transition-colors">
                        {task.title}
                      </h3>
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task)}
                    </div>

                    {/* Metadata Grid */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--text-secondary)] pt-0.5">
                      <span className="flex items-center gap-1 font-semibold text-[var(--text-secondary)]">
                        <Calendar className="w-3.5 h-3.5 text-[var(--emerald-bright)]" /> Assigned: {assignedDateDisplay}
                      </span>

                      <span className="flex items-center gap-1 font-semibold text-amber-400">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Due: {task.dueDate} {task.dueTime ? `@ ${task.dueTime}` : ''}
                      </span>

                      {task.expectedCompletionTime && (
                        <span className="flex items-center gap-1 font-semibold text-[var(--emerald-bright)]">
                          <Clock className="w-3.5 h-3.5 text-[var(--emerald-bright)]" /> Expected: {task.expectedCompletionTime}
                        </span>
                      )}

                      {task.completedAt && (
                        <span className="flex items-center gap-1 font-semibold text-emerald-400">
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Completed: {new Date(task.completedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      )}

                      {revisionsCount > 0 && (
                        <span className="flex items-center gap-1 font-black text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                          <RotateCcw className="w-3 h-3" /> Revisions: {revisionsCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 bg-[var(--background-card)] p-2.5 rounded-xl border border-[var(--border-color)]">
                  {task.description}
                </p>

                {/* REVISION REQUEST ALERT BANNER */}
                {effectiveStatus === 'Revision Requested' && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-amber-400 text-xs flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-amber-400 animate-spin" /> Revision Requested by {task.revisions?.[task.revisions.length - 1]?.requestedByName || 'Supervisor'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRevisionsTask(task);
                        }}
                        className="text-[10px] font-bold text-amber-400 underline hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        View Full History
                      </button>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] italic">
                      "{task.revisions?.[task.revisions.length - 1]?.reason || task.currentRevisionReason || task.reviewRemark || 'Please review and resubmit with requested corrections.'}"
                    </p>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[var(--text-secondary)]">
                    <span>Progress</span>
                    <span className="text-[var(--text-primary)] font-extrabold">{task.completionPercentage || 0}%</span>
                  </div>
                  <div className="w-full bg-[var(--background-card)] h-2 rounded-full overflow-hidden border border-[var(--border-color)]">
                    <div
                      className={`h-full transition-all duration-300 ${
                        effectiveStatus === 'Completed'
                          ? 'bg-emerald-500'
                          : effectiveStatus === 'Overdue'
                          ? 'bg-rose-500'
                          : effectiveStatus === 'Revision Requested'
                          ? 'bg-amber-500'
                          : 'bg-[var(--emerald)]'
                      }`}
                      style={{ width: `${task.completionPercentage || 0}%` }}
                    />
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-2 border-t border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-[var(--text-secondary)]" /> By {task.createdByName || 'Admin'}
                    </span>
                    {(task.comments || []).length > 0 && (
                      <span className="flex items-center gap-1 text-[var(--emerald-bright)]">
                        <MessageSquare className="w-3 h-3 text-[var(--emerald-bright)]" /> {(task.comments || []).length} comments
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Action: View Revision Request */}
                    {revisionsCount > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingRevisionsTask(task);
                        }}
                        className="py-1 px-2.5 text-[11px] font-bold bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1 rounded-xl cursor-pointer"
                      >
                        <History className="w-3 h-3" /> Revisions ({revisionsCount})
                      </Button>
                    )}

                    {/* Action: Start Task */}
                    {effectiveStatus === 'Assigned' && (
                      <Button
                        size="sm"
                        onClick={(e) => handleStartTask(task, e)}
                        className="py-1 px-3 text-[11px] font-bold bg-[var(--emerald)] hover:bg-[var(--emerald-bright)] text-white flex items-center gap-1 rounded-xl cursor-pointer shadow-md"
                      >
                        <Play className="w-3 h-3" /> Start Task
                      </Button>
                    )}

                    {/* Action: Submit Task / Resubmit */}
                    {(effectiveStatus === 'In Progress' || effectiveStatus === 'Revision Requested' || effectiveStatus === 'Overdue') && (
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTask(task);
                        }}
                        className="py-1 px-3 text-[11px] font-bold bg-[var(--emerald)] hover:bg-[var(--emerald-bright)] text-white flex items-center gap-1 rounded-xl cursor-pointer shadow-md"
                      >
                        <Send className="w-3 h-3" /> {effectiveStatus === 'Revision Requested' ? 'Resubmit Task' : 'Submit Task'}
                      </Button>
                    )}

                    {/* Action: Mark Completed */}
                    {effectiveStatus !== 'Completed' && effectiveStatus !== 'Cancelled' && (
                      <Button
                        size="sm"
                        onClick={(e) => handleMarkCompleted(task, e)}
                        className="py-1 px-2.5 text-[11px] font-bold bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white border border-emerald-500/40 flex items-center gap-1 rounded-xl cursor-pointer"
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
          <div className="py-12 bg-[var(--background-card)] rounded-2xl border border-dashed border-[var(--border-color)]">
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
              <div className="p-3 bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)] space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-extrabold text-base text-[var(--text-primary)]">{selectedTask.title}</h3>
                    <p className="text-[10px] text-[var(--text-secondary)] font-semibold mt-0.5">
                      Dept: {selectedTask.assignedToDepartment} • Assigned by {selectedTask.createdByName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getPriorityBadge(selectedTask.priority)}
                    {getStatusBadge(selectedTask)}
                  </div>
                </div>

                <div className="p-2.5 bg-[var(--background-card)] rounded-xl text-[var(--text-secondary)] text-xs leading-relaxed border border-[var(--border-color)]">
                  {selectedTask.description}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-[var(--text-secondary)]">
                  <div>
                    <span className="text-[var(--emerald-bright)] font-bold block">Due Date & Time</span>
                    <span className="font-semibold text-[var(--text-primary)]">{selectedTask.dueDate} {selectedTask.dueTime || ''}</span>
                  </div>
                  <div>
                    <span className="text-[var(--emerald-bright)] font-bold block">Assigned Date</span>
                    <span className="font-semibold text-[var(--text-secondary)]">
                      {selectedTask.assignedTime?.substring(0, 10) || selectedTask.createdAtDeviceTime?.substring(0, 10) || 'N/A'}
                    </span>
                  </div>
                  {selectedTask.expectedCompletionTime && (
                    <div>
                      <span className="text-[var(--emerald-bright)] font-bold block">Expected Completion</span>
                      <span className="font-semibold text-[var(--emerald-bright)]">{selectedTask.expectedCompletionTime}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Revision note / request banner if revision requested */}
              {isRevision && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="font-bold text-amber-400">Supervisor Revision Instructions:</span>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] bg-[var(--background-card)] p-2 rounded-xl border border-amber-500/30">
                    {selectedTask.revisions?.[selectedTask.revisions.length - 1]?.reason || selectedTask.currentRevisionReason || selectedTask.reviewRemark || 'Please review deliverable specifications and update.'}
                  </p>
                  <div className="space-y-1 pt-1">
                    <label className="font-bold text-amber-400 text-[11px]">Resubmission Note for Reviewer:</label>
                    <textarea
                      value={resubmissionNote}
                      onChange={(e) => setResubmissionNote(e.target.value)}
                      placeholder="Explain how you addressed the revision request..."
                      className="w-full bg-[var(--background-card)] border border-amber-500/40 rounded-xl p-2.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-amber-500 min-h-[60px]"
                    />
                  </div>
                </div>
              )}

              {/* Employee Interactive Progress Slider */}
              <div className="p-3 bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)] space-y-3">
                <div className="flex justify-between items-center">
                  <label className="font-extrabold text-xs text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[var(--emerald-bright)]" /> Completion Percentage
                  </label>
                  <span className="text-sm font-black text-[var(--emerald-bright)] bg-[var(--emerald)]/20 px-2.5 py-0.5 rounded-full border border-[var(--emerald)]/30 font-mono">
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
                  className="w-full accent-[var(--emerald)] cursor-pointer"
                />

                <div className="flex justify-between gap-1">
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCompletionInput(pct)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all border cursor-pointer ${
                        completionInput === pct
                          ? 'bg-[var(--emerald)] text-white border-[var(--emerald)] font-black'
                          : 'bg-[var(--background-card)] text-[var(--text-secondary)] border-[var(--border-color)]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Comments Thread */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-xs text-[var(--text-secondary)] uppercase tracking-wider">
                  Discussion & Notes ({(selectedTask.comments || []).length})
                </h4>

                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                  {(selectedTask.comments || []).length > 0 ? (
                    selectedTask.comments.map((c) => (
                      <div
                        key={c.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                          c.authorRole === 'ADMIN'
                            ? 'bg-[var(--emerald)]/15 border-[var(--emerald)]/40'
                            : 'bg-[var(--background-card)] border-[var(--border-color)]'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className={c.authorRole === 'ADMIN' ? 'text-[var(--emerald-bright)]' : 'text-emerald-400'}>
                            {c.authorName} ({c.authorRole})
                          </span>
                          <span className="text-[var(--text-secondary)] font-mono">
                            {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[var(--text-primary)]">{c.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-[var(--text-secondary)] italic text-center py-2">No comments yet.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Add progress notes or questions..."
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] text-[var(--text-primary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--emerald)]"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddComment} 
                    disabled={!commentInput.trim()}
                    className="px-3 bg-[var(--emerald)] hover:bg-[var(--emerald-bright)] text-white font-bold cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {isRevision ? (
                  <Button
                    onClick={() => handleSubmitTask(selectedTask, resubmissionNote)}
                    disabled={isUpdating}
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" /> {isUpdating ? 'Submitting...' : 'Resubmit Deliverable'}
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleSaveTaskProgress}
                      disabled={isUpdating}
                      variant="secondary"
                      className="flex-1 py-3 bg-[var(--background-card-hover)] hover:bg-[var(--background-card)] text-[var(--text-primary)] border border-[var(--border-color)] font-bold rounded-2xl cursor-pointer"
                    >
                      {isUpdating ? 'Saving...' : 'Save Progress'}
                    </Button>
                    <Button
                      onClick={() => handleSubmitTask(selectedTask)}
                      disabled={isUpdating}
                      className="flex-1 py-3 bg-[var(--emerald)] hover:bg-[var(--emerald-bright)] text-white font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
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
            <div className="p-3 bg-[var(--background-card)] rounded-2xl border border-[var(--border-color)]">
              <h4 className="font-bold text-sm text-[var(--text-primary)]">{viewingRevisionsTask.title}</h4>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Total Revisions: <span className="font-bold text-amber-400">{viewingRevisionsTask.revisions?.length || viewingRevisionsTask.revisionCount || 0}</span>
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {(viewingRevisionsTask.revisions || []).length > 0 ? (
                viewingRevisionsTask.revisions!.map((rev, idx) => (
                  <div key={idx} className="p-3 bg-[var(--background-card)] rounded-xl border border-amber-500/30 space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-amber-400">Revision #{idx + 1}</span>
                      <span className="text-[var(--text-secondary)] font-mono">{new Date(rev.requestedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1.5">
                      <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/20">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest block mb-0.5">Supervisor Instruction:</span>
                        <p className="text-[var(--text-primary)] leading-relaxed italic">"{rev.reason}"</p>
                      </div>
                      {rev.resubmittedAt && (
                        <div className="p-2 bg-[var(--emerald)]/10 rounded-lg border border-[var(--emerald)]/20">
                          <span className="text-[9px] font-black text-[var(--emerald-bright)] uppercase tracking-widest block mb-0.5">Your Response:</span>
                          <p className="text-[var(--text-primary)] leading-relaxed italic">"{rev.resubmissionNote || 'No note provided'}"</p>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between items-center text-[9px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-color)]">
                      <span>By {rev.requestedByName}</span>
                      {rev.resubmittedAt && <span>Resubmitted: {new Date(rev.resubmittedAt).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-[var(--background-card)] rounded-2xl border border-dashed border-[var(--border-color)]">
                  <RotateCcw className="w-8 h-8 text-[var(--text-secondary)] mx-auto mb-2 opacity-20" />
                  <p className="text-[var(--text-secondary)] italic">No revision history found.</p>
                </div>
              )}
            </div>

            <Button
              onClick={() => setViewingRevisionsTask(null)}
              className="w-full bg-[var(--background-card-hover)] text-[var(--text-primary)] border border-[var(--border-color)] rounded-xl font-bold py-2.5 cursor-pointer"
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
