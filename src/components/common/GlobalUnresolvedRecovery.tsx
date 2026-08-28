import React, { useEffect, useState, useMemo } from 'react';
import { getStoredAttendanceRecords, saveAttendanceRecord } from '../../services/attendance/attendanceStorage';
import { AttendanceRecord } from '../../types/attendance';
import { getFormattedDateStr } from '../../services/attendance/smartAttendanceEngine';
import { useRegistration } from '../../context/RegistrationContext';
import { syncPendingAttendanceRecords } from '../../services/attendance/syncEngine';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { AlertCircle, Clock, Check } from 'lucide-react';

export const GlobalUnresolvedRecovery: React.FC = () => {
  const { employeeData } = useRegistration();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [time, setTime] = useState('18:00');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const todayStr = getFormattedDateStr();

  // Polling to keep records up to date (or we can just listen to focus events)
  useEffect(() => {
    const fetchRecords = () => {
      if (employeeData) {
        setRecords(getStoredAttendanceRecords());
      }
    };
    fetchRecords();
    
    const interval = setInterval(fetchRecords, 5000);
    window.addEventListener('focus', fetchRecords);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', fetchRecords);
    };
  }, [employeeData]);

  // Find oldest unresolved record
  const unresolvedRecord = useMemo(() => {
    if (!employeeData || !records.length) return null;
    const empId = employeeData.employeeCode || employeeData.id;
    
    const pastRecords = records
      .filter((r) => {
        const rEmp = r.employeeId || r.employeeCode;
        if (rEmp !== empId) return false;
        if (r.date >= todayStr) return false;
        
        // Target specifically: attendance is applicable Office attendance AND date is previous day AND attendanceStatus/checkoutStatus = UNRESOLVED AND checkoutTime = EMPTY AND not already EMPLOYEE_REPORTED
        const isOffice = r.attendanceType === 'OFFICE' || !r.attendanceType;
        const isUnresolved = r.attendanceStatus === 'UNRESOLVED' || r.checkoutStatus === 'UNRESOLVED';
        const hasCheckIn = !!(r.checkInTime && r.checkInTime !== '--:--');
        
        const checkOutVal = (r.checkOutTime || '').trim();
        const isCheckoutEmpty = !checkOutVal || 
                                checkOutVal === '--:--' || 
                                checkOutVal === '--:-- --' ||
                                checkOutVal === 'Pending' ||
                                checkOutVal === 'N/A' ||
                                checkOutVal === 'UNRESOLVED';

        const notReported = r.checkoutSource !== 'EMPLOYEE_REPORTED';
        
        return isOffice && isUnresolved && hasCheckIn && isCheckoutEmpty && notReported;
      })
      .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first
      
    return pastRecords.length > 0 ? pastRecords[0] : null;
  }, [records, employeeData, todayStr]);

  // When unresolvedRecord changes, we should show the modal if it's not currently open
  useEffect(() => {
    if (unresolvedRecord && !isOpen) {
      setIsOpen(true);
    }
  }, [unresolvedRecord]);

  if (!unresolvedRecord) return null;

  const handleSubmit = async () => {
    setError(null);
    
    // Validation
    const [h, m] = time.split(':').map(Number);
    const [y, mo, d] = unresolvedRecord.date.split('-').map(Number);
    const selectedDate = new Date(y, mo - 1, d);
    selectedDate.setHours(h, m, 0, 0);
    
    // Time must be after check-in
    if (unresolvedRecord.checkInTime) {
      const match = unresolvedRecord.checkInTime.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
      if (match) {
        let inH = parseInt(match[1], 10);
        const inM = parseInt(match[2], 10);
        const ampm = match[3];
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && inH < 12) inH += 12;
          if (ampm.toUpperCase() === 'AM' && inH === 12) inH = 0;
        }
        const checkInDate = new Date(y, mo - 1, d);
        checkInDate.setHours(inH, inM, 0, 0);
        if (selectedDate <= checkInDate) {
          setError('Checkout time must be after your check-in time.');
          return;
        }
      }
    }
    
    // Time cannot be in the future relative to current time if we were editing today, 
    // but this is a past date so any time up to 11:59 PM is theoretically valid.
    // However, if the user enters a time that is "future" on the past date? 
    // A past date is always entirely in the past compared to today.
    // The prompt says: "not be a future time relative to the current date/time when interpreted as a previous-day checkout"
    // Since it's a previous day, any time 00:00 - 23:59 is allowed.
    const now = new Date();
    if (selectedDate > now) {
      setError('Checkout time cannot be in the future.');
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

    setIsSubmitting(true);
    try {
      const updatedRecord: AttendanceRecord = {
        ...unresolvedRecord,
        checkOutTime: formattedTime,
        employeeProposedCheckoutTime: formattedTime,
        checkoutSource: 'EMPLOYEE_REPORTED',
        checkoutStatus: 'UNRESOLVED',
        attendanceStatus: 'UNRESOLVED',
        checkoutFinalizationSource: 'NONE',
        exitDetectionSource: 'NONE',
        checkoutFinalized: false,
        checkoutConfirmed: false,
        status: 'UNRESOLVED',
        syncStatus: 'Pending',
        updatedAt: new Date().toISOString(),
        version: (unresolvedRecord.version || 1) + 1,
      };

      saveAttendanceRecord(updatedRecord);
      
      // Update local state to immediately hide this record
      setRecords(prev => prev.map(r => r.id === updatedRecord.id ? updatedRecord : r));
      
      if (navigator.onLine) {
        await syncPendingAttendanceRecords();
      }
      
      // Reset form
      setTime('18:00');
      // Dialog will close automatically if no more unresolved records, or stay open with next
    } catch (e) {
      console.error('Failed to submit unresolved checkout', e);
      setError('Failed to save checkout. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog isOpen={isOpen} onClose={() => setIsOpen(false)} title="Previous Day Checkout Pending" hideDefaultFooter>
        <div className="space-y-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
            <p className="text-sm text-rose-200 font-bold mb-1">
              Your checkout for {unresolvedRecord.date} was not recorded.
            </p>
            <p className="text-xs text-rose-200/80">
              No office exit was detected by the app. Please enter the time you actually checked out on {unresolvedRecord.date}.
            </p>
          </div>

          <div className="text-xs text-[#C7C7C7] bg-[#101010] p-3 rounded-xl border border-[#292929]">
            <div className="flex justify-between items-center mb-1">
              <span>Date:</span>
              <span className="font-bold text-white">{unresolvedRecord.date}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Check-in Time:</span>
              <span className="font-bold text-[#D4AF37]">{unresolvedRecord.checkInTime}</span>
            </div>
          </div>

          {error && (
            <div className="text-xs text-rose-400 font-bold flex items-center gap-1.5 p-2 bg-rose-500/10 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#A7B0BE] mb-1">Enter Previous Day Checkout Time</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8B5CF6]" />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#080B0F] border border-[rgba(167,139,250,0.3)] text-[#F8FAFC] rounded-xl focus:outline-none focus:border-[#00F5FF] transition-colors"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>Dismiss for now</Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-[rgba(0,245,255,0.12)] text-[#00F5FF] border border-[rgba(0,245,255,0.55)] hover:bg-[rgba(0,245,255,0.2)] hover:text-[#67F9FF] shadow-[0_0_15px_rgba(0,245,255,0.15)] flex items-center gap-1">
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Submitting...' : 'Enter Checkout Time'}
            </Button>
          </div>
        </div>
      </Dialog>
      
      {/* Persistent Banner if dismissed */}
      {!isOpen && (
        <div className="fixed bottom-20 left-4 right-4 z-40 max-w-3xl mx-auto">
          <div className="bg-rose-500 border border-rose-600 rounded-xl shadow-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-600/50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Action Required</h4>
                <p className="text-rose-100 text-xs">Missing checkout for {unresolvedRecord.date}</p>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(true)}
              className="px-3 py-1.5 bg-white text-rose-600 font-bold text-xs rounded-lg hover:bg-rose-50 transition-colors shadow-sm"
            >
              Resolve Now
            </button>
          </div>
        </div>
      )}
    </>
  );
};
