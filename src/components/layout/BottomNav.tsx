import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CalendarCheck, Briefcase, BarChart3, Users } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { usePermission } from '../../context/PermissionContext';

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

  return (
    <nav aria-label="Bottom Navigation" className="fixed bottom-3 left-2 right-2 max-w-md mx-auto h-16 bg-[#2D1B5A]/95 backdrop-blur-2xl border border-purple-500/30 rounded-full flex items-center justify-around px-1.5 z-[100] shadow-[0_10px_35px_rgba(0,0,0,0.5)] pointer-events-auto">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              if (location.pathname !== item.path) {
                navigate(item.path);
              }
            }}
            className={`flex flex-col items-center justify-center flex-1 min-w-0 h-12 rounded-full transition-all duration-75 touch-manipulation cursor-pointer active:scale-95 ${
              isActive ? 'text-white' : 'text-purple-300/60 hover:text-purple-200'
            }`}
          >
            <div className={`flex items-center justify-center w-10 h-7 rounded-full mb-0.5 transition-all duration-75 ${
              isActive ? 'bg-[#7C3AED] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)] scale-105' : 'bg-transparent'
            }`}>
              <item.icon className={`w-4 h-4 transition-transform duration-75 ${
                isActive ? 'stroke-white scale-110' : 'stroke-purple-300/70'
              }`} />
            </div>
            <span className={`text-[10px] sm:text-[10.5px] leading-none truncate max-w-full px-1 transition-all ${
              isActive ? 'font-black text-white' : 'font-semibold text-purple-300/60'
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



