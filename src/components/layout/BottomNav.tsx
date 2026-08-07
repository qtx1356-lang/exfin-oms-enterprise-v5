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
    <div className="fixed bottom-0 left-0 right-0 h-20 bg-surface border-t border-surface-variant flex items-center justify-around px-2 z-30 pb-safe">
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => 
            `flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all ${
              isActive ? 'text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-variant/50'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className={`flex items-center justify-center w-16 h-8 rounded-full mb-1 transition-colors ${isActive ? 'bg-secondary-container' : 'bg-transparent'}`}>
                <item.icon className={`w-6 h-6 ${isActive ? 'stroke-on-secondary-container' : 'stroke-on-surface-variant'}`} />
              </div>
              <span className="text-[12px] font-medium leading-none">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
};
