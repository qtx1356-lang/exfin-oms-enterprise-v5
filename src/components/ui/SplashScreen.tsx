import React, { useEffect } from 'react';
import { motion } from 'motion/react';

export const SplashScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-gradient-to-b from-[#170B38] via-[#211044] to-[#2A145B] flex flex-col items-center justify-center z-50 text-white"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="w-20 h-20 mx-auto mb-4 bg-[#7C3AED] rounded-3xl flex items-center justify-center shadow-[0_0_40px_rgba(124,58,237,0.6)]">
          <span className="text-3xl font-black tracking-tighter text-white">EO</span>
        </div>
        <div className="text-2xl font-black tracking-wider text-white">
          EXFIN OMS ENTERPRISE
        </div>
        <div className="mt-2 text-xs font-bold uppercase tracking-widest text-purple-300 bg-purple-900/40 border border-purple-500/30 px-3 py-1 rounded-full inline-block">
          v6.0 • Deep Purple Enterprise
        </div>
      </motion.div>
    </motion.div>
  );
};
