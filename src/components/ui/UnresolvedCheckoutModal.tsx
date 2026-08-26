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
      <div className="space-y-4 text-[#F4FAF7]">
        <p className="text-sm text-[#C7DAD3]">
          No checkout was recorded for today's Office attendance and no office exit was detected.
        </p>
        <p className="text-sm text-[#C7DAD3]">
          Enter the time you actually checked out. This will be recorded as an employee-reported checkout and will remain unresolved for verification.
        </p>

        {error && (
          <div className="text-xs text-[#EF6B73] font-bold flex items-center gap-1.5 p-2 bg-[#EF6B73]/10 rounded-lg border border-[#EF6B73]/30">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-[#C7DAD3] mb-1">Checkout Time</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#19C7C0]" />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-[#112C26] border border-[#2A5B50] text-[#F4FAF7] rounded-xl focus:outline-none focus:border-[#19C7C0] transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="border-[#2A5B50] text-[#C7DAD3] hover:bg-[#21483E] cursor-pointer">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-[#19C7C0] text-[#112C26] hover:bg-[#19C7C0]/90 font-bold flex items-center gap-1 cursor-pointer">
            <Check className="w-4 h-4" />
            {isSubmitting ? 'Submitting...' : 'Enter Checkout Time'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
