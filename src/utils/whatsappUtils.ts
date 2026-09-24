import { AttendanceRecord } from '../types/attendance';

/**
 * Free WhatsApp Click-to-Chat. The employee manually selects the recipient in WhatsApp.
 * Under no circumstances does the application use a hard-coded or pre-configured phone number.
 */

/**
 * Checks whether an attendance record is eligible for WhatsApp sharing.
 */
export function canGenerateWhatsAppAttendanceUrl(
  record: AttendanceRecord | null | undefined,
  type: 'CHECK_IN' | 'CHECK_OUT'
): boolean {
  if (!record) return false;

  if (type === 'CHECK_IN') {
    return Boolean(record.checkInTime && record.checkInTime !== '--:--');
  }

  if (type === 'CHECK_OUT') {
    const checkOut = record.checkOutTime;
    if (
      !checkOut ||
      checkOut === '--:--' ||
      checkOut === 'UNRESOLVED' ||
      record.checkoutStatus === 'UNRESOLVED' ||
      record.checkoutStatus === 'PENDING_ADMIN_REVIEW'
    ) {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Generates the WhatsApp Click-to-Chat URL in manual recipient-selection mode:
 * https://wa.me/?text=<encoded-message>
 * 
 * The employee taps the button and manually chooses the recipient (Admin, Team Leader,
 * Manager, colleague, group, etc.) inside WhatsApp.
 * 
 * Returns string URL or null if validation fails.
 */
export const getWhatsAppAttendanceUrl = (
  employeeName: string,
  employeeCode: string,
  record: AttendanceRecord,
  type: 'CHECK_IN' | 'CHECK_OUT'
): string | null => {
  if (!employeeName || !employeeCode || !record) return null;

  const date = record.date;
  const checkIn = record.checkInTime;
  const officeName = record.townCity || record.checkInTownCity || 'EXFIN Office';

  if (type === 'CHECK_IN') {
    if (!checkIn || checkIn === '--:--') return null;

    const message = `🟢 ATTENDANCE CHECK-IN

Employee: ${employeeName}
Code: ${employeeCode}
Date: ${date}
Check-in: ${checkIn}
Office: ${officeName}
Status: PRESENT`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  if (type === 'CHECK_OUT') {
    const checkOut = record.checkOutTime;
    // A checkout WhatsApp message must only be generated when the existing
    // attendance record contains a valid finalized checkout.
    if (
      !checkOut ||
      checkOut === '--:--' ||
      checkOut === 'UNRESOLVED' ||
      record.checkoutStatus === 'UNRESOLVED' ||
      record.checkoutStatus === 'PENDING_ADMIN_REVIEW'
    ) {
      return null;
    }

    const workingTime = record.workingHours || 'N/A';
    const status = record.checkoutStatus === 'COMPLETED' ? 'COMPLETED' : 'PRESENT';

    const message = `🔴 ATTENDANCE CHECK-OUT

Employee: ${employeeName}
Code: ${employeeCode}
Date: ${date}
Check-in: ${checkIn}
Check-out: ${checkOut}
Working Time: ${workingTime}
Office: ${officeName}
Status: ${status}`;

    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  return null;
};
