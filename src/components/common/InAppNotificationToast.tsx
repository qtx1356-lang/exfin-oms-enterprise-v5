import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  X,
  Calendar,
  ClipboardList,
  FileText,
  DollarSign,
  ChevronRight,
  Info,
} from 'lucide-react';
import { NotificationRecord } from '../../types/notification';

interface Props {
  notification: NotificationRecord | null;
  onDismiss: () => void;
}

export const InAppNotificationToast: React.FC<Props> = ({
  notification,
  onDismiss,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!notification) return;

    // Auto dismiss after 6 seconds
    const timer = setTimeout(() => {
      onDismiss();
    }, 6000);

    return () => clearTimeout(timer);
  }, [notification, onDismiss]);

  if (!notification) return null;

  const handleActionClick = () => {
    const route = notification.route;
    onDismiss();

    if (route) {
      navigate(route);
    } else {
      switch (notification.category) {
        case 'ATTENDANCE':
          navigate('/attendance');
          break;
        case 'PLANNER':
          navigate('/planner');
          break;
        case 'LEAVE':
          navigate('/leave');
          break;
        case 'EXPENSE':
          navigate('/expenses');
          break;
        default:
          navigate('/notifications');
          break;
      }
    }
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'ATTENDANCE':
        return <Calendar className="w-5 h-5 text-emerald-400" />;
      case 'PLANNER':
        return <ClipboardList className="w-5 h-5 text-blue-400" />;
      case 'LEAVE':
        return <FileText className="w-5 h-5 text-orange-400" />;
      case 'EXPENSE':
        return <DollarSign className="w-5 h-5 text-yellow-400" />;
      default:
        return <Bell className="w-5 h-5 text-purple-400" />;
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg"
      >
        <div
          onClick={handleActionClick}
          className="bg-[#211044] border-2 border-purple-500/50 shadow-[0_10px_35px_rgba(0,0,0,0.7)] rounded-[22px] p-3.5 text-white flex items-center gap-3 cursor-pointer hover:border-purple-400 transition-all group"
        >
          {/* Icon */}
          <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-500/30 shrink-0">
            {getCategoryIcon(notification.category)}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-purple-300">
                {notification.category || 'ALERT'}
              </span>
              {notification.priority && (
                <span
                  className={`text-[9px] px-2 py-0.2 rounded-full font-black ${
                    notification.priority === 'URGENT' ||
                    notification.priority === 'HIGH'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}
                >
                  {notification.priority}
                </span>
              )}
            </div>

            <h4 className="font-bold text-xs text-white truncate">
              {notification.title}
            </h4>
            <p className="text-[11px] text-purple-200/80 line-clamp-2 mt-0.5">
              {notification.message}
            </p>
          </div>

          {/* Action Button & Close */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleActionClick();
              }}
              className="p-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold flex items-center gap-0.5 shadow-md"
            >
              <span>View</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-slate-400 hover:text-white transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
