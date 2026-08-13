import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, CalendarCheck, Receipt, CalendarDays, User } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: CalendarCheck, label: 'Attendance', path: '/attendance' },
    { icon: Receipt, label: 'Expenses', path: '/expenses' },
    { icon: CalendarDays, label: 'Leave', path: '/leave' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <nav aria-label="Bottom Navigation" className="fixed bottom-4 left-3 right-3 max-w-md mx-auto h-16 bg-[#2D1B5A]/95 backdrop-blur-2xl border border-purple-500/30 rounded-full flex items-center justify-around px-2 z-40 shadow-[0_10px_35px_rgba(0,0,0,0.5)] pointer-events-auto">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
        return (
          <button
            key={item.path}
            type="button"
            onClick={() => {
              navigate(item.path);
            }}
            className={`flex flex-col items-center justify-center w-14 sm:w-16 h-12 rounded-full transition-all duration-200 touch-manipulation cursor-pointer active:scale-95 ${
              isActive ? 'text-white' : 'text-purple-300/60 hover:text-purple-200'
            }`}
          >
            <div className={`flex items-center justify-center w-9 h-7 rounded-full mb-0.5 transition-all duration-200 ${
              isActive ? 'bg-[#7C3AED] text-white shadow-[0_0_15px_rgba(124,58,237,0.5)] scale-105' : 'bg-transparent'
            }`}>
              <item.icon className={`w-4 h-4 transition-transform duration-200 ${
                isActive ? 'stroke-white scale-110' : 'stroke-purple-300/70'
              }`} />
            </div>
            <span className={`text-[10px] leading-none transition-all ${
              isActive ? 'font-black text-white' : 'font-semibold text-purple-300/60'
            }`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};


