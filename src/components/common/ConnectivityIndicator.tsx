import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff } from 'lucide-react';
import { useRealtimeSync } from '../../context/RealtimeSyncContext';

export const ConnectivityIndicator: React.FC = () => {
  const { isOnline, showStatusIndicator } = useRealtimeSync();
  const isInitialOfflineRef = React.useRef(typeof navigator !== 'undefined' && !navigator.onLine);

  return (
    <AnimatePresence>
      {showStatusIndicator && (
        <motion.div
          initial={isInitialOfflineRef.current ? false : { y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className={`fixed top-0 left-0 right-0 z-[9999] pointer-events-none flex items-center justify-center py-1.5 px-4 text-xs font-bold transition-colors duration-500 shadow-lg ${
            isOnline ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
          }`}
        >
          {isOnline ? (
            <div className="flex items-center gap-2">
              <Wifi size={14} className="animate-pulse" />
              <span>Back online — All data synchronized</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <WifiOff size={14} className="animate-pulse" />
              <span>Offline — Changes saved locally</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
