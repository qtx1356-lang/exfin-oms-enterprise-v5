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
      {/* Subtle Emerald ambient lighting */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[var(--primary)]/10 rounded-full blur-[120px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-96 h-96 bg-[var(--primary)]/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Dynamic Header Bar with [Distance] [Office Status] [Location Address] [Bell] */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--card-bg)]/85 backdrop-blur-[16px] border-b border-[var(--primary)]/20 shadow-md text-[var(--text-primary)]">
        <div className="container mx-auto px-2.5 sm:px-4 py-2 max-w-3xl flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Left/Center Header Status & Location Controls */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden py-0.5">
            {/* Live Distance Value */}
            <div
              className="text-[10px] font-bold text-[var(--text-secondary)] bg-[var(--app-bg-secondary)]/80 border border-[var(--primary)]/20 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm flex items-center gap-1 shrink-0"
              title="Live distance from office"
            >
              <span>{formattedDistance}</span>
            </div>

            {/* Office Location Status Badge */}
            <div
              className={`text-[9px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap flex items-center gap-1 shadow-sm select-none shrink-0 ${
                isInsideGeofence
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
              }`}
              title={isInsideGeofence ? 'Inside office geofence' : 'Outside office geofence'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isInsideGeofence ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>{isInsideGeofence ? 'INSIDE OFFICE' : 'OUTSIDE OFFICE'}</span>
            </div>

            {/* Global Sync Status */}
            <GlobalSyncStatus />

            {/* Location Address */}
            <div className="block min-w-0 flex-1">
              <MarqueeAddress address={displayAddress} />
            </div>
          </div>

          {/* Right Header Navigation Controls: [Notification Bell] */}
          <div className="flex items-center gap-1.5 shrink-0">
            {currentUser && (
              <>
                {!adminUser && (
                  <button
                    onClick={() => navigate('/faq')}
                    className="relative p-1.5 sm:p-2 rounded-xl bg-[var(--app-bg-secondary)]/80 border border-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary-light)] hover:border-[var(--primary)]/50 transition-all cursor-pointer shadow-xs"
                    aria-label="Help & FAQ"
                    title="Help & FAQ"
                  >
                    <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                )}
                <div className="relative shrink-0 flex items-center" ref={dropdownRef}>
                  {/* Bell Button */}
                  <button
                    onClick={handleBellClick}
                    className="relative p-1.5 sm:p-2 rounded-xl bg-[var(--app-bg-secondary)]/80 border border-[var(--primary)]/20 text-[var(--text-secondary)] hover:text-[var(--primary-light)] hover:border-[var(--primary)]/50 transition-all cursor-pointer shadow-xs"
                    aria-label="Toggle notifications"
                    id="notification-bell-btn"
                  >
                    <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-rose-600 text-[9px] sm:text-[10px] font-bold text-white ring-2 ring-[var(--card-bg)]">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                {/* Popover Dropdown */}
                <AnimatePresence>
                  {dropdownOpen && (
                    <motion.div
                       initial={{ opacity: 0, y: 10, scale: 0.95 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 10, scale: 0.95 }}
                       transition={{ duration: 0.15 }}
                       className="absolute right-0 mt-2 w-80 sm:w-96 bg-[var(--card-bg)]/95 backdrop-blur-[20px] border border-[var(--primary)]/25 rounded-2xl shadow-xl z-50 overflow-hidden text-[var(--text-primary)]"
                       id="notification-bell-dropdown"
                    >
                      <div className="p-4 border-b border-[var(--primary)]/20 flex items-center justify-between bg-[var(--app-bg-secondary)]/90">
                        <span className="font-bold text-sm text-[var(--text-primary)]">Recent Alerts</span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllRead}
                              className="text-[11px] text-[var(--primary-light)] hover:underline font-bold flex items-center gap-1 bg-[var(--primary)]/15 border border-[var(--primary)]/30 px-2 py-0.5 rounded-full transition-colors"
                              title="Mark all notifications as read"
                              id="mark-all-read-btn"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Mark all read</span>
                            </button>
                          )}
                          {unreadCount > 0 && (
                            <span className="text-xs text-[var(--primary-light)] bg-[var(--primary)]/20 border border-[var(--primary)]/40 px-2 py-0.5 rounded-full font-bold">
                              {unreadCount} unread
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto divide-y divide-[var(--primary)]/15">
                        {recentNotifs.length === 0 ? (
                          <div className="p-6 text-center text-[var(--text-secondary)] text-xs">
                            No recent notifications.
                          </div>
                        ) : (
                          recentNotifs.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-3.5 hover:bg-[var(--app-bg-secondary)] transition-colors cursor-pointer flex items-start gap-3 text-left group ${
                                notif.read ? 'opacity-60' : 'bg-[var(--card-bg)]/60'
                              }`}
                            >
                              <div className="mt-1">
                                <Info className={`w-4 h-4 ${notif.read ? 'text-[var(--text-secondary)]' : 'text-[var(--primary-light)]'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold ${notif.read ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                                  {notif.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {!notif.read && (
                                  <div className="w-2 h-2 rounded-full bg-[var(--primary)] mt-1 shadow-[0_0_8px_var(--primary)]" />
                                )}
                                <button
                                  onClick={(e) => handleDeleteNotification(e, notif.id)}
                                  className="p-1 rounded hover:bg-rose-500/20 text-[var(--text-secondary)] hover:text-rose-400 transition-colors opacity-80 group-hover:opacity-100"
                                  title="Delete notification"
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
                        className="w-full py-3 bg-[var(--card-bg)] hover:bg-[var(--app-bg-secondary)] text-center text-xs font-bold text-[var(--primary-light)] transition-colors border-t border-[var(--primary)]/20 flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <span>View all alerts</span>
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

      <main className="container mx-auto p-4 pt-16 sm:pt-20 max-w-3xl pb-28">
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
