import React from 'react';
import { Loader } from './Loader';

export const LoadingScreen: React.FC<{ fullScreen?: boolean }> = ({ fullScreen = true }) => {
  if (!fullScreen) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-white min-h-[200px]">
        <Loader size="lg" />
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#170B38] to-[#2A145B] flex flex-col items-center justify-center z-[9999] text-white">
      <Loader size="lg" />
    </div>
  );
};
