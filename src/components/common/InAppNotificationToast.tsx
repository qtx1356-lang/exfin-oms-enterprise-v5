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
  Users,
  User,
  ShieldAlert,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { NotificationRecord, NotificationPriority } from '../../types/notification';

export interface ToastPayload {
  mode: 'SINGLE' | 'SUMMARY';
  notification?: NotificationRecord;
  count?: number;
  title?: string;
  message?: string;
  actionLabel?: string;
  route?: string;
  priority?: NotificationPriority;
}

interface Props {
  toastData: ToastPayload | NotificationRecord | null;
  onDismiss: () => void;
}

export const InAppNotificationToast: React.FC<Props> = ({
  toastData,
  onDismiss,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!toastData) return;

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);

    return () => clearTimeout(timer);
  }, [toastData, onDismiss]);

  if (!toastData) return null;

  // Normalize payload
  const isSummary = 'mode' in toastData && toastData.mode === 'SUMMARY';
  const singleNotif = !isSummary
    ? 'mode' in toastData
      ? toastData.notification
      : (toastData as NotificationRecord)
    : undefined;

  const title = isSummary
    ? (toastData as ToastPayload).title || '🔔 New Notifications'
    : singleNotif?.title || 'New Notification';

  const message = isSummary
    ? (toastData as ToastPayload).message || 'You have new unread notifications.'
    : singleNotif?.message || '';

  const priority: NotificationPriority = isSummary
    ? (toastData as ToastPayload).priority || 'NORMAL'
    : singleNotif?.priority || 'NORMAL';

  const category = singleNotif?.category || 'SYSTEM';

  const handleActionClick = () => {
    onDismiss();

    if (isSummary) {
      const targetRoute = (toastData as ToastPayload).route || '/notifications';
      navigate(targetRoute);
    } else if (singleNotif) {
      if (singleNotif.route) {
        navigate(singleNotif.route);
      } else {
        switch (singleNotif.category) {
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
    } else {
      navigate('/notifications');
    }
  };

  const getCategoryIcon = (cat?: string) => {
    if (isSummary) {
      return <Bell className="w-5 h-5 text-purple-300 animate-pulse" />;
    }
    switch (cat) {
      case 'ATTENDANCE':
        return <Calendar className="w-5 h-5 text-emerald-400" />;
      case 'PLANNER':
        return <ClipboardList className="w-5 h-5 text-blue-400" />;
      case 'LEAVE':
        return <FileText className="w-5 h-5 text-orange-400" />;
      case 'EXPENSE':
        return <DollarSign className="w-5 h-5 text-yellow-400" />;
      case 'TEAM':
        return <Users className="w-5 h-5 text-purple-400" />;
      case 'ACCOUNT':
        return <User className="w-5 h-5 text-indigo-400" />;
      case 'ADMINISTRATIVE':
        return <ShieldAlert className="w-5 h-5 text-amber-400" />;
      default:
        return <Bell className="w-5 h-5 text-purple-400" />;
    }
  };

  const actionBtnText = isSummary
    ? (toastData as ToastPayload).actionLabel ||
      ((toastData as ToastPayload).count && (toastData as ToastPayload).count! > 5
        ? 'View All'
        : 'View Notifications')
    : 'View';

  const isCritical = priority === 'URGENT';
  const isHigh = priority === 'HIGH';

  const borderStyle = isCritical
    ? 'border-2 border-rose-500/80 shadow-[0_0_25px_rgba(244,63,94,0.4)] bg-[#280D3D]'
    : isHigh
    ? 'border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.3)] bg-[#211044]'
    : 'border-2 border-purple-500/50 shadow-[0_10px_35px_rgba(0,0,0,0.7)] bg-[#211044]';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -30, scale: 0.95 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[94%] max-w-md pointer-events-auto"
      >
        <div
          onClick={handleActionClick}
          className={`${borderStyle} rounded-2xl p-3.5 text-white flex items-center gap-3 cursor-pointer hover:border-purple-300 transition-all group backdrop-blur-md relative overflow-hidden`}
        >
          {/* Subtle Priority Accent Pulse */}
          {isCritical && (
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500 animate-pulse" />
          )}

          {/* Icon */}
          <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-500/30 shrink-0">
            {getCategoryIcon(category)}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] uppercase font-black tracking-wider text-purple-300 flex items-center gap-1">
                {isSummary ? (
                  <>
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span>SUMMARY</span>
                  </>
                ) : (
                  <span>{category}</span>
                )}
              </span>

              {priority && priority !== 'NORMAL' && (
                <span
                  className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                    isCritical
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}
                >
                  {priority}
                </span>
              )}
            </div>

            <h4 className="font-extrabold text-xs text-white truncate flex items-center gap-1.5">
              <span>{title}</span>
            </h4>
            <p className="text-[11px] text-purple-200/90 line-clamp-2 mt-0.5 font-medium leading-relaxed">
              {message}
            </p>
          </div>

          {/* Action Button & Close */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleActionClick();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-[11px] font-bold flex items-center gap-0.5 shadow-md transition-colors"
            >
              <span>{actionBtnText}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="p-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white transition-colors"
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

