import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Bell, ChevronRight, CheckCheck, Info, User, Home, MapPin, Trash2, HelpCircle } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useLocationContext } from '../../context/LocationContext';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';
import { GlobalSyncStatus } from '../common/GlobalSyncStatus';
import { ConnectivityIndicator } from '../common/ConnectivityIndicator';
import {
  getUnreadNotificationCount,
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  isNotificationForUser,
} from '../../services/notification/notificationService';
import {
  isNotificationEligibleForPopup,
  markPopupShown,
  isPopupShown,
} from '../../services/notification/alertDeduplication';
import { NotificationRecord } from '../../types/notification';
import { motion, AnimatePresence } from 'motion/react';
import { InAppNotificationToast, ToastPayload } from '../common/InAppNotificationToast';
import { CheckoutConfirmationModal } from '../attendance/CheckoutConfirmationModal';
import { GlobalUnresolvedRecovery } from '../common/GlobalUnresolvedRecovery';
import { initTaskDeadlineMonitor } from '../../services/planner/taskDeadlineEngine';

const MarqueeAddress: React.FC<{ address: string }> = ({ address }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        if (textWidth > containerWidth + 4) {
          const newDist = textWidth - containerWidth + 12;
          setOverflowDistance((prev) => (prev === newDist ? prev : newDist));
        } else {
          setOverflowDistance((prev) => (prev === 0 ? prev : 0));
        }
      }
    };

    checkOverflow();

    const observer = new ResizeObserver(() => checkOverflow());
    if (containerRef.current) observer.observe(containerRef.current);
    if (textRef.current) observer.observe(textRef.current);

    return () => observer.disconnect();
  }, [address]);

  const durationSec = Math.max(7, Math.round(overflowDistance / 18));

  return (
    <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)] font-medium overflow-hidden bg-[var(--app-bg-secondary)]/80 border border-[var(--primary)]/20 px-2 py-0.5 rounded-full min-w-[60px] flex-1 max-w-[150px] xs:max-w-[200px] sm:max-w-[280px]"
      title={address}
    >
      <MapPin className="w-3 h-3 text-[var(--primary)] shrink-0 z-10" />
      <div ref={containerRef} className="overflow-hidden relative flex-1 min-w-0">
        <span
          ref={textRef}
          className={`inline-block whitespace-nowrap text-[10.5px] text-[var(--text-secondary)] ${
            overflowDistance > 0 ? '' : 'truncate'
          }`}
          style={
            overflowDistance > 0
              ? ({
                  '--scroll-dist': `-${overflowDistance}px`,
                  animation: `marqueeSmooth ${durationSec}s ease-in-out infinite`,
                } as React.CSSProperties)
              : undefined
          }
        >
          {address}
        </span>
      </div>
    </div>
  );
};

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();
  const { 
    formattedDistance, 
    isInsideGeofence, 
    currentAddress, 
    locationStatus
  } = useLocationContext();

  const realtimeSync = useRealtimeSync();
  const syncNotifs = realtimeSync?.notifications || [];
  const syncUnreadCount = realtimeSync?.unreadNotificationCount ?? 0;

  const [activeToastNotif, setActiveToastNotif] = useState<ToastPayload | NotificationRecord | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentUser = React.useMemo(() => {
    if (adminUser) {
      return {
        id: adminUser.uid,
        employeeCode: 'ADMIN',
        role: 'ADMIN',
      };
    }
    if (employeeData) {
      return {
        id: employeeData.id || '',
        employeeCode: employeeData.employeeCode || '',
        role: employeeData.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE',
      };
    }
    return null;
  }, [adminUser?.uid, employeeData?.id, employeeData?.employeeCode, employeeData?.isTeamLeader]);

  const unreadCount = syncUnreadCount;
  const recentNotifs = React.useMemo(() => {
    return syncNotifs.slice(0, 3);
  }, [syncNotifs]);

  // Check for newly received eligible notifications and present popup immediately
  useEffect(() => {
    if (!currentUser || syncNotifs.length === 0) return;

    const unseenNotifs: NotificationRecord[] = [];

    syncNotifs.forEach((n) => {
      if (!isNotificationForUser(n, currentUser)) return;

      if (isPopupShown(n.id)) {
        return;
      }

      if (isNotificationEligibleForPopup(n)) {
        console.log('[NotificationRealtime] POPUP_TRIGGERED', { id: n.id, title: n.title });
        markPopupShown(n.id);
        unseenNotifs.push(n);
      } else {
        console.log('[NotificationRealtime] POPUP_DUPLICATE_SUPPRESSED', { id: n.id });
      }
    });

    if (unseenNotifs.length === 0) return;

    if (unseenNotifs.length === 1) {
      setActiveToastNotif({
        mode: 'SINGLE',
        notification: unseenNotifs[0],
      });
    } else {
      const count = unseenNotifs.length;
      const hasCritical = unseenNotifs.some(
        (n) => n.priority === 'URGENT' || n.priority === 'HIGH'
      );
      setActiveToastNotif({
        mode: 'SUMMARY',
        count,
        title: count <= 5 ? `🔔 ${count} New Notifications` : `🔔 New Notifications`,
        message: `You have ${count} new unread notifications.`,
        actionLabel: count <= 5 ? 'View Notifications' : 'View All',
        route: '/notifications',
        priority: hasCritical ? 'HIGH' : 'NORMAL',
      });
    }
  }, [currentUser, syncNotifs]);

  // Task deadline monitor for current employee
  useEffect(() => {
    if (!currentUser) return;
    const empCode = currentUser.employeeCode;
    const unsubDeadline = empCode ? initTaskDeadlineMonitor(empCode) : () => {};

    return () => {
      unsubDeadline();
    };
  }, [currentUser?.employeeCode, currentUser?.id]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const isOnline = realtimeSync?.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true);

  const handleBellClick = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleMarkAllRead = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    try {
      await markAllNotificationsRead(currentUser);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(id, currentUser || undefined);
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = async (notif: NotificationRecord) => {
    setDropdownOpen(false);
    try {
      if (!notif.read) {
        await markNotificationRead(notif.id);
      }
      
      if (notif.route) {
        navigate(notif.route);
      } else {
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
          case 'EFFICIENCY':
            navigate('/efficiency');
            break;
          default:
            break;
        }
      }
    } catch (err) {
      console.error('Error opening notification from bell:', err);
    }
  };

  const handleViewAll = () => {
    setDropdownOpen(false);
    navigate('/notifications');
  };

  const rawAddress = (typeof currentAddress === 'string' ? currentAddress.trim() : '');
  const displayAddress =
    rawAddress && !rawAddress.toLowerCase().includes('unavailable')
      ? rawAddress
      : (!isOnline ? 'Offline' : 'Raniganj HQ');

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--text-primary)] pb-20 relative overflow-x-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-[var(--aurora-emerald)]/15 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[400px] h-[400px] bg-[var(--aurora-teal)]/10 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed top-1/2 left-0 w-[300px] h-[500px] bg-[var(--aurora-cyan)]/5 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Dynamic Header Bar with Glassmorphism */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--card-surface)]/70 backdrop-blur-[24px] border-b border-[var(--border)] shadow-xl text-[var(--text-primary)]">
        <div className="container mx-auto px-3 sm:px-5 py-2.5 max-w-3xl flex items-center justify-between gap-2">
          {/* Left/Center Header Status & Location Controls */}
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Live Distance Value */}
            <div
              className="text-[10px] font-black text-[var(--text-secondary)] bg-[var(--card-bg)]/80 border border-[var(--border)] px-2.5 py-1 rounded-xl whitespace-nowrap shadow-sm flex items-center gap-1 shrink-0 uppercase tracking-tight"
              title="Live distance from office"
            >
              <span className="text-[var(--aurora-emerald)]">DIST:</span>
              <span>{formattedDistance}</span>
            </div>

            {/* Office Location Status Badge */}
            <div
              className={`text-[9px] font-black px-2.5 py-1 rounded-xl border whitespace-nowrap flex items-center gap-1.5 shadow-sm select-none shrink-0 transition-all duration-500 ${
                isInsideGeofence
                  ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                  : 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
              }`}
              title={isInsideGeofence ? 'Inside office geofence' : 'Outside office geofence'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isInsideGeofence ? 'bg-[var(--success)] animate-pulse' : 'bg-[var(--danger)]'}`} />
              <span className="tracking-[0.05em]">{isInsideGeofence ? 'GEOFENCE OK' : 'OUT OF RANGE'}</span>
            </div>

            {/* Global Sync Status */}
            <GlobalSyncStatus />

            {/* Location Address */}
            <div className="hidden xs:block min-w-0 flex-1">
              <MarqueeAddress address={displayAddress} />
            </div>
          </div>

          {/* Right Header Navigation Controls: [Notification Bell] */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser && (
              <>
                {!adminUser && (
                  <button
                    onClick={() => navigate('/faq')}
                    className="relative p-2 rounded-xl bg-[var(--card-bg)]/80 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--aurora-emerald)]/30 transition-all cursor-pointer shadow-sm active:scale-95"
                    aria-label="Help & FAQ"
                  >
                    <HelpCircle className="w-4.5 h-4.5" />
                  </button>
                )}
                <div className="relative shrink-0 flex items-center" ref={dropdownRef}>
                  {/* Bell Button */}
                  <button
                    onClick={handleBellClick}
                    className="relative p-2 rounded-xl bg-[var(--card-bg)]/80 border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--aurora-emerald)]/30 transition-all cursor-pointer shadow-sm active:scale-95"
                    aria-label="Toggle notifications"
                    id="notification-bell-btn"
                  >
                    <Bell className="w-4.5 h-4.5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--danger)] text-[9px] font-black text-white ring-2 ring-[var(--card-bg)] shadow-lg animate-bounce-subtle">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                {/* Popover Dropdown */}
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                       initial={{ opacity: 0, y: 12, scale: 0.95 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 12, scale: 0.95 }}
                       transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                       className="absolute right-0 mt-3 w-[320px] xs:w-[380px] glass-card-elevated z-50 overflow-hidden text-[var(--text-primary)] shadow-2xl"
                       id="notification-bell-dropdown"
                    >
                      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--card-surface)]/90">
                        <span className="font-black text-xs uppercase tracking-widest text-[var(--text-primary)]">Intelligence Alerts</span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllRead}
                              className="text-[9px] text-[var(--aurora-emerald)] hover:underline font-black flex items-center gap-1 bg-[var(--aurora-emerald)]/10 border border-[var(--aurora-emerald)]/20 px-2.5 py-1 rounded-lg transition-all uppercase tracking-wider"
                              id="mark-all-read-btn"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Clear All</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border)]">
                        {recentNotifs.length === 0 ? (
                          <div className="p-10 text-center flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-[var(--card-surface)] border border-[var(--border)] flex items-center justify-center">
                              <Bell className="w-5 h-5 text-[var(--text-muted)]" />
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">System Clear</span>
                          </div>
                        ) : (
                          recentNotifs.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-4 hover:bg-[var(--card-surface)] transition-all cursor-pointer flex items-start gap-4 text-left group relative ${
                                notif.read ? 'opacity-50' : 'bg-transparent'
                              }`}
                            >
                              {!notif.read && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--aurora-emerald)]" />
                              )}
                              <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                notif.read ? 'bg-[var(--card-bg)] border-[var(--border)]' : 'bg-[var(--aurora-emerald)]/10 border-[var(--aurora-emerald)]/20'
                              }`}>
                                <Info className={`w-4 h-4 ${notif.read ? 'text-[var(--text-muted)]' : 'text-[var(--aurora-emerald)]'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-black uppercase tracking-tight leading-tight ${notif.read ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2">
                                  {notif.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={(e) => handleDeleteNotification(e, notif.id)}
                                  className="p-1.5 rounded-lg hover:bg-[var(--danger)]/10 text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <button
                        onClick={handleViewAll}
                        className="w-full py-4 bg-[var(--card-surface)] hover:bg-[var(--card-bg)] text-center text-[10px] font-black text-[var(--aurora-emerald)] transition-all border-t border-[var(--border)] flex items-center justify-center gap-2 cursor-pointer uppercase tracking-[0.2em]"
                      >
                        <span>Portal Intelligence Center</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto p-4 pt-20 sm:pt-24 max-w-3xl pb-32">
        <InAppNotificationToast
          toastData={activeToastNotif}
          onDismiss={() => setActiveToastNotif(null)}
        />
        <CheckoutConfirmationModal />
        <GlobalUnresolvedRecovery />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
