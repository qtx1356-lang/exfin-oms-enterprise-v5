import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Bell, ChevronRight, CheckCheck, Info } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useAdminAuth } from '../../context/AdminAuthContext';
import {
  getUnreadNotificationCount,
  getNotificationsForUser,
  markNotificationRead,
} from '../../services/notification/notificationService';
import { NotificationRecord } from '../../types/notification';
import { motion, AnimatePresence } from 'motion/react';

export const Layout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeData } = useRegistration();
  const { user: adminUser } = useAdminAuth();

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

  const handleBellClick = () => {
    setDropdownOpen(!dropdownOpen);
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

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Dynamic Header Bar with Notification Bell */}
      <header className="sticky top-0 z-30 bg-[#1D113B]/80 backdrop-blur-md border-b border-purple-500/10">
        <div className="container mx-auto px-4 py-3.5 max-w-3xl flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <span className="text-xs font-black tracking-widest text-white bg-purple-600 px-2.5 py-1 rounded-xl shadow-md">EXFIN</span>
            <span className="text-xs font-black text-purple-300">OMS</span>
          </div>

          {currentUser && (
            <div className="relative" ref={dropdownRef}>
              {/* Trigger Button */}
              <button
                onClick={handleBellClick}
                className="relative p-2 rounded-xl bg-[#2D1B5A]/40 border border-purple-500/10 text-purple-300 hover:text-white hover:bg-purple-500/10 transition-all"
                aria-label="Toggle notifications"
                id="notification-bell-btn"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white ring-2 ring-[#1D113B] animate-pulse">
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
                      {unreadCount > 0 && (
                        <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded-full font-bold">
                          {unreadCount} unread
                        </span>
                      )}
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
                            className={`p-3.5 hover:bg-purple-500/10 transition-colors cursor-pointer flex gap-3 text-left ${
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
                            {!notif.read && (
                              <div className="w-2 h-2 rounded-full bg-purple-500 mt-2 flex-shrink-0" />
                            )}
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
      </header>

      <main className="container mx-auto p-4 max-w-3xl">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
