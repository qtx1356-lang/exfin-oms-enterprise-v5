import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Building2, AlertTriangle, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { getTodayAttendanceRecord, getStoredAttendanceRecords, saveAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AutomaticAttendanceEngine } from '../../services/attendance/automaticAttendanceEngine';
import { AttendanceRecord } from '../../types/attendance';

export const CheckoutConfirmationModal: React.FC = () => {
  const { employeeData } = useRegistration();
  const { liveLocation, currentAddress } = useLocationContext();
  const [activeRecord, setActiveRecord] = useState<AttendanceRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const employeeId = employeeData?.employeeCode || employeeData?.employeeId;

  const checkPendingConfirmation = useCallback(() => {
    if (!employeeId) {
      setActiveRecord(null);
      return;
    }

    const todayStr = getFormattedDateStr();
    const record = getTodayAttendanceRecord(employeeId, todayStr);

    if (
      record &&
      record.checkInTime &&
      record.checkInTime !== '--:--' &&
      !record.checkOutTime &&
      (record.attendanceType === 'OFFICE' || !record.attendanceType) &&
      record.pendingCheckoutConfirmation === true
    ) {
      setActiveRecord(record);
    } else {
      setActiveRecord(null);
    }
  }, [employeeId]);

  useEffect(() => {
    checkPendingConfirmation();

    // Check periodically (every 1.5s) to guarantee responsiveness across background/foreground changes
    const interval = setInterval(checkPendingConfirmation, 1500);

    const handleAttendanceUpdated = () => checkPendingConfirmation();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkPendingConfirmation();
      }
    };
    const handleFocus = () => checkPendingConfirmation();

    window.addEventListener('exfin-attendance-updated', handleAttendanceUpdated);
    window.addEventListener('exfin-checkout-confirmation-needed', handleAttendanceUpdated);
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleAttendanceUpdated);

    return () => {
      clearInterval(interval);
      window.removeEventListener('exfin-attendance-updated', handleAttendanceUpdated);
      window.removeEventListener('exfin-checkout-confirmation-needed', handleAttendanceUpdated);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleAttendanceUpdated);
    };
  }, [checkPendingConfirmation]);

  // Prevent background scrolling while modal is active
  useEffect(() => {
    if (activeRecord) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [activeRecord]);

  // Prevent Escape key dismissal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeRecord && (e.key === 'Escape' || e.key === 'Esc')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeRecord]);

  const handleConfirmCheckout = async () => {
    if (!employeeId || isProcessing || !activeRecord) return;
    setIsProcessing(true);
    setFeedback('Finalizing checkout at recorded exit time...');

    try {
      const todayStr = getFormattedDateStr();
      const result = AutomaticAttendanceEngine.confirmCheckoutFromExit(
        employeeId,
        todayStr,
        liveLocation || undefined,
        currentAddress || undefined
      );

      if (result) {
        setFeedback(`Checkout confirmed at ${result.checkOutTime}`);
        setTimeout(() => {
          setActiveRecord(null);
          setIsProcessing(false);
          setFeedback(null);
        }, 500);
      } else {
        setActiveRecord(null);
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error('Error confirming checkout:', err);
      setIsProcessing(false);
      setFeedback(err.message || 'Failed to confirm checkout');
    }
  };

  const handleReturningToOffice = async () => {
    if (!employeeId || isProcessing || !activeRecord) return;
    setIsProcessing(true);
    setFeedback('Preserving active session...');

    try {
      const todayStr = getFormattedDateStr();
      const result = AutomaticAttendanceEngine.setReturningToOffice(
        employeeId,
        todayStr
      );

      if (result) {
        setFeedback('Active attendance session preserved.');
        setTimeout(() => {
          setActiveRecord(null);
          setIsProcessing(false);
          setFeedback(null);
        }, 500);
      } else {
        setActiveRecord(null);
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error('Error setting returning to office:', err);
      setIsProcessing(false);
      setFeedback(err.message || 'Failed to update status');
    }
  };

  if (!activeRecord) {
    return null;
  }

  const exitTimeDisplay = activeRecord.geofenceExitTime || activeRecord.lastExitTime || activeRecord.exitTime || 'Just now';

  return (
    <AnimatePresence>
      <div 
        id="checkout-confirmation-backdrop"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md select-none"
        onClick={(e) => {
          // Strictly prevent tap-outside-to-dismiss
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <motion.div
          id="checkout-confirmation-modal"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#180e30] border border-purple-800/60 rounded-2xl shadow-2xl shadow-purple-950/80 overflow-hidden text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-purple-900/90 via-[#27154d] to-purple-950/90 px-6 pt-6 pb-5 border-b border-purple-800/40">
            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-purple-300 uppercase block">
                  Geofence Exit Detected
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                  You have left the office premises.
                </h3>
              </div>
            </div>
            <p className="text-sm text-purple-200/90 font-medium pl-[58px]">
              What would you like to do?
            </p>
          </div>

          {/* Details Card */}
          <div className="p-6 space-y-4">
            <div className="bg-purple-950/40 rounded-xl border border-purple-800/30 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-purple-200">
                <span className="flex items-center gap-1.5 text-purple-300">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  Recorded Exit Time:
                </span>
                <span className="font-bold text-sm text-amber-300">
                  {exitTimeDisplay}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-purple-300/80 pt-1 border-t border-purple-900/50">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-purple-400" />
                  Office Geofence:
                </span>
                <span className="font-medium text-purple-200">
                  Outside 25m boundary
                </span>
              </div>
            </div>

            {feedback && (
              <div className="p-3 bg-purple-900/40 border border-purple-700/50 rounded-xl text-xs text-purple-200 text-center font-medium flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{feedback}</span>
              </div>
            )}

            {/* Exactly TWO mandatory options */}
            <div className="pt-2 space-y-3">
              {/* Option 1: Confirm Checkout */}
              <button
                id="btn-confirm-checkout"
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmCheckout}
                className="w-full group relative flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:from-emerald-700 active:to-emerald-800 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950/40 border border-emerald-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-lg bg-emerald-800/60 border border-emerald-400/30 flex items-center justify-center text-emerald-200 group-hover:scale-105 transition-transform">
                    <LogOut className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">Confirm Checkout</div>
                    <div className="text-[11px] text-emerald-100/80 font-normal">
                      Finalize at {exitTimeDisplay}
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold px-2.5 py-1 bg-emerald-800/70 border border-emerald-400/30 rounded-lg text-emerald-100">
                  End Day
                </div>
              </button>

              {/* Option 2: Returning to Office */}
              <button
                id="btn-returning-to-office"
                type="button"
                disabled={isProcessing}
                onClick={handleReturningToOffice}
                className="w-full group relative flex items-center justify-between px-4 py-3.5 bg-purple-900/60 hover:bg-purple-800/80 active:bg-purple-950 text-white font-semibold rounded-xl shadow-lg shadow-purple-950/40 border border-purple-700/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-lg bg-purple-800/70 border border-purple-600/40 flex items-center justify-center text-purple-200 group-hover:scale-105 transition-transform">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold tracking-tight">Returning to Office</div>
                    <div className="text-[11px] text-purple-200/80 font-normal">
                      Keep attendance session active
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold px-2.5 py-1 bg-purple-800/80 border border-purple-600/40 rounded-lg text-purple-200">
                  Stay Active
                </div>
              </button>
            </div>

            <p className="text-[11px] text-center text-purple-400/80 pt-1">
              Please choose an action. This prompt will remain until resolved.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
