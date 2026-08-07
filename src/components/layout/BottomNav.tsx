import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, CalendarCheck, Wallet, User } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: CalendarCheck, label: 'Attendance', path: '/attendance' },
    { icon: Wallet, label: 'Expenses', path: '/expenses' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-white/90 backdrop-blur-md border-t border-slate-200/80 flex items-center justify-around px-4 z-30 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => 
            `flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-200 ${
              isActive ? 'text-[#2563EB]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className={`flex items-center justify-center w-12 h-7 rounded-full mb-1 transition-all duration-200 ${
                isActive ? 'bg-blue-50 text-[#2563EB] shadow-sm' : 'bg-transparent text-slate-500'
              }`}>
                <item.icon className={`w-5 h-5 transition-transform duration-200 ${
                  isActive ? 'stroke-[#2563EB] scale-110' : 'stroke-slate-500'
                }`} />
              </div>
              <span className={`text-[11px] leading-none transition-all ${
                isActive ? 'font-black text-[#2563EB]' : 'font-semibold text-slate-500'
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
