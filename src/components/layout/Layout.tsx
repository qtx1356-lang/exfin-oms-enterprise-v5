import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Bell, ChevronRight, CheckCheck, Info, User, Home, MapPin, Trash2 } from 'lucide-react';
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
  const [overflowDist, setOverflowDist] = useState<number>(0);

  useEffect(() => {
    let rafId: number;

    const measure = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;

        if (textWidth > containerWidth + 2) {
          const dist = textWidth - containerWidth + 12;
          setOverflowDist(dist);
        } else {
          setOverflowDist(0);
        }
      }
    };

    rafId = requestAnimationFrame(measure);

    const resizeObserver = new ResizeObserver(() => {
      measure();
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);
    if (textRef.current) resizeObserver.observe(textRef.current);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [address]);

  const durationSec = Math.max(6, Math.round(overflowDist / 15) + 3);

  return (
    <div
      className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)] font-bold overflow-hidden glass-inner-tile border border-[var(--border)] px-2.5 py-1 rounded-xl min-w-[70px] flex-1 max-w-[170px] xs:max-w-[260px] sm:max-w-[360px] shadow-sm shrink"
      title={address}
    >
      <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0 z-10" />
      <div ref={containerRef} className="overflow-hidden relative flex-1 min-w-0">
        <span
          ref={textRef}
          className={`inline-block whitespace-nowrap text-[10px] tracking-tight text-white/90 ${
            overflowDist > 0 ? 'animate-marquee-smooth' : 'truncate'
          }`}
          style={
            overflowDist > 0
              ? ({
                  '--scroll-dist': `-${overflowDist}px`,
                  animationDuration: `${durationSec}s`,
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
    <div className="min-h-screen bg-transparent text-[var(--text-primary)] pb-20 relative overflow-x-hidden">
      {/* Premium Ambient Gradient Glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[320px] bg-[var(--primary)]/5 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-10 right-1/4 w-[450px] h-[450px] bg-[var(--primary-light)]/5 rounded-full blur-[160px] pointer-events-none -z-10" />
      <div className="fixed top-1/2 left-0 w-[350px] h-[500px] bg-[var(--info)]/5 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* Dynamic Header Bar with Frosted Glassmorphism */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-nav border-b border-[var(--border)] shadow-lg text-white">
        <div className="container mx-auto px-2.5 sm:px-4 py-2 max-w-3xl flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Left/Center Header Status & Location Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
            {/* Live Distance Value Pill (Cyan / Blue Accent) */}
            <div
              className="text-[10px] font-bold px-2 py-1 rounded-xl whitespace-nowrap shadow-sm flex items-center gap-1 shrink-0 uppercase tracking-tight glass-inner-tile border border-cyan-500/30 text-cyan-300"
              title="Live distance from office"
            >
              <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>{formattedDistance}</span>
            </div>

            {/* Office Location Status Badge */}
            <div
              className={`text-[9px] font-black px-2 py-1 rounded-xl border whitespace-nowrap flex items-center gap-1 shadow-sm select-none shrink-0 transition-all duration-300 ${
                isInsideGeofence
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.15)]'
              }`}
              title={isInsideGeofence ? 'Inside office geofence' : 'Outside office geofence'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isInsideGeofence ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="tracking-[0.05em]">{isInsideGeofence ? 'INSIDE' : 'OUTSIDE'}</span>
            </div>

            {/* Global Sync Status */}
            <GlobalSyncStatus />

            {/* Location Address (Marquee) */}
            <div className="block min-w-0 flex-1">
              <MarqueeAddress address={displayAddress} />
            </div>
          </div>

          {/* Right Header Navigation Controls: [Notification Bell] */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser && (
              <div className="relative shrink-0 flex items-center" ref={dropdownRef}>
                {/* Bell Button */}
                  <button
                    onClick={handleBellClick}
                    className="relative p-2 rounded-xl glass-inner-tile border border-[var(--border)] text-[#AAB8C7] hover:text-white hover:bg-white/10 transition-all cursor-pointer shadow-sm active:scale-95"
                    aria-label="Toggle notifications"
                    id="notification-bell-btn"
                  >
                    <Bell className="w-4.5 h-4.5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--danger)] text-[9px] font-black text-white ring-2 ring-white shadow-md animate-bounce-subtle">
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
                       className="absolute right-0 mt-3 w-[320px] xs:w-[380px] glass-card border border-[var(--border)] rounded-2xl z-50 overflow-hidden text-[var(--text-primary)] shadow-lg"
                       id="notification-bell-dropdown"
                    >
                      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-black/20">
                        <span className="font-black text-xs uppercase tracking-widest text-[var(--text-primary)]">Intelligence Alerts</span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllRead}
                              className="text-[9px] text-[var(--primary)] hover:underline font-black flex items-center gap-1 bg-[var(--primary)]/10 border border-[var(--primary)]/20 px-2.5 py-1 rounded-lg transition-all uppercase tracking-wider cursor-pointer"
                              id="mark-all-read-btn"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Clear All</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-white/10 bg-[var(--surface-inner)]">
                        {recentNotifs.length === 0 ? (
                          <div className="p-10 text-center flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-white/10 border border-[var(--border)] flex items-center justify-center">
                              <Bell className="w-5 h-5 text-[var(--text-muted)]" />
                            </div>
                            <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest">System Clear</span>
                          </div>
                        ) : (
                          recentNotifs.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-4 hover:bg-white/10 transition-all cursor-pointer flex items-start gap-4 text-left group relative ${
                                notif.read ? 'opacity-60' : 'bg-transparent'
                              }`}
                            >
                              {!notif.read && (
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-[var(--primary)]" />
                              )}
                              <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
                                notif.read ? 'bg-white/10 border-[var(--border)]' : 'bg-[var(--primary)]/10 border-[var(--primary)]/20'
                              }`}>
                                <Info className={`w-4 h-4 ${notif.read ? 'text-[var(--text-muted)]' : 'text-[var(--primary)]'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-black uppercase tracking-tight leading-tight ${notif.read ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed line-clamp-2">
                                  {notif.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={(e) => handleDeleteNotification(e, notif.id)}
                                  className="p-1.5 rounded-lg hover:bg-rose-500/20 text-[var(--text-muted)] hover:text-rose-400 transition-colors"
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
                        className="w-full py-4 bg-black/25 hover:bg-black/35 text-center text-[10px] font-black text-[var(--primary)] transition-all border-t border-[var(--border)] flex items-center justify-center gap-2 cursor-pointer uppercase tracking-[0.2em]"
                      >
                        <span>Portal Intelligence Center</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
