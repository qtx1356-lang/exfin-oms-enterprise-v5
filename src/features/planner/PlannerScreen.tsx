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
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 uppercase tracking-wider">
            Medium
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#151515] text-[#8A8A8A] border border-[#292929] uppercase tracking-wider">
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
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 flex items-center gap-1">
            <FileCheck2 className="w-3 h-3 text-[#D4AF37]" /> Submitted
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
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#222222] text-[#8A8A8A] border border-[#333333]">
            Cancelled
          </span>
        );
      case 'Assigned':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#151515] text-[#8A8A8A] border border-[#292929]">
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
    <div className="flex flex-col gap-5 pb-16 text-[#FFFFFF] max-w-5xl mx-auto font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2 pb-2 border-b border-[#292929]">
        <div>
          <h1 className="text-2xl font-black text-[#FFFFFF] tracking-tight flex items-center gap-2">
            <CheckSquare className="w-7 h-7 text-[#D4AF37]" /> Work Planner
          </h1>
          <p className="text-xs text-[#8A8A8A] font-medium mt-0.5">
            Operational Deliverables & Tasks for <span className="text-[#D4AF37] font-bold">{empDept}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
        </div>
      </div>

      {/* Feature Card: WORK COMPLETION SUMMARY */}
      <Card className="p-5 bg-[#151515] border border-[#292929] shadow-xl rounded-2xl relative overflow-hidden text-[#FFFFFF]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1B1B1B] border border-[#292929] flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#8A8A8A]">Sprint Delivery Rate</span>
              <h2 className="text-lg font-black text-[#FFFFFF] leading-none mt-0.5 tracking-wide">TASK PROGRESS & CADENCE</h2>
            </div>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-between sm:justify-end">
            <div className="text-right">
              <p className="text-xs font-bold text-[#8A8A8A]">Completion Score</p>
              <p className="text-2xl font-black text-[#D4AF37] font-mono">{overallProgressPct}%</p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="w-full bg-[#101010] h-3 rounded-full overflow-hidden border border-[#292929] p-0.5">
            <div 
              className="h-full bg-gradient-to-r from-[#D4AF37] to-[#E6C766] rounded-full transition-all duration-500"
              style={{ width: `${overallProgressPct}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-bold text-[#8A8A8A]">
            <span>{completedCount} of {totalAssignedTasks} tasks completed</span>
            <span className={categoryCounts.overdue > 0 ? 'text-rose-400 font-bold' : 'text-[#8A8A8A]'}>
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
              ? 'bg-[#D4AF37] border-[#D4AF37] text-[#080808] shadow-lg scale-[1.02]'
              : 'bg-[#151515] border-[#292929] text-[#8A8A8A] hover:bg-[#1B1B1B] hover:text-[#FFFFFF]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CalendarCheck className="w-3.5 h-3.5" /> Today's
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'today' ? 'text-[#080808]' : 'text-[#FFFFFF]'}`}>{categoryCounts.today}</span>
        </button>

        <button
          onClick={() => setActiveCategory('upcoming')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'upcoming'
              ? 'bg-[#D4AF37] border-[#D4AF37] text-[#080808] shadow-lg scale-[1.02]'
              : 'bg-[#151515] border-[#292929] text-[#8A8A8A] hover:bg-[#1B1B1B] hover:text-[#FFFFFF]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CalendarClock className="w-3.5 h-3.5" /> Upcoming
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'upcoming' ? 'text-[#080808]' : 'text-[#D4AF37]'}`}>{categoryCounts.upcoming}</span>
        </button>

        <button
          onClick={() => setActiveCategory('overdue')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'overdue'
              ? 'bg-rose-500 border-rose-500 text-[#FFFFFF] shadow-lg scale-[1.02]'
              : 'bg-[#151515] border-[#292929] text-rose-400 hover:bg-[#1B1B1B]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Overdue
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'overdue' ? 'text-[#FFFFFF]' : 'text-rose-400'}`}>{categoryCounts.overdue}</span>
        </button>

        <button
          onClick={() => setActiveCategory('revision')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'revision'
              ? 'bg-amber-500 border-amber-500 text-[#080808] shadow-lg scale-[1.02]'
              : 'bg-[#151515] border-[#292929] text-amber-400 hover:bg-[#1B1B1B]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Revisions
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'revision' ? 'text-[#080808]' : 'text-amber-400'}`}>{categoryCounts.revision}</span>
        </button>

        <button
          onClick={() => setActiveCategory('completed')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'completed'
              ? 'bg-emerald-500 border-emerald-500 text-[#080808] shadow-lg scale-[1.02]'
              : 'bg-[#151515] border-[#292929] text-emerald-400 hover:bg-[#1B1B1B]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Completed
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'completed' ? 'text-[#080808]' : 'text-emerald-400'}`}>{categoryCounts.completed}</span>
        </button>

        <button
          onClick={() => setActiveCategory('all')}
          className={`p-2.5 rounded-xl border flex flex-col items-center justify-between text-center transition-all cursor-pointer ${
            activeCategory === 'all'
              ? 'bg-[#D4AF37] border-[#D4AF37] text-[#080808] shadow-lg scale-[1.02]'
              : 'bg-[#151515] border-[#292929] text-[#8A8A8A] hover:bg-[#1B1B1B] hover:text-[#FFFFFF]'
          }`}
        >
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5" /> All Tasks
          </div>
          <span className={`text-lg font-black mt-1 font-mono ${activeCategory === 'all' ? 'text-[#080808]' : 'text-[#FFFFFF]'}`}>{categoryCounts.total}</span>
        </button>
      </div>

      {/* View Mode Toggle & Filters */}
      <div className="space-y-3">
        <div className="flex items-center justify-between bg-[#151515] p-1.5 rounded-2xl border border-[#292929]">
          <div className="flex items-center gap-1 w-full">
            <button
              onClick={() => setViewMode('daily')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'daily'
                  ? 'bg-[#D4AF37] text-[#080808] shadow-md font-black'
                  : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> Category View
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                viewMode === 'weekly'
                  ? 'bg-[#D4AF37] text-[#080808] shadow-md font-black'
                  : 'text-[#8A8A8A] hover:text-[#FFFFFF]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Weekly Cadence
            </button>
          </div>
        </div>

        {/* Weekly View Strip */}
        {viewMode === 'weekly' && (
          <div className="grid grid-cols-7 gap-1.5 bg-[#151515] p-2.5 rounded-2xl border border-[#292929] text-center">
            {weekDays.map((day) => (
              <div 
                key={day.dateStr}
                className={`p-2 rounded-xl border flex flex-col items-center justify-between ${
                  day.dateStr === todayDateStr
                    ? 'bg-[#D4AF37]/20 border-[#D4AF37]'
                    : 'bg-[#1B1B1B] border-[#292929]'
                }`}
              >
                <span className="text-[10px] font-bold text-[#8A8A8A]">{day.dayName}</span>
                <span className="text-xs font-black text-[#FFFFFF] my-0.5">{day.dayNum}</span>
                <span className="text-[9px] font-extrabold text-[#D4AF37] bg-[#151515] px-1.5 py-0.5 rounded-full border border-[#292929]">
                  {day.completed}/{day.total}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Sub-Filters for Priority & Status */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[10px] font-extrabold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
              <Filter className="w-3 h-3 text-[#D4AF37]" /> Priority:
            </span>
            {['All', 'Critical', 'High', 'Medium', 'Low'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                  priorityFilter === p
                    ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] shadow-md'
                    : 'bg-[#151515] text-[#8A8A8A] border-[#292929] hover:bg-[#1B1B1B] hover:text-[#FFFFFF]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          {activeCategory === 'all' && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar ml-auto">
              <span className="text-[10px] font-extrabold text-[#D4AF37] uppercase tracking-wider flex items-center gap-1 flex-shrink-0">
                Status:
              </span>
              {['All', 'Assigned', 'In Progress', 'Submitted', 'Completed', 'Revision Requested', 'Overdue', 'Cancelled'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                    statusFilter === s
                      ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] shadow-md'
                      : 'bg-[#151515] text-[#8A8A8A] border-[#292929] hover:bg-[#1B1B1B] hover:text-[#FFFFFF]'
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
        <h2 className="text-xs font-extrabold text-[#D4AF37] uppercase tracking-wider flex items-center justify-between">
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
                className={`p-4.5 bg-[#151515] border rounded-2xl shadow-md cursor-pointer transition-all space-y-3 group text-[#FFFFFF] ${
                  effectiveStatus === 'Revision Requested'
                    ? 'border-amber-500/50 hover:border-amber-500'
                    : effectiveStatus === 'Overdue'
                    ? 'border-rose-500/50 hover:border-rose-500'
                    : effectiveStatus === 'Completed'
                    ? 'border-emerald-500/30 hover:border-emerald-500/60'
                    : 'border-[#292929] hover:border-[#D4AF37]'
                }`}
              >
                {/* Top Row: Title, Priority, Status Badge */}
                <div className="flex justify-between items-start gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-[#FFFFFF] group-hover:text-[#D4AF37] transition-colors">
                        {task.title}
                      </h3>
                      {getPriorityBadge(task.priority)}
                      {getStatusBadge(task)}
                    </div>

                    {/* Metadata Grid */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#8A8A8A] pt-0.5">
                      <span className="flex items-center gap-1 font-semibold text-[#8A8A8A]">
                        <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> Assigned: {assignedDateDisplay}
                      </span>

                      <span className="flex items-center gap-1 font-semibold text-amber-400">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Due: {task.dueDate} {task.dueTime ? `@ ${task.dueTime}` : ''}
                      </span>

                      {task.expectedCompletionTime && (
                        <span className="flex items-center gap-1 font-semibold text-[#D4AF37]">
                          <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> Expected: {task.expectedCompletionTime}
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
                <p className="text-xs text-[#8A8A8A] line-clamp-2 bg-[#101010] p-2.5 rounded-xl border border-[#292929]">
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
                        className="text-[10px] font-bold text-amber-400 underline hover:text-[#FFFFFF] cursor-pointer"
                      >
                        View Full History
                      </button>
                    </div>
                    <p className="text-xs text-[#FFFFFF] italic">
                      "{task.revisions?.[task.revisions.length - 1]?.reason || task.currentRevisionReason || task.reviewRemark || 'Please review and resubmit with requested corrections.'}"
                    </p>
                  </div>
                )}

                {/* Progress Bar */}
                <div className="space-y-1 pt-1">
                  <div className="flex justify-between items-center text-[10px] font-bold text-[#8A8A8A]">
                    <span>Progress</span>
                    <span className="text-[#FFFFFF] font-extrabold">{task.completionPercentage || 0}%</span>
                  </div>
                  <div className="w-full bg-[#101010] h-2 rounded-full overflow-hidden border border-[#292929]">
                    <div
                      className={`h-full transition-all duration-300 ${
                        effectiveStatus === 'Completed'
                          ? 'bg-emerald-500'
                          : effectiveStatus === 'Overdue'
                          ? 'bg-rose-500'
                          : effectiveStatus === 'Revision Requested'
                          ? 'bg-amber-500'
                          : 'bg-[#D4AF37]'
                      }`}
                      style={{ width: `${task.completionPercentage || 0}%` }}
                    />
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="pt-2 border-t border-[#292929] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-[10px] text-[#8A8A8A]">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-[#8A8A8A]" /> By {task.createdByName || 'Admin'}
                    </span>
                    {(task.comments || []).length > 0 && (
                      <span className="flex items-center gap-1 text-[#D4AF37]">
                        <MessageSquare className="w-3 h-3 text-[#D4AF37]" /> {(task.comments || []).length} comments
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
                        className="py-1 px-3 text-[11px] font-bold bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808] flex items-center gap-1 rounded-xl cursor-pointer shadow-md"
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
                        className="py-1 px-3 text-[11px] font-bold bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808] flex items-center gap-1 rounded-xl cursor-pointer shadow-md"
                      >
                        <Send className="w-3 h-3" /> {effectiveStatus === 'Revision Requested' ? 'Resubmit Task' : 'Submit Task'}
                      </Button>
                    )}

                    {/* Action: Mark Completed */}
                    {effectiveStatus !== 'Completed' && effectiveStatus !== 'Cancelled' && (
                      <Button
                        size="sm"
                        onClick={(e) => handleMarkCompleted(task, e)}
                        className="py-1 px-2.5 text-[11px] font-bold bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-[#080808] border border-emerald-500/40 flex items-center gap-1 rounded-xl cursor-pointer"
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
          <div className="py-12 bg-[#151515] rounded-2xl border border-dashed border-[#292929]">
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
            <div className="space-y-4 text-xs text-[#FFFFFF]">
              {/* Task Header info */}
              <div className="p-3 bg-[#101010] rounded-2xl border border-[#292929] space-y-2">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h3 className="font-extrabold text-base text-[#FFFFFF]">{selectedTask.title}</h3>
                    <p className="text-[10px] text-[#8A8A8A] font-semibold mt-0.5">
                      Dept: {selectedTask.assignedToDepartment} • Assigned by {selectedTask.createdByName}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getPriorityBadge(selectedTask.priority)}
                    {getStatusBadge(selectedTask)}
                  </div>
                </div>

                <div className="p-2.5 bg-[#151515] rounded-xl text-[#8A8A8A] text-xs leading-relaxed border border-[#292929]">
                  {selectedTask.description}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-[#8A8A8A]">
                  <div>
                    <span className="text-[#D4AF37] font-bold block">Due Date & Time</span>
                    <span className="font-semibold text-[#FFFFFF]">{selectedTask.dueDate} {selectedTask.dueTime || ''}</span>
                  </div>
                  <div>
                    <span className="text-[#D4AF37] font-bold block">Assigned Date</span>
                    <span className="font-semibold text-[#8A8A8A]">
                      {selectedTask.assignedTime?.substring(0, 10) || selectedTask.createdAtDeviceTime?.substring(0, 10) || 'N/A'}
                    </span>
                  </div>
                  {selectedTask.expectedCompletionTime && (
                    <div>
                      <span className="text-[#D4AF37] font-bold block">Expected Completion</span>
                      <span className="font-semibold text-[#D4AF37]">{selectedTask.expectedCompletionTime}</span>
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
                  <p className="text-xs text-[#FFFFFF] bg-[#101010] p-2 rounded-xl border border-amber-500/30">
                    {selectedTask.revisions?.[selectedTask.revisions.length - 1]?.reason || selectedTask.currentRevisionReason || selectedTask.reviewRemark || 'Please review deliverable specifications and update.'}
                  </p>
                  <div className="space-y-1 pt-1">
                    <label className="font-bold text-amber-400 text-[11px]">Resubmission Note for Reviewer:</label>
                    <input
                      type="text"
                      value={resubmissionNote}
                      onChange={(e) => setResubmissionNote(e.target.value)}
                      placeholder="e.g. Corrected figures and updated report"
                      className="w-full px-3 py-2 rounded-xl border border-[#292929] bg-[#101010] text-[#FFFFFF] text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                    />
                  </div>
                </div>
              )}

              {/* Employee Interactive Progress Slider */}
              <div className="p-3 bg-[#101010] rounded-2xl border border-[#292929] space-y-3">
                <div className="flex justify-between items-center">
                  <label className="font-extrabold text-xs text-[#FFFFFF] uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-[#D4AF37]" /> Completion Percentage
                  </label>
                  <span className="text-sm font-black text-[#D4AF37] bg-[#D4AF37]/20 px-2.5 py-0.5 rounded-full border border-[#D4AF37]/30 font-mono">
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
                  className="w-full accent-[#D4AF37] cursor-pointer"
                />

                <div className="flex justify-between gap-1">
                  {[0, 25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setCompletionInput(pct)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold transition-all border cursor-pointer ${
                        completionInput === pct
                          ? 'bg-[#D4AF37] text-[#080808] border-[#D4AF37] font-black'
                          : 'bg-[#151515] text-[#8A8A8A] border-[#292929]'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Comments Thread */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-xs text-[#8A8A8A] uppercase tracking-wider">
                  Discussion & Notes ({(selectedTask.comments || []).length})
                </h4>

                <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                  {(selectedTask.comments || []).length > 0 ? (
                    selectedTask.comments.map((c) => (
                      <div
                        key={c.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                          c.authorRole === 'ADMIN'
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40'
                            : 'bg-[#101010] border-[#292929]'
                        }`}
                      >
                        <div className="flex justify-between items-center text-[10px] font-bold">
                          <span className={c.authorRole === 'ADMIN' ? 'text-[#D4AF37]' : 'text-emerald-400'}>
                            {c.authorName} ({c.authorRole})
                          </span>
                          <span className="text-[#8A8A8A] font-mono">
                            {new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-[#FFFFFF]">{c.content}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[11px] text-[#8A8A8A] italic text-center py-2">No comments yet.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="Add progress notes or questions..."
                    className="flex-1 px-3 py-2 rounded-xl border border-[#292929] bg-[#101010] text-[#FFFFFF] text-xs focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                  />
                  <Button 
                    type="button" 
                    onClick={handleAddComment} 
                    disabled={!commentInput.trim()}
                    className="px-3 bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808] font-bold cursor-pointer"
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
                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-[#080808] font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" /> {isUpdating ? 'Submitting...' : 'Resubmit Deliverable'}
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={handleSaveTaskProgress}
                      disabled={isUpdating}
                      variant="secondary"
                      className="flex-1 py-3 bg-[#1B1B1B] hover:bg-[#252525] text-[#FFFFFF] border border-[#292929] font-bold rounded-2xl cursor-pointer"
                    >
                      {isUpdating ? 'Saving...' : 'Save Progress'}
                    </Button>
                    <Button
                      onClick={() => handleSubmitTask(selectedTask)}
                      disabled={isUpdating}
                      className="flex-1 py-3 bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808] font-bold rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
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
          <div className="space-y-4 text-xs text-[#FFFFFF]">
            <div className="p-3 bg-[#101010] rounded-2xl border border-[#292929]">
              <h4 className="font-bold text-sm text-[#FFFFFF]">{viewingRevisionsTask.title}</h4>
              <p className="text-[11px] text-[#8A8A8A] mt-0.5">
                Total Revisions: <span className="font-bold text-amber-400">{viewingRevisionsTask.revisions?.length || viewingRevisionsTask.revisionCount || 0}</span>
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {(viewingRevisionsTask.revisions || []).length > 0 ? (
                viewingRevisionsTask.revisions!.map((rev, idx) => (
                  <div key={idx} className="p-3 bg-[#151515] rounded-xl border border-amber-500/30 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-black text-amber-400 text-xs">
                        Revision #{rev.revisionNumber || (idx + 1)}
                      </span>
                      <span className="text-[10px] text-[#8A8A8A]">
                        {new Date(rev.requestedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>

                    <div className="p-2 bg-[#101010] rounded-lg border border-[#292929] text-[#FFFFFF]">
                      <span className="text-[10px] font-bold text-amber-400 block mb-0.5">Requested by {rev.requestedByName}:</span>
                      {rev.reason}
                    </div>

                    {rev.resubmittedAt ? (
                      <div className="p-2 bg-emerald-500/15 rounded-lg border border-emerald-500/30 text-emerald-400 text-[11px]">
                        <span className="font-bold block text-emerald-400">
                          Resubmitted on {new Date(rev.resubmittedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}:
                        </span>
                        {rev.resubmissionNote || 'Resubmitted for review.'}
                      </div>
                    ) : (
                      <div className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Awaiting employee resubmission
                      </div>
                    )}
                  </div>
                ))
              ) : viewingRevisionsTask.reviewRemark ? (
                <div className="p-3 bg-[#151515] rounded-xl border border-amber-500/30 space-y-1">
                  <span className="font-bold text-amber-400">Revision Note:</span>
                  <p className="text-[#FFFFFF]">{viewingRevisionsTask.reviewRemark}</p>
                </div>
              ) : (
                <p className="text-center py-4 text-[#8A8A8A] italic">No revision history recorded for this task.</p>
              )}
            </div>

            <Button
              onClick={() => setViewingRevisionsTask(null)}
              className="w-full py-2.5 bg-[#D4AF37] hover:bg-[#E6C766] text-[#080808] font-bold rounded-xl cursor-pointer"
            >
              Close
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
};
