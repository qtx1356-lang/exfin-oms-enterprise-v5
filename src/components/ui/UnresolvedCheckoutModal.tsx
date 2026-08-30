import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { AlertCircle, Clock, Check } from 'lucide-react';
import { AttendanceRecord } from '../../types/attendance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  record: AttendanceRecord;
  onSubmit: (time: string) => void;
  isSubmitting?: boolean;
}

export const UnresolvedCheckoutModal: React.FC<Props> = ({ isOpen, onClose, record, onSubmit, isSubmitting }) => {
  const [time, setTime] = useState('18:00');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    
    // Validation
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    const selectedDate = new Date(record.date);
    selectedDate.setHours(h, m, 0, 0);

    const nowOnSelectedDate = new Date(record.date);
    nowOnSelectedDate.setHours(now.getHours(), now.getMinutes(), 0, 0);

    if (record.date === now.toISOString().split('T')[0]) {
       if (selectedDate > now) {
         setError('Checkout time cannot be in the future.');
         return;
       }
    }

    if (record.checkInTime) {
      const match = record.checkInTime.match(/(\d+):(\d+)(?:\s*(AM|PM))?/i);
      if (match) {
        let inH = parseInt(match[1], 10);
        const inM = parseInt(match[2], 10);
        const ampm = match[3];
        if (ampm) {
          if (ampm.toUpperCase() === 'PM' && inH < 12) inH += 12;
          if (ampm.toUpperCase() === 'AM' && inH === 12) inH = 0;
        }
        const checkInDate = new Date(record.date);
        checkInDate.setHours(inH, inM, 0, 0);

        if (selectedDate <= checkInDate) {
          setError('Checkout time must be after check-in time.');
          return;
        }
      }
    }

    let ampm = 'AM';
    let formattedH = h;
    if (h >= 12) {
      ampm = 'PM';
      if (h > 12) formattedH = h - 12;
    }
    if (formattedH === 0) formattedH = 12;
    const formattedTime = `${String(formattedH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;

    onSubmit(formattedTime);
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Checkout Pending" hideDefaultFooter>
      <div className="space-y-4 text-[var(--text-primary)]">
        <p className="text-sm text-[var(--text-secondary)]">
          No checkout was recorded for today's Office attendance and no office exit was detected.
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Enter the time you actually checked out. This will be recorded as an employee-reported checkout and will remain unresolved for verification.
        </p>

        {error && (
          <div className="text-xs text-[var(--danger)] font-bold flex items-center gap-1.5 p-2.5 bg-[var(--danger)]/10 rounded-xl border border-[var(--danger)]/30">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">Checkout Time</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--primary-light)]" />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[var(--app-background)] border border-[var(--border)] text-[var(--text-primary)] rounded-xl focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outlined" onClick={onClose} className="border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--app-background-secondary)] cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} variant="filled" className="btn-primary text-white font-bold flex items-center gap-1 cursor-pointer">
            <Check className="w-4 h-4" />
            {isSubmitting ? 'Submitting...' : 'Enter Checkout Time'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
