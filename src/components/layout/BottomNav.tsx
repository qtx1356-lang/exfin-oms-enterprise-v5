import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CalendarCheck, Wallet, User, Users, Briefcase } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';

export const BottomNav: React.FC = () => {
  const { employeeData } = useRegistration();

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: CalendarCheck, label: 'Attendance', path: '/attendance' },
    { icon: Briefcase, label: 'Planner', path: '/planner' },
    ...(employeeData?.isTeamLeader ? [{ icon: Users, label: 'My Team', path: '/my-team' }] : []),
    { icon: Wallet, label: 'Expenses', path: '/expenses' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto h-16 bg-[#2D1B5A]/95 backdrop-blur-2xl border border-purple-500/30 rounded-full flex items-center justify-around px-3 z-40 shadow-[0_10px_35px_rgba(0,0,0,0.5)]">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => 
            `flex flex-col items-center justify-center w-16 h-12 rounded-full transition-all duration-300 ${
              isActive ? 'text-white' : 'text-purple-300/60 hover:text-purple-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className={`flex items-center justify-center w-10 h-7 rounded-full mb-0.5 transition-all duration-300 ${
                isActive ? 'bg-[#7C3AED] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)] scale-105' : 'bg-transparent'
              }`}>
                <item.icon className={`w-4 h-4 transition-transform duration-300 ${
                  isActive ? 'stroke-white scale-110' : 'stroke-purple-300/70'
                }`} />
              </div>
              <span className={`text-[10px] leading-none transition-all ${
                isActive ? 'font-black text-white' : 'font-semibold text-purple-300/60'
              }`}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
};
