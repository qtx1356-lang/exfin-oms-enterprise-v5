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

  const handleNavClick = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (location.pathname !== path) {
      navigate(path);
    }
  };

  return (
    <nav aria-label="Bottom Navigation" className="fixed bottom-3 left-2 right-2 max-w-md mx-auto h-16 bg-[#171936]/85 backdrop-blur-[20px] border border-[#6366F1]/20 rounded-full flex items-center justify-around px-2 z-[100] shadow-[0_8px_32px_rgba(15,16,37,0.6)] pointer-events-auto">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            type="button"
            onClick={(e) => handleNavClick(e, item.path)}
            className={`flex flex-col items-center justify-center flex-1 min-w-0 h-12 rounded-full transition-all duration-150 touch-manipulation cursor-pointer active:scale-95 group ${
              isActive ? 'text-[#6366F1] bg-[#6366F1]/15 border border-[#6366F1]/30 font-bold' : 'text-[#8A8AA3] hover:text-[#F8F8FF]'
            }`}
          >
            <div className={`flex items-center justify-center w-8 h-6 mb-0.5 transition-all duration-150 ${
              isActive ? 'text-[#6366F1] filter drop-shadow-[0_0_8px_rgba(99,102,241,0.50)]' : 'text-[#8A8AA3]'
            }`}>
              <item.icon className={`w-4 h-4 ${
                isActive ? 'stroke-[#6366F1] stroke-[2.5]' : 'stroke-[#8A8AA3]'
              }`} />
            </div>
            <span className={`text-[10px] sm:text-[10.5px] leading-none truncate max-w-full px-1 ${
              isActive ? 'font-black text-[#818CF8]' : 'font-medium text-[#8A8AA3]'
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
