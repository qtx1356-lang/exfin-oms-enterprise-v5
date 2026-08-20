import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Megaphone,
  AlertTriangle,
  ShieldAlert,
  Calendar,
  ClipboardList,
  FileText,
  DollarSign,
  Users,
  Check,
  X,
  Sparkles,
  Info,
} from 'lucide-react';
import { NotificationRecord } from '../../types/notification';

interface AlertPopupProps {
  notification: NotificationRecord | null;
  onAcknowledge: (notifId: string) => void;
  onDismiss: () => void;
  queueCount?: number;
}

export const AlertPopup: React.FC<AlertPopupProps> = ({
  notification,
  onAcknowledge,
  onDismiss,
  queueCount = 0,
}) => {
  if (!notification) return null;

  const isAnnouncement =
    notification.type === 'ANNOUNCEMENT' ||
    notification.category === 'SYSTEM' ||
    notification.title.toLowerCase().includes('announcement');

  const priority = notification.priority || 'NORMAL';
  const isUrgent = priority === 'URGENT';
  const isHigh = priority === 'HIGH';

  // Format date and time
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      
      const now = new Date();
      const isToday =
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();

      const timeStr = d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

      if (isToday) {
        return `Today at ${timeStr}`;
      }
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
    } catch {
      return dateStr;
    }
  };

  const formattedTime = formatDateTime(
    notification.timestamp ||
      notification.createdAtDeviceTime ||
      notification.createdAt
  );

  // Category Icon Resolver
  const renderCategoryIcon = () => {
    if (isAnnouncement) {
      return <Megaphone className="w-8 h-8 text-amber-400 animate-bounce" />;
    }
    if (isUrgent) {
      return <AlertTriangle className="w-8 h-8 text-rose-400 animate-pulse" />;
    }
    if (isHigh) {
      return <ShieldAlert className="w-8 h-8 text-amber-400 animate-pulse" />;
    }

    switch (notification.category) {
      case 'ATTENDANCE':
        return <Calendar className="w-8 h-8 text-emerald-400" />;
      case 'PLANNER':
        return <ClipboardList className="w-8 h-8 text-blue-400" />;
      case 'LEAVE':
        return <FileText className="w-8 h-8 text-orange-400" />;
      case 'EXPENSE':
        return <DollarSign className="w-8 h-8 text-yellow-400" />;
      case 'TEAM':
        return <Users className="w-8 h-8 text-purple-300" />;
      default:
        return <Bell className="w-8 h-8 text-purple-300" />;
    }
  };

  return (
    <AnimatePresence>
      <div
        id="exfin-realtime-alert-popup-overlay"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.88, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          id={`alert-popup-${notification.id}`}
          className={`relative w-full max-w-lg bg-[#211044] border rounded-[28px] shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden text-white ${
            isUrgent
              ? 'border-rose-500/80 shadow-[0_0_50px_rgba(244,63,94,0.35)]'
              : isHigh
              ? 'border-amber-500/80 shadow-[0_0_40px_rgba(245,158,11,0.3)]'
              : 'border-purple-500/50 shadow-[0_0_40px_rgba(139,92,246,0.25)]'
          }`}
        >
          {/* Top Priority Accent Bar */}
          <div
            className={`h-1.5 w-full ${
              isUrgent
                ? 'bg-gradient-to-r from-rose-500 via-amber-400 to-rose-600'
                : isHigh
                ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-purple-600'
                : 'bg-gradient-to-r from-purple-600 via-indigo-400 to-purple-500'
            }`}
          />

          {/* Close button in top corner */}
          <button
            onClick={onDismiss}
            id="alert-popup-close-btn"
            className="absolute top-4 right-4 p-2 rounded-xl bg-purple-950/60 border border-purple-500/20 text-purple-300 hover:text-white hover:bg-purple-800/40 transition-colors z-10"
            title="Dismiss popup"
            aria-label="Close alert"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="p-6 sm:p-7 space-y-5">
            {/* Header: Icon + Badges */}
            <div className="flex items-start gap-4">
              <div
                className={`p-3.5 rounded-2xl border flex items-center justify-center shrink-0 ${
                  isUrgent
                    ? 'bg-rose-950/70 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.3)]'
                    : isHigh
                    ? 'bg-amber-950/70 border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                    : 'bg-purple-950/80 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.25)]'
                }`}
              >
                {renderCategoryIcon()}
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${
                      isAnnouncement
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    }`}
                  >
                    {isAnnouncement ? '📢 ANNOUNCEMENT' : '🔔 REAL-TIME ALERT'}
                  </span>

                  {priority && priority !== 'NORMAL' && (
                    <span
                      className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        isUrgent
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {priority} PRIORITY
                    </span>
                  )}

                  {notification.category && (
                    <span className="text-[9px] font-bold uppercase text-purple-300/80 bg-purple-900/40 px-2 py-0.5 rounded-full border border-purple-500/20">
                      {notification.category}
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-purple-300/70 font-medium">
                  {formattedTime}
                </div>
              </div>
            </div>

            {/* Notification Title */}
            <div>
              <h2
                id="alert-popup-title"
                className="text-lg sm:text-xl font-black text-white leading-snug tracking-tight"
              >
                {notification.title || 'Important Notice'}
              </h2>
            </div>

            {/* Notification Message */}
            <div
              id="alert-popup-message-body"
              className="bg-[#170B38]/80 border border-purple-500/20 rounded-2xl p-4 max-h-56 sm:max-h-64 overflow-y-auto text-purple-100 text-xs sm:text-sm leading-relaxed whitespace-pre-line select-text"
            >
              {notification.message}
            </div>

            {/* Queue info if multiple alerts waiting */}
            {queueCount > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-purple-300/80 bg-purple-950/50 border border-purple-500/20 px-3 py-1.5 rounded-xl">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>
                  +{queueCount} more alert{queueCount > 1 ? 's' : ''} in queue
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => onAcknowledge(notification.id)}
                id="alert-popup-acknowledge-btn"
                className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-[0.98] text-white text-xs sm:text-sm font-black tracking-wide flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(147,51,234,0.4)] transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-300 stroke-[3]" />
                <span>OK / ACKNOWLEDGE</span>
              </button>

              <button
                type="button"
                onClick={onDismiss}
                id="alert-popup-dismiss-btn"
                className="py-3.5 px-5 rounded-2xl bg-purple-950/70 hover:bg-purple-900/60 text-purple-300 hover:text-white border border-purple-500/30 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
