import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import {
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  isNotificationForUser,
} from '../../services/notification/notificationService';
import { NotificationRecord, NotificationCategory, NotificationPriority, parseTimestamp } from '../../types/notification';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  Bell,
  CheckCheck,
  Trash2,
  Calendar,
  ClipboardList,
  FileText,
  DollarSign,
  Smartphone,
  TrendingUp,
  AlertTriangle,
  Info,
  Clock,
} from 'lucide-react';
import { NotificationSettingsCard } from '../../components/common/NotificationSettingsCard';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();

  let realtimeSync: any = null;
  try {
    realtimeSync = useRealtimeSync();
  } catch (e) {
    // Context is not available
  }

  const [localNotifications, setLocalNotifications] = useState<NotificationRecord[]>([]);
  const notifications = realtimeSync ? realtimeSync.notifications : localNotifications;
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('ALL');
  const [activeTab, setActiveTab] = useState<'ALL' | 'UNREAD' | 'IMPORTANT' | 'SETTINGS'>('ALL');

  // Determine current user context
  const currentUser = adminUser
    ? {
        id: adminUser.uid,
        employeeCode: 'ADMIN',
        role: 'ADMIN',
      }
    : employeeData
    ? {
        id: employeeData.id || '',
        employeeCode: employeeData.employeeCode || '',
        role: employeeData.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE',
      }
    : null;

  const loadNotifications = async () => {
    if (!currentUser) return;
    if (realtimeSync) {
      setLoading(false);
      return; // Already resolved reactively
    }
    setLoading(true);
    try {
      const data = await getNotificationsForUser(currentUser);
      // Sort by canonical timestamp descending
      const sorted = [...data].sort(
        (a, b) => new Date(b.timestamp || b.createdAt || b.createdAtDeviceTime).getTime() - new Date(a.timestamp || a.createdAt || a.createdAtDeviceTime).getTime()
      );
      setLocalNotifications(sorted);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const userId = adminUser?.uid || employeeData?.employeeCode || employeeData?.id;

  useEffect(() => {
    if (realtimeSync) {
      setLoading(false);
      return;
    }
    loadNotifications();

    const handleUpdate = () => {
      loadNotifications();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    };

    window.addEventListener('exfin-notifications-updated', handleUpdate);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('exfin-notifications-updated', handleUpdate);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userId, realtimeSync]);

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    try {
      await markAllNotificationsRead(currentUser);
      await loadNotifications();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = (notif: NotificationRecord) => {
    try {
      if (!notif.read && !(notif as any).isRead) {
        markNotificationRead(notif.id, currentUser || undefined).catch((err) =>
          console.warn('Failed to mark notification read:', err)
        );
        // Conditional local update if not using real-time sync
        if (!realtimeSync) {
          setLocalNotifications((prev) =>
            prev.map((n) => (n.id === notif.id ? { ...n, read: true, isRead: true } : n))
          );
        }
      }
      
      // Navigate to correct module deep-link if route is configured
      if (notif.route) {
        navigate(notif.route);
      } else {
        // Fallback mapping based on category or type
        switch (notif.category) {
          case 'ATTENDANCE':
            navigate('/attendance');
            break;
          case 'PLANNER':
            navigate('/planner');
            break;
          case 'LEAVE':
            navigate('/leave');
            break;
          case 'EXPENSE':
            navigate('/expenses');
            break;
          case 'DEVICE':
            navigate('/profile');
            break;
          case 'EFFICIENCY':
            navigate('/efficiency');
            break;
          default:
            break;
        }
      }
    } catch (err) {
      console.error('Error handling notification click:', err);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(id, currentUser || undefined);
      if (!realtimeSync) {
        setLocalNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const isImportantNotification = (n: NotificationRecord) => {
    const p = String(n.priority || '').toUpperCase();
    return p === 'HIGH' || p === 'URGENT' || p === 'CRITICAL' || p === 'IMPORTANT';
  };

  // Filter based on tab, category, and strict user isolation
  const filteredNotifications = notifications.filter((n) => {
    // 0. Strict user isolation
    if (!isNotificationForUser(n, currentUser)) return false;

    // 1. Filter by Tab (ALL, UNREAD, IMPORTANT)
    if (activeTab === 'UNREAD' && (n.read || (n as any).isRead)) return false;
    if (activeTab === 'IMPORTANT' && !isImportantNotification(n)) return false;

    // 2. Filter by Category
    if (activeCategory !== 'ALL' && n.category !== activeCategory) return false;

    return true;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'ATTENDANCE':
        return <Calendar className="w-4 h-4 text-emerald-400" />;
      case 'PLANNER':
        return <ClipboardList className="w-4 h-4 text-blue-400" />;
      case 'LEAVE':
        return <FileText className="w-4 h-4 text-orange-400" />;
      case 'EXPENSE':
        return <DollarSign className="w-4 h-4 text-yellow-400" />;
      case 'DEVICE':
        return <Smartphone className="w-4 h-4 text-[#D4AF37]" />;
      case 'EFFICIENCY':
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      default:
        return <Info className="w-4 h-4 text-cyan-400" />;
    }
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return 'Time unavailable';
    try {
      const date = parseTimestamp(timeStr);
      if (!date) return 'Time unavailable';
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Time unavailable';
    }
  };

  const getPriorityStyle = (priority: NotificationPriority) => {
    switch (priority) {
      case 'URGENT':
        return 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20';
      case 'HIGH':
        return 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm shadow-amber-500/20';
      case 'NORMAL':
        return 'bg-blue-500/20 text-blue-300 border border-blue-500/40';
      default:
        return 'bg-slate-500/20 text-slate-300 border border-slate-500/30';
    }
  };

  const getPriorityBadgeLabel = (priority: NotificationPriority) => {
    switch (priority) {
      case 'URGENT':
        return '🔴 URGENT';
      case 'HIGH':
        return '🔴 HIGH';
      case 'NORMAL':
        return '🟢 IMPORTANT';
      default:
        return '⚪ NORMAL';
    }
  };

  return (
    <div className="py-6 min-h-[calc(100vh-120px)] space-y-6 max-w-5xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Bell className="w-7 h-7 text-indigo-600" />
            Notification Center
          </h1>
          <p className="text-slate-600 text-xs font-medium mt-0.5">
            Centralized notification feed and actionable real-time alerts
          </p>
        </div>

        {notifications.some((n) => !n.read && !(n as any).isRead) && (
          <Button
            onClick={handleMarkAllRead}
            variant="tonal"
            className="rounded-xl flex items-center gap-2 text-xs font-bold shadow-sm"
          >
            <CheckCheck className="w-4 h-4 text-indigo-600" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        {(['ALL', 'UNREAD', 'IMPORTANT', 'SETTINGS'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 font-bold text-sm relative transition-all duration-200 cursor-pointer ${
              activeTab === tab ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab === 'ALL' && 'All Alerts'}
            {tab === 'UNREAD' && 'Unread'}
            {tab === 'IMPORTANT' && 'Critical & High'}
            {tab === 'SETTINGS' && 'Preferences'}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'SETTINGS' ? (
        <NotificationSettingsCard />
      ) : (
        <>
          {/* Categories Horizontal Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {[
              { key: 'ALL', label: 'All Modules' },
              { key: 'ATTENDANCE', label: 'Attendance' },
              { key: 'PLANNER', label: 'Planner' },
              { key: 'LEAVE', label: 'Leave' },
              { key: 'EXPENSE', label: 'Expenses' },
              { key: 'DEVICE', label: 'Device' },
              { key: 'EFFICIENCY', label: 'Efficiency' },
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap cursor-pointer ${
                  activeCategory === cat.key
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 border-transparent text-white shadow-md'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Content Feed */}
          {loading ? (
            <div className="glass-card-elevated p-8 flex flex-col items-center justify-center rounded-2xl text-white">
              <Clock className="w-8 h-8 animate-spin text-cyan-300 mb-2" />
              <p className="text-sm font-semibold">Synchronizing notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="bg-white/70 backdrop-blur-md p-8 border border-slate-300 rounded-2xl shadow-sm">
              <EmptyState
                icon={Bell}
                title="All Clear"
                description="No notifications match the selected filter criteria."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex gap-4 text-white ${
                    notif.read
                      ? 'glass-card-elevated opacity-75 hover:opacity-100 hover:border-cyan-400/30'
                      : 'glass-card-elevated hover:border-cyan-400/60 shadow-lg'
                  }`}
                >
                  {/* Left category icon with indicator */}
                  <div className="relative flex-shrink-0 flex items-start mt-0.5">
                    <div className="p-2.5 rounded-xl glass-card-inner">
                      {getCategoryIcon(notif.category)}
                    </div>
                    {!notif.read && (
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-400"></span>
                      </span>
                    )}
                  </div>

                  {/* Main message details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                      <h3 className="font-bold text-sm text-white truncate pr-2">
                        {notif.title}
                      </h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${getPriorityStyle(notif.priority as NotificationPriority)}`}>
                          {getPriorityBadgeLabel(notif.priority as NotificationPriority)}
                        </span>
                        <span className="text-[11px] text-[var(--text-secondary)] font-medium">
                          {formatTime(notif.timestamp || notif.createdAtDeviceTime)}
                        </span>
                      </div>
                    </div>

                    <p className="text-[var(--text-secondary)] text-xs leading-relaxed mb-1 pr-6 break-words">
                      {notif.message}
                    </p>

                    <div className="flex items-center gap-2 flex-wrap mt-2">
                      <span className="text-[10px] uppercase tracking-wider font-black text-cyan-300">
                        {notif.category}
                      </span>
                      
                      {/* Delivery Channel Badges */}
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-md font-bold">
                        In-App ✓
                      </span>

                      {notif.emailStatus && notif.emailStatus !== 'NOT_REQUIRED' && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold border ${
                          notif.emailStatus === 'DELIVERED' || notif.emailStatus === 'SENT'
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                            : 'glass-card-inner text-[var(--text-secondary)]'
                        }`}>
                          Email: {notif.emailStatus}
                        </span>
                      )}

                      {notif.smsStatus && notif.smsStatus !== 'NOT_REQUIRED' && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold border ${
                          notif.smsStatus === 'DELIVERED' || notif.smsStatus === 'SENT'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'glass-card-inner text-[var(--text-secondary)]'
                        }`}>
                          SMS: {notif.smsStatus}
                        </span>
                      )}

                      {notif.pushStatus && notif.pushStatus !== 'NOT_REQUIRED' && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold border ${
                          notif.pushStatus === 'SENT' || notif.pushStatus === 'DELIVERED'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}>
                          Push: {notif.pushStatus === 'SENT' ? 'SENT ✓' : notif.pushStatus}
                        </span>
                      )}

                      {notif.syncStatus === 'PENDING' && (
                        <span className="text-[9px] text-amber-300 bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.5 rounded-md font-bold">
                          Offline Sync Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right delete option */}
                  <div className="flex items-start">
                    <button
                      onClick={(e) => handleDelete(e, notif.id)}
                      className="p-1 rounded-lg hover:bg-rose-500/20 text-[var(--text-secondary)] hover:text-rose-300 transition-colors cursor-pointer"
                      title="Archive notification"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
