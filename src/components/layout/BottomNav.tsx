import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, ClipboardCheck, CalendarRange, Target, Users } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';

const TABS = [
  { id: 'dashboard', path: '/employee-dashboard', icon: Home, label: 'Home' },
  { id: 'attendance', path: '/attendance', icon: ClipboardCheck, label: 'Attendance' },
  { id: 'planner', path: '/planner', icon: CalendarRange, label: 'Planner' },
  { id: 'efficiency', path: '/efficiency', icon: Target, label: 'Efficiency' },
  { id: 'team', path: '/my-team', icon: Users, label: 'My Team' },
];

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { employeeData } = useRegistration();

  // "My Team" must be displayed ONLY when employee is assigned/designated as a Team Leader
  const isTeamLeader = Boolean(
    employeeData?.isTeamLeader ||
    employeeData?.isManager ||
    employeeData?.role === 'MANAGER' ||
    employeeData?.role === 'ADMIN' ||
    employeeData?.role === 'TEAM_LEADER'
  );

  const visibleTabs = TABS.filter(tab => tab.id !== 'team' || isTeamLeader);

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-nav z-[90] pb-safe pt-1.5 px-1 sm:px-4">
      <div className="flex justify-between items-center h-16 max-w-md mx-auto gap-1">
        {visibleTabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-2xl transition-all duration-300 cursor-pointer select-none ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-blue-600 text-white shadow-md shadow-emerald-500/20 scale-[1.02]'
                  : 'text-[#CBD5E1] hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon 
                className={`w-5 h-5 transition-transform duration-300 ${
                  isActive ? 'text-white scale-110 drop-shadow' : 'text-[#CBD5E1]'
                }`}
              />
              <span 
                className={`text-[10px] tracking-tight leading-tight mt-0.5 transition-all duration-300 whitespace-nowrap ${
                  isActive ? 'text-white font-extrabold' : 'text-[#CBD5E1] font-semibold'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-emerald-400 rounded-full shadow-sm" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

