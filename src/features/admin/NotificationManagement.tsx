import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  doc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  addDoc,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { NotificationDeliveryLog } from './NotificationDeliveryLog';

// Helper functions for robust Date/Timestamp conversions to handle both Firestore Timestamp and ISO string formats
const getScheduledDate = (val: any): Date | null => {
  if (!val) return null;
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (val && typeof val.toDate === 'function') {
    return val.toDate();
  }
  if (val && val.seconds) {
    return new Date(val.seconds * 1000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const getScheduledDateString = (val: any): string => {
  const d = getScheduledDate(val);
  return d ? d.toLocaleString() : 'N/A';
};

const getDatetimeLocalString = (val: any): string => {
  const dateObj = getScheduledDate(val);
  if (!dateObj) return '';
  
  // Convert date object to Local ISO String (YYYY-MM-DDTHH:mm)
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = dateObj.getFullYear();
  const month = pad(dateObj.getMonth() + 1);
  const day = pad(dateObj.getDate());
  const hours = pad(dateObj.getHours());
  const minutes = pad(dateObj.getMinutes());
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};
import { db, auth } from '../../services/firebase/config';
import { usePermission } from '../../context/PermissionContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { 
  Bell, 
  Megaphone, 
  Send, 
  Clock, 
  Trash2, 
  Edit3, 
  Search, 
  Filter, 
  AlertCircle,
  CheckCircle,
  Users,
  Building2,
  Calendar,
  AlertTriangle,
  Info,
  ChevronRight,
  Sparkles,
  Eye,
  Check
} from 'lucide-react';
import { NotificationType, NotificationCategory, NotificationPriority, NotificationRecord } from '../../types/notification';

interface Registration {
  id: string;
  employeeCode: string;
  name: string;
  office: string;
  department?: string;
  designation?: string;
  role: string;
  status: string;
}

interface Campaign {
  id: string;
  title: string;
  message: string;
  type: 'NOTIFICATION' | 'ANNOUNCEMENT';
  notificationType?: string;
  category?: string;
  priority?: NotificationPriority;
  route?: string;
  targetType: 'ALL' | 'DEPARTMENT' | 'DESIGNATION' | 'SELECTED';
  targetValue: string | string[]; // department name, designation name, or array of employee codes
  status: 'SCHEDULED' | 'SENT' | 'CANCELLED';
  createdAt: string;
  scheduledAt?: any;
  sentAt?: string;
  recipientCount: number;
  createdBy: string;
}

export const NotificationManagement: React.FC = () => {
  const { isSuperAdmin, isAdmin } = usePermission();
  const { user: adminUser, loginId } = useAdminAuth();

  const [activeTab, setActiveTab] = useState<'compose' | 'active' | 'history' | 'delivery'>('compose');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Data from DB
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [designations, setDesignations] = useState<{ id: string; name: string }[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  
  // Real-time Read Statistics for Campaigns
  const [campaignStats, setCampaignStats] = useState<Record<string, { total: number; read: number }>>({});

  // Compose State
  const [composerType, setComposerType] = useState<'NOTIFICATION' | 'ANNOUNCEMENT'>('NOTIFICATION');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [notifType, setNotifType] = useState<string>('SYSTEM_ALERT');
  const [priority, setPriority] = useState<NotificationPriority>('NORMAL');
  const [route, setRoute] = useState('');
  const [targetType, setTargetType] = useState<'ALL' | 'DEPARTMENT' | 'DESIGNATION' | 'SELECTED'>('ALL');
  const [targetValue, setTargetValue] = useState('');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]); // Array of employee codes
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Selected Campaign to edit or view
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Search/Filters
  const [empSearch, setEmpSearch] = useState('');
  const [campaignSearch, setCampaignSearch] = useState('');

  const adminEmail = loginId || adminUser?.email || 'admin@exfin.internal';

  // 1. Fetch registrations, departments, designations, campaigns
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }

    const unsubRegs = onSnapshot(collection(db, 'registrations'), (snap) => {
      const list: Registration[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          employeeCode: d.employeeCode || docSnap.id,
          name: d.name || 'Unnamed',
          office: d.office || 'Raniganj',
          department: d.department || '',
          designation: d.designation || '',
          role: d.role || 'EMPLOYEE',
          status: d.status || 'Approved'
        });
      });
      setRegistrations(list);
    });

    const unsubDepts = onSnapshot(collection(db, 'departments'), (snap) => {
      const list: { id: string; name: string }[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({ id: docSnap.id, name: d.name || '' });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(list);
    });

    const unsubDesigs = onSnapshot(collection(db, 'designations'), (snap) => {
      const list: { id: string; name: string }[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({ id: docSnap.id, name: d.name || '' });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setDesignations(list);
    });

    const unsubCampaigns = onSnapshot(collection(db, 'notification_campaigns'), (snap) => {
      const list: Campaign[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Campaign);
      });
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCampaigns(list);
      setLoading(false);
    });

    return () => {
      unsubRegs();
      unsubDepts();
      unsubDesigs();
      unsubCampaigns();
    };
  }, []);

  // 2. Fetch real-time delivery and read stats from the notifications collection for SENT campaigns
  useEffect(() => {
    if (!db || campaigns.length === 0) return;

    const sentCampaignIds = campaigns
      .filter((c) => c.status === 'SENT' && c.type === 'NOTIFICATION')
      .map((c) => c.id);

    if (sentCampaignIds.length === 0) return;

    // Listen to notifications collection where campaignId is present
    const unsubStats = onSnapshot(collection(db, 'notifications'), (snap) => {
      const stats: Record<string, { total: number; read: number }> = {};
      
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const campId = d.campaignId;
        if (campId) {
          if (!stats[campId]) {
            stats[campId] = { total: 0, read: 0 };
          }
          stats[campId].total += 1;
          if (d.read === true) {
            stats[campId].read += 1;
          }
        }
      });
      setCampaignStats(stats);
    });

    return () => unsubStats();
  }, [campaigns]);

  // 3. Process Scheduled campaigns whose scheduled time has passed
  useEffect(() => {
    if (campaigns.length === 0 || isSubmitting) return;

    const processScheduled = async () => {
      const now = new Date();
      const passedCampaigns = campaigns.filter((c) => {
        if (c.status !== 'SCHEDULED' || !c.scheduledAt) return false;
        const dateVal = getScheduledDate(c.scheduledAt);
        return dateVal ? dateVal <= now : false;
      });

      if (passedCampaigns.length === 0) return;

      console.log(`Auto-processing ${passedCampaigns.length} scheduled campaigns that are due...`);
      for (const campaign of passedCampaigns) {
        try {
          await triggerCampaignSend(campaign);
        } catch (err) {
          console.error(`Error sending scheduled campaign ${campaign.id}:`, err);
        }
      }
    };

    const interval = setInterval(processScheduled, 15000); // Check every 15s
    processScheduled(); // Also run immediately on campaigns load

    return () => clearInterval(interval);
  }, [campaigns, isSubmitting]);

  // Resolve target employees from filters
  const getTargetRecipients = (
    tType: 'ALL' | 'DEPARTMENT' | 'DESIGNATION' | 'SELECTED',
    tVal: string | string[],
    selCodes: string[]
  ): Registration[] => {
    // Filter active employees (Approved registration status, and not Admin/Super Admin)
    const activeEmployees = registrations.filter(
      (reg) => reg.status === 'Approved' && reg.role !== 'SUPER_ADMIN' && reg.role !== 'ADMIN'
    );

    switch (tType) {
      case 'ALL':
        return activeEmployees;
      case 'DEPARTMENT':
        return activeEmployees.filter(
          (reg) => 
            reg.office === tVal || 
            reg.department === tVal || 
            (reg.office && reg.office.toLowerCase() === (tVal as string).toLowerCase()) ||
            (reg.department && reg.department.toLowerCase() === (tVal as string).toLowerCase())
        );
      case 'DESIGNATION':
        return activeEmployees.filter(
          (reg) => 
            reg.designation === tVal || 
            (reg.designation && reg.designation.toLowerCase() === (tVal as string).toLowerCase())
        );
      case 'SELECTED':
        return activeEmployees.filter((reg) => selCodes.includes(reg.employeeCode));
      default:
        return [];
    }
  };

  // Compose trigger
  const handleComposeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setErrorMessage('Validation Error: Title and Message/Content cannot be empty.');
      return;
    }

    if (targetType === 'DEPARTMENT' && !targetValue) {
      setErrorMessage('Validation Error: Please select a target department.');
      return;
    }

    if (targetType === 'DESIGNATION' && !targetValue) {
      setErrorMessage('Validation Error: Please select a target designation.');
      return;
    }

    if (targetType === 'SELECTED' && selectedEmployees.length === 0) {
      setErrorMessage('Validation Error: Please select at least one employee.');
      return;
    }

    let scheduledAtTimestamp: Timestamp | undefined;
    if (isScheduled) {
      if (!scheduledDate || !scheduledTime) {
        setErrorMessage('Please select a valid schedule date and time.');
        return;
      }
      const sched = new Date(`${scheduledDate}T${scheduledTime}`);
      if (isNaN(sched.getTime())) {
        setErrorMessage('Please select a valid schedule date and time.');
        return;
      }
      if (sched <= new Date()) {
        setErrorMessage('Validation Error: Scheduling time must be in the future.');
        return;
      }
      scheduledAtTimestamp = Timestamp.fromDate(sched);
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const campaignId = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const recipients = getTargetRecipients(
        targetType, 
        targetType === 'SELECTED' ? selectedEmployees : targetValue, 
        selectedEmployees
      );

      const campaignPayload: any = {
        id: campaignId,
        title: title.trim(),
        message: message.trim(),
        type: composerType,
        targetType,
        targetValue: targetType === 'SELECTED' ? selectedEmployees : targetValue,
        status: isScheduled ? 'SCHEDULED' : 'SENT',
        createdAt: new Date().toISOString(),
        recipientCount: recipients.length,
        createdBy: adminEmail,
      };

      if (isScheduled && scheduledAtTimestamp) {
        campaignPayload.scheduledAt = scheduledAtTimestamp;
      }

      if (!isScheduled) {
        campaignPayload.sentAt = new Date().toISOString();
      }

      if (composerType === 'NOTIFICATION') {
        campaignPayload.notificationType = notifType;
        campaignPayload.category = getCategoryFromNotifType(notifType);
        campaignPayload.priority = priority;
        if (route.trim()) {
          campaignPayload.route = route.trim();
        }
      }

      await setDoc(doc(db, 'notification_campaigns', campaignId), campaignPayload);

      if (!isScheduled) {
        // Send immediately!
        await triggerCampaignSend(campaignPayload);
        setSuccessMessage(`${composerType === 'NOTIFICATION' ? 'Notification' : 'Announcement'} sent successfully to ${recipients.length} recipients!`);
      } else {
        const localSchedString = scheduledAtTimestamp ? scheduledAtTimestamp.toDate().toLocaleString() : '';
        setSuccessMessage(`${composerType === 'NOTIFICATION' ? 'Notification' : 'Announcement'} scheduled successfully for ${localSchedString}`);
      }

      // Reset Form State
      setTitle('');
      setMessage('');
      setRoute('');
      setTargetValue('');
      setSelectedEmployees([]);
      setIsScheduled(false);
      setScheduledDate('');
      setScheduledTime('');
    } catch (err: any) {
      console.error('Error creating campaign:', err);
      setErrorMessage('Database Error: Failed to execute requested action. ' + (err.message || ''));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper function to trigger sending a campaign
  const triggerCampaignSend = async (campaign: Campaign): Promise<void> => {
    const recipients = getTargetRecipients(
      campaign.targetType,
      campaign.targetValue,
      campaign.targetType === 'SELECTED' ? (campaign.targetValue as string[]) : []
    );

    const nowIso = new Date().toISOString();

    if (campaign.type === 'NOTIFICATION' || campaign.type === 'ANNOUNCEMENT') {
      // Create batch or individual documents in notifications collection for both notifications and announcements
      const batch = writeBatch(db);
      
      recipients.forEach((rec) => {
        const notifId = `notif_${campaign.id}_${rec.employeeCode}`;
        const ref = doc(db, 'notifications', notifId);
        
        const payload: NotificationRecord & { channels?: string[] } = {
          id: notifId,
          type: campaign.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : (campaign.notificationType || 'SYSTEM_ALERT'),
          category: campaign.type === 'ANNOUNCEMENT' ? 'SYSTEM' : ((campaign.category as any) || 'SYSTEM'),
          title: campaign.title,
          message: campaign.message,
          recipientUserId: rec.id,
          recipientEmployeeCode: rec.employeeCode,
          recipientRole: rec.role,
          priority: campaign.type === 'ANNOUNCEMENT' ? 'HIGH' : (campaign.priority || 'NORMAL'),
          route: campaign.route || '',
          read: false,
          timestamp: nowIso,
          createdAtDeviceTime: nowIso,
          updatedAtDeviceTime: nowIso,
          serverSyncTime: nowIso,
          syncStatus: 'SYNCED',
          channels: ['IN_APP', 'PUSH'],
          campaignId: campaign.id // Group key for analytics
        } as any;

        batch.set(ref, payload);
      });

      await batch.commit();

      // Also create announcement entry in announcements collection for announcements section display
      if (campaign.type === 'ANNOUNCEMENT') {
        const announcementId = `ann_${campaign.id}`;
        await setDoc(doc(db, 'announcements', announcementId), {
          id: announcementId,
          title: campaign.title,
          content: campaign.message,
          date: nowIso, // Backward compatibility timestamp
          campaignId: campaign.id,
          targetType: campaign.targetType,
          targetValue: campaign.targetValue,
          createdBy: campaign.createdBy
        });
      }
    } else {
      // Create a single document in announcements collection
      const announcementId = `ann_${campaign.id}`;
      await setDoc(doc(db, 'announcements', announcementId), {
        id: announcementId,
        title: campaign.title,
        content: campaign.message,
        date: nowIso, // Backward compatibility timestamp
        campaignId: campaign.id,
        targetType: campaign.targetType,
        targetValue: campaign.targetValue,
        createdBy: campaign.createdBy
      });
    }

    // Update campaign status to SENT
    await setDoc(doc(db, 'notification_campaigns', campaign.id), {
      status: 'SENT',
      sentAt: nowIso,
      recipientCount: recipients.length
    }, { merge: true });
  };

  // Cancel scheduled campaign
  const handleCancelCampaign = async (campaignId: string) => {
    try {
      await setDoc(doc(db, 'notification_campaigns', campaignId), {
        status: 'CANCELLED'
      }, { merge: true });
      setSuccessMessage('Scheduled notification/announcement cancelled successfully.');
    } catch (err: any) {
      console.error('Error cancelling campaign:', err);
      setErrorMessage('Failed to cancel campaign: ' + err.message);
    }
  };

  // Delete campaign records
  const handleDeleteCampaign = async (campaign: Campaign) => {
    if (!window.confirm('Are you sure you want to delete this notification record? This will also remove the notification from employee feeds.')) return;
    try {
      // 1. Delete campaign meta doc
      await deleteDoc(doc(db, 'notification_campaigns', campaign.id));

      if (campaign.type === 'NOTIFICATION') {
        // Find and delete individual sent notifications in batch
        const qNotifs = query(collection(db, 'notifications'), where('campaignId', '==', campaign.id));
        const snapshots = await getDocs(qNotifs);
        const batch = writeBatch(db);
        snapshots.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } else {
        // Delete from announcements collection
        await deleteDoc(doc(db, 'announcements', `ann_${campaign.id}`));
      }

      setSuccessMessage('Campaign record deleted successfully.');
    } catch (err: any) {
      console.error('Error deleting campaign:', err);
      setErrorMessage('Failed to delete campaign: ' + err.message);
    }
  };

  // Edit / Save Scheduled Campaign changes
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign) return;

    if (!editingCampaign.title.trim() || !editingCampaign.message.trim()) {
      setErrorMessage('Title and Content cannot be empty.');
      return;
    }

    setIsSubmitting(true);
    try {
      const ref = doc(db, 'notification_campaigns', editingCampaign.id);
      
      const updatePayload: any = {
        title: editingCampaign.title.trim(),
        message: editingCampaign.message.trim()
      };

      if (editingCampaign.priority) {
        updatePayload.priority = editingCampaign.priority;
      }

      if (editingCampaign.scheduledAt) {
        const dateObj = getScheduledDate(editingCampaign.scheduledAt);
        if (dateObj) {
          updatePayload.scheduledAt = Timestamp.fromDate(dateObj);
        }
      }

      await setDoc(ref, updatePayload, { merge: true });

      setSuccessMessage('Scheduled campaign updated successfully.');
      setIsEditModalOpen(false);
      setEditingCampaign(null);
    } catch (err: any) {
      console.error('Error updating scheduled campaign:', err);
      setErrorMessage('Failed to update scheduled campaign: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to map NotificationType to Category
  const getCategoryFromNotifType = (type: string): NotificationCategory => {
    if (type.startsWith('TASK_') || type.startsWith('MANAGER_')) return 'PLANNER';
    if (type.startsWith('LEAVE_')) return 'LEAVE';
    if (type.startsWith('EXPENSE_')) return 'EXPENSE';
    if (type.startsWith('DEVICE_')) return 'DEVICE';
    if (type === 'EFFICIENCY_UPDATED') return 'EFFICIENCY';
    if (type.includes('CHECKIN') || type.includes('CHECKOUT')) return 'ATTENDANCE';
    return 'SYSTEM';
  };

  // Filtering campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.title.toLowerCase().includes(campaignSearch.toLowerCase()) || 
                          c.message.toLowerCase().includes(campaignSearch.toLowerCase());
    return matchesSearch;
  });

  const activeScheduled = filteredCampaigns.filter((c) => c.status === 'SCHEDULED');
  const historySent = filteredCampaigns.filter((c) => c.status === 'SENT' || c.status === 'CANCELLED');

  // Filter employees for recipient selector
  const activeEmployeesList = registrations.filter(
    (reg) => reg.status === 'Approved' && reg.role !== 'SUPER_ADMIN' && reg.role !== 'ADMIN'
  );

  const filteredEmployeesForSelector = activeEmployeesList.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(empSearch.toLowerCase()) || 
                          emp.employeeCode.toLowerCase().includes(empSearch.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center justify-between border-b border-purple-500/20 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-500 to-purple-600 flex items-center justify-center shadow-md">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              Announcements & Notifications
            </h2>
            <p className="text-[11px] text-purple-300/80">Manage general announcements and user targeting push notifications</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button 
            onClick={() => setActiveTab('compose')} 
            variant={activeTab === 'compose' ? 'primary' : 'secondary'}
            className="text-xs"
          >
            Create Alert
          </Button>
          <Button 
            onClick={() => setActiveTab('active')} 
            variant={activeTab === 'active' ? 'primary' : 'secondary'}
            className="text-xs flex items-center gap-1.5"
          >
            Scheduled ({activeScheduled.length})
          </Button>
          <Button 
            onClick={() => setActiveTab('history')} 
            variant={activeTab === 'history' ? 'primary' : 'secondary'}
            className="text-xs flex items-center gap-1.5"
          >
            Campaign History
          </Button>
          <Button 
            onClick={() => setActiveTab('delivery')} 
            variant={activeTab === 'delivery' ? 'primary' : 'secondary'}
            className="text-xs flex items-center gap-1.5"
          >
            Delivery Log
          </Button>
        </div>
      </div>

      {/* Message banners */}
      {successMessage && (
        <div className="bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 p-4 rounded-xl flex items-center gap-3 text-xs shadow-md">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <div>
            <p className="font-extrabold text-white">Action Completed Successfully</p>
            <p className="text-purple-200/90 mt-0.5">{successMessage}</p>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="ml-auto text-purple-300/60 hover:text-white">&times;</button>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-950/60 border border-rose-500/30 text-rose-200 p-4 rounded-xl flex items-center gap-3 text-xs shadow-md">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <p className="font-extrabold text-white">Error Detected</p>
            <p className="text-purple-200/95 mt-0.5">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-purple-300/60 hover:text-white">&times;</button>
        </div>
      )}

      {/* COMPOSE TAB */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <Card className="lg:col-span-2 p-6 bg-[#250F4C] border border-purple-500/20 space-y-6">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" /> Composer Engine
            </h3>

            <form onSubmit={handleComposeSubmit} className="space-y-4">
              {/* Type toggle */}
              <div>
                <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1.5">Communication Medium</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setComposerType('NOTIFICATION');
                      setNotifType('SYSTEM_ALERT');
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition ${
                      composerType === 'NOTIFICATION' 
                        ? 'bg-purple-600/20 text-white border-purple-500' 
                        : 'bg-white/5 text-purple-300/80 border-purple-500/10 hover:text-white'
                    }`}
                  >
                    <Bell className="w-4 h-4" />
                    Push Notification
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerType('ANNOUNCEMENT')}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 font-bold text-xs transition ${
                      composerType === 'ANNOUNCEMENT' 
                        ? 'bg-purple-600/20 text-white border-purple-500' 
                        : 'bg-white/5 text-purple-300/80 border-purple-500/10 hover:text-white'
                    }`}
                  >
                    <Megaphone className="w-4 h-4" />
                    General Announcement
                  </button>
                </div>
              </div>

              {/* Title Input */}
              <div>
                <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Headline / Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Server Maintenance or Policy Update"
                  className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              {/* Content Input */}
              <div>
                <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Content / Message Body <span className="text-red-400">*</span></label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write details of the alert here..."
                  rows={4}
                  className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-500 resize-none"
                  required
                />
              </div>

              {/* Notification Details (only for NOTIFICATION) */}
              {composerType === 'NOTIFICATION' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#1A0B36]/50 p-4 rounded-xl border border-purple-500/10">
                  <div>
                    <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Notification Category/Type</label>
                    <select
                      value={notifType}
                      onChange={(e) => setNotifType(e.target.value)}
                      className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="SYSTEM_ALERT">System Alert / Admin Notification</option>
                      <option value="TASK_ASSIGNED">Task/Planner Assigned</option>
                      <option value="LEAVE_BALANCE_CHANGED">Leave Policy / Balance Update</option>
                      <option value="EXPENSE_APPROVED">Expense Claim Alert</option>
                      <option value="EFFICIENCY_UPDATED">Efficiency & Performance Metric</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Priority Classification</label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                      className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="LOW">Low - General Information</option>
                      <option value="NORMAL">Normal - Routine updates</option>
                      <option value="HIGH">High - Urgent Action Required</option>
                      <option value="URGENT">Urgent - High Priority/Critical</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">App Deep Link / Route (Optional)</label>
                    <input
                      type="text"
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                      placeholder="e.g. /attendance or /leave or /planner"
                      className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white placeholder-purple-300/30 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
              )}

              {/* Scheduling Details */}
              <div className="bg-[#1A0B36]/50 p-4 rounded-xl border border-purple-500/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[11px] text-white font-extrabold block">Schedule Transmission</label>
                    <p className="text-[10px] text-purple-300/60">Configure delay or schedule for future release</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={isScheduled}
                    onChange={(e) => setIsScheduled(e.target.checked)}
                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                  />
                </div>

                {isScheduled && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-[9px] text-purple-300 font-extrabold uppercase block mb-1">Target Date</label>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        required={isScheduled}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-purple-300 font-extrabold uppercase block mb-1">Target Time (24h)</label>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                        required={isScheduled}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Controls */}
              <div className="pt-2 flex justify-end">
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="bg-purple-600 hover:bg-purple-500 flex items-center gap-1.5 text-xs py-2.5"
                >
                  {isScheduled ? <Clock className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  {isSubmitting ? 'Processing...' : isScheduled ? 'Schedule Release' : 'Broadcast Now'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Recipient Targeting Panel */}
          <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
            <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" /> Targeting Scope
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Target Audience</label>
                <select
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value as any);
                    setTargetValue('');
                    setSelectedEmployees([]);
                  }}
                  className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="ALL">All Active Employees</option>
                  <option value="DEPARTMENT">Specific Department</option>
                  <option value="DESIGNATION">Specific Designation</option>
                  <option value="SELECTED">Selected Employees (Custom Select)</option>
                </select>
              </div>

              {/* Department Option */}
              {targetType === 'DEPARTMENT' && (
                <div>
                  <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Select Department</label>
                  {departments.length === 0 ? (
                    <p className="text-[10px] text-amber-400 italic">No departments declared. Go to Organization settings to add departments.</p>
                  ) : (
                    <select
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                      required
                    >
                      <option value="">-- Choose Department --</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.name}>{dept.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Designation Option */}
              {targetType === 'DESIGNATION' && (
                <div>
                  <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Select Designation</label>
                  {designations.length === 0 ? (
                    <p className="text-[10px] text-amber-400 italic">No designations declared. Go to Organization settings to add designations.</p>
                  ) : (
                    <select
                      value={targetValue}
                      onChange={(e) => setTargetValue(e.target.value)}
                      className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                      required
                    >
                      <option value="">-- Choose Designation --</option>
                      {designations.map((desig) => (
                        <option key={desig.id} value={desig.name}>{desig.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Selected Employees List Selector with Checklist */}
              {targetType === 'SELECTED' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-purple-300 font-extrabold uppercase">Selected: {selectedEmployees.length}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedEmployees([])}
                      className="text-[9px] font-extrabold text-[#7C3AED] hover:text-purple-300"
                    >
                      Clear Selection
                    </button>
                  </div>

                  {/* Search Bar inside selector */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-purple-300/40" />
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl pl-9 pr-4 py-2 text-[11px] text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  {/* Employees Checklist */}
                  <div className="max-h-[220px] overflow-y-auto border border-purple-500/15 rounded-xl divide-y divide-purple-500/10 bg-[#1A0B36]/30 pr-1 scrollbar-thin">
                    {filteredEmployeesForSelector.length === 0 ? (
                      <p className="text-[10px] text-purple-300/40 text-center py-6">No matching active employees</p>
                    ) : (
                      filteredEmployeesForSelector.map((emp) => {
                        const isChecked = selectedEmployees.includes(emp.employeeCode);
                        return (
                          <label 
                            key={emp.id} 
                            className="flex items-center gap-3 p-2.5 hover:bg-white/[0.02] cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedEmployees(selectedEmployees.filter(code => code !== emp.employeeCode));
                                } else {
                                  setSelectedEmployees([...selectedEmployees, emp.employeeCode]);
                                }
                              }}
                              className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                            />
                            <div className="flex-1">
                              <p className="font-bold text-white leading-none mb-0.5">{emp.name}</p>
                              <p className="text-[10px] text-purple-300/50 font-mono">{emp.employeeCode} • {emp.office} {emp.designation ? `(${emp.designation})` : ''}</p>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Resolved Count Box */}
              <div className="p-3 bg-[#1A0B36] rounded-xl border border-purple-500/10 flex justify-between items-center">
                <span className="text-[10px] text-purple-300 font-bold uppercase">Estimated Recipients</span>
                <span className="text-sm font-black text-emerald-400">
                  {getTargetRecipients(
                    targetType, 
                    targetType === 'SELECTED' ? selectedEmployees : targetValue, 
                    selectedEmployees
                  ).length}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SCHEDULED TAB */}
      {activeTab === 'active' && (
        <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Scheduled Broadcasting Campaigns
              </h3>
              <p className="text-[10px] text-purple-300/60 mt-0.5">Campaigns listed below will automatically dispatch at their scheduled times</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-purple-300/40" />
              <input
                type="text"
                placeholder="Search scheduled..."
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="space-y-3.5">
            {activeScheduled.length === 0 ? (
              <div className="text-center py-10 text-purple-300/40 border border-dashed border-purple-500/15 rounded-2xl">
                <Clock className="w-8 h-8 mx-auto text-purple-500/30 mb-2" />
                <p className="text-xs font-bold">No active scheduled campaigns</p>
                <p className="text-[10px] mt-0.5">Create a new broadcast alert and select 'Schedule' to queue it.</p>
              </div>
            ) : (
              activeScheduled.map((campaign) => (
                <div key={campaign.id} className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        campaign.type === 'NOTIFICATION' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}>
                        {campaign.type}
                      </span>
                      {campaign.priority && (
                        <span className={`text-[9px] font-bold uppercase ${
                          campaign.priority === 'URGENT' || campaign.priority === 'HIGH' ? 'text-red-400' : 'text-purple-300/60'
                        }`}>
                          • {campaign.priority} Priority
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-black text-white">{campaign.title}</h4>
                    <p className="text-xs text-purple-200/80 leading-relaxed max-w-2xl">{campaign.message}</p>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1.5 text-[10px] text-purple-300/60 font-medium">
                      <span>Target: <strong className="text-white">{campaign.targetType} ({campaign.targetValue || 'ALL'})</strong></span>
                      <span>Resolved: <strong className="text-emerald-400">{campaign.recipientCount}</strong></span>
                      <span>Scheduled At: <strong className="text-amber-400">{getScheduledDateString(campaign.scheduledAt)}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end md:self-center">
                    <Button
                      onClick={() => {
                        setEditingCampaign(campaign);
                        setIsEditModalOpen(true);
                      }}
                      className="bg-purple-600/20 text-purple-300 hover:text-white border border-purple-500/30 text-xs py-1.5 px-3"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      onClick={() => handleCancelCampaign(campaign.id)}
                      className="bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 text-[11px] py-1.5 px-3"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleDeleteCampaign(campaign)}
                      variant="secondary"
                      className="text-rose-400 hover:bg-rose-500/10 border border-rose-500/10 py-1.5 px-3"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* CAMPAIGN HISTORY TAB */}
      {activeTab === 'history' && (
        <Card className="p-6 bg-[#250F4C] border border-purple-500/20 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" /> Campaign Dispatch Logs
              </h3>
              <p className="text-[10px] text-purple-300/60 mt-0.5">Review dispatch status, dates, recipient distribution lists, and employee read statistics</p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-purple-300/40" />
              <input
                type="text"
                placeholder="Search history..."
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="space-y-4">
            {historySent.length === 0 ? (
              <div className="text-center py-10 text-purple-300/40 border border-dashed border-purple-500/15 rounded-2xl">
                <Info className="w-8 h-8 mx-auto text-purple-500/30 mb-2" />
                <p className="text-xs font-bold">No dispatch logs found</p>
                <p className="text-[10px] mt-0.5">Send or let scheduled alerts dispatch to populate the history logs.</p>
              </div>
            ) : (
              historySent.map((campaign) => {
                const stats = campaignStats[campaign.id] || { total: 0, read: 0 };
                const readPct = stats.total > 0 ? Math.round((stats.read / stats.total) * 100) : 0;

                return (
                  <div key={campaign.id} className="p-4 bg-[#1A0B36] rounded-2xl border border-purple-500/25 space-y-3">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            campaign.type === 'NOTIFICATION' ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {campaign.type}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                            campaign.status === 'SENT' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20' : 'bg-red-500/10 text-red-300 border border-red-500/20'
                          }`}>
                            {campaign.status}
                          </span>
                        </div>
                        <h4 className="text-sm font-black text-white">{campaign.title}</h4>
                        <p className="text-xs text-purple-200/85 leading-relaxed">{campaign.message}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                        <Button
                          onClick={() => handleDeleteCampaign(campaign)}
                          variant="secondary"
                          className="text-rose-400 hover:bg-rose-500/10 border border-rose-500/10 py-1.5 px-3 text-xs flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Log
                        </Button>
                      </div>
                    </div>

                    {/* Metadata Footer and read states */}
                    <div className="pt-2.5 border-t border-purple-500/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[10px] text-purple-300/60 font-medium">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>Audience Target: <strong className="text-white">{campaign.targetType} ({Array.isArray(campaign.targetValue) ? `${campaign.targetValue.length} Employees` : campaign.targetValue || 'ALL'})</strong></span>
                        <span>Dispatched: <strong className="text-white">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : 'N/A'}</strong></span>
                        <span>By: <strong className="text-white">{campaign.createdBy}</strong></span>
                      </div>

                      {/* Display Delivery stats for Push Notifications */}
                      {campaign.type === 'NOTIFICATION' && campaign.status === 'SENT' && (
                        <div className="flex items-center gap-3 bg-purple-950/40 px-3 py-1.5 rounded-xl border border-purple-500/10">
                          <span>Total Sent: <strong className="text-white">{campaign.recipientCount}</strong></span>
                          <span>Read Rate: <strong className="text-emerald-400">{readPct}% ({stats.read}/{stats.total})</strong></span>
                          
                          {/* Mini Progress bar */}
                          <div className="w-16 h-1.5 bg-[#1A0B36] rounded-full overflow-hidden shrink-0">
                            <div 
                              className="h-full bg-emerald-400 rounded-full" 
                              style={{ width: `${readPct}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      )}

      {/* DELIVERY LOG TAB */}
      {activeTab === 'delivery' && (
        <NotificationDeliveryLog />
      )}

      {/* Edit Scheduled Campaign Modal Dialog */}
      <Dialog
        isOpen={isEditModalOpen && !!editingCampaign}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingCampaign(null);
        }}
        title="Edit Scheduled Release"
      >
        {editingCampaign && (
          <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
            <div>
              <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Headline / Title</label>
              <input
                type="text"
                value={editingCampaign.title}
                onChange={(e) => setEditingCampaign({ ...editingCampaign, title: e.target.value })}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Content / Message Body</label>
              <textarea
                value={editingCampaign.message}
                onChange={(e) => setEditingCampaign({ ...editingCampaign, message: e.target.value })}
                rows={4}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500 resize-none"
                required
              />
            </div>

            {editingCampaign.type === 'NOTIFICATION' && (
              <div>
                <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Priority</label>
                <select
                  value={editingCampaign.priority}
                  onChange={(e) => setEditingCampaign({ ...editingCampaign, priority: e.target.value as NotificationPriority })}
                  className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] text-purple-300 font-extrabold uppercase block mb-1">Scheduled Release Date & Time</label>
              <input
                type="datetime-local"
                value={editingCampaign.scheduledAt ? getDatetimeLocalString(editingCampaign.scheduledAt) : ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditingCampaign({ ...editingCampaign, scheduledAt: val ? new Date(val).toISOString() : undefined });
                }}
                className="w-full bg-[#1A0B36] border border-purple-500/20 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div className="pt-3 border-t border-purple-500/25 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingCampaign(null);
                }}
              >
                Discard
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-purple-600 hover:bg-purple-500"
              >
                {isSubmitting ? 'Saving Changes...' : 'Save Scheduled Changes'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
