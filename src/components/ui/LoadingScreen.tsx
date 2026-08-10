import React from 'react';
import { Loader } from './Loader';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#170B38] to-[#2A145B] flex flex-col items-center justify-center z-40 text-white">
      <Loader size="lg" />
    </div>
  );
};
