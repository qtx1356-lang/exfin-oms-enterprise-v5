import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CalendarCheck, Briefcase, BarChart3, Users } from 'lucide-react';
import { motion } from 'motion/react';
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
    <nav aria-label="Main Navigation" className="fixed bottom-3 left-4 right-4 max-w-md mx-auto h-16 bg-[linear-gradient(135deg,rgba(45,27,100,0.95),rgba(20,42,91,0.95))] backdrop-blur-2xl rounded-2xl flex items-center justify-around px-2 z-[100] shadow-[0_8px_32px_rgba(17,16,74,0.60)] pointer-events-auto border border-[#A78BFA]/25">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            type="button"
            onClick={(e) => handleNavClick(e, item.path)}
            className={`flex flex-col items-center justify-center flex-1 h-12 rounded-xl transition-all duration-300 touch-manipulation cursor-pointer relative group ${
              isActive ? 'text-white' : 'text-[#A8B0C5] hover:text-white'
            }`}
          >
            {isActive && (
              <motion.div 
                layoutId="nav-active"
                className="absolute inset-0 bg-gradient-to-r from-[#8B5CF6]/35 to-[#2563EB]/35 border border-[#A78BFA]/40 rounded-xl -z-10 shadow-[0_0_12px_rgba(139,92,246,0.3)]"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            
            <div className={`transition-transform duration-300 ${isActive ? 'scale-110 -translate-y-0.5' : 'scale-100 group-hover:scale-105'}`}>
              <item.icon className={`w-4.5 h-4.5 ${
                isActive ? 'stroke-[#38BDF8] stroke-[2.5]' : 'stroke-[#A8B0C5] group-hover:stroke-white'
              }`} />
            </div>
            
            <span className={`text-[9px] font-black uppercase tracking-widest mt-1 transition-colors duration-300 ${
              isActive ? 'text-[#38BDF8]' : 'text-[#A8B0C5]'
            }`}>
              {item.label}
            </span>

            {isActive && (
              <div className="absolute -bottom-0.5 w-1.5 h-1.5 bg-[#38BDF8] rounded-full shadow-[0_0_10px_#38BDF8]" />
            )}
          </button>
        );
      })}
    </nav>
  );
});
BottomNav.displayName = 'BottomNav';
