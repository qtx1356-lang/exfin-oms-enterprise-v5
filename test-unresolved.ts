import { isAttendanceCheckoutUnresolved } from './src/utils/attendanceUtils';

// Mock record for today
let todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const record = {
  date: todayStr,
  checkInTime: '09:00 AM',
  checkOutTime: null,
  checkoutStatus: undefined,
  attendanceType: 'OFFICE'
};

console.log("Record Date:", record.date);
console.log("Today Date:", todayStr);
console.log("Is Unresolved?", isAttendanceCheckoutUnresolved(record as any));

