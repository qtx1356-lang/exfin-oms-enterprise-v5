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
    <div className="fixed inset-0 bg-gradient-to-b from-[#071A17] via-[#0B2420] to-[#102D28] flex flex-col items-center justify-center z-[9999] text-[#F5FFFC]">
      <Loader size="lg" />
    </div>
  );
};
