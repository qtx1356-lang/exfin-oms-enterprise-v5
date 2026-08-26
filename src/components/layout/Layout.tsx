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
import { initTaskDeadlineMonitor } from '../../services/planner/taskDeadlineEngine';

const MarqueeAddress: React.FC<{ address: string }> = ({ address }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const isInitialOfflineRef = useRef(typeof navigator !== 'undefined' && !navigator.onLine);

  useEffect(() => {
    if (isInitialOfflineRef.current) {
      setOverflowDistance(0);
      return;
    }

    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = textRef.current.scrollWidth;
        if (textWidth > containerWidth + 4) {
          setOverflowDistance(textWidth - containerWidth + 12);
        } else {
          setOverflowDistance(0);
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
    <div className="flex items-center gap-1 text-[11px] text-[#B7C0BC] font-medium overflow-hidden bg-[#171B1E] border border-[#292F33] px-2 py-0.5 rounded-full min-w-[60px] flex-1 max-w-[150px] xs:max-w-[200px] sm:max-w-[280px]"
      title={address}
    >
      <MapPin className="w-3 h-3 text-[#18C98F] shrink-0 z-10" />
      <div className="overflow-hidden relative flex-1 min-w-0">
        <span
          ref={textRef}
          className={`inline-block whitespace-nowrap text-[10.5px] ${
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
  const baselineDoneRef = useRef(false);

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

  // Derive unreadCount and recents directly from synchronized state (0 Firestore overhead)
  const unreadCount = syncUnreadCount;
  const recentNotifs = React.useMemo(() => {
    return syncNotifs.slice(0, 3);
  }, [syncNotifs]);

  // Check for newly received eligible notifications and present popup immediately
  useEffect(() => {
    if (!currentUser || syncNotifs.length === 0) return;

    // Filter syncNotifs for unseen eligible notifications intended for current employee
    const unseenNotifs: NotificationRecord[] = [];

    syncNotifs.forEach((n) => {
      if (!isNotificationForUser(n, currentUser)) return;

      if (isPopupShown(n.id)) {
        // Suppressed duplicate
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
        // Fallback category mapping
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
      ? (rawAddress.length > 28
          ? rawAddress.substring(0, 26) + '...'
          : rawAddress)
      : (!isOnline ? 'Offline' : 'Raniganj HQ');

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Dynamic Header Bar with [Distance] [Office Status] [Location Address] [Bell] */}
      <header className="sticky top-0 z-50 bg-[#111417]/90 backdrop-blur-md border-b border-[#292F33]">
        <div className="container mx-auto px-2.5 sm:px-4 py-2 max-w-3xl flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Left/Center Header Status & Location Controls */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden py-0.5">
            {/* Live Distance Value */}
            <div
              className="text-[10px] font-extrabold text-[#B7C0BC] bg-[#171B1E] border border-[#292F33] px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm flex items-center gap-1 shrink-0"
              title="Live distance from office"
            >
              <span>{formattedDistance}</span>
            </div>

            {/* Office Location Status Badge */}
            <div
              className={`text-[9px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap flex items-center gap-1 shadow-sm select-none shrink-0 ${
                isInsideGeofence
                  ? 'bg-[#22C55E]/15 text-[#22C55E] border-[#22C55E]/30'
                  : 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30'
              }`}
              title={isInsideGeofence ? 'Inside office geofence' : 'Outside office geofence'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isInsideGeofence ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
              <span>{isInsideGeofence ? 'INSIDE OFFICE' : 'OUTSIDE OFFICE'}</span>
            </div>

            {/* Global Sync Status (shown only when offline/pending) */}
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
                    className="relative p-1.5 sm:p-2 rounded-xl bg-[#171B1E] border border-[#292F33] text-[#B7C0BC] hover:text-[#F5F7F6] hover:bg-[#1D2226] transition-colors cursor-pointer"
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
                    className="relative p-1.5 sm:p-2 rounded-xl bg-[#171B1E] border border-[#292F33] text-[#B7C0BC] hover:text-[#F5F7F6] hover:bg-[#1D2226] transition-colors cursor-pointer"
                    aria-label="Toggle notifications"
                    id="notification-bell-btn"
                  >
                    <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-[#EF4444] text-[9px] sm:text-[10px] font-black text-white ring-2 ring-[#0B0D0F]">
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
                       className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#171B1E] border border-[#292F33] rounded-2xl shadow-xl z-50 overflow-hidden text-[#F5F7F6]"
                       id="notification-bell-dropdown"
                    >
                      <div className="p-4 border-b border-[#292F33] flex items-center justify-between">
                        <span className="font-bold text-sm">Recent Alerts</span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllRead}
                              className="text-[11px] text-[#18C98F] hover:underline font-bold flex items-center gap-1 bg-[#1D2226] px-2 py-0.5 rounded-full transition-colors"
                              title="Mark all notifications as read"
                              id="mark-all-read-btn"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Mark all read</span>
                            </button>
                          )}
                          {unreadCount > 0 && (
                            <span className="text-xs text-[#18C98F] bg-[#1D2226] px-2 py-0.5 rounded-full font-bold">
                              {unreadCount} unread
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto divide-y divide-[#292F33]">
                        {recentNotifs.length === 0 ? (
                          <div className="p-6 text-center text-[#7E8985] text-xs">
                            No recent notifications.
                          </div>
                        ) : (
                          recentNotifs.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-3.5 hover:bg-[#1D2226] transition-colors cursor-pointer flex items-start gap-3 text-left group ${
                                notif.read ? 'opacity-60' : 'bg-[#111417]'
                              }`}
                            >
                              <div className="mt-1">
                                <Info className={`w-4 h-4 ${notif.read ? 'text-[#7E8985]' : 'text-[#18C98F]'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold ${notif.read ? 'text-[#B7C0BC]' : 'text-[#F5F7F6]'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] text-[#B7C0BC] truncate mt-0.5">
                                  {notif.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {!notif.read && (
                                  <div className="w-2 h-2 rounded-full bg-[#18C98F] mt-1" />
                                )}
                                <button
                                  onClick={(e) => handleDeleteNotification(e, notif.id)}
                                  className="p-1 rounded hover:bg-[#EF4444]/20 text-[#7E8985] hover:text-[#EF4444] transition-colors opacity-80 group-hover:opacity-100"
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
                        className="w-full py-3 bg-[#111417] hover:bg-[#1D2226] text-center text-xs font-bold text-[#18C98F] transition-colors border-t border-[#292F33] flex items-center justify-center gap-1.5"
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

      <main className="container mx-auto p-4 max-w-3xl pb-28">
        <InAppNotificationToast
          toastData={activeToastNotif}
          onDismiss={() => setActiveToastNotif(null)}
        />
        <CheckoutConfirmationModal />
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
