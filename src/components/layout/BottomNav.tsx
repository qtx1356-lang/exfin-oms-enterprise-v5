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

  // Show "My Team" only for managers or specific roles, or always if you want
  const hasTeam = employeeData?.role === 'MANAGER' || employeeData?.role === 'ADMIN' || employeeData?.isManager === true;
  
  const visibleTabs = TABS.filter(tab => tab.id !== 'team' || hasTeam);

  return (
    <nav className="fixed bottom-0 left-0 right-0 glass-nav z-[90] pb-safe pt-2">
      <div className="flex justify-around items-center h-16 px-2">
        {visibleTabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className="relative flex flex-col items-center justify-center w-16 h-14 cursor-pointer"
            >
              {isActive && (
                <div className="absolute inset-0 bg-[var(--primary)]/10 rounded-2xl pointer-events-none" />
              )}
              <Icon 
                className={`w-6 h-6 mb-1 transition-all duration-300 ${
                  isActive 
                    ? 'text-[var(--primary)] scale-110' 
                    : 'text-[var(--text-muted)] scale-95'
                }`}
              />
              <span 
                className={`text-[10px] font-semibold tracking-wide transition-all duration-300 ${
                  isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {tab.label}
              </span>
              {isActive && (
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-[var(--primary)] rounded-b-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
