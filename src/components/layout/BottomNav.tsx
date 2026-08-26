import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CalendarCheck, Briefcase, BarChart3, Users } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { usePermission } from '../../context/PermissionContext';
import { getTodayAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';

export const BottomNav: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeData } = useRegistration();
  const { isTeamLeader: checkIsTeamLeader } = usePermission();

  const isTL = Boolean(employeeData?.isTeamLeader) || employeeData?.role === 'TEAM_LEADER' || checkIsTeamLeader();

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: CalendarCheck, label: 'Attendance', path: '/attendance' },
    { icon: Briefcase, label: 'Planner', path: '/planner' },
    { icon: BarChart3, label: 'Efficiency', path: '/efficiency' },
    ...(isTL ? [{ icon: Users, label: 'My Team', path: '/my-team' }] : []),
  ];

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav aria-label="Bottom Navigation" className="fixed bottom-3 left-2 right-2 max-w-md mx-auto h-16 bg-[#111417]/95 backdrop-blur-2xl border border-[#292F33] rounded-full flex items-center justify-around px-1.5 z-[100] shadow-xl pointer-events-auto">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            type="button"
            onClick={(e) => handleNavClick(e, item.path)}
            className={`flex flex-col items-center justify-center flex-1 min-w-0 h-12 rounded-full transition-colors duration-75 touch-manipulation cursor-pointer active:scale-95 ${
              isActive ? 'text-[#F5F7F6]' : 'text-[#7E8985] hover:text-[#B7C0BC]'
            }`}
          >
            <div className={`flex items-center justify-center w-10 h-7 rounded-full mb-0.5 transition-colors duration-75 ${
              isActive ? 'bg-[#18C98F] text-[#06110D] shadow-sm' : 'bg-transparent'
            }`}>
              <item.icon className={`w-4 h-4 ${
                isActive ? 'stroke-[#06110D]' : 'stroke-[#7E8985]'
              }`} />
            </div>
            <span className={`text-[10px] sm:text-[10.5px] leading-none truncate max-w-full px-1 ${
              isActive ? 'font-black text-[#18C98F]' : 'font-semibold text-[#7E8985]'
            }`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
});
BottomNav.displayName = 'BottomNav';



