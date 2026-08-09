import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { usePermission } from '../../context/PermissionContext';
import { TaskRecord, TaskPriority, AssignmentType, TaskStatus } from '../../types/planner';
import { createNotification } from '../../services/notification/notificationService';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { 
  CheckSquare, Plus, Clock, Search, Filter, AlertTriangle, Users, MessageSquare, Briefcase, Trash2
} from 'lucide-react';

export const AdminWorkPlannerTab: React.FC = () => {
  const { isSuperAdmin, isAdmin } = usePermission();
  const { user: adminUser, role: activeAdminRole, loginId } = useAdminAuth();
  
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Create/Edit Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('MEDIUM');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskDueTime, setTaskDueTime] = useState('');
  const [selectedEmployeeCode, setSelectedEmployeeCode] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('PENDING');

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
      alert('Failed to delete task. You might not have permission.');
    }
  };

  const handleEditClick = (task: TaskRecord) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title);
    setTaskDescription(task.description);
    setTaskPriority(task.priority);
    setTaskDueDate(task.dueDate);
    setTaskDueTime(task.dueTime || '');
    setSelectedEmployeeCode(task.assignedToEmployeeCodes[0] || '');
    setTaskStatus(task.status);
    setShowCreateModal(true);
  };

  useEffect(() => {
    if (!db) return;

    // Load Tasks
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAtDeviceTime', 'desc'));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      const data = snap.docs.map(d => d.data() as TaskRecord);
      setTasks(data);
      setLoading(false);
    });

    // Load Eligible Employees
    const unsubRegs = onSnapshot(collection(db, 'registrations'), (snap) => {
      const emps: any[] = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.status === 'Approved' && data.employeeCode) {
          emps.push({
            id: d.id,
            employeeCode: data.employeeCode,
            name: data.name || 'Unnamed',
            department: data.office || data.department || 'Operations'
          });
        }
      });
      setEmployees(emps);
    });

    return () => {
      unsubTasks();
      unsubRegs();
    };
  }, []);

  const handleSaveTask = async () => {
    if (!taskTitle.trim() || !taskDescription.trim() || !taskDueDate || !selectedEmployeeCode) return;
    
    setIsSubmitting(true);
    try {
      const selectedEmp = employees.find(e => e.employeeCode === selectedEmployeeCode);
      if (!selectedEmp) throw new Error("Selected employee not found");

      const nowIso = new Date().toISOString();
      const adminName = activeAdminRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin';
      const createdByRole = activeAdminRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN';

      if (editingTaskId) {
        await updateDoc(doc(db, 'tasks', editingTaskId), {
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          priority: taskPriority,
          status: taskStatus,
          dueDate: taskDueDate,
          dueTime: taskDueTime,
          assignedToEmployeeIds: [selectedEmp.id],
          assignedToEmployeeCodes: [selectedEmp.employeeCode],
          assignedToDepartment: selectedEmp.department,
          updatedAtDeviceTime: nowIso,
          syncStatus: 'Synced'
        });
      } else {
        const taskId = `task_admin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newTask: TaskRecord = {
          id: taskId,
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          assignmentType: 'EMPLOYEE',
          assignedToEmployeeIds: [selectedEmp.id],
          assignedToEmployeeCodes: [selectedEmp.employeeCode],
          assignedToDepartment: selectedEmp.department,
          
          createdBy: adminUser?.uid || 'admin',
          createdByName: adminName,
          
          priority: taskPriority,
          status: taskStatus,
          approvalStatus: 'NOT_REQUIRED',
          completionPercentage: 0,
          
          dueDate: taskDueDate,
          dueTime: taskDueTime,
          createdAtDeviceTime: nowIso,
          updatedAtDeviceTime: nowIso,
          syncStatus: 'Synced',
          comments: [],
          assignedTime: nowIso,
        };

        await setDoc(doc(db, 'tasks', taskId), newTask);

        // Notification
        await createNotification({
          recipientEmployeeCode: selectedEmp.employeeCode,
          type: 'TASK_ASSIGNED',
          category: 'PLANNER',
          priority: taskPriority === 'HIGH' ? 'HIGH' : taskPriority === 'URGENT' ? 'URGENT' : 'NORMAL',
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
      alert('Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskDescription('');
    setTaskPriority('MEDIUM');
    setTaskDueDate('');
    setTaskDueTime('');
    setSelectedEmployeeCode('');
    setTaskStatus('PENDING');
  };

  const filteredTasks = tasks.filter(t => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (searchTerm) {
      const lSearch = searchTerm.toLowerCase();
      if (!t.title.toLowerCase().includes(lSearch) && 
          !t.assignedToEmployeeCodes.some(c => c.toLowerCase().includes(lSearch))) {
        return false;
      }
    }
    return true;
  });

  return (
    <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-purple-400" /> Enterprise Work Planner
          </h3>
          <p className="text-xs text-purple-300 mt-1">
            Assign and track tasks across all employees.
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateModal(true)}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold whitespace-nowrap"
        >
          <Plus className="w-4 h-4 mr-2" /> Assign Task
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-purple-400" />
          <input
            type="text"
            placeholder="Search tasks or employee code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="OVERDUE">Overdue</option>
        </select>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="text-center py-10 text-purple-300">Loading tasks...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="text-center py-10 text-purple-300 bg-[#1A0B36] rounded-2xl border border-purple-500/20">
          No tasks found matching your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTasks.map(t => (
            <div key={t.id} className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/20 space-y-3">
              <div className="flex justify-between items-start">
                <h4 className="font-bold text-white text-sm">{t.title}</h4>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  t.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-300' :
                  t.status === 'IN_PROGRESS' ? 'bg-blue-500/20 text-blue-300' :
                  t.status === 'OVERDUE' ? 'bg-red-500/20 text-red-300' :
                  'bg-amber-500/20 text-amber-300'
                }`}>
                  {t.status}
                </span>
              </div>
              
              <div className="text-xs text-purple-200 line-clamp-2">
                {t.description}
              </div>

              <div className="pt-2 border-t border-purple-500/20 text-[10px] space-y-1 relative">
                <div className="flex justify-between text-purple-300">
                  <span>Assigned To:</span>
                  <span className="font-bold text-white">
                    {t.assignedToEmployeeCodes.join(', ')}
                  </span>
                </div>
                <div className="flex justify-between text-purple-300">
                  <span>Due:</span>
                  <span className="font-bold text-amber-300">
                    {t.dueDate} {t.dueTime}
                  </span>
                </div>
                <div className="flex justify-between text-purple-300">
                  <span>Progress:</span>
                  <span className="font-bold text-emerald-400">
                    {t.completionPercentage}%
                  </span>
                </div>
                <div className="absolute bottom-0 right-0 flex gap-2">
                  {(isSuperAdmin() || isAdmin()) && (
                    <button 
                      onClick={() => handleEditClick(t)}
                      className="p-1.5 bg-blue-500/20 hover:bg-blue-500/40 text-blue-400 rounded-md transition-colors"
                      title="Edit Task"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                  )}
                  {isSuperAdmin() && (
                    <button 
                      onClick={() => handleDeleteTask(t.id)}
                      className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-md transition-colors"
                      title="Delete Task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Task Modal */}
      <Dialog isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }} title={editingTaskId ? 'Edit Task' : 'Assign New Task'}>
        <div className="space-y-4 pt-2">
          
          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-300">Assign To Employee</label>
            <select
              value={selectedEmployeeCode}
              onChange={(e) => setSelectedEmployeeCode(e.target.value)}
              className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
            >
              <option value="">-- Select Employee --</option>
              {employees.map(e => (
                <option key={e.employeeCode} value={e.employeeCode}>
                  {e.name} ({e.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-300">Task Title</label>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Monthly Audit Report"
              className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-purple-300">Description</label>
            <textarea
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              placeholder="Detailed instructions..."
              className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Due Date</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Due Time (Optional)</label>
              <input
                type="time"
                value={taskDueTime}
                onChange={(e) => setTaskDueTime(e.target.value)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-purple-300">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            
            {editingTaskId && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-purple-300">Status</label>
                <select
                  value={taskStatus}
                  onChange={(e) => setTaskStatus(e.target.value as TaskStatus)}
                  className="w-full px-3 py-2 bg-[#1A0B36] border border-purple-500/30 rounded-xl text-xs text-white"
                >
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="OVERDUE">Overdue</option>
                </select>
              </div>
            )}
          </div>

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
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold"
            >
              {isSubmitting ? 'Saving...' : editingTaskId ? 'Save Changes' : 'Assign Task'}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
};
