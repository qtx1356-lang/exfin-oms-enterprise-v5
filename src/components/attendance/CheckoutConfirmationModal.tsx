import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, Building2, AlertTriangle, Clock, MapPin, CheckCircle2, X, Send } from 'lucide-react';
import { useRegistration } from '../../context/RegistrationContext';
import { useLocationContext } from '../../context/LocationContext';
import { getTodayAttendanceRecord, saveAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { AutomaticAttendanceEngine } from '../../services/attendance/automaticAttendanceEngine';
import { AttendanceRecord } from '../../types/attendance';

export const CheckoutConfirmationModal: React.FC = () => {
  const { employeeData } = useRegistration();
  const { liveLocation, currentAddress } = useLocationContext();
  const [activeRecord, setActiveRecord] = useState<AttendanceRecord | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState('18:00');
  const [showManualTimeInput, setShowManualTimeInput] = useState(false);
  const [manualError, setManualError] = useState<string | null>(null);

  const employeeId = employeeData?.employeeCode || employeeData?.employeeId;

  const resolvedEmployeeId = employeeId || (() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('cached_registration_data') : null;
      if (raw) {
        const p = JSON.parse(raw);
        return p.employeeCode || p.employeeId || p.id || p.uid;
      }
    } catch (e) {}
    return undefined;
  })();

  const checkPendingConfirmation = useCallback(() => {
    if (!resolvedEmployeeId) {
      setActiveRecord(null);
      return;
    }

    const todayStr = getFormattedDateStr();
    const record = getTodayAttendanceRecord(resolvedEmployeeId, todayStr);

    const checkOutValue = (record?.checkOutTime || '').trim();
    const isCheckOutMissing = !checkOutValue || 
                              checkOutValue === '--:--' || 
                              checkOutValue === '--:-- --' ||
                              checkOutValue === 'Pending' ||
                              checkOutValue === 'N/A' ||
                              checkOutValue === 'UNRESOLVED';

    const hasPendingExitState = record?.pendingCheckoutConfirmation === true ||
      record?.currentState === 'PENDING_AUTO_CHECKOUT' ||
      record?.currentState === 'PENDING_EXIT_CONFIRMATION' ||
      record?.currentState === 'PENDING_FINAL_EXIT' ||
      record?.currentState === 'CHECKOUT_NOT_DETECTED';

    if (
      record &&
      record.checkInTime &&
      record.checkInTime !== '--:--' &&
      isCheckOutMissing &&
      (record.attendanceType === 'OFFICE' || !record.attendanceType) &&
      hasPendingExitState
    ) {
      if (!record.confirmationDisplayedAt) {
        record.confirmationDisplayedAt = new Date().toISOString();
        saveAttendanceRecord(record);
      }
      setActiveRecord(record);
    } else {
      setActiveRecord(null);
    }
  }, [resolvedEmployeeId]);

  useEffect(() => {
    checkPendingConfirmation();

    // Event-driven check on mount and on relevant custom events/visibility changes
    const interval = setInterval(checkPendingConfirmation, 10000);

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
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [activeRecord]);

  const hasRecordedExit = !!(activeRecord?.recordedExitTime || activeRecord?.geofenceExitTime);

  // Trap Android / Browser Back button navigation ONLY when an exit was authoritatively recorded
  useEffect(() => {
    if (!activeRecord || !hasRecordedExit) return;

    window.history.pushState({ checkoutModal: true }, '', window.location.href);

    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      window.history.pushState({ checkoutModal: true }, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [activeRecord, hasRecordedExit]);

  // Prevent Escape key dismissal ONLY when authoritative exit was recorded
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeRecord && (e.key === 'Escape' || e.key === 'Esc')) {
        if (!hasRecordedExit) {
          setActiveRecord(null);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [activeRecord, hasRecordedExit]);

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

  const handleManualCheckoutSubmit = async () => {
    if (!employeeId || isProcessing || !activeRecord) return;
    setManualError(null);

    const [h, m] = manualTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) {
      setManualError('Please enter a valid time.');
      return;
    }

    let ampm = 'AM';
    let formattedH = h;
    if (h >= 12) {
      ampm = 'PM';
      if (h > 12) formattedH = h - 12;
    }
    if (formattedH === 0) formattedH = 12;
    const formattedTime = `${String(formattedH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;

    setIsProcessing(true);
    setFeedback('Recording checkout time for admin review...');

    try {
      const todayStr = getFormattedDateStr();
      const result = AutomaticAttendanceEngine.submitEmployeeCheckoutTime(
        employeeId,
        todayStr,
        formattedTime,
        false
      );

      if (result) {
        setFeedback(`Checkout recorded at ${formattedTime}. Status: UNRESOLVED`);
        setTimeout(() => {
          setActiveRecord(null);
          setIsProcessing(false);
          setFeedback(null);
          setShowManualTimeInput(false);
        }, 600);
      } else {
        setActiveRecord(null);
        setIsProcessing(false);
      }
    } catch (err: any) {
      console.error('Error submitting manual checkout time:', err);
      setIsProcessing(false);
      setManualError(err.message || 'Failed to submit checkout time');
    }
  };

  const handleDismiss = () => {
    if (activeRecord) {
      // Allow dismissing the non-blocking prompt
      activeRecord.pendingCheckoutConfirmation = false;
      saveAttendanceRecord(activeRecord);
      setActiveRecord(null);
    }
  };

  if (!activeRecord) {
    return null;
  }

  const exitTimeDisplay = activeRecord.recordedExitTime || activeRecord.geofenceExitTime;

  return (
    <AnimatePresence>
      <div 
        id="checkout-confirmation-backdrop"
        className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md select-none"
        onClick={(e) => {
          if (!hasRecordedExit) {
            handleDismiss();
          } else {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <motion.div
          id="checkout-confirmation-modal"
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-md glass-card border border-purple-800/60 rounded-2xl shadow-2xl shadow-purple-950/80 overflow-hidden text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Dismiss button when non-blocking */}
          {!hasRecordedExit && (
            <button
              onClick={handleDismiss}
              className="absolute top-4 right-4 z-10 p-2 text-purple-300 hover:text-white hover:bg-purple-900/50 rounded-xl transition-colors cursor-pointer"
              title="Dismiss for now"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Header Banner */}
          <div className="glass-card border-b border-[var(--border)] px-6 pt-6 pb-5">
            <div className="flex items-center gap-3.5 mb-2">
              <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-purple-300 uppercase block">
                  {hasRecordedExit ? 'Geofence Exit Detected' : 'Checkout Not Detected'}
                </span>
                <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                  {hasRecordedExit ? 'You have left the office premises.' : 'Office Checkout Not Detected'}
                </h3>
              </div>
            </div>
            <p className="text-sm text-purple-200/90 font-medium pl-[58px]">
              {hasRecordedExit 
                ? 'What would you like to do?' 
                : 'You are currently outside the office geofence. What would you like to do?'}
            </p>
          </div>

          {/* Details Card */}
          <div className="p-6 space-y-4">
            <div className="bg-purple-950/40 rounded-xl border border-purple-800/30 p-3.5 space-y-2">
              {hasRecordedExit ? (
                <div className="flex items-center justify-between text-xs text-purple-200">
                  <span className="flex items-center gap-1.5 text-purple-300">
                    <Clock className="w-3.5 h-3.5 text-purple-400" />
                    Recorded Exit Time:
                  </span>
                  <span className="font-bold text-sm text-amber-300">
                    {exitTimeDisplay}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-purple-200/90 leading-relaxed">
                  No automatic geofence exit was recorded while the app was closed. You can provide your checkout time or indicate you are returning to the office.
                </div>
              )}
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

            {manualError && (
              <div className="p-3 bg-rose-950/40 border border-rose-700/50 rounded-xl text-xs text-rose-200 text-center font-medium">
                <span>{manualError}</span>
              </div>
            )}

            {/* If has recorded exit: Show Confirm Checkout vs Returning to Office */}
            {hasRecordedExit && (
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
            )}

            {/* If NO recorded exit: Provide Enter Checkout Time or Returning to Office */}
            {!hasRecordedExit && (
              <div className="pt-2 space-y-3">
                {showManualTimeInput ? (
                  <div className="p-4 bg-purple-900/30 border border-purple-700/50 rounded-xl space-y-3">
                    <label className="block text-xs font-semibold text-purple-200">
                      When did you leave the office?
                    </label>
                    <div className="relative">
                      <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-400" />
                      <input
                        type="time"
                        value={manualTime}
                        onChange={(e) => setManualTime(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-purple-950/80 border border-purple-700/80 text-white rounded-xl focus:outline-none focus:border-purple-400 font-medium text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowManualTimeInput(false)}
                        className="flex-1 py-2 px-3 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/40 text-xs font-semibold rounded-lg text-purple-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={handleManualCheckoutSubmit}
                        className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-xs font-bold rounded-lg text-white transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/40"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Time</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    id="btn-enter-checkout-time"
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setShowManualTimeInput(true)}
                    className="w-full group relative flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-semibold rounded-xl shadow-lg shadow-amber-950/40 border border-amber-500/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <div className="flex items-center gap-3 text-left">
                      <div className="w-9 h-9 rounded-lg bg-amber-800/60 border border-amber-400/30 flex items-center justify-center text-amber-200 group-hover:scale-105 transition-transform">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold tracking-tight">Enter Checkout Time</div>
                        <div className="text-[11px] text-amber-100/80 font-normal">
                          Provide exit time for review
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-semibold px-2.5 py-1 bg-amber-800/70 border border-amber-400/30 rounded-lg text-amber-100">
                      Specify Time
                    </div>
                  </button>
                )}

                {/* Option 2: Returning to Office */}
                <button
                  id="btn-returning-to-office-unresolved"
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

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleDismiss}
                    className="text-xs text-purple-300 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    Decide later (keep session open)
                  </button>
                </div>
              </div>
            )}

            <p className="text-[11px] text-center text-purple-400/80 pt-1">
              {hasRecordedExit 
                ? 'Please choose an action. This prompt will remain until resolved.' 
                : 'Your attendance remains open until confirmed, returned, or settled at 11:59 PM.'}
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
