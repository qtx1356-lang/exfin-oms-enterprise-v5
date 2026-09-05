import { AttendanceRecord } from '../types/attendance';

/**
 * FREE WhatsApp "Tap to Send" Configuration
 * This uses the official wa.me Click-to-Chat mechanism.
 */
// Centralized Admin WhatsApp number in international format (91 for India)
// NO spaces, NO +, NO hyphens.
export const ADMIN_WHATSAPP_NUMBER = "91XXXXXXXXXX"; 

/**
 * Generates the WhatsApp "Tap to Send" URL for attendance notifications
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

    return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  if (type === 'CHECK_OUT') {
    const checkOut = record.checkOutTime;
    // Do NOT show a "Send Check-Out" action when checkout is unresolved.
    // A checkout WhatsApp message must only be generated when the existing
    // attendance record contains a valid finalized checkout.
    if (!checkOut || checkOut === '--:--' || checkOut === 'UNRESOLVED' || record.checkoutStatus === 'UNRESOLVED' || record.checkoutStatus === 'PENDING_ADMIN_REVIEW') {
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

    return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  return null;
};
