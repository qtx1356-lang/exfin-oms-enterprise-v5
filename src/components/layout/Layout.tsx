import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Bell, ChevronRight, CheckCheck, Info, User, Home, MapPin, Trash2 } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useLocationContext } from '../../context/LocationContext';
import { GlobalSyncStatus } from '../common/GlobalSyncStatus';
import {
  getUnreadNotificationCount,
  getNotificationsForUser,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../../services/notification/notificationService';
import { NotificationRecord } from '../../types/notification';
import { motion, AnimatePresence } from 'motion/react';

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
    <div
      ref={containerRef}
      className="flex items-center gap-1 text-[11px] text-purple-200/80 font-medium overflow-hidden bg-[#2D1B5A]/50 border border-purple-500/15 px-2 py-0.5 rounded-full min-w-[60px] flex-1 max-w-[150px] xs:max-w-[200px] sm:max-w-[280px]"
      title={address}
    >
      <MapPin className="w-3 h-3 text-purple-400 shrink-0 z-10" />
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
  const { formattedDistance, isInsideGeofence, currentAddress } = useLocationContext();

  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifs, setRecentNotifs] = useState<NotificationRecord[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const refreshNotificationCount = async () => {
    if (!currentUser) return;
    try {
      // 1. Get locally updated unread count
      const count = getUnreadNotificationCount(currentUser);
      setUnreadCount(count);

      // 2. Fetch notifications to get fresh recent list
      const data = await getNotificationsForUser(currentUser);
      const sorted = [...data].sort(
        (a, b) => new Date(b.timestamp || b.createdAt || b.createdAtDeviceTime).getTime() - new Date(a.timestamp || a.createdAt || a.createdAtDeviceTime).getTime()
      );
      
      // Get 3 most recent unread, or 3 most recent overall
      const recents = sorted.slice(0, 3);
      setRecentNotifs(recents);
    } catch (err) {
      console.warn('Failed to refresh notification count:', err);
    }
  };

  useEffect(() => {
    refreshNotificationCount();
    
    // Refresh interval
    const timer = setInterval(() => {
      refreshNotificationCount();
    }, 15000);

    return () => clearInterval(timer);
  }, [employeeData, adminUser, location.pathname]);

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

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleBellClick = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleMarkAllRead = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    try {
      await markAllNotificationsRead(currentUser);
      await refreshNotificationCount();
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteNotification(id, currentUser || undefined);
      await refreshNotificationCount();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleNotificationClick = async (notif: NotificationRecord) => {
    setDropdownOpen(false);
    try {
      if (!notif.read) {
        await markNotificationRead(notif.id);
        refreshNotificationCount();
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
  const displayAddress = (!isOnline || rawAddress === 'Offline')
    ? 'Offline'
    : (rawAddress && rawAddress !== 'Location unavailable')
      ? rawAddress
      : 'Offline';

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Dynamic Header Bar with [Distance] [Office Status] [Location Address] [Bell] */}
      <header className="sticky top-0 z-30 bg-[#1D113B]/90 backdrop-blur-md border-b border-purple-500/10">
        <div className="container mx-auto px-2.5 sm:px-4 py-2 max-w-3xl flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Left/Center Header Status & Location Controls */}
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden py-0.5">
            {/* Live Distance Value (Value ONLY, e.g., "476 m", "1.24 km") */}
            <div
              className="text-[11px] font-bold text-purple-200 bg-[#2D1B5A]/80 border border-purple-500/20 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm flex items-center gap-1 shrink-0"
              title="Live distance from office"
            >
              <span>{formattedDistance}</span>
            </div>

            {/* Office Location Status Badge with subtle pulse animation */}
            <div
              className={`text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap animate-subtle-pulse flex items-center gap-1 shadow-sm select-none shrink-0 transition-colors duration-300 ${
                isInsideGeofence
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-red-600 text-white border-red-500'
              }`}
              title={isInsideGeofence ? 'Inside 25m office geofence' : 'Outside 25m office geofence'}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>{isInsideGeofence ? 'INSIDE OFFICE' : 'OUTSIDE OFFICE'}</span>
            </div>

            {/* Global Sync Status (shown only when offline/pending) */}
            <GlobalSyncStatus />

            {/* Marquee Location Address */}
            <MarqueeAddress address={displayAddress} />
          </div>

          {/* Right Header Navigation Controls: [Notification Bell] */}
          <div className="flex items-center gap-1.5 shrink-0">
            {currentUser && (
              <div className="relative shrink-0 flex items-center" ref={dropdownRef}>
                {/* Bell Button */}
                <button
                  onClick={handleBellClick}
                  className="relative p-1.5 sm:p-2 rounded-xl bg-[#2D1B5A]/80 border border-purple-500/20 text-purple-300 hover:text-white hover:bg-purple-500/20 transition-all cursor-pointer"
                  aria-label="Toggle notifications"
                  id="notification-bell-btn"
                >
                  <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-red-500 text-[9px] sm:text-[10px] font-black text-white ring-2 ring-[#1D113B] animate-pulse">
                      {unreadCount > 9 ? '9+' : unreadCount}
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
                      className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#2D1B5A] border border-purple-500/30 rounded-[22px] shadow-[0_15px_50px_rgba(0,0,0,0.6)] z-50 overflow-hidden text-white"
                      id="notification-bell-dropdown"
                    >
                      <div className="p-4 border-b border-purple-500/20 flex items-center justify-between">
                        <span className="font-bold text-sm">Recent Alerts</span>
                        <div className="flex items-center gap-2">
                          {unreadCount > 0 && (
                            <button
                              onClick={handleMarkAllRead}
                              className="text-[11px] text-purple-300 hover:text-white font-bold hover:underline flex items-center gap-1 bg-purple-500/10 hover:bg-purple-500/20 px-2 py-0.5 rounded-full transition-colors"
                              title="Mark all notifications as read"
                              id="mark-all-read-btn"
                            >
                              <CheckCheck className="w-3 h-3" />
                              <span>Mark all read</span>
                            </button>
                          )}
                          {unreadCount > 0 && (
                            <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full font-bold">
                              {unreadCount} unread
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto divide-y divide-purple-500/10">
                        {recentNotifs.length === 0 ? (
                          <div className="p-6 text-center text-slate-400 text-xs">
                            No recent notifications.
                          </div>
                        ) : (
                          recentNotifs.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-3.5 hover:bg-purple-500/10 transition-colors cursor-pointer flex items-start gap-3 text-left group ${
                                notif.read ? 'opacity-60' : 'bg-[#1D113B]/20'
                              }`}
                            >
                              <div className="mt-1">
                                <Info className={`w-4 h-4 ${notif.read ? 'text-slate-400' : 'text-purple-400'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-bold ${notif.read ? 'text-slate-300' : 'text-white'}`}>
                                  {notif.title}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                  {notif.message}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {!notif.read && (
                                  <div className="w-2 h-2 rounded-full bg-purple-500 mt-1" />
                                )}
                                <button
                                  onClick={(e) => handleDeleteNotification(e, notif.id)}
                                  className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-300 transition-colors opacity-80 group-hover:opacity-100"
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
                        className="w-full py-3 bg-[#1D113B]/40 hover:bg-[#1D113B]/60 text-center text-xs font-bold text-purple-300 hover:text-white transition-colors border-t border-purple-500/20 flex items-center justify-center gap-1.5"
                      >
                        <span>View all alerts</span>
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

      <main className="container mx-auto p-4 max-w-3xl">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
