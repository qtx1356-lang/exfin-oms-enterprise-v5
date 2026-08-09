import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { Card } from '../../components/ui/Card';
import { 
  Calendar, 
  Clock, 
  UserCheck, 
  Hourglass,
  Bell,
  Wallet,
  Briefcase,
  Megaphone,
  MapPin,
  Building2,
  PhoneCall,
  Sparkles,
  Users,
  BarChart3,
  User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getTodayAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AttendanceRecord } from '../../types/attendance';
import { getStoredLeaves, getStoredLeaveConfig, getStoredEmployeeAllowances } from '../../services/leave/leaveStorage';
import { calculateLeaveBalance } from '../../services/leave/leaveService';

interface Announcement {
  id: string;
  title: string;
  content: string;
  date: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
}

export const EmployeeDashboard: React.FC = () => {
  const { employeeData } = useRegistration();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord | null>(null);
  const [leaveBalance, setLeaveBalance] = useState({ available: 24, pending: 0, used: 0 });

  useEffect(() => {
    if (employeeData) {
      const empId = employeeData.id || employeeData.employeeCode || '';
      const dept = employeeData.office || 'Raniganj';
      const localLeaves = getStoredLeaves();
      const localConfig = getStoredLeaveConfig();
      const localAllowances = getStoredEmployeeAllowances();
      const bal = calculateLeaveBalance(empId, dept, localLeaves, localConfig, localAllowances);
      setLeaveBalance({
        available: bal.available,
        pending: bal.pending,
        used: bal.used,
      });
    }
  }, [employeeData]);

  useEffect(() => {
    if (employeeData) {
      const empId = employeeData.employeeCode || employeeData.id || 'EMP-UNKNOWN';
      const todayStr = getFormattedDateStr();
      const rec = getTodayAttendanceRecord(empId, todayStr);
      setTodayAttendance(rec);
    }
  }, [employeeData]);

  useEffect(() => {
    if (!db) return;

    // Fetch announcements
    const announcementsQ = query(
      collection(db, 'announcements'),
      orderBy('date', 'desc'),
      limit(3)
    );
    const unsubAnnouncements = onSnapshot(announcementsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Announcement[];
      setAnnouncements(data);
    }, (error) => {
      console.error('Error fetching announcements:', error);
    });

    // Fetch notifications
    const notificationsQ = query(
      collection(db, 'notifications'),
      where('recipientEmployeeCode', '==', employeeData?.employeeCode || ''),
      orderBy('timestamp', 'desc'),
      limit(3)
    );
    const unsubNotifications = onSnapshot(notificationsQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Notification[];
      setNotifications(data);
    }, (error) => {
      console.error('Error fetching notifications:', error);
    });

    return () => {
      unsubAnnouncements();
      unsubNotifications();
    };
  }, []);

  if (!employeeData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center text-white">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
          <UserCheck className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold text-red-400 mb-2">Employee profile not found</h2>
        <p className="text-sm text-purple-200">We couldn't load your employee data. Please contact administrator.</p>
      </div>
    );
  }

  const todayDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date());

  const quickActions = [
    { icon: UserCheck, label: 'Attendance', path: '/attendance', bg: 'bg-[#7C3AED]/20 text-[#A78BFA] border-purple-500/30' },
    { icon: Briefcase, label: 'Work Planner', path: '/planner', bg: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    ...(employeeData.isTeamLeader ? [
      { icon: Users, label: 'My Team', path: '/my-team', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' }
    ] : []),
    { icon: BarChart3, label: 'Efficiency', path: '/efficiency', bg: 'bg-[#7C3AED]/20 text-purple-300 border-purple-500/30' },
    { icon: Wallet, label: 'Expenses', path: '/expenses', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    { icon: Calendar, label: 'Leave', path: '/leave', bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    { icon: User, label: 'Profile', path: '/profile', bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  ];

  return (
    <div className="flex flex-col gap-5 pb-8 text-white">
      {/* Top Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl overflow-hidden bg-[#211044] border-2 border-[#7C3AED]/50 flex-shrink-0 shadow-lg">
            {employeeData.selfieUrl ? (
              <img src={employeeData.selfieUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <UserCheck className="w-6 h-6 m-auto mt-3 text-purple-300" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white leading-none">
                {employeeData.name || 'Employee'}
              </h1>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#7C3AED]/30 text-[#A78BFA] border border-purple-500/30">
                PRO
              </span>
            </div>
            <p className="text-xs text-purple-300/80 font-medium mt-1">
              Code: <span className="text-white font-bold">{employeeData.employeeCode || 'N/A'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-[#2D1B5A] border border-purple-500/30 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-200 shadow-md">
          <MapPin className="w-3.5 h-3.5 text-[#A78BFA]" />
          <span>{employeeData.office || 'Raniganj HQ'}</span>
        </div>
      </div>

      {/* Today Status Hero Banner */}
      <Card className="p-5 relative overflow-hidden bg-gradient-to-br from-[#2D1B5A] via-[#35206A] to-[#211044] border border-purple-500/30 shadow-2xl">
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-[#7C3AED]/15 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex justify-between items-start mb-4 relative z-10">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-purple-300 flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Today's Overview
            </span>
            <h2 className="text-xl font-black text-white tracking-tight">{todayDate}</h2>
          </div>
          <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-[#211044] border border-purple-500/30 text-purple-200">
            Shift End: 06:00 PM
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 relative z-10">
          <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-3.5 border border-purple-500/20">
            <p className="text-[11px] font-semibold text-purple-300/80 mb-1 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#10B981]" /> Check-In
            </p>
            <p className="font-black text-base text-white">
              {todayAttendance ? todayAttendance.checkInTime : 'Not Checked In'}
            </p>
            {todayAttendance && (
              <span className="inline-block text-[10px] font-extrabold text-[#10B981] mt-1 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {todayAttendance.checkInMode}
              </span>
            )}
          </div>

          <div className="bg-[#211044]/80 backdrop-blur-md rounded-2xl p-3.5 border border-purple-500/20">
            <p className="text-[11px] font-semibold text-purple-300/80 mb-1 flex items-center gap-1.5">
              <Hourglass className="w-3.5 h-3.5 text-amber-400" /> Check-Out
            </p>
            <p className="font-black text-base text-white">
              {todayAttendance?.checkOutTime || '--:--'}
            </p>
            {todayAttendance?.checkOutMode && (
              <span className="inline-block text-[10px] font-extrabold text-amber-300 mt-1 bg-amber-500/10 px-2 py-0.5 rounded-md">
                {todayAttendance.checkOutMode}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Compact Leave Status Card */}
      <Card 
        className="p-4 bg-[#2D1B5A] border border-purple-500/20 hover:border-purple-500/35 transition cursor-pointer relative overflow-hidden"
        onClick={() => navigate('/leave')}
      >
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-500/15">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-purple-400" /> My Leave Status
          </span>
          <span className="text-[10px] text-purple-300/60 font-bold hover:text-white transition">
            Apply / History &rarr;
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
            <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Available Balance</p>
            <p className="text-sm font-black text-white">{leaveBalance.available} Days</p>
          </div>
          <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
            <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Pending Leave</p>
            <p className="text-sm font-black text-amber-400">{leaveBalance.pending} Days</p>
          </div>
          <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
            <p className="text-[10px] text-[#10B981] font-semibold mb-0.5">Used Leave</p>
            <p className="text-sm font-black text-emerald-400">{leaveBalance.used} Days</p>
          </div>
        </div>
      </Card>

      {/* Quick Actions Grid */}
      <div>
        <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action, idx) => (
            <button 
              key={idx}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#2D1B5A] border border-purple-500/20 hover:border-purple-500/40 transition-all hover:scale-105 active:scale-95 shadow-lg group"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 border ${action.bg}`}>
                <action.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
              </div>
              <span className="text-[11px] font-bold text-purple-100 text-center leading-tight">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Profile Card */}
      <Card className="p-4 bg-[#2D1B5A] border border-purple-500/20">
        <div className="flex justify-between items-center mb-3 pb-2 border-b border-purple-500/15">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#A78BFA]" /> Profile Information
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {employeeData.status || 'Active'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
            <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Department</p>
            <p className="font-bold text-white">{employeeData.department || 'Operations'}</p>
          </div>
          <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10">
            <p className="text-[10px] text-purple-300/70 font-semibold mb-0.5">Designation</p>
            <p className="font-bold text-white">{employeeData.designation || 'Staff Executive'}</p>
          </div>
          <div className="bg-[#211044] p-2.5 rounded-xl border border-purple-500/10 col-span-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-purple-300/70 font-semibold">Registered Mobile</p>
              <p className="font-bold text-white">{employeeData.mobileNumber || 'N/A'}</p>
            </div>
            <PhoneCall className="w-4 h-4 text-purple-300/60" />
          </div>
        </div>
      </Card>

      {/* Announcements */}
      <div>
        <div className="flex justify-between items-center mb-2.5">
          <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1.5">
            <Megaphone className="w-4 h-4 text-[#A78BFA]" />
            Announcements
          </h2>
        </div>
        <div className="flex flex-col gap-2.5">
          {announcements.length > 0 ? (
            announcements.map((ann) => (
              <Card key={ann.id} className="p-3.5 bg-[#2D1B5A] border border-purple-500/20">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-xs text-white">{ann.title}</h3>
                  <span className="text-[10px] font-semibold text-purple-300 bg-[#211044] px-2 py-0.5 rounded-full border border-purple-500/20">
                    {new Date(ann.date).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-purple-200/90 leading-relaxed line-clamp-2">
                  {ann.content}
                </p>
              </Card>
            ))
          ) : (
            <div className="text-center py-5 text-purple-300/70 bg-[#211044] rounded-2xl border border-dashed border-purple-500/20">
              <p className="text-xs font-semibold">No recent announcements</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Notifications */}
      <div>
        <div className="flex justify-between items-center mb-2.5">
          <h2 className="text-xs font-extrabold text-purple-300/80 uppercase tracking-wider flex items-center gap-1.5">
            <Bell className="w-4 h-4 text-amber-400" />
            Recent Notifications
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          {notifications.length > 0 ? (
            notifications.map((notif) => (
              <div key={notif.id} className="flex items-start gap-3 p-3 bg-[#2D1B5A] rounded-2xl border border-purple-500/20">
                <div className="w-2 h-2 rounded-full bg-[#7C3AED] mt-1.5 flex-shrink-0 shadow-[0_0_8px_#7C3AED]" />
                <div className="flex-1">
                  <h3 className="text-xs font-bold text-white mb-0.5">{notif.title}</h3>
                  <p className="text-[11px] text-purple-200/80 leading-tight">{notif.message}</p>
                </div>
                <span className="text-[10px] font-semibold text-purple-300/60">
                  {new Date(notif.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-5 text-purple-300/70 bg-[#211044] rounded-2xl border border-dashed border-purple-500/20">
              <p className="text-xs font-semibold">No new notifications</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
