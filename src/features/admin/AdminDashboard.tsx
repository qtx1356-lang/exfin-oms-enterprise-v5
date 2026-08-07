import React, { useEffect, useState } from 'react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { db } from '../../services/firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { LogOut, Search, CheckCircle, XCircle, Clock, Smartphone, User, Phone, Calendar, Wifi, WifiOff, Shield, RefreshCw, Wallet, Paperclip, IndianRupee, Briefcase, Plus, Users, Building2, Sliders, Filter, CheckSquare, Sparkles, Layers, AlertTriangle, Edit3, MessageSquare, Send } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { useNavigate } from 'react-router-dom';
import { AttendanceRecord } from '../../types/attendance';
import { getStoredAttendanceRecords } from '../../services/attendance/attendanceStorage';
import { ExpenseRecord } from '../../types/expense';
import { getStoredExpenseRecords } from '../../services/expenses/expenseStorage';
import { TaskRecord, TaskPriority, TaskStatus, AssignmentType, TaskComment, getEffectiveTaskStatus } from '../../types/planner';
import { getStoredTasks, saveTaskRecord } from '../../services/planner/taskStorage';
import { EfficiencyDashboard } from '../efficiency/EfficiencyDashboard';

type Registration = {
  id: string;
  employeeCode: string;
  name: string;
  mobileNumber: string;
  deviceId: string;
  deviceModel: string;
  androidVersion: string;
  appVersion: string;
  selfieUrl: string;
  registrationDate: string;
  status: string;
  rejectionReason?: string;
  office: string;
  isTeamLeader?: boolean;
  teamLeaderId?: string | null;
  teamLeaderCode?: string | null;
  teamLeaderName?: string | null;
};

