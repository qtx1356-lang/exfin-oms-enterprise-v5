import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useRegistration } from '../../context/RegistrationContext';
import { Card } from '../../components/ui/Card';
import { 
  Calendar, 
  Clock, 
  UserCheck, 
  Hourglass,
  LogOut,
  ChevronRight,
  Bell,
  Wallet,
  Briefcase,
  Megaphone,
  MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getTodayAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AttendanceRecord } from '../../types/attendance';

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

    console.log('Fetching announcements and notifications...');

    // Fetch announcements
    const announcementsQ = query(
      collection(db, 'announcements'),
      orderBy('date', 'desc'),
      limit(3)
    );
    const unsubAnnouncements = onSnapshot(announcementsQ, (snapshot) => {
      console.log(`Announcements query returned ${snapshot.docs.length} documents.`);
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
      orderBy('timestamp', 'desc'),
      limit(3)
    );
    const unsubNotifications = onSnapshot(notificationsQ, (snapshot) => {
      console.log(`Notifications query returned ${snapshot.docs.length} documents.`);
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

  console.log('Employee Dashboard rendering. employeeData:', employeeData);

  if (!employeeData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <h2 className="text-xl font-bold text-error mb-2">Employee profile not found</h2>
        <p className="text-sm text-on-surface-variant">We couldn't load your employee data. Please try again or contact support.</p>
        <p className="text-xs text-on-surface-variant mt-4 opacity-50">Diagnostic: employeeData is falsy.</p>
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
    { icon: UserCheck, label: 'Attendance', path: '/attendance', color: 'bg-primary-container text-on-primary-container' },
    { icon: Calendar, label: 'Leave', path: '/leave', color: 'bg-tertiary-container text-on-tertiary-container' },
    { icon: Wallet, label: 'Expenses', path: '/expenses', color: 'bg-secondary-container text-on-secondary-container' },
    { icon: Briefcase, label: 'Work Planner', path: '/planner', color: 'bg-surface-variant text-on-surface-variant' },
    { icon: Bell, label: 'Notifications', path: '/notifications', color: 'bg-error-container text-on-error-container' },
  ];

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-variant flex-shrink-0 border-2 border-primary/20">
            {employeeData.selfieUrl ? (
              <img src={employeeData.selfieUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <UserCheck className="w-6 h-6 m-auto mt-3 text-on-surface-variant" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-on-background leading-tight">
              {employeeData.name || 'Employee'}
            </h1>
            <p className="text-sm text-on-surface-variant font-medium">
              {employeeData.employeeCode || 'No Code'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-surface-variant px-3 py-1.5 rounded-full text-xs font-medium text-on-surface-variant">
          <MapPin className="w-3.5 h-3.5" />
          <span>{employeeData.office || 'Raniganj HQ'}</span>
        </div>
      </div>

      {/* Profile Card */}
      <Card className="p-5 flex flex-col gap-4 border-l-4 border-l-primary shadow-sm bg-surface">
        <div className="flex justify-between items-start">
          <h2 className="text-sm font-semibold tracking-wider text-on-surface-variant uppercase">Profile Information</h2>
          <span className="px-2 py-1 rounded text-xs font-bold bg-primary/10 text-primary">
            {employeeData.status || 'Active'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
          <div>
            <p className="text-on-surface-variant text-xs">Department</p>
            <p className="font-medium text-on-surface">{employeeData.department || 'Not Assigned'}</p>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs">Designation</p>
            <p className="font-medium text-on-surface">{employeeData.designation || 'Not Assigned'}</p>
          </div>
          <div>
            <p className="text-on-surface-variant text-xs">Mobile</p>
            <p className="font-medium text-on-surface">{employeeData.mobileNumber || 'N/A'}</p>
          </div>
        </div>
      </Card>

      {/* Today Status Card */}
      <Card className="p-5 flex flex-col gap-4 bg-primary text-on-primary shadow-md overflow-hidden relative">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Clock className="w-24 h-24" />
        </div>
        <div className="z-10 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold">{todayDate}</h2>
            <p className="text-primary-container text-sm font-medium">Office Closing Time: 06:00 PM</p>
          </div>
        </div>
        
        <div className="z-10 grid grid-cols-2 gap-4 mt-2">
          <div className="bg-primary-container/20 rounded-lg p-3">
            <p className="text-primary-container text-xs mb-1 flex items-center gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Status
            </p>
            <p className="font-bold text-base leading-tight">
              {todayAttendance 
                ? (todayAttendance.checkOutTime ? 'Checked Out' : `Checked In (${todayAttendance.checkInMode})`)
                : 'Not Checked In'}
            </p>
          </div>
          <div className="bg-primary-container/20 rounded-lg p-3">
            <p className="text-primary-container text-xs mb-1 flex items-center gap-1">
              <Hourglass className="w-3.5 h-3.5" /> Check-Out
            </p>
            <p className="font-bold text-base leading-tight">
              {todayAttendance?.checkOutTime || '--:--'}
            </p>
          </div>
        </div>
        <div className="z-10 text-xs font-medium text-primary-container mt-1">
          Last Check-In: {todayAttendance?.checkInTime || '--:--'} {todayAttendance ? `(${todayAttendance.checkInMode})` : ''}
        </div>
      </Card>


      {/* Quick Actions */}
      <div>
        <h2 className="text-base font-bold text-on-background mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map((action, idx) => (
            <button 
              key={idx}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-center justify-center gap-2"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95 ${action.color}`}>
                <action.icon className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-semibold text-on-surface-variant text-center leading-tight">
                {action.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Announcements */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-bold text-on-background flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-secondary" />
            Announcements
          </h2>
        </div>
        <div className="flex flex-col gap-3">
          {announcements.length > 0 ? (
            announcements.map((ann) => (
              <Card key={ann.id} className="p-4 bg-surface shadow-sm">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-sm text-on-surface">{ann.title}</h3>
                  <span className="text-[10px] font-medium text-on-surface-variant whitespace-nowrap bg-surface-variant/50 px-2 py-0.5 rounded">
                    {new Date(ann.date).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant line-clamp-2 leading-relaxed">
                  {ann.content}
                </p>
              </Card>
            ))
          ) : (
            <div className="text-center py-6 text-on-surface-variant bg-surface rounded-xl border border-dashed border-outline-variant">
              <p className="text-sm font-medium">No recent announcements</p>
            </div>
          )}
        </div>
      </div>

      {/* Recent Notifications */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-base font-bold text-on-background flex items-center gap-2">
            <Bell className="w-5 h-5 text-tertiary" />
            Recent Notifications
          </h2>
        </div>
        <div className="flex flex-col gap-3">
          {notifications.length > 0 ? (
            notifications.map((notif) => (
              <div key={notif.id} className="flex items-start gap-3 p-3 bg-surface rounded-xl shadow-sm border border-surface-variant">
                <div className="w-2 h-2 rounded-full bg-error mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-on-surface mb-0.5">{notif.title}</h3>
                  <p className="text-xs text-on-surface-variant">{notif.message}</p>
                </div>
                <span className="text-[10px] text-on-surface-variant">
                  {new Date(notif.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-on-surface-variant bg-surface rounded-xl border border-dashed border-outline-variant">
              <p className="text-sm font-medium">No new notifications</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
