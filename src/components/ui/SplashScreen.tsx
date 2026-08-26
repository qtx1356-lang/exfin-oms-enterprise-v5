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
      className="fixed inset-0 bg-gradient-to-b from-[#071A17] via-[#0B2420] to-[#102D28] flex flex-col items-center justify-center z-50 text-[#F5FFFC]"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="text-center"
      >
        <div className="w-20 h-20 mx-auto bg-[#18C7A0] rounded-3xl flex items-center justify-center shadow-lg border border-[#35E0B9]/30">
          <span className="text-3xl font-black tracking-tighter text-[#04110E]">EO</span>
        </div>
      </motion.div>
    </motion.div>
  );
};