export const AdminDashboard: React.FC = () => {
  const { logout } = useAdminAuth();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'registrations' | 'attendance' | 'expenses' | 'planner' | 'efficiency'>('attendance');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [expenseRecords, setExpenseRecords] = useState<ExpenseRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReg, setSelectedReg] = useState<Registration | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<AttendanceRecord | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);

  const [rejectionReason, setRejectionReason] = useState('');
  const [expenseRejectReason, setExpenseRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showExpenseRejectDialog, setShowExpenseRejectDialog] = useState(false);
  const [previewReceiptUrl, setPreviewReceiptUrl] = useState<string | null>(null);

  // Admin Task Planner States
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [taskFilterDept, setTaskFilterDept] = useState<string>('All');
  const [taskFilterPriority, setTaskFilterPriority] = useState<string>('All');
  const [taskFilterStatus, setTaskFilterStatus] = useState<string>('All');
  const [adminRemarkInput, setAdminRemarkInput] = useState<string>('');

  // Form fields for Create / Edit Task
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskDept, setTaskDept] = useState('Operations');
  const [taskAssignmentType, setTaskAssignmentType] = useState<AssignmentType>('EMPLOYEE');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskStartDate, setTaskStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskDueDate, setTaskDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [taskDueTime, setTaskDueTime] = useState('18:00');
  const [taskManagerRemarks, setTaskManagerRemarks] = useState('');

  useEffect(() => {
    if (!db) return;

    // Listen to registrations
    const qRegs = query(collection(db, 'registrations'), orderBy('registrationDate', 'desc'));
    const unsubRegs = onSnapshot(qRegs, (snapshot) => {
      const regs: Registration[] = [];
      snapshot.forEach((doc) => {
        regs.push({ id: doc.id, ...doc.data() } as Registration);
      });
      setRegistrations(regs);
    }, (err) => {
      console.warn('Error fetching registrations:', err);
    });

    // Listen to synced attendance records from Firestore
    const qAttendance = query(collection(db, 'attendance'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubAttendance = onSnapshot(qAttendance, (snapshot) => {
      const firestoreAtt: AttendanceRecord[] = [];
      snapshot.forEach((doc) => {
        firestoreAtt.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
      });

      // Merge local un-synced records with firestore records
      const localRecords = getStoredAttendanceRecords();
      const mergedMap = new Map<string, AttendanceRecord>();

      firestoreAtt.forEach((rec) => mergedMap.set(rec.id, rec));
      localRecords.forEach((rec) => {
        if (!mergedMap.has(rec.id)) {
          mergedMap.set(rec.id, rec);
        }
      });

      const combined = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
      );
      setAttendanceRecords(combined);
    }, (err) => {
      console.warn('Error fetching attendance from firestore, loading local fallback:', err);
      setAttendanceRecords(getStoredAttendanceRecords());
    });

    // Listen to expense claims from Firestore
    const qExpenses = query(collection(db, 'expenses'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubExpenses = onSnapshot(qExpenses, (snapshot) => {
      const firestoreExp: ExpenseRecord[] = [];
      snapshot.forEach((doc) => {
        firestoreExp.push({ id: doc.id, ...doc.data() } as ExpenseRecord);
      });

      const localExpenses = getStoredExpenseRecords();
      const mergedMap = new Map<string, ExpenseRecord>();

      firestoreExp.forEach((rec) => mergedMap.set(rec.id, rec));
      localExpenses.forEach((rec) => {
        if (!mergedMap.has(rec.id)) {
          mergedMap.set(rec.id, rec);
        }
      });

      const combinedExp = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
      );
      setExpenseRecords(combinedExp);
    }, (err) => {
      console.warn('Error fetching expenses from firestore, loading local fallback:', err);
      setExpenseRecords(getStoredExpenseRecords());
    });

    // Listen to tasks from Firestore
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const firestoreTasks: TaskRecord[] = [];
      snapshot.forEach((docSnap) => {
        firestoreTasks.push({ id: docSnap.id, ...docSnap.data() } as TaskRecord);
      });

      const localTasks = getStoredTasks();
      const mergedMap = new Map<string, TaskRecord>();

      firestoreTasks.forEach((rec) => mergedMap.set(rec.id, rec));
      localTasks.forEach((rec) => {
        if (!mergedMap.has(rec.id)) {
          mergedMap.set(rec.id, rec);
        }
      });

      const combinedTasks = Array.from(mergedMap.values()).sort(
        (a, b) => new Date(b.createdAtDeviceTime).getTime() - new Date(a.createdAtDeviceTime).getTime()
      );
      setTasks(combinedTasks);
    }, (err) => {
      console.warn('Error fetching tasks from firestore, loading local fallback:', err);
      setTasks(getStoredTasks());
    });

    return () => {
      unsubRegs();
      unsubAttendance();
      unsubExpenses();
      unsubTasks();
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/admin/login');
  };

  const handleApprove = async (id: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'registrations', id), {
      status: 'Approved',
      rejectionReason: null
    });
    setSelectedReg(null);
  };

  const handleToggleTeamLeader = async (reg: Registration, isTL: boolean) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'registrations', reg.id), {
        isTeamLeader: isTL
      });
      if (selectedReg && selectedReg.id === reg.id) {
        setSelectedReg({ ...selectedReg, isTeamLeader: isTL });
      }
    } catch (err) {
      console.error('Error updating Team Leader status:', err);
    }
  };

  const handleAssignTeamLeader = async (reg: Registration, tlCode: string) => {
    if (!db) return;
    try {
      const targetTL = registrations.find((r) => r.employeeCode === tlCode);
      const updates = tlCode ? {
        teamLeaderId: targetTL ? targetTL.id : null,
        teamLeaderCode: tlCode,
        teamLeaderName: targetTL ? targetTL.name : null,
      } : {
        teamLeaderId: null,
        teamLeaderCode: null,
        teamLeaderName: null,
      };

      await updateDoc(doc(db, 'registrations', reg.id), updates);
      if (selectedReg && selectedReg.id === reg.id) {
        setSelectedReg({ ...selectedReg, ...updates });
      }
    } catch (err) {
      console.error('Error assigning Team Leader:', err);
    }
  };

  const handleReject = async (id: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'registrations', id), {
      status: 'Rejected',
      rejectionReason: rejectionReason || 'Rejected by administrator'
    });
    setShowRejectDialog(false);
    setSelectedReg(null);
    setRejectionReason('');
  };

  const handleApproveExpense = async (exp: ExpenseRecord) => {
    if (!db) return;
    try {
      await updateDoc(doc(db, 'expenses', exp.id), {
        status: 'Approved',
        rejectionReason: null,
      });

      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: exp.employeeCode || exp.employeeId,
        type: 'EXPENSE_APPROVED',
        title: 'Expense Claim Approved',
        message: `Your claim of ₹${exp.amount.toLocaleString('en-IN')} for ${exp.category} (${exp.date}) has been approved.`,
        createdAt: new Date().toISOString(),
        read: false,
      });
    } catch (err) {
      console.error('Error approving expense:', err);
    }
    setSelectedExpense(null);
  };

  const handleRejectExpense = async (exp: ExpenseRecord) => {
    if (!db) return;
    const reason = expenseRejectReason.trim() || 'Rejected by administrator';

    try {
      await updateDoc(doc(db, 'expenses', exp.id), {
        status: 'Rejected',
        rejectionReason: reason,
      });

      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        employeeCode: exp.employeeCode || exp.employeeId,
        type: 'EXPENSE_REJECTED',
        title: 'Expense Claim Rejected',
        message: `Your claim of ₹${exp.amount.toLocaleString('en-IN')} for ${exp.category} was rejected. Reason: ${reason}`,
        createdAt: new Date().toISOString(),
        read: false,
      });
    } catch (err) {
      console.error('Error rejecting expense:', err);
    }

    setShowExpenseRejectDialog(false);
    setSelectedExpense(null);
    setExpenseRejectReason('');
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !taskDescription.trim() || !taskDueDate) return;

    const nowIso = new Date().toISOString();
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build assignee arrays
    let assignedIds: string[] = [];
    let assignedCodes: string[] = [];

    if (taskAssignmentType === 'DEPARTMENT') {
      // Find all employees registered in this department
      const deptRegs = registrations.filter(r => r.status === 'Approved' && (r.office === taskDept || true));
      assignedIds = deptRegs.map(r => r.id);
      assignedCodes = deptRegs.map(r => r.employeeCode);
    } else {
      assignedIds = selectedEmployeeIds;
      assignedCodes = registrations
        .filter(r => selectedEmployeeIds.includes(r.id) || selectedEmployeeIds.includes(r.employeeCode))
        .map(r => r.employeeCode);
    }

    const newTask: TaskRecord = {
      id: taskId,
      title: taskTitle.trim(),
      description: taskDescription.trim(),
      assignmentType: taskAssignmentType,
      assignedToEmployeeIds: assignedIds,
      assignedToEmployeeCodes: assignedCodes,
      assignedToDepartment: taskDept,
      createdBy: 'ADMIN',
      createdByName: 'Admin Manager',
      priority: taskPriority,
      status: 'PENDING',
      completionPercentage: 0,
      startDate: taskStartDate,
      dueDate: taskDueDate,
      dueTime: taskDueTime,
      createdAtDeviceTime: nowIso,
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
      comments: [],
      managerRemarks: taskManagerRemarks.trim() || null,
      assignedTime: nowIso,
    };

    // Save locally
    saveTaskRecord(newTask);

    // Save to Firestore
    if (db) {
      try {
        await setDoc(doc(db, 'tasks', taskId), newTask);

        // Send notifications
        for (const empCode of assignedCodes) {
          const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            employeeCode: empCode,
            type: 'TASK_ASSIGNED',
            title: 'New Task Assigned',
            message: `You have been assigned task "${taskTitle}" (${taskPriority} Priority) due on ${taskDueDate}.`,
            createdAt: nowIso,
            read: false,
          });
        }
      } catch (err) {
        console.error('Error creating task in Firestore:', err);
      }
    }

    // Reset Form
    setTaskTitle('');
    setTaskDescription('');
    setSelectedEmployeeIds([]);
    setTaskManagerRemarks('');
    setShowCreateTaskDialog(false);
  };

  const handleSaveManagerRemark = async () => {
    if (!selectedTask || !db) return;
    const nowIso = new Date().toISOString();

    const updatedComments = [...(selectedTask.comments || [])];
    if (adminRemarkInput.trim()) {
      updatedComments.push({
        id: `comment_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        authorId: 'ADMIN',
        authorName: 'Admin Manager',
        authorRole: 'ADMIN',
        content: adminRemarkInput.trim(),
        timestamp: nowIso,
      });
    }

    const updatedTask: TaskRecord = {
      ...selectedTask,
      managerRemarks: taskManagerRemarks.trim() || selectedTask.managerRemarks,
      comments: updatedComments,
      updatedAtDeviceTime: nowIso,
      syncStatus: 'Synced',
    };

    saveTaskRecord(updatedTask);

    try {
      await updateDoc(doc(db, 'tasks', selectedTask.id), {
        managerRemarks: updatedTask.managerRemarks,
        comments: updatedTask.comments,
        updatedAtDeviceTime: nowIso,
      });

      // Send notifications to assigned employees
      for (const empCode of selectedTask.assignedToEmployeeCodes || []) {
        const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          employeeCode: empCode,
          type: 'MANAGER_REMARK_ADDED',
          title: 'Manager Remark Added',
          message: `Admin manager added a remark to task "${selectedTask.title}".`,
          createdAt: nowIso,
          read: false,
        });
      }
    } catch (err) {
      console.error('Error updating manager remarks in Firestore:', err);
    }

    setSelectedTask(updatedTask);
    setAdminRemarkInput('');
  };

  const filteredRegs = registrations.filter(r => 
    r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    r.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.mobileNumber.includes(searchTerm)
  );

  const filteredAttendance = attendanceRecords.filter(a => {
    const term = searchTerm.toLowerCase();
    return (
      a.employeeName.toLowerCase().includes(term) ||
      a.employeeId.toLowerCase().includes(term) ||
      a.date.includes(term) ||
      a.townCity.toLowerCase().includes(term) ||
      (a.attendanceType || 'OFFICE').toLowerCase().includes(term) ||
      (a.clientName && a.clientName.toLowerCase().includes(term)) ||
      (a.outdoorType && a.outdoorType.toLowerCase().includes(term))
    );
  });

  const filteredExpenses = expenseRecords.filter(e => {
    const term = searchTerm.toLowerCase();
    return (
      e.employeeName.toLowerCase().includes(term) ||
      e.employeeCode.toLowerCase().includes(term) ||
      e.category.toLowerCase().includes(term) ||
      e.status.toLowerCase().includes(term) ||
      e.date.includes(term) ||
      e.description.toLowerCase().includes(term)
    );
  });

  const filteredTasks = tasks.filter(t => {
    const term = searchTerm.toLowerCase();
    const effStatus = getEffectiveTaskStatus(t);

    const matchesSearch = 
      t.title.toLowerCase().includes(term) ||
      t.description.toLowerCase().includes(term) ||
      t.assignedToDepartment.toLowerCase().includes(term) ||
      t.createdBy.toLowerCase().includes(term) ||
      (t.assignedToEmployeeCodes || []).some(c => c.toLowerCase().includes(term));

    const matchesDept = taskFilterDept === 'All' || t.assignedToDepartment === taskFilterDept;
    const matchesPriority = taskFilterPriority === 'All' || t.priority === taskFilterPriority;
    const matchesStatus = taskFilterStatus === 'All' || effStatus === taskFilterStatus;

    return matchesSearch && matchesDept && matchesPriority && matchesStatus;
  });

  const pendingRegCount = registrations.filter(r => r.status === 'Pending Approval').length;
  const pendingExpenseCount = expenseRecords.filter(e => e.status === 'Pending').length;
  const pendingTaskCount = tasks.filter(t => getEffectiveTaskStatus(t) === 'PENDING').length;
  const overdueTaskCount = tasks.filter(t => getEffectiveTaskStatus(t) === 'OVERDUE').length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] text-white pb-12">
      {/* Top Header */}
      <header className="bg-[#2D1B5A] border-b border-purple-500/20 sticky top-0 z-20 px-4 md:px-8 h-18 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-[#7C3AED] rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(124,58,237,0.5)]">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-none">Exfin OMS Admin</h1>
              <span className="text-[10px] text-purple-300 font-bold">Enterprise Console v6.0</span>
            </div>
          </div>

          <div className="flex bg-[#211044] p-1 rounded-2xl border border-purple-500/20 text-xs font-bold">
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-4 py-2 rounded-xl transition-all ${
                activeTab === 'attendance'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Smart Attendance ({attendanceRecords.length})
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'expenses'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Expense Claims ({expenseRecords.length})
              {pendingExpenseCount > 0 && (
                <span className="bg-amber-500 text-black text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                  {pendingExpenseCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('planner')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'planner'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Work Planner ({tasks.length})
              {overdueTaskCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                  {overdueTaskCount} OVERDUE
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('registrations')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'registrations'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Device Registrations
              {pendingRegCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                  {pendingRegCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('efficiency')}
              className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
                activeTab === 'efficiency'
                  ? 'bg-[#7C3AED] text-white shadow-lg shadow-purple-900/50'
                  : 'text-purple-300/70 hover:text-white'
              }`}
            >
              Efficiency Hub
            </button>
          </div>
        </div>

        <Button variant="outlined" onClick={handleLogout} className="border-purple-400/30 text-purple-200 text-xs">
          <LogOut className="w-4 h-4 mr-1.5" /> Logout
        </Button>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
        
        {/* Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-purple-300/70" />
            <input
              type="text"
              placeholder={activeTab === 'attendance' ? "Search employee, date or mode..." : "Search name, code or mobile..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl border border-purple-500/30 bg-[#2D1B5A] text-white focus:ring-2 focus:ring-[#7C3AED] focus:outline-none text-xs font-medium placeholder:text-purple-300/50 shadow-md"
            />
          </div>
        </div>

        {/* ATTENDANCE PANEL VIEW */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div className="overflow-x-auto bg-[#2D1B5A] rounded-[22px] shadow-2xl border border-purple-500/20">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#211044] text-purple-300 uppercase text-[10px] font-extrabold tracking-wider border-b border-purple-500/20">
                  <tr>
                    <th className="p-4">Employee</th>
                    <th className="p-4">Attendance Mode</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Check-In</th>
                    <th className="p-4">Mode</th>
                    <th className="p-4">Check-Out</th>
                    <th className="p-4">Mode</th>
                    <th className="p-4">Working Hours</th>
                    <th className="p-4">Exit / Return</th>
                    <th className="p-4">Network</th>
                    <th className="p-4">Sync Status</th>
                    <th className="p-4">Device Time</th>
                    <th className="p-4">Server Sync Time</th>
                    <th className="p-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10 text-white font-medium">
                  {filteredAttendance.map((rec) => (
                    <tr 
                      key={rec.id} 
                      onClick={() => setSelectedAttendance(rec)}
                      className="hover:bg-[#35206A]/60 cursor-pointer transition-colors"
                    >
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-bold text-sm text-white">{rec.employeeName}</div>
                        <div className="text-[10px] text-purple-300/70">{rec.employeeId}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black flex items-center gap-1.5 w-fit border ${
                          (rec.attendanceType || 'OFFICE') === 'WFH'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : (rec.attendanceType || 'OFFICE') === 'CLIENT_VISIT'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : (rec.attendanceType || 'OFFICE') === 'OUTDOOR'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : 'bg-purple-500/20 text-purple-200 border-purple-500/30'
                        }`}>
                          {(rec.attendanceType || 'OFFICE') === 'WFH' ? '🏠 WFH' : (rec.attendanceType || 'OFFICE') === 'CLIENT_VISIT' ? '🤝 Client Visit' : (rec.attendanceType || 'OFFICE') === 'OUTDOOR' ? '🚗 Outdoor Work' : '🏢 Office'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-purple-200">{rec.date}</td>
                      <td className="p-4 whitespace-nowrap font-bold text-emerald-400">{rec.checkInTime}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/50 text-purple-200 border border-purple-500/30">
                          {rec.checkInMode}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold text-purple-100">
                        {rec.checkOutTime || '--:--'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          rec.checkOutMode === 'AUTO_SYSTEM' 
                            ? 'bg-red-500/20 text-red-300 border-red-500/30' 
                            : rec.checkOutMode === 'MANUAL'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-purple-900/40 text-purple-300 border-purple-500/20'
                        }`}>
                          {rec.checkOutMode || '--'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-bold text-white">
                        {rec.workingHours || '--'}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[11px] text-amber-300">
                        {rec.exitTime ? `Exit: ${rec.exitTime} | Ret: ${rec.returnTime || '--'}` : 'None'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`flex items-center gap-1 font-semibold text-[11px] ${rec.isOffline ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {rec.isOffline ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
                          {rec.isOffline ? 'Offline' : 'Online'}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          rec.syncStatus === 'Synced' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {rec.syncStatus}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap text-[10px] font-mono text-purple-300/80">
                        {new Date(rec.createdAtDeviceTime).toLocaleString()}
                      </td>
                      <td className="p-4 whitespace-nowrap text-[10px] font-mono text-purple-300/80">
                        {rec.serverSyncTime ? new Date(rec.serverSyncTime).toLocaleString() : 'Pending'}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {rec.reason ? (
                          <span className="text-red-300 bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded font-bold text-[10px]">
                            {rec.reason}
                          </span>
                        ) : (
                          <span className="text-purple-300/50">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredAttendance.length === 0 && (
                <div className="py-12">
                  <EmptyState 
                    icon={Calendar} 
                    title="No attendance records found" 
                    description="Attendance events logged by employees will appear here." 
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* WORK PLANNER PANEL VIEW */}
        {activeTab === 'planner' && (
          <div className="space-y-5">
            {/* Action Bar & Stats Cards */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#2D1B5A] p-4 rounded-[22px] border border-purple-500/20">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full md:w-auto">
                <div className="bg-[#211044] p-3 rounded-2xl border border-purple-500/20 text-center">
                  <p className="text-[10px] font-bold text-purple-300 uppercase">Total Tasks</p>
                  <p className="text-xl font-black text-white">{tasks.length}</p>
                </div>
                <div className="bg-[#211044] p-3 rounded-2xl border border-amber-500/30 text-center">
                  <p className="text-[10px] font-bold text-amber-300 uppercase">Pending</p>
                  <p className="text-xl font-black text-amber-300">{pendingTaskCount}</p>
                </div>
                <div className="bg-[#211044] p-3 rounded-2xl border border-blue-500/30 text-center">
                  <p className="text-[10px] font-bold text-blue-300 uppercase">In Progress</p>
                  <p className="text-xl font-black text-blue-300">
                    {tasks.filter(t => getEffectiveTaskStatus(t) === 'IN_PROGRESS').length}
                  </p>
                </div>
                <div className="bg-[#211044] p-3 rounded-2xl border border-emerald-500/30 text-center">
                  <p className="text-[10px] font-bold text-emerald-300 uppercase">Completed</p>
                  <p className="text-xl font-black text-emerald-400">
                    {tasks.filter(t => getEffectiveTaskStatus(t) === 'COMPLETED').length}
                  </p>
                </div>
                <div className="bg-[#211044] p-3 rounded-2xl border border-red-500/30 text-center col-span-2 sm:col-span-1">
                  <p className="text-[10px] font-bold text-red-300 uppercase">Overdue</p>
                  <p className="text-xl font-black text-red-400">{overdueTaskCount}</p>
                </div>
              </div>

              <Button
                onClick={() => {
                  setTaskTitle('');
                  setTaskDescription('');
                  setSelectedEmployeeIds([]);
                  setTaskManagerRemarks('');
                  setShowCreateTaskDialog(true);
                }}
                className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-extrabold px-5 py-3 rounded-2xl shadow-lg shadow-purple-900/50 flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" /> Create & Assign Task
              </Button>
            </div>

            {/* Department & Employee Workload Summaries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Department Workload */}
              <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 rounded-[22px] space-y-3">
                <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-[#A78BFA]" /> Department Workload Summary
                </h3>
                <div className="space-y-2">
                  {['Operations', 'Sales', 'HR', 'Logistics'].map((dept) => {
                    const deptTasks = tasks.filter(t => t.assignedToDepartment === dept);
                    const completed = deptTasks.filter(t => getEffectiveTaskStatus(t) === 'COMPLETED').length;
                    const overdue = deptTasks.filter(t => getEffectiveTaskStatus(t) === 'OVERDUE').length;
                    const pct = deptTasks.length ? Math.round((completed / deptTasks.length) * 100) : 0;

                    return (
                      <div key={dept} className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-bold text-white">{dept}</p>
                          <p className="text-[10px] text-purple-300/70">{deptTasks.length} total tasks ({overdue} overdue)</p>
                        </div>
                        <div className="text-right">
                          <p className="font-extrabold text-emerald-400">{pct}% Done</p>
                          <p className="text-[10px] text-purple-300/60">{completed}/{deptTasks.length} completed</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Employee Workload */}
              <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20 rounded-[22px] space-y-3">
                <h3 className="text-xs font-black uppercase text-purple-300 tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#A78BFA]" /> Employee Task Load
                </h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {registrations.filter(r => r.status === 'Approved').length > 0 ? (
                    registrations.filter(r => r.status === 'Approved').map((emp) => {
                      const empTasks = tasks.filter(t => 
                        (t.assignedToEmployeeIds || []).includes(emp.id) || 
                        (t.assignedToEmployeeCodes || []).includes(emp.employeeCode)
                      );
                      const completed = empTasks.filter(t => getEffectiveTaskStatus(t) === 'COMPLETED').length;
                      const overdue = empTasks.filter(t => getEffectiveTaskStatus(t) === 'OVERDUE').length;

                      return (
                        <div key={emp.id} className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-white">{emp.name} <span className="text-[10px] font-mono text-purple-300">({emp.employeeCode})</span></p>
                            <p className="text-[10px] text-purple-300/70">{emp.office || 'Operations'}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-extrabold text-purple-200">{empTasks.length} Assigned</p>
                            <p className="text-[10px] text-emerald-300">{completed} Done {overdue > 0 ? `• ${overdue} Overdue` : ''}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-purple-300/60 italic text-center py-4">No approved registered employees available.</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3 bg-[#2D1B5A] p-3 rounded-2xl border border-purple-500/20 text-xs">
              <span className="font-bold text-purple-300 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-[#A78BFA]" /> Filters:
              </span>

              {/* Dept filter */}
              <select
                value={taskFilterDept}
                onChange={(e) => setTaskFilterDept(e.target.value)}
                className="bg-[#211044] text-white px-3 py-1.5 rounded-xl border border-purple-500/30 font-bold focus:outline-none"
              >
                <option value="All">All Departments</option>
                <option value="Operations">Operations</option>
                <option value="Sales">Sales</option>
                <option value="HR">HR</option>
                <option value="Logistics">Logistics</option>
              </select>

              {/* Priority filter */}
              <select
                value={taskFilterPriority}
                onChange={(e) => setTaskFilterPriority(e.target.value)}
                className="bg-[#211044] text-white px-3 py-1.5 rounded-xl border border-purple-500/30 font-bold focus:outline-none"
              >
                <option value="All">All Priorities</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>

              {/* Status filter */}
              <select
                value={taskFilterStatus}
                onChange={(e) => setTaskFilterStatus(e.target.value)}
                className="bg-[#211044] text-white px-3 py-1.5 rounded-xl border border-purple-500/30 font-bold focus:outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="PENDING">PENDING</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="OVERDUE">OVERDUE</option>
              </select>
            </div>

            {/* Task Table */}
            <div className="overflow-x-auto bg-[#2D1B5A] rounded-[22px] shadow-2xl border border-purple-500/20">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#211044] text-purple-300 uppercase text-[10px] font-extrabold tracking-wider border-b border-purple-500/20">
                  <tr>
                    <th className="p-4">Task Details</th>
                    <th className="p-4">Department</th>
                    <th className="p-4">Assigned To</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Due Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Progress</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10 text-white font-medium">
                  {filteredTasks.map((t) => {
                    const effStatus = getEffectiveTaskStatus(t);

                    return (
                      <tr key={t.id} className="hover:bg-[#35206A]/60 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-sm text-white">{t.title}</div>
                          <div className="text-[10px] text-purple-300/70 line-clamp-1 max-w-xs">{t.description}</div>
                        </td>
                        <td className="p-4 whitespace-nowrap font-bold text-purple-200">{t.assignedToDepartment}</td>
                        <td className="p-4 whitespace-nowrap text-purple-200">
                          {t.assignmentType === 'DEPARTMENT' ? (
                            <span className="text-blue-300 font-bold">Entire Dept</span>
                          ) : (
                            <span className="font-mono text-xs">{(t.assignedToEmployeeCodes || []).join(', ') || 'N/A'}</span>
                          )}
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                            t.priority === 'URGENT' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                            t.priority === 'HIGH' ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' :
                            t.priority === 'MEDIUM' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                            'bg-purple-500/20 text-purple-300 border-purple-500/30'
                          }`}>
                            {t.priority}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap font-semibold text-purple-200">{t.dueDate} {t.dueTime || ''}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                            effStatus === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                            effStatus === 'OVERDUE' ? 'bg-red-600/30 text-red-300 border-red-500/40 animate-pulse' :
                            effStatus === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
                            'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}>
                            {effStatus}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="w-24 bg-[#211044] h-2 rounded-full overflow-hidden border border-purple-500/20 mb-0.5">
                            <div 
                              className={`h-full ${effStatus === 'COMPLETED' ? 'bg-emerald-400' : effStatus === 'OVERDUE' ? 'bg-red-500' : 'bg-[#7C3AED]'}`}
                              style={{ width: `${t.completionPercentage || 0}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-purple-300">{t.completionPercentage || 0}%</span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSelectedTask(t);
                              setTaskManagerRemarks(t.managerRemarks || '');
                              setAdminRemarkInput('');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-[10px]"
                          >
                            Audit & Remarks
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {filteredTasks.length === 0 && (
                <div className="py-12">
                  <EmptyState
                    icon={CheckSquare}
                    title="No tasks found"
                    description="No work planner tasks match your current filter selection."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* EXPENSE CLAIMS PANEL VIEW */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <div className="overflow-x-auto bg-[#2D1B5A] rounded-[22px] shadow-2xl border border-purple-500/20">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#211044] text-purple-300 uppercase text-[10px] font-extrabold tracking-wider border-b border-purple-500/20">
                  <tr>
                    <th className="p-4">Employee</th>
                    <th className="p-4">Employee Code</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Receipt</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Sync Status</th>
                    <th className="p-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10 text-white font-medium">
                  {filteredExpenses.map((exp) => (
                    <tr 
                      key={exp.id} 
                      className="hover:bg-[#35206A]/60 transition-colors"
                    >
                      <td className="p-4 whitespace-nowrap">
                        <div className="font-bold text-sm text-white">{exp.employeeName}</div>
                      </td>
                      <td className="p-4 whitespace-nowrap font-mono text-purple-200">
                        {exp.employeeCode}
                      </td>
                      <td className="p-4 whitespace-nowrap text-purple-200">{exp.date}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-200 border border-purple-500/30">
                          {exp.category}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap font-black text-sm text-white">
                        ₹{exp.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {exp.receiptUrl ? (
                          <button
                            onClick={() => setPreviewReceiptUrl(exp.receiptUrl!)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-200 hover:bg-purple-500/30 text-[10px] font-bold border border-purple-500/30"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-[#A78BFA]" /> View Receipt
                          </button>
                        ) : (
                          <span className="text-purple-300/40 text-[10px]">No Receipt</span>
                        )}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          exp.status === 'Approved'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : exp.status === 'Rejected'
                            ? 'bg-red-500/20 text-red-300 border-red-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {exp.status}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          exp.syncStatus === 'Synced'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                            : 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                        }`}>
                          {exp.syncStatus}
                        </span>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {exp.status === 'Pending' ? (
                            <>
                              <button
                                onClick={() => handleApproveExpense(exp)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedExpense(exp);
                                  setShowExpenseRejectDialog(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-700 text-white font-bold text-[10px]"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setSelectedExpense(exp)}
                              className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 font-bold text-[10px]"
                            >
                              Audit Details
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredExpenses.length === 0 && (
                <div className="py-12">
                  <EmptyState 
                    icon={Wallet} 
                    title="No expense claims found" 
                    description="Submitted expense claims from employees will appear here." 
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* REGISTRATIONS PANEL VIEW */}
        {activeTab === 'registrations' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRegs.map((reg) => (
              <Card key={reg.id} className="p-5 flex flex-col cursor-pointer bg-[#2D1B5A] border border-purple-500/20 hover:border-purple-500/50 transition-all hover:scale-[1.01]" onClick={() => setSelectedReg(reg)}>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#211044] border border-purple-500/30">
                      {reg.selfieUrl ? (
                        <img src={reg.selfieUrl} alt={reg.name} className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-6 h-6 m-3 text-purple-300" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-white text-sm line-clamp-1">{reg.name}</h3>
                        {reg.isTeamLeader && (
                          <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-black px-2 py-0.2 rounded-full border border-emerald-500/30">
                            ⭐ TL
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-purple-300/70 font-mono">{reg.employeeCode}</p>
                      {reg.teamLeaderName && (
                        <p className="text-[10px] text-purple-300/60 font-semibold">TL: {reg.teamLeaderName}</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={reg.status} />
                </div>
                
                <div className="space-y-2 mt-auto pt-4 border-t border-purple-500/15 text-xs text-purple-200">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-[#A78BFA]" /> {reg.mobileNumber}
                  </div>
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-3.5 h-3.5 text-[#A78BFA]" /> {reg.deviceModel}
                  </div>
                </div>
              </Card>
            ))}
            
            {filteredRegs.length === 0 && (
              <div className="col-span-full py-12">
                <EmptyState 
                  icon={Search} 
                  title="No registrations found" 
                  description="Try adjusting your search criteria" 
                />
              </div>
            )}
          </div>
        )}

        {/* EFFICIENCY HUB PANEL VIEW */}
        {activeTab === 'efficiency' && (
          <EfficiencyDashboard />
        )}

      </main>

      {/* Attendance Detail Dialog */}
      <Dialog isOpen={!!selectedAttendance} onClose={() => setSelectedAttendance(null)} title="Attendance Audit Log">
        {selectedAttendance && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-white">{selectedAttendance.employeeName}</h3>
                <p className="text-[10px] text-purple-300/70 font-mono">ID: {selectedAttendance.employeeId} | UUID: {selectedAttendance.id}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                selectedAttendance.syncStatus === 'Synced' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {selectedAttendance.syncStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-[#211044]/60 rounded-2xl border border-purple-500/20">
              <div className="col-span-2 p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20">
                <p className="text-[10px] text-purple-300/70 font-bold uppercase mb-0.5">Mode</p>
                <p className="font-black text-sm text-white flex items-center gap-1.5">
                  {(selectedAttendance.attendanceType || 'OFFICE') === 'WFH' ? '🏠 Work From Home (WFH)' : (selectedAttendance.attendanceType || 'OFFICE') === 'CLIENT_VISIT' ? '🤝 Client Visit' : (selectedAttendance.attendanceType || 'OFFICE') === 'OUTDOOR' ? '🚗 Outdoor Work' : '🏢 Office Attendance'}
                </p>
                {selectedAttendance.wfhReason && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1 text-xs">
                    <p><span className="font-bold text-emerald-300">Reason:</span> {selectedAttendance.wfhReason}</p>
                    <p><span className="font-bold text-emerald-300">Work Plan:</span> {selectedAttendance.workPlan}</p>
                  </div>
                )}
                {selectedAttendance.clientName && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1 text-xs">
                    <p><span className="font-bold text-amber-300">Client:</span> {selectedAttendance.clientName}</p>
                    <p><span className="font-bold text-amber-300">Location:</span> {selectedAttendance.clientLocation}</p>
                    <p><span className="font-bold text-amber-300">Purpose:</span> {selectedAttendance.purpose}</p>
                  </div>
                )}
                {selectedAttendance.outdoorType && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 space-y-1 text-xs">
                    <p><span className="font-bold text-blue-300">Outdoor Type:</span> {selectedAttendance.outdoorType}</p>
                    <p><span className="font-bold text-blue-300">Description:</span> {selectedAttendance.description}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Date</p>
                <p className="font-bold text-white">{selectedAttendance.date}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Working Hours</p>
                <p className="font-bold text-white">{selectedAttendance.workingHours || '--'}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Check-In</p>
                <p className="font-bold text-emerald-400">{selectedAttendance.checkInTime} ({selectedAttendance.checkInMode})</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Check-Out</p>
                <p className="font-bold text-purple-200">{selectedAttendance.checkOutTime || '--:--'} ({selectedAttendance.checkOutMode})</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Office Distance</p>
                <p className="font-bold text-white">{selectedAttendance.distance.toFixed(1)}m</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Location</p>
                <p className="font-bold text-white">{selectedAttendance.townCity}</p>
              </div>
            </div>

            <Button onClick={() => setSelectedAttendance(null)} className="w-full">Close Audit Log</Button>
          </div>
        )}
      </Dialog>

      {/* Registration Details Dialog */}
      <Dialog isOpen={!!selectedReg} onClose={() => setSelectedReg(null)} title="Device Registration Audit">
        {selectedReg && (
          <div className="space-y-5">
            <div className="flex justify-center">
              <div className="w-28 h-28 rounded-2xl overflow-hidden shadow-xl border border-purple-500/30 bg-[#211044]">
                {selectedReg.selfieUrl ? (
                  <img src={selectedReg.selfieUrl} alt="Selfie" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 m-auto mt-9 text-purple-300" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#211044] p-4 rounded-2xl border border-purple-500/20">
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Code</p>
                <p className="font-bold text-white">{selectedReg.employeeCode}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Status</p>
                <StatusBadge status={selectedReg.status} />
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Name</p>
                <p className="font-bold text-white">{selectedReg.name}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Mobile</p>
                <p className="font-bold text-white">{selectedReg.mobileNumber}</p>
              </div>
              <div className="col-span-2 pt-2 border-t border-purple-500/20">
                <p className="text-[10px] text-purple-300/70 mb-0.5">Device</p>
                <p className="font-bold text-white">{selectedReg.deviceModel} ({selectedReg.androidVersion})</p>
              </div>
            </div>

            {/* Team Leader Management Controls */}
            {selectedReg.status === 'Approved' && (
              <div className="p-4 bg-[#211044] rounded-2xl border border-purple-500/30 space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="font-extrabold text-white">Team Leader Designation</h4>
                    <p className="text-[10px] text-purple-300/70">Grants My Team module & team task review authority</p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedReg.isTeamLeader)}
                      onChange={(e) => handleToggleTeamLeader(selectedReg, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-purple-950 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#7C3AED]"></div>
                  </label>
                </div>

                {!selectedReg.isTeamLeader && (
                  <div className="pt-2 border-t border-purple-500/20 space-y-1">
                    <label className="font-bold text-purple-300 text-[10px] uppercase block">Assigned Team Leader</label>
                    <select
                      value={selectedReg.teamLeaderCode || ''}
                      onChange={(e) => handleAssignTeamLeader(selectedReg, e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#2D1B5A] text-white font-bold text-xs"
                    >
                      <option value="">-- No Team Leader Assigned --</option>
                      {registrations
                        .filter((r) => r.isTeamLeader && r.id !== selectedReg.id && r.status === 'Approved')
                        .map((tl) => (
                          <option key={tl.id} value={tl.employeeCode}>
                            {tl.name} ({tl.employeeCode})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {selectedReg.status === 'Pending Approval' && (
              <div className="flex gap-3 pt-2">
                <Button variant="outlined" className="flex-1 border-red-500/40 text-red-300 hover:bg-red-500/20" onClick={() => setShowRejectDialog(true)}>
                  Reject
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApprove(selectedReg.id)}>
                  Approve
                </Button>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* Expense Detail Audit Dialog */}
      <Dialog isOpen={!!selectedExpense && !showExpenseRejectDialog} onClose={() => setSelectedExpense(null)} title="Expense Claim Audit Log">
        {selectedExpense && (
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-sm text-white">{selectedExpense.employeeName}</h3>
                <p className="text-[10px] text-purple-300/70 font-mono">Code: {selectedExpense.employeeCode} | UUID: {selectedExpense.id}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                selectedExpense.status === 'Approved'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : selectedExpense.status === 'Rejected'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {selectedExpense.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-[#211044]/60 rounded-2xl border border-purple-500/20">
              <div className="col-span-2 p-3 bg-[#2D1B5A] rounded-xl border border-purple-500/20">
                <p className="text-[10px] text-purple-300/70 font-bold uppercase mb-0.5">Category & Amount</p>
                <div className="flex justify-between items-center">
                  <p className="font-bold text-sm text-white">{selectedExpense.category}</p>
                  <p className="font-black text-base text-emerald-400">₹{selectedExpense.amount.toLocaleString('en-IN')}</p>
                </div>
                {selectedExpense.description && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 text-xs text-purple-200">
                    <p className="font-bold text-purple-300 mb-0.5">Description:</p>
                    <p className="text-purple-100">{selectedExpense.description}</p>
                  </div>
                )}
                {selectedExpense.rejectionReason && (
                  <div className="mt-2 pt-2 border-t border-purple-500/20 text-xs text-red-300">
                    <p className="font-bold mb-0.5">Rejection Reason:</p>
                    <p className="text-red-200">{selectedExpense.rejectionReason}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Claim Date</p>
                <p className="font-bold text-white">{selectedExpense.date}</p>
              </div>
              <div>
                <p className="text-[10px] text-purple-300/70 mb-0.5">Sync Status</p>
                <p className="font-bold text-purple-200">{selectedExpense.syncStatus}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] text-purple-300/70 mb-0.5">Device Timestamp</p>
                <p className="font-mono text-purple-300/80">{new Date(selectedExpense.createdAtDeviceTime).toLocaleString()}</p>
              </div>
            </div>

            {selectedExpense.receiptUrl && (
              <div className="space-y-1.5">
                <p className="font-bold text-purple-200">Receipt Attachment:</p>
                <div className="w-full h-44 rounded-xl overflow-hidden bg-[#211044] border border-purple-500/30">
                  <img
                    src={selectedExpense.receiptUrl}
                    alt="Receipt"
                    className="w-full h-full object-contain cursor-pointer"
                    onClick={() => setPreviewReceiptUrl(selectedExpense.receiptUrl!)}
                  />
                </div>
              </div>
            )}

            {selectedExpense.status === 'Pending' ? (
              <div className="flex gap-3 pt-2">
                <Button variant="outlined" className="flex-1 border-red-500/40 text-red-300 hover:bg-red-500/20" onClick={() => setShowExpenseRejectDialog(true)}>
                  Reject Claim
                </Button>
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleApproveExpense(selectedExpense)}>
                  Approve Claim
                </Button>
              </div>
            ) : (
              <Button onClick={() => setSelectedExpense(null)} className="w-full">Close Audit</Button>
            )}
          </div>
        )}
      </Dialog>

      {/* Expense Reject Dialog */}
      <Dialog isOpen={showExpenseRejectDialog} onClose={() => setShowExpenseRejectDialog(false)} title="Reject Expense Claim">
        <div className="space-y-4">
          <p className="text-xs text-purple-200">Please provide a reason for rejecting this claim (will be sent to the employee):</p>
          <textarea
            value={expenseRejectReason}
            onChange={(e) => setExpenseRejectReason(e.target.value)}
            className="w-full p-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white min-h-[90px] text-xs focus:ring-2 focus:ring-[#7C3AED] focus:outline-none"
            placeholder="e.g., Missing valid invoice bill, duplicate claim, clear policy mismatch..."
          />
          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowExpenseRejectDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-red-600 text-white hover:bg-red-700" 
              onClick={() => selectedExpense && handleRejectExpense(selectedExpense)}
              disabled={!expenseRejectReason.trim()}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Receipt Preview Modal */}
      <Dialog isOpen={!!previewReceiptUrl} onClose={() => setPreviewReceiptUrl(null)} title="Receipt Preview">
        {previewReceiptUrl && (
          <div className="space-y-4">
            <div className="max-h-[70vh] overflow-auto flex justify-center bg-[#211044] p-2 rounded-2xl border border-purple-500/30">
              <img src={previewReceiptUrl} alt="Receipt preview" className="max-w-full rounded-lg object-contain" />
            </div>
            <Button onClick={() => setPreviewReceiptUrl(null)} className="w-full">Close Preview</Button>
          </div>
        )}
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog isOpen={showRejectDialog} onClose={() => setShowRejectDialog(false)} title="Reject Device Registration">
        <div className="space-y-4">
          <p className="text-xs text-purple-200">State reason for rejecting device registration:</p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="w-full p-3 rounded-2xl border border-purple-500/30 bg-[#211044] text-white min-h-[90px] text-xs focus:ring-2 focus:ring-[#7C3AED] focus:outline-none"
            placeholder="e.g., Unclear selfie, unrecognized employee..."
          />
          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowRejectDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              className="flex-1 bg-red-600 text-white hover:bg-red-700" 
              onClick={() => selectedReg && handleReject(selectedReg.id)}
              disabled={!rejectionReason.trim()}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog isOpen={showCreateTaskDialog} onClose={() => setShowCreateTaskDialog(false)} title="Create & Assign Work Planner Task">
        <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Task Title *</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g., Q3 Financial Reconciliations & Audit"
              className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Description & Work Plan *</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Provide detailed instructions, required deliverables, and guidelines..."
              className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs min-h-[80px] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Department *</label>
              <select
                value={taskDept}
                onChange={(e) => setTaskDept(e.target.value)}
                className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white font-bold text-xs focus:outline-none"
              >
                <option value="Operations">Operations</option>
                <option value="Sales">Sales</option>
                <option value="HR">HR</option>
                <option value="Logistics">Logistics</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Priority *</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white font-bold text-xs focus:outline-none"
              >
                <option value="LOW">LOW (Grey/Purple)</option>
                <option value="MEDIUM">MEDIUM (Blue)</option>
                <option value="HIGH">HIGH (Amber)</option>
                <option value="URGENT">URGENT (Red)</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Assignment Mode *</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTaskAssignmentType('EMPLOYEE')}
                className={`p-2 rounded-xl text-[11px] font-bold border transition-all ${
                  taskAssignmentType === 'EMPLOYEE' ? 'bg-[#7C3AED] text-white border-purple-400' : 'bg-[#211044] text-purple-300 border-purple-500/20'
                }`}
              >
                Single Employee
              </button>
              <button
                type="button"
                onClick={() => setTaskAssignmentType('MULTIPLE_EMPLOYEES')}
                className={`p-2 rounded-xl text-[11px] font-bold border transition-all ${
                  taskAssignmentType === 'MULTIPLE_EMPLOYEES' ? 'bg-[#7C3AED] text-white border-purple-400' : 'bg-[#211044] text-purple-300 border-purple-500/20'
                }`}
              >
                Multiple
              </button>
              <button
                type="button"
                onClick={() => setTaskAssignmentType('DEPARTMENT')}
                className={`p-2 rounded-xl text-[11px] font-bold border transition-all ${
                  taskAssignmentType === 'DEPARTMENT' ? 'bg-[#7C3AED] text-white border-purple-400' : 'bg-[#211044] text-purple-300 border-purple-500/20'
                }`}
              >
                Entire Dept
              </button>
            </div>
          </div>

          {taskAssignmentType !== 'DEPARTMENT' && (
            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Assign Employees *</label>
              <div className="max-h-36 overflow-y-auto bg-[#211044] p-2 rounded-xl border border-purple-500/30 space-y-1">
                {registrations.filter(r => r.status === 'Approved').map((emp) => {
                  const isChecked = selectedEmployeeIds.includes(emp.id) || selectedEmployeeIds.includes(emp.employeeCode);
                  return (
                    <label key={emp.id} className="flex items-center gap-2.5 p-2 hover:bg-[#2D1B5A] rounded-lg cursor-pointer">
                      <input
                        type={taskAssignmentType === 'EMPLOYEE' ? 'radio' : 'checkbox'}
                        name="assignee"
                        checked={isChecked}
                        onChange={(e) => {
                          if (taskAssignmentType === 'EMPLOYEE') {
                            setSelectedEmployeeIds([emp.id]);
                          } else {
                            if (e.target.checked) {
                              setSelectedEmployeeIds([...selectedEmployeeIds, emp.id]);
                            } else {
                              setSelectedEmployeeIds(selectedEmployeeIds.filter(id => id !== emp.id));
                            }
                          }
                        }}
                        className="accent-[#7C3AED]"
                      />
                      <div>
                        <p className="font-bold text-white text-xs">{emp.name}</p>
                        <p className="text-[10px] text-purple-300/70 font-mono">{emp.employeeCode} • {emp.office || 'Operations'}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Start Date</label>
              <input
                type="date"
                value={taskStartDate}
                onChange={(e) => setTaskStartDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Due Date *</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Due Time</label>
              <input
                type="time"
                value={taskDueTime}
                onChange={(e) => setTaskDueTime(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs font-bold"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="font-extrabold text-purple-300 uppercase tracking-wider block">Initial Manager Remarks (Optional)</label>
            <input
              type="text"
              value={taskManagerRemarks}
              onChange={(e) => setTaskManagerRemarks(e.target.value)}
              placeholder="Special instructions or notes for the assignee..."
              className="w-full p-3 rounded-xl border border-purple-500/30 bg-[#211044] text-white text-xs focus:outline-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="text" onClick={() => setShowCreateTaskDialog(false)} className="flex-1">
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTask}
              disabled={!taskTitle.trim() || !taskDescription.trim() || !taskDueDate || (taskAssignmentType !== 'DEPARTMENT' && selectedEmployeeIds.length === 0)}
              className="flex-1 bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold"
            >
              Create & Assign Task
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Admin Task Audit & Manager Remarks Dialog */}
      <Dialog isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} title="Admin Task Audit & Manager Remarks">
        {selectedTask && (
          <div className="space-y-4 text-xs max-h-[75vh] overflow-y-auto pr-1">
            <div className="p-3 bg-[#211044] rounded-2xl border border-purple-500/30 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-base text-white">{selectedTask.title}</h3>
                  <p className="text-[10px] text-purple-300 font-mono mt-0.5">ID: {selectedTask.id}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                  getEffectiveTaskStatus(selectedTask) === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  getEffectiveTaskStatus(selectedTask) === 'OVERDUE' ? 'bg-red-600/30 text-red-300 border-red-500/40 animate-pulse' :
                  'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {getEffectiveTaskStatus(selectedTask)}
                </span>
              </div>

              <div className="p-2.5 bg-[#2D1B5A] rounded-xl text-purple-100 text-xs leading-relaxed border border-purple-500/20">
                {selectedTask.description}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-purple-200">
                <div><span className="text-purple-300/70 font-bold">Dept:</span> {selectedTask.assignedToDepartment}</div>
                <div><span className="text-purple-300/70 font-bold">Priority:</span> {selectedTask.priority}</div>
                <div><span className="text-purple-300/70 font-bold">Due Date:</span> {selectedTask.dueDate} {selectedTask.dueTime || ''}</div>
                <div><span className="text-purple-300/70 font-bold">Progress:</span> {selectedTask.completionPercentage || 0}%</div>
              </div>
            </div>

            {/* Manager Remarks Section */}
            <div className="space-y-2 p-3 bg-[#211044] rounded-2xl border border-purple-500/30">
              <label className="font-extrabold text-xs text-white uppercase tracking-wider block">Manager Remarks</label>
              <textarea
                value={taskManagerRemarks}
                onChange={(e) => setTaskManagerRemarks(e.target.value)}
                placeholder="Write manager remarks or directive for employee..."
                className="w-full p-2.5 rounded-xl border border-purple-500/30 bg-[#2D1B5A] text-white text-xs min-h-[60px] focus:outline-none"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  value={adminRemarkInput}
                  onChange={(e) => setAdminRemarkInput(e.target.value)}
                  placeholder="Post an admin comment to thread..."
                  className="flex-1 px-3 py-2 rounded-xl border border-purple-500/30 bg-[#2D1B5A] text-white text-xs"
                />
                <Button onClick={handleSaveManagerRemark} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-bold text-xs">
                  Save Remarks
                </Button>
              </div>
            </div>

            {/* Comments Thread */}
            <div className="space-y-2">
              <h4 className="font-extrabold text-xs text-purple-300 uppercase tracking-wider">Comment History</h4>
              <div className="max-h-36 overflow-y-auto space-y-2">
                {(selectedTask.comments || []).map((c) => (
                  <div key={c.id} className="p-2.5 bg-[#211044] rounded-xl border border-purple-500/20 text-xs">
                    <div className="flex justify-between items-center text-[10px] font-bold text-purple-300">
                      <span>{c.authorName} ({c.authorRole})</span>
                      <span className="text-purple-300/60">{new Date(c.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-purple-100 mt-1">{c.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={() => setSelectedTask(null)} className="w-full">Close Audit</Button>
          </div>
        )}
      </Dialog>

    </div>
  );
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'Approved') {
    return (
      <span className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
        <CheckCircle className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === 'Rejected') {
    return (
      <span className="flex items-center gap-1 bg-red-500/20 text-red-300 border border-red-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
        <XCircle className="w-3 h-3" /> Rejected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
};
