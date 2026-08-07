import React from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <main className="container mx-auto p-4 max-w-3xl">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
