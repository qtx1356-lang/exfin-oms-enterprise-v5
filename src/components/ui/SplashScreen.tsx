import React, { useEffect } from 'react';
import { motion } from 'motion/react';

export const SplashScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 1800);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-[var(--app-background)] flex flex-col items-center justify-center z-50 text-[var(--text-primary)]"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center flex flex-col items-center"
      >
        <div className="w-20 h-20 mx-auto bg-[var(--surface-card)] backdrop-blur-[14px] rounded-3xl flex items-center justify-center shadow-2xl border border-[var(--primary)]/40 mb-4 relative">
          <div className="absolute inset-0 bg-[var(--primary)]/10 rounded-3xl blur-md" />
          <span className="text-3xl font-black tracking-tight text-[var(--primary-light)] relative z-10">EO</span>
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-black tracking-widest text-[var(--text-primary)] uppercase">EXFIN OMS</h1>
          <p className="text-[11px] font-bold tracking-widest text-[var(--primary-light)] uppercase">Executive Edition</p>
        </div>
      </motion.div>
    </motion.div>
  );
};
