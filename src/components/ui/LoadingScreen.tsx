import React from 'react';
import { Loader } from './Loader';

export const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-background flex flex-col items-center justify-center z-40">
      <Loader size="lg" />
      <p className="mt-4 text-outline text-sm font-medium">Loading...</p>
    </div>
  );
};
