import React from 'react';
import { Loader } from './Loader';

const getTime = () => new Date().toISOString().substring(11, 23);

export const LoadingScreen: React.FC<{ fullScreen?: boolean }> = ({ fullScreen = true }) => {
  React.useEffect(() => {
    console.log(`[FLICKER-TRACE] LoadingScreen MOUNT ${getTime()}`);
    return () => console.log(`[FLICKER-TRACE] LoadingScreen UNMOUNT ${getTime()}`);
  }, []);

  console.log(`[FLICKER-TRACE] LoadingScreen RENDER fullScreen=${fullScreen} ${getTime()}`);

  if (!fullScreen) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-[var(--text-primary)] min-h-[200px] relative">
        <Loader size="lg" />
      </div>
    );
  }
  return (
    <div className="fixed inset-0 bg-[var(--app-bg)] flex flex-col items-center justify-center z-[9999] text-[var(--text-primary)] relative overflow-hidden">
      {/* Emerald Aurora Ambient Lighting */}
      <div className="fixed top-1/4 right-1/4 w-[500px] h-[500px] bg-[var(--aurora-emerald)]/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
      <div className="fixed bottom-1/4 left-1/4 w-[400px] h-[400px] bg-[var(--aurora-teal)]/10 rounded-full blur-[140px] pointer-events-none animate-pulse delay-700" />
      
      <div className="relative z-10 flex flex-col items-center gap-6">
        <Loader size="lg" />
        <div className="text-[10px] font-black text-[var(--text-muted)] uppercase tracking-[0.3em] aurora-text animate-pulse">
          Exfin Systems
        </div>
      </div>
    </div>
  );
};
