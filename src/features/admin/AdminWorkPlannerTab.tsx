import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { getDb } from '../../services/firebase/db';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import { 
  TaskRecord, 
  TaskPriority, 
  TaskStatus, 
  TaskRevision, 
  TaskHistoryEvent,
  getCanonicalPriority,
  getNormalizedTaskStatus,
  CanonicalTaskStatus
} from '../../types/planner';
import { createNotification } from '../../services/notification/notificationService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { 
  CheckSquare, 
  Plus, 
  Clock, 
  Search, 
  Filter, 
  AlertTriangle, 
  Users, 
  MessageSquare, 
  Briefcase, 
  Trash2,
  RotateCcw,
  History,
  Edit,
  UserCheck,
  Ban,
  CheckCircle2,
  FileCheck2,
  CalendarCheck,
  Layers,
  Send,
  Calendar,
  X
} from 'lucide-react';

interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  department: string;
  designation?: string;
}

export const AdminWorkPlannerTab: React.FC = () => {
  const { isSuperAdmin, isAdmin } = usePermission();
  const { user: adminUser, role: activeAdminRole } = useAdminAuth();
  
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'DUE_TODAY' | 'OVERDUE' | 'REVISION_REQUESTED' | 'COMPLETED'>('ALL');
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState('ALL');
  const [selectedPriorityFilter, setSelectedPriorityFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');

  // Create / Edit Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('Medium');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDueTime, setTaskDueTime] = useState('18:00');
  const [taskExpectedCompletion, setTaskExpectedCompletion] = useState('');
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('Assigned');

  // Revision Modal State
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionTargetTask, setRevisionTargetTask] = useState<TaskRecord | null>(null);
  const [revisionReasonInput, setRevisionReasonInput] = useState('');
  const [isRequestingRevision, setIsRequestingRevision] = useState(false);

  // History & Audit Modal State
  const [viewHistoryTask, setViewHistoryTask] = useState<TaskRecord | null>(null);

  // Reassign Modal State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignTargetTask, setReassignTargetTask] = useState<TaskRecord | null>(null);
  const [reassignEmployeeCode, setReassignEmployeeCode] = useState('');
  const [isReassigning, setIsReassigning] = useState(false);

  const adminName = activeAdminRole === 'SUPER_ADMIN' ? 'Super Admin' : (adminUser?.displayName || 'Admin');
  const adminId = adminUser?.uid || 'admin_user';

  // Load Tasks and Employees from Firestore
  useEffect(() => {
    let isMounted = true;
    const unsubs: (() => void)[] = [];

    getDb().then((activeDb) => {
      if (!isMounted || !activeDb) {
        setLoading(false);
        return;
      }

      const qTasks = query(collection(activeDb, 'tasks'), orderBy('createdAtDeviceTime', 'desc'));
      unsubs.push(onSnapshot(qTasks, (snap) => {
        if (!isMounted) return;
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRecord));
        setTasks(data);
        setLoading(false);
      }, (err) => {
        console.warn('AdminWorkPlannerTab tasks snapshot error:', err);
        if (isMounted) setLoading(false);
      }));

      unsubs.push(onSnapshot(collection(activeDb, 'registrations'), (snap) => {
        if (!isMounted) return;
        const emps: EmployeeOption[] = [];
        snap.docs.forEach(d => {
          const data = d.data();
          if (data.status === 'Approved' && data.employeeCode) {
            emps.push({
              id: d.id,
              employeeCode: data.employeeCode,
              name: data.name || data.fullName || 'Unnamed Employee',
              department: data.office || data.department || 'Operations',
              designation: data.designation || 'Staff'
            });
          }
        });
        setEmployees(emps);
      }));
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubs.forEach(u => u());
    };
  }, []);

  const resetForm = () => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('Medium');
    setTaskDueDate('');
    setTaskDueTime('18:00');
    setTaskExpectedCompletion('');
    setSelectedEmployeeCode('');
    setTaskStatus('Assigned');
  };

  const handleOpenCreateModal = () => {
    resetForm();
    const d = new Date();
    d.setDate(d.getDate() + 1);
    setTaskDueDate(d.toISOString().split('T')[0]);
    setShowCreateModal(true);
  };

  const handleEditClick = (task: TaskRecord) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTaskPriority(getCanonicalPriority(task.priority));
    setTaskDueDate(task.dueDate || '');
    setTaskDueTime(task.dueTime || '18:00');
    setTaskExpectedCompletion(task.expectedCompletionTime || '');
    setSelectedEmployeeCode(task.assignedToEmployeeCodes[0] || '');
    setTaskStatus(task.status);
    setShowCreateModal(true);
  };

  // 1. SAVE / CREATE / EDIT TASK
  const handleSaveTask = async () => {
    if (!taskTitle.trim() || !taskDescription.trim() || !taskDueDate || !selectedEmployeeCode) return;
    
    setIsSubmitting(true);
    try {
      const activeDb = await getDb();
      const selectedEmp = employees.find(e => e.employeeCode === selectedEmployeeCode);
      if (!selectedEmp) throw new Error("Selected employee not found");

      const nowIso = new Date().toISOString();

      if (editingTaskId) {
        const existing = tasks.find(t => t.id === editingTaskId);
        const historyEntry: TaskHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          action: 'EDITED',
          performedBy: adminId,
          performedByName: adminName,
          timestamp: nowIso,
          details: `Edited task details (Priority: ${taskPriority}, Due: ${taskDueDate})`
        };

        await updateDoc(doc(activeDb, 'tasks', editingTaskId), {
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          priority: taskPriority,
          status: taskStatus,
          dueDate: taskDueDate,
          dueTime: taskDueTime,
          expectedCompletionTime: taskExpectedCompletion.trim() || null,
          assignedToEmployeeIds: [selectedEmp.id],
          assignedToEmployeeCodes: [selectedEmp.employeeCode],
          assignedToDepartment: selectedEmp.department,
          history: [...(existing?.history || []), historyEntry],
          updatedAtDeviceTime: nowIso,
          syncStatus: 'Synced'
        });
      } else {
        const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const historyEntry: TaskHistoryEvent = {
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          action: 'CREATED',
          performedBy: adminId,
          performedByName: adminName,
          timestamp: nowIso,
          details: `Created task and assigned to ${selectedEmp.name} (${selectedEmp.employeeCode})`
        };

        const newTask: TaskRecord = {
          id: taskId,
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          assignmentType: 'EMPLOYEE',
          assignedToEmployeeIds: [selectedEmp.id],
          assignedToEmployeeCodes: [selectedEmp.employeeCode],
          assignedToDepartment: selectedEmp.department,
          
          createdBy: adminId,
          createdByName: adminName,
          
          priority: taskPriority,
          status: 'Assigned',
          approvalStatus: 'NOT_REQUIRED',
          completionPercentage: 0,
          
          dueDate: taskDueDate,
          dueTime: taskDueTime,
          expectedCompletionTime: taskExpectedCompletion.trim() || null,
          
          revisions: [],
          revisionCount: 0,
          history: [historyEntry],
          comments: [],

          createdAtDeviceTime: nowIso,
          updatedAtDeviceTime: nowIso,
          assignedTime: nowIso,
          syncStatus: 'Synced',
        };

        await setDoc(doc(activeDb, 'tasks', taskId), newTask);

        // Send Push Notification to Employee
        await createNotification({
          recipientEmployeeCode: selectedEmp.employeeCode,
          type: 'TASK_ASSIGNED',
          category: 'PLANNER',
          priority: taskPriority === 'Critical' || taskPriority === 'High' ? 'HIGH' : 'NORMAL',
          title: 'New Task Assigned by Admin',
          message: `${adminName} assigned you task "${taskTitle}" (${taskPriority} Priority) due on ${taskDueDate}.`,
          entityId: taskId,
          entityType: 'TASK',
        });
      }

      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      console.error('Error saving task:', err);
      alert('Failed to save task. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. REASSIGN TASK
  const handleOpenReassign = (task: TaskRecord) => {
    setReassignTargetTask(task);
    setReassignEmployeeCode(task.assignedToEmployeeCodes[0] || '');
    setShowReassignModal(true);
  };

  const handleConfirmReassign = async () => {
    if (!reassignTargetTask || !reassignEmployeeCode) return;
    setIsReassigning(true);

    try {
      const newEmp = employees.find(e => e.employeeCode === reassignEmployeeCode);
      if (!newEmp) throw new Error("Employee not found");

      const nowIso = new Date().toISOString();
      const prevEmpCode = reassignTargetTask.assignedToEmployeeCodes[0] || 'Unknown';
      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'REASSIGNED',
        performedBy: adminId,
        performedByName: adminName,
        timestamp: nowIso,
        details: `Reassigned from ${prevEmpCode} to ${newEmp.name} (${newEmp.employeeCode})`
      };

      const activeDb = await getDb();
      await updateDoc(doc(activeDb, 'tasks', reassignTargetTask.id), {
        assignedToEmployeeIds: [newEmp.id],
        assignedToEmployeeCodes: [newEmp.employeeCode],
        assignedToDepartment: newEmp.department,
        history: [...(reassignTargetTask.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Synced'
      });

      // Notification to new employee
      await createNotification({
        recipientEmployeeCode: newEmp.employeeCode,
        type: 'TASK_ASSIGNED',
        category: 'PLANNER',
        priority: 'HIGH',
        title: 'Task Reassigned to You',
        message: `${adminName} reassigned task "${reassignTargetTask.title}" to you. Due date: ${reassignTargetTask.dueDate}.`,
        entityId: reassignTargetTask.id,
        entityType: 'TASK',
      });

      setShowReassignModal(false);
      setReassignTargetTask(null);
    } catch (err) {
      console.error('Error reassigning task:', err);
      alert('Failed to reassign task.');
    } finally {
      setIsReassigning(false);
    }
  };

  // 3. CANCEL TASK
  const handleCancelTask = async (task: TaskRecord) => {
    if (!window.confirm(`Are you sure you want to cancel task "${task.title}"?`)) return;

    try {
      const nowIso = new Date().toISOString();
      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'CANCELLED',
        performedBy: adminId,
        performedByName: adminName,
        timestamp: nowIso,
        details: 'Task cancelled by admin'
      };

      const activeDb = await getDb();
      await updateDoc(doc(activeDb, 'tasks', task.id), {
        status: 'Cancelled',
        history: [...(task.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Synced'
      });
    } catch (err) {
      console.error('Error cancelling task:', err);
      alert('Failed to cancel task.');
    }
  };

  // 4. REQUEST REVISION (Requirement 6)
  const handleOpenRevisionModal = (task: TaskRecord) => {
    setRevisionTargetTask(task);
    setRevisionReasonInput('');
    setShowRevisionModal(true);
  };

  const handleConfirmRevisionRequest = async () => {
    if (!revisionTargetTask || !revisionReasonInput.trim()) return;
    setIsRequestingRevision(true);

    try {
      const activeDb = await getDb();
      const nowIso = new Date().toISOString();
      const currentRevisions = revisionTargetTask.revisions || [];
      const newRevNumber = currentRevisions.length + 1;

      const newRevision: TaskRevision = {
        revisionNumber: newRevNumber,
        reason: revisionReasonInput.trim(),
        requestedBy: adminId,
        requestedByName: adminName,
        requestedAt: nowIso,
      };

      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'REVISION_REQUESTED',
        performedBy: adminId,
        performedByName: adminName,
        timestamp: nowIso,
        details: `Revision #${newRevNumber} requested: "${revisionReasonInput.trim()}"`
      };

      await updateDoc(doc(activeDb, 'tasks', revisionTargetTask.id), {
        status: 'Revision Requested',
        approvalStatus: 'REVISION_REQUIRED',
        revisionCount: newRevNumber,
        currentRevisionReason: revisionReasonInput.trim(),
        revisions: [...currentRevisions, newRevision],
        history: [...(revisionTargetTask.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Synced'
      });

      // Notification to assigned employees
      for (const empCode of revisionTargetTask.assignedToEmployeeCodes) {
        await createNotification({
          recipientEmployeeCode: empCode,
          type: 'TASK_REVISION_REQUESTED',
          category: 'PLANNER',
          priority: 'URGENT',
          title: 'Revision Requested on Task',
          message: `${adminName} requested revision #${newRevNumber} on "${revisionTargetTask.title}": "${revisionReasonInput.trim()}"`,
          entityId: revisionTargetTask.id,
          entityType: 'TASK',
        });
      }

      setShowRevisionModal(false);
      setRevisionTargetTask(null);
    } catch (err) {
      console.error('Error requesting revision:', err);
      alert('Failed to request revision.');
    } finally {
      setIsRequestingRevision(false);
    }
  };

  // 5. APPROVE / MARK COMPLETED DIRECTLY
  const handleApproveCompleted = async (task: TaskRecord) => {
    try {
      const nowIso = new Date().toISOString();
      const historyEntry: TaskHistoryEvent = {
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        action: 'COMPLETED',
        performedBy: adminId,
        performedByName: adminName,
        timestamp: nowIso,
        details: 'Approved and marked 100% completed by admin'
      };

      const activeDb = await getDb();
      await updateDoc(doc(activeDb, 'tasks', task.id), {
        status: 'Completed',
        approvalStatus: 'APPROVED',
        completionPercentage: 100,
        completedAt: task.completedAt || nowIso,
        completedBy: adminName,
        approvedBy: adminId,
        approvedByName: adminName,
        approvedAtDeviceTime: nowIso,
        history: [...(task.history || []), historyEntry],
        updatedAtDeviceTime: nowIso,
        syncStatus: 'Synced'
      });
    } catch (err) {
      console.error('Error approving task:', err);
      alert('Failed to approve task.');
    }
  };

  // 6. DELETE TASK (Super Admin)
  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this task?")) return;
    try {
      const activeDb = await getDb();
      await deleteDoc(doc(activeDb, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
      alert('Failed to delete task. You might not have permission.');
    }
  };

  // Priority badge renderer
  const getPriorityBadge = (priority: TaskPriority | string) => {
    const canon = getCanonicalPriority(priority);
    switch (canon) {
      case 'Critical':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase">
            Critical
          </span>
        );
      case 'High':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
            High
          </span>
        );
      case 'Medium':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/40 uppercase">
            Medium
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase">
            Low
          </span>
        );
    }
  };

  // Status badge renderer
  const getStatusBadge = (task: TaskRecord) => {
    const status = getNormalizedTaskStatus(task);
    switch (status) {
      case 'Completed':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'Revision Requested':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/25 text-amber-200 border border-amber-500/40 flex items-center gap-1 animate-pulse">
            <RotateCcw className="w-3 h-3 text-amber-300" /> Revision Requested
          </span>
        );
      case 'Submitted':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
            <FileCheck2 className="w-3 h-3" /> Submitted
          </span>
        );
      case 'Overdue':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Overdue
          </span>
        );
      case 'In Progress':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
            <Clock className="w-3 h-3" /> In Progress
          </span>
        );
      case 'Cancelled':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-gray-500/20 text-gray-300 border border-gray-500/30">
            Cancelled
          </span>
        );
      case 'Assigned':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Assigned
          </span>
        );
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];

  // Filtered tasks calculation
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const normStatus = getNormalizedTaskStatus(t);
      const canonPriority = getCanonicalPriority(t.priority);
      const due = t.dueDate ? t.dueDate.substring(0, 10) : '';

      // Quick filter
      if (quickFilter === 'DUE_TODAY' && due !== todayStr) return false;
      if (quickFilter === 'OVERDUE' && normStatus !== 'Overdue') return false;
      if (quickFilter === 'REVISION_REQUESTED' && normStatus !== 'Revision Requested') return false;
      if (quickFilter === 'COMPLETED' && normStatus !== 'Completed') return false;

      // Employee Filter
      if (selectedEmployeeFilter !== 'ALL') {
        if (!t.assignedToEmployeeCodes.includes(selectedEmployeeFilter)) return false;
      }

      // Priority Filter
      if (selectedPriorityFilter !== 'ALL') {
        if (canonPriority !== selectedPriorityFilter) return false;
      }

      // Status Filter
      if (selectedStatusFilter !== 'ALL') {
        if (normStatus !== selectedStatusFilter) return false;
      }

      // Search Filter
      if (searchTerm) {
        const lSearch = searchTerm.toLowerCase();
        const titleMatch = t.title.toLowerCase().includes(lSearch);
        const descMatch = (t.description || '').toLowerCase().includes(lSearch);
        const empMatch = t.assignedToEmployeeCodes.some(c => c.toLowerCase().includes(lSearch));
        if (!titleMatch && !descMatch && !empMatch) return false;
      }

      return true;
    });
  }, [tasks, quickFilter, selectedEmployeeFilter, selectedPriorityFilter, selectedStatusFilter, searchTerm, todayStr]);

  // Overall metric counts
  const metrics = useMemo(() => {
    let overdue = 0;
    let revisions = 0;
    let completed = 0;
    let dueToday = 0;

    tasks.forEach(t => {
      const s = getNormalizedTaskStatus(t);
      const due = t.dueDate ? t.dueDate.substring(0, 10) : '';
      if (s === 'Overdue') overdue++;
      if (s === 'Revision Requested') revisions++;
      if (s === 'Completed') completed++;
      if (due === todayStr && s !== 'Completed' && s !== 'Cancelled') dueToday++;
    });

    return { total: tasks.length, overdue, revisions, completed, dueToday };
  }, [tasks, todayStr]);

  return (
    <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-purple-400" /> Enterprise Work Planner
          </h3>
          <p className="text-xs text-purple-300 mt-1">
            Assign, schedule, audit, and track operational deliverables across all enterprise teams.
          </p>
        </div>
        <Button 
          onClick={handleOpenCreateModal}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold whitespace-nowrap rounded-xl shadow-lg"
        >
          <Plus className="w-4 h-4 mr-2" /> Assign New Task
        </Button>
      </div>

      {/* Metric Quick-Action Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <button
          onClick={() => setQuickFilter('ALL')}
          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
            quickFilter === 'ALL'
              ? 'bg-[#7C3AED] border-purple-400 text-white shadow-md scale-[1.02]'
              : 'bg-[#1A0B36] border-purple-500/20 text-purple-200 hover:glass-card'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider">Total Tasks</span>
          <span className="text-xl font-black mt-1 font-mono">{metrics.total}</span>
        </button>

        <button
          onClick={() => setQuickFilter('DUE_TODAY')}
          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
            quickFilter === 'DUE_TODAY'
              ? 'bg-[#7C3AED] border-purple-400 text-white shadow-md scale-[1.02]'
              : 'bg-[#1A0B36] border-purple-500/20 text-purple-200 hover:glass-card'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-300">Due Today</span>
          <span className="text-xl font-black mt-1 font-mono text-blue-300">{metrics.dueToday}</span>
        </button>

        <button
          onClick={() => setQuickFilter('OVERDUE')}
          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
            quickFilter === 'OVERDUE'
              ? 'bg-rose-700 border-rose-400 text-white shadow-md scale-[1.02]'
              : 'bg-[#1A0B36] border-rose-500/30 text-rose-300 hover:bg-rose-950/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-300">Overdue</span>
          <span className="text-xl font-black mt-1 font-mono text-rose-300">{metrics.overdue}</span>
        </button>

        <button
          onClick={() => setQuickFilter('REVISION_REQUESTED')}
          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
            quickFilter === 'REVISION_REQUESTED'
              ? 'bg-amber-600 border-amber-300 text-white shadow-md scale-[1.02]'
              : 'bg-[#1A0B36] border-amber-500/30 text-amber-300 hover:bg-amber-950/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">Revisions</span>
          <span className="text-xl font-black mt-1 font-mono text-amber-300">{metrics.revisions}</span>
        </button>

        <button
          onClick={() => setQuickFilter('COMPLETED')}
          className={`p-3 rounded-2xl border flex flex-col items-center justify-center transition-all ${
            quickFilter === 'COMPLETED'
              ? 'bg-emerald-700 border-emerald-400 text-white shadow-md scale-[1.02]'
              : 'bg-[#1A0B36] border-emerald-500/30 text-emerald-300 hover:bg-emerald-950/40'
          }`}
        >
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300">Completed</span>
          <span className="text-xl font-black mt-1 font-mono text-emerald-300">{metrics.completed}</span>
        </button>
      </div>

      {/* Toolbar Filters (Requirement 4: Employee, Priority, Status, Search) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-[#1A0B36] p-3 rounded-2xl border border-purple-500/20">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-purple-400" />
          <input
            type="text"
            placeholder="Search task, code, description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#250F4C] border border-purple-500/30 rounded-xl text-xs text-white placeholder-purple-300/50"
          />
        </div>

        <div>
          <select
            value={selectedEmployeeFilter}
            onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
            className="w-full px-3 py-2 bg-[#250F4C] border border-purple-500/30 rounded-xl text-xs text-white"
          >
            <option value="ALL">All Employees</option>
            {employees.map(e => (
              <option key={e.employeeCode} value={e.employeeCode}>
                {e.name} ({e.employeeCode})
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedPriorityFilter}
            onChange={(e) => setSelectedPriorityFilter(e.target.value)}
            className="w-full px-3 py-2 bg-[#250F4C] border border-purple-500/30 rounded-xl text-xs text-white"
          >
            <option value="ALL">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>

        <div>
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="w-full px-3 py-2 bg-[#250F4C] border border-purple-500/30 rounded-xl text-xs text-white"
          >
            <option value="ALL">All Statuses</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Submitted">Submitted</option>
            <option value="Completed">Completed</option>
            <option value="Revision Requested">Revision Requested</option>
            <option value="Overdue">Overdue</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Task List Grid */}
      {loading ? (
        <div className="text-center py-12 text-purple-300">
          <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
          Loading enterprise deliverables...
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-12 bg-[#1A0B36] rounded-2xl border border-dashed border-purple-500/20">
          <EmptyState
            icon={CheckSquare}
            title="No tasks match criteria"
            description="No tasks found matching your active filter criteria."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map(t => {
            const effectiveStatus = getNormalizedTaskStatus(t);
            const revisionsCount = t.revisions?.length || t.revisionCount || 0;

            return (
              <div 
                key={t.id} 
                className={`p-4 bg-[#1A0B36] rounded-2xl border transition-all space-y-3 flex flex-col justify-between ${
                  effectiveStatus === 'Revision Requested'
                    ? 'border-amber-500/50 hover:border-amber-400'
                    : effectiveStatus === 'Overdue'
                    ? 'border-rose-500/50 hover:border-rose-400'
                    : effectiveStatus === 'Completed'
                    ? 'border-emerald-500/30'
                    : 'border-purple-500/20 hover:border-purple-500/40'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-bold text-white text-sm leading-snug">{t.title}</h4>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {getPriorityBadge(t.priority)}
                      {getStatusBadge(t)}
                    </div>
                  </div>
                  
                  <p className="text-xs text-purple-200/90 line-clamp-2 bg-[#250F4C]/60 p-2 rounded-xl border border-purple-500/10">
                    {t.description}
                  </p>

                  <div className="text-[11px] space-y-1 text-purple-300/80 pt-1">
                    <div className="flex justify-between">
                      <span>Assigned to:</span>
                      <span className="font-bold text-purple-100">{t.assignedToEmployeeCodes.join(', ')} ({t.assignedToDepartment})</span>
                    </div>

                    <div className="flex justify-between">
                      <span>Due Date:</span>
                      <span className="font-bold text-amber-300">{t.dueDate} {t.dueTime ? `@ ${t.dueTime}` : ''}</span>
                    </div>

                    {t.expectedCompletionTime && (
                      <div className="flex justify-between">
                        <span>Expected:</span>
                        <span className="font-bold text-indigo-300">{t.expectedCompletionTime}</span>
                      </div>
                    )}

                    {t.completedAt && (
                      <div className="flex justify-between">
                        <span>Completed:</span>
                        <span className="font-bold text-emerald-300">
                          {new Date(t.completedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    {revisionsCount > 0 && (
                      <div className="flex justify-between text-amber-300 font-bold">
                        <span>Revision Count:</span>
                        <span>{revisionsCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-[10px] font-bold text-purple-300">
                      <span>Progress</span>
                      <span className="text-white">{t.completionPercentage || 0}%</span>
                    </div>
                    <div className="w-full bg-[#250F4C] h-1.5 rounded-full overflow-hidden border border-purple-500/20">
                      <div 
                        className={`h-full ${
                          effectiveStatus === 'Completed' ? 'bg-emerald-400' :
                          effectiveStatus === 'Overdue' ? 'bg-rose-500' :
                          effectiveStatus === 'Revision Requested' ? 'bg-amber-400' : 'bg-[#7C3AED]'
                        }`}
                        style={{ width: `${t.completionPercentage || 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Admin Actions Bar (Requirement 4: Edit, Reassign, Cancel, Request Revision, View History) */}
                <div className="pt-3 border-t border-purple-500/20 flex items-center justify-between gap-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {/* View History */}
                    <button
                      onClick={() => setViewHistoryTask(t)}
                      className="p-1.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 rounded-lg transition-colors text-[10px] font-bold flex items-center gap-1"
                      title="View Task Audit History"
                    >
                      <History className="w-3.5 h-3.5" /> History
                    </button>

                    {/* Request Revision */}
                    {effectiveStatus !== 'Cancelled' && (
                      <button
                        onClick={() => handleOpenRevisionModal(t)}
                        className="p-1.5 bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 rounded-lg transition-colors text-[10px] font-bold flex items-center gap-1"
                        title="Request Revision"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Revision
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Approve / Mark Completed */}
                    {effectiveStatus === 'Submitted' && (
                      <button
                        onClick={() => handleApproveCompleted(t)}
                        className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 rounded-lg transition-colors text-[10px] font-bold flex items-center gap-1"
                        title="Approve deliverable"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                      </button>
                    )}

                    {/* Reassign */}
                    {effectiveStatus !== 'Completed' && effectiveStatus !== 'Cancelled' && (
                      <button
                        onClick={() => handleOpenReassign(t)}
                        className="p-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 rounded-lg transition-colors text-[10px] font-bold flex items-center gap-1"
                        title="Reassign Task"
                      >
                        <UserCheck className="w-3.5 h-3.5" /> Reassign
                      </button>
                    )}

                    {/* Edit */}
                    <button 
                      onClick={() => handleEditClick(t)}
                      className="p-1.5 bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 rounded-lg transition-colors"
                      title="Edit Task"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    {/* Cancel Task */}
                    {effectiveStatus !== 'Cancelled' && effectiveStatus !== 'Completed' && (
                      <button
                        onClick={() => handleCancelTask(t)}
                        className="p-1.5 bg-gray-500/20 hover:bg-gray-500/40 text-gray-300 rounded-lg transition-colors"
                        title="Cancel Task"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Delete Task (Super Admin) */}
                    {isSuperAdmin() && (
                      <button 
                        onClick={() => handleDeleteTask(t.id)}
                        className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition-colors"
                        title="Delete Task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT TASK MODAL */}
      <Dialog 
        isOpen={showCreateModal} 
        onClose={() => { setShowCreateModal(false); resetForm(); }} 
        title={editingTaskId ? 'Edit Operational Task' : 'Assign New Operational Task'}
      >
        <div className="space-y-4 pt-2 text-xs">
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-300">Assign To Employee *</label>
            <select
              value={selectedEmployeeCode}
              onChange={(e) => setSelectedEmployeeCode(e.target.value)}
              className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
            >
              <option value="">-- Select Active Employee --</option>
              {employees.map(e => (
                <option key={e.employeeCode} value={e.employeeCode}>
                  {e.name} ({e.employeeCode}) • {e.department}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-300">Task Title *</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Q3 Financial Statement & Reconciliation"
              className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-300">Description & Deliverable Guidelines *</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Detailed instructions, scope, expectations..."
              className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Priority *</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white font-bold"
              >
                <option value="Critical">Critical (P1)</option>
                <option value="High">High (P2)</option>
                <option value="Medium">Medium (P3)</option>
                <option value="Low">Low (P4)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Expected Completion</label>
              <input
                type="text"
                value={taskExpectedCompletion}
                onChange={(e) => setTaskExpectedCompletion(e.target.value)}
                placeholder="e.g. 4 hours / 17:00"
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Due Date *</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Due Time</label>
              <input
                type="time"
                value={taskDueTime}
                onChange={(e) => setTaskDueTime(e.target.value)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          {editingTaskId && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Manual Status Override</label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
              >
                <option value="Assigned">Assigned</option>
                <option value="In Progress">In Progress</option>
                <option value="Submitted">Submitted</option>
                <option value="Completed">Completed</option>
                <option value="Revision Requested">Revision Requested</option>
                <option value="Overdue">Overdue</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          )}

          <div className="pt-4 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => { setShowCreateModal(false); resetForm(); }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTask}
              disabled={isSubmitting || !taskTitle.trim() || !taskDescription.trim() || !taskDueDate || !selectedEmployeeCode}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl"
            >
              {isSubmitting ? 'Saving...' : editingTaskId ? 'Save Changes' : 'Assign Task'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* REQUEST REVISION MODAL (Requirement 6) */}
      <Dialog
        isOpen={showRevisionModal}
        onClose={() => { setShowRevisionModal(false); setRevisionTargetTask(null); }}
        title="Request Deliverable Revision"
      >
        {revisionTargetTask && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="p-3 bg-[#1A0B36] rounded-xl border border-purple-500/30">
              <h4 className="font-bold text-white text-sm">{revisionTargetTask.title}</h4>
              <p className="text-purple-300 text-[11px] mt-0.5">
                Assigned to: <span className="text-white font-bold">{revisionTargetTask.assignedToEmployeeCodes.join(', ')}</span>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-amber-300">Revision Reason & Specific Instructions *</label>
              <textarea
                value={revisionReasonInput}
                onChange={(e) => setRevisionReasonInput(e.target.value)}
                placeholder="Explain clearly what corrections or deliverables need to be revised..."
                className="w-full px-3 py-2.5 bg-[#1A0B36] border border-amber-500/40 rounded-xl text-xs text-white min-h-[90px] focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
              * This will transition the task status to <span className="font-bold text-white">Revision Requested</span>, increment the revision counter, record an audit event, and send an alert notification to the employee.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => { setShowRevisionModal(false); setRevisionTargetTask(null); }}
                disabled={isRequestingRevision}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmRevisionRequest}
                disabled={isRequestingRevision || !revisionReasonInput.trim()}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center gap-1.5"
              >
                <RotateCcw className="w-4 h-4" /> {isRequestingRevision ? 'Requesting...' : 'Submit Revision Request'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* REASSIGN TASK MODAL */}
      <Dialog
        isOpen={showReassignModal}
        onClose={() => { setShowReassignModal(false); setReassignTargetTask(null); }}
        title="Reassign Task Ownership"
      >
        {reassignTargetTask && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="p-3 bg-[#1A0B36] rounded-xl border border-purple-500/30">
              <h4 className="font-bold text-white text-sm">{reassignTargetTask.title}</h4>
              <p className="text-purple-300 text-[11px] mt-0.5">
                Current Assignee: <span className="text-amber-300 font-bold">{reassignTargetTask.assignedToEmployeeCodes.join(', ')}</span>
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Select New Assignee *</label>
              <select
                value={reassignEmployeeCode}
                onChange={(e) => setReassignEmployeeCode(e.target.value)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
              >
                <option value="">-- Select New Employee --</option>
                {employees.map(e => (
                  <option key={e.employeeCode} value={e.employeeCode}>
                    {e.name} ({e.employeeCode}) • {e.department}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => { setShowReassignModal(false); setReassignTargetTask(null); }}
                disabled={isReassigning}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmReassign}
                disabled={isReassigning || !reassignEmployeeCode}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl"
              >
                {isReassigning ? 'Reassigning...' : 'Confirm Reassignment'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* TASK HISTORY & AUDIT LOG MODAL (Requirement 4) */}
      <Dialog
        isOpen={!!viewHistoryTask}
        onClose={() => setViewHistoryTask(null)}
        title="Task Audit Log & Lifecycle History"
      >
        {viewHistoryTask && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#1A0B36] rounded-2xl border border-purple-500/30 space-y-1">
              <div className="flex justify-between items-start">
                <h4 className="font-bold text-white text-sm">{viewHistoryTask.title}</h4>
                {getStatusBadge(viewHistoryTask)}
              </div>
              <p className="text-[11px] text-purple-300">
                Created: {new Date(viewHistoryTask.createdAtDeviceTime).toLocaleString()} by {viewHistoryTask.createdByName}
              </p>
            </div>

            {/* Audit Event Timeline */}
            <div className="space-y-2">
              <h5 className="font-bold text-xs text-purple-200 uppercase tracking-wider flex items-center gap-1">
                <History className="w-3.5 h-3.5 text-purple-400" /> Event Timeline
              </h5>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {(viewHistoryTask.history || []).length > 0 ? (
                  viewHistoryTask.history!.map((evt, idx) => (
                    <div key={idx} className="p-2.5 bg-[#250F4C] rounded-xl border border-purple-500/20 text-[11px] space-y-0.5">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-purple-300 font-mono text-[10px]">{evt.action}</span>
                        <span className="text-purple-400 font-mono text-[10px]">
                          {new Date(evt.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-white font-medium">{evt.details || evt.action}</p>
                      <p className="text-[10px] text-purple-300/70">Performed by: {evt.performedByName} ({evt.performedBy})</p>
                    </div>
                  ))
                ) : (
                  <p className="text-purple-300 italic text-center py-2">No lifecycle events recorded.</p>
                )}
              </div>
            </div>

            {/* Revisions History Block */}
            <div className="space-y-2">
              <h5 className="font-bold text-xs text-amber-300 uppercase tracking-wider flex items-center gap-1">
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Revision Log ({viewHistoryTask.revisions?.length || 0})
              </h5>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {(viewHistoryTask.revisions || []).length > 0 ? (
                  viewHistoryTask.revisions!.map((rev, idx) => (
                    <div key={idx} className="p-2.5 bg-amber-950/30 rounded-xl border border-amber-500/30 text-[11px] space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-amber-300">Revision #{rev.revisionNumber}</span>
                        <span className="text-[10px] text-purple-300">
                          {new Date(rev.requestedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="text-amber-100 italic">"{rev.reason}"</p>
                      <p className="text-[10px] text-purple-300">Requested by: {rev.requestedByName}</p>
                      {rev.resubmittedAt && (
                        <p className="text-[10px] text-emerald-300 font-bold">
                          Resubmitted on {new Date(rev.resubmittedAt).toLocaleString()}: {rev.resubmissionNote}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-purple-300 italic text-center py-1">No revisions requested on this task.</p>
                )}
              </div>
            </div>

            <Button
              onClick={() => setViewHistoryTask(null)}
              className="w-full bg-[#7C3AED] hover:bg-[#6D28D9] font-bold rounded-xl"
            >
              Close History Log
            </Button>
          </div>
        )}
      </Dialog>
    </Card>
  );
};
