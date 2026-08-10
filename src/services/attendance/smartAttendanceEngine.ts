import { AttendanceRecord, CheckInMode, CheckOutMode, SyncStatus } from '../../types/attendance';
import {
  getTodayAttendanceRecord,
  saveAttendanceRecord,
  getStoredAttendanceRecords
} from './attendanceStorage';
import { syncPendingAttendanceRecords } from './syncEngine';
import { createNotification } from '../notification/notificationService';

export const OFFICE_LOCATION = {
  name: 'EXFIN OFFICE',
  latitude: 23.616227,
  longitude: 87.117063,
  radius: 25, // meters
  autoCheckoutDistanceThreshold: 25 // 25 meters office geofence
};

export function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Radius of Earth in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
};

export const getFormattedTimeStr = (date: Date = new Date()): string => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

export const getFormattedDateStr = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculates working hours string e.g. "8h 30m"
 */
export const calculateWorkingHours = (checkInTimeStr: string, checkOutTimeStr: string | null): string | null => {
  if (!checkInTimeStr || !checkOutTimeStr) return null;

  try {
    const parseTime = (timeStr: string): Date => {
      const d = new Date();
      const [time, modifier] = timeStr.trim().split(' ');
      let [hours, minutes] = time.split(':').map(Number);
      if (modifier === 'PM' && hours < 12) hours += 12;
      if (modifier === 'AM' && hours === 12) hours = 0;
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    const inTime = parseTime(checkInTimeStr);
    const outTime = parseTime(checkOutTimeStr);

    let diffMs = outTime.getTime() - inTime.getTime();
    if (diffMs < 0) {
      // Overnight adjustment if applicable
      diffMs += 24 * 60 * 60 * 1000;
    }

    const totalMins = Math.floor(diffMs / (1000 * 60));
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;

    return `${h}h ${m}m`;
  } catch (err) {
    console.warn('Error calculating working hours:', err);
    return null;
  }
};

/**
 * Performs Check-In (either AUTO or MANUAL)
 * Enforces Daily Attendance Lock: Only ONE session per day per employee.
 */
export const performCheckIn = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number },
  townCity: string,
  mode: CheckInMode
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
  const docId = `${employeeId}_${todayStr}`;

  // Daily Attendance Lock check
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    console.log('Daily Attendance Lock active: Existing session found for today.');
    return existingRecord;
  }

  const distance = getDistanceFromLatLonInM(
    coords.latitude,
    coords.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  if (distance > 25) {
    throw new Error(`Attendance check-in is allowed only within 25 meters of the office.`);
  }

  const now = new Date();
  const record: AttendanceRecord = {
    id: generateUUID(),
    docId,
    employeeId,
    employeeName: employeeName || 'Employee',
    date: todayStr,
    attendanceType: 'OFFICE',
    checkInTime: getFormattedTimeStr(now),
    checkOutTime: null,
    workingHours: null,
    latitude: coords.latitude,
    longitude: coords.longitude,
    distance,
    townCity: townCity || 'Raniganj HQ',
    checkInMode: mode,
    checkOutMode: 'N/A',
    exitTime: null,
    returnTime: null,
    reason: null,
    createdAtDeviceTime: now.toISOString(),
    syncStatus: 'Pending',
    serverSyncTime: null,
    isOffline: !navigator.onLine,
    reminderCount: 0
  };

  saveAttendanceRecord(record);

  // Send local check-in system notification
  createNotification({
    recipientEmployeeCode: employeeId,
    type: 'ATTENDANCE_CHECK_IN',
    category: 'ATTENDANCE',
    priority: 'LOW',
    title: 'Attendance Check-In Logged',
    message: `You successfully checked-in at ${record.checkInTime} (${mode} mode) at ${townCity}.`,
    entityId: record.id,
    entityType: 'ATTENDANCE',
  }).catch((err) => console.warn('Failed to dispatch check-in notification:', err));

  if (navigator.onLine) {
    syncPendingAttendanceRecords().catch((err) =>
      console.warn('Background sync on check-in failed:', err)
    );
  }

  return record;
};

/**
 * Performs Manual Check-Out
 */
export const performCheckOut = (
  record: AttendanceRecord,
  coords: { latitude: number; longitude: number },
  townCity: string
): AttendanceRecord => {
  const distance = getDistanceFromLatLonInM(
    coords.latitude,
    coords.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  const now = new Date();
  
  if (now.getHours() >= 18) {
    if (distance > 500) {
      throw new Error(`Cannot manually checkout. You left the office beyond 500m after 6 PM. Auto-checkout at 6 PM will apply.`);
    }
  } else {
    // Wait, what is the rule for before 6 PM?
    // "Before 6:00 PM Manual Office checkout is allowed according to the existing attendance flow."
    // Does it still need the 25m check? If so, I should put it here.
    // I'll assume they need to be in the office (or not?), the existing code had:
    // if (distance > OFFICE_LOCATION.radius) { throw ... }
    // Wait, the prompt says "Do not apply the 25-meter check-in geofence to this 500-meter checkout rule."
    // I'll just leave the 25m check for < 6PM? No, the prompt says "The employee can manually check out before 6 PM." I will leave the 25m rule for before 6PM because it was there in the "existing attendance flow".
    if (distance > OFFICE_LOCATION.radius) {
      throw new Error(
        `Check-Out is allowed ONLY inside the ${OFFICE_LOCATION.radius} meter office geofence. Current distance: ${distance.toFixed(1)}m`
      );
    }
  }

  const checkOutTimeStr = getFormattedTimeStr(now);
  const workingHours = calculateWorkingHours(record.checkInTime, checkOutTimeStr);

  const updatedRecord: AttendanceRecord = {
    ...record,
    checkOutTime: checkOutTimeStr,
    checkOutMode: 'MANUAL',
    workingHours,
    latitude: coords.latitude,
    longitude: coords.longitude,
    distance,
    townCity: townCity || record.townCity,
    syncStatus: 'Pending',
    isOffline: !navigator.onLine
  };

  saveAttendanceRecord(updatedRecord);

  // Send local check-out system notification
  createNotification({
    recipientEmployeeCode: record.employeeId,
    type: 'ATTENDANCE_CHECK_OUT',
    category: 'ATTENDANCE',
    priority: 'LOW',
    title: 'Attendance Check-Out Logged',
    message: `You successfully checked-out at ${updatedRecord.checkOutTime}. Total working hours logged: ${workingHours}.`,
    entityId: record.id,
    entityType: 'ATTENDANCE',
  }).catch((err) => console.warn('Failed to dispatch check-out notification:', err));

  if (navigator.onLine) {
    syncPendingAttendanceRecords().catch((err) =>
      console.warn('Background sync on check-out failed:', err)
    );
  }

  return updatedRecord;
};

/**
 * Smart Office Exit Log: Tracks Exit and Return times after Check-In without affecting attendance status.
 */
export const trackSmartOfficeExit = (
  record: AttendanceRecord,
  currentDistance: number
): AttendanceRecord => {
  if (!record || record.checkOutTime || record.manualRectified || record.checkoutConfirmed) {
    return record; // Completed session, manually rectified, or already checkout confirmed
  }

  let modified = false;
  const now = new Date();
  const updatedRecord = { ...record };

  // Employee exited geofence (> 25m) after check-in
  if (currentDistance > OFFICE_LOCATION.radius) {
    const exitTimeStr = getFormattedTimeStr(now);
    updatedRecord.lastExitTime = exitTimeStr;
    if (!updatedRecord.exitTime) {
      updatedRecord.exitTime = exitTimeStr;
    }
    
    // Only set pending if not dismissed
    if (!updatedRecord.checkoutDismissed) {
      updatedRecord.pendingCheckoutConfirmation = true;
    }
    updatedRecord.syncStatus = 'Pending';
    modified = true;
    console.log(`Smart Office Exit Logged: Last Exit Time ${exitTimeStr}`);
  }

  // Employee returned to geofence (<= 25m) after exiting
  if (currentDistance <= OFFICE_LOCATION.radius) {
    if (updatedRecord.pendingCheckoutConfirmation || updatedRecord.checkoutDismissed) {
      updatedRecord.pendingCheckoutConfirmation = false;
      updatedRecord.checkoutDismissed = false; // Reset dismissed flag
      updatedRecord.returnTime = getFormattedTimeStr(now);
      updatedRecord.syncStatus = 'Pending';
      modified = true;
      console.log(`Smart Office Return Logged: Pending checkout prompt cleared at ${updatedRecord.returnTime}`);
    }
  }

  if (modified) {
    saveAttendanceRecord(updatedRecord);
  }

  return updatedRecord;
};

/**
 * End-of-day attendance checkout finalizer (WFH/Client Visit -> 6:00 PM, Office -> last exit or 6:00 PM)
 */
export const runAutoCheckoutFinalizer = (): void => {
  const records = getStoredAttendanceRecords();
  const todayStr = getFormattedDateStr();
  const now = new Date();
  const hours = now.getHours();
  const isAfter6PM = hours >= 18;

  let modified = false;
  const newRecords = records.map((rec) => {
    if (rec.checkOutTime || rec.manualRectified) {
      return rec;
    }

    // Only finalize today's or past unfinalized records if after 6 PM or end of day
    // For WFH and Client Visit, they do not require manual checkout and finalize to 6:00 PM
    if (rec.attendanceType === 'WFH' || rec.attendanceType === 'CLIENT_VISIT') {
      const checkOutTimeStr = '06:00 PM';
      const workingHours = calculateWorkingHours(rec.checkInTime, checkOutTimeStr);
      modified = true;
      return {
        ...rec,
        checkOutTime: checkOutTimeStr,
        checkOutMode: 'AUTO_SYSTEM' as CheckOutMode,
        checkoutSource: rec.attendanceType === 'WFH' ? 'automatic_wfh_end_of_day' : 'automatic_client_visit_end_of_day',
        checkoutFinalized: true,
        checkoutFinalizedAt: now.toISOString(),
        workingHours,
        syncStatus: 'Pending' as SyncStatus
      };
    }

    // Office:
    if (rec.attendanceType === 'OFFICE' || !rec.attendanceType) {
      // If after 6 PM or if it's a past date
      if (isAfter6PM || rec.date < todayStr) {
        let checkoutTime = '06:00 PM';
        let source = 'automatic_end_of_day';
        if (rec.lastExitTime || rec.exitTime) {
          checkoutTime = rec.lastExitTime || rec.exitTime!;
          source = 'automatic_end_of_day_exit';
        }
        const workingHours = calculateWorkingHours(rec.checkInTime, checkoutTime);
        modified = true;
        return {
          ...rec,
          checkOutTime: checkoutTime,
          checkOutMode: 'AUTO_SYSTEM' as CheckOutMode,
          checkoutSource: source,
          checkoutFinalized: true,
          checkoutFinalizedAt: now.toISOString(),
          workingHours,
          syncStatus: 'Pending' as SyncStatus
        };
      }
    }

    return rec;
  });

  if (modified) {
    localStorage.setItem('exfin_attendance_records_v1', JSON.stringify(newRecords));
  }
};

/**
 * Checks and triggers Auto System Checkout at 11:59 PM if employee forgot checkout & is > 25m away
 */
export const checkAndTriggerAutoCheckout = (
  employeeId: string,
  currentCoords?: { latitude: number; longitude: number }
): AttendanceRecord | null => {
  const todayStr = getFormattedDateStr();
  const record = getTodayAttendanceRecord(employeeId, todayStr);

  if (!record || record.checkOutTime) {
    return null; // No check-in today or already checked out
  }

  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  // Check if time is 18:00 (6:00 PM) or later
  const isAfter6PM = hours >= 18;

  // Check if time is 23:59 (11:59 PM) or later
  const is1159PMOrLater = hours === 23 && minutes >= 59;

  let isOutside500m = false;
  if (currentCoords) {
    const dist = getDistanceFromLatLonInM(
      currentCoords.latitude,
      currentCoords.longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );
    isOutside500m = dist > 500;
  } else {
    isOutside500m = record.distance > 500;
  }

  let triggerAutoCheckout = false;
  let reason = '';

  if (isAfter6PM && isOutside500m) {
    triggerAutoCheckout = true;
    reason = 'Left Office Beyond 500m After 6 PM';
  } else if (is1159PMOrLater) {
    triggerAutoCheckout = true;
    reason = 'Forgot Checkout';
  }

  if (triggerAutoCheckout) {
    const checkOutTimeStr = '06:00 PM'; // Office Closing Time
    const workingHours = calculateWorkingHours(record.checkInTime, checkOutTimeStr);

    const updatedRecord: AttendanceRecord = {
      ...record,
      checkOutTime: checkOutTimeStr,
      checkOutMode: 'AUTO_SYSTEM',
      reason,
      workingHours,
      syncStatus: 'Pending',
      isOffline: !navigator.onLine
    };

    saveAttendanceRecord(updatedRecord);

    if (navigator.onLine) {
      syncPendingAttendanceRecords().catch((err) =>
        console.warn('Background sync on auto-checkout failed:', err)
      );
    }

    return updatedRecord;
  }

  return null;
};

/**
 * Evaluates smart reminder engine status starting at 06:00 PM every 15 mins
 */
export const getCheckoutReminderStatus = (
  record: AttendanceRecord | null
): { isReminderActive: boolean; nextReminderTimeStr: string | null; currentReminderCount: number } => {
  if (!record || record.checkOutTime) {
    return { isReminderActive: false, nextReminderTimeStr: null, currentReminderCount: record?.reminderCount || 0 };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const closingMinutes = 18 * 60; // 06:00 PM = 1080 min
  const endOfDayMinutes = 23 * 60 + 59; // 11:59 PM

  if (currentMinutes >= closingMinutes && currentMinutes <= endOfDayMinutes) {
    const minutesSinceClosing = currentMinutes - closingMinutes;
    const elapsedSlots = Math.floor(minutesSinceClosing / 10) + 1;

    // Update reminder count if changed
    if (elapsedSlots > record.reminderCount) {
      record.reminderCount = elapsedSlots;
      saveAttendanceRecord(record);
    }

    const remainder = minutesSinceClosing % 10;
    const nextSlotMinutes = currentMinutes + (10 - remainder);
    const nextHours = Math.floor(nextSlotMinutes / 60);
    const nextMins = nextSlotMinutes % 60;

    const nextDate = new Date();
    nextDate.setHours(nextHours, nextMins, 0, 0);

    return {
      isReminderActive: true,
      nextReminderTimeStr: getFormattedTimeStr(nextDate),
      currentReminderCount: record.reminderCount
    };
  }

  return { isReminderActive: false, nextReminderTimeStr: null, currentReminderCount: record.reminderCount };
};

/**
 * Calculates current month WFH count for an employee
 */
export const getMonthlyWfhCount = (employeeId: string, dateStr: string = getFormattedDateStr()): number => {
  const currentMonth = dateStr.substring(0, 7); // "YYYY-MM"
  const records = getStoredAttendanceRecords();
  return records.filter(
    (r) => r.employeeId === employeeId && 
           r.date.startsWith(currentMonth) && 
           (r.attendanceType === 'WFH')
  ).length;
};

/**
 * Performs Work From Home (WFH) Attendance Submission
 */
export const performWFHAttendance = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number } | null,
  townCity: string,
  wfhReason: string,
  workPlan: string
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
  const docId = `${employeeId}_${todayStr}`;

  // Daily Attendance Lock check
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    throw new Error('Attendance session already logged for today.');
  }

  // Monthly WFH limit check (max 2 per calendar month)
  const currentMonthCount = getMonthlyWfhCount(employeeId, todayStr);
  if (currentMonthCount >= 2) {
    throw new Error('Monthly WFH limit exceeded.');
  }

  const now = new Date();
  const record: AttendanceRecord = {
    id: generateUUID(),
    docId,
    employeeId,
    employeeName: employeeName || 'Employee',
    date: todayStr,
    attendanceType: 'WFH',
    checkInTime: getFormattedTimeStr(now),
    checkOutTime: null,
    workingHours: null,
    latitude: coords?.latitude || 0,
    longitude: coords?.longitude || 0,
    distance: 0,
    townCity: townCity || 'Home',
    checkInMode: 'MANUAL',
    checkOutMode: 'N/A',
    exitTime: null,
    returnTime: null,
    reason: null,
    createdAtDeviceTime: now.toISOString(),
    syncStatus: 'Pending',
    serverSyncTime: null,
    isOffline: !navigator.onLine,
    reminderCount: 0,
    wfhReason,
    workPlan,
    monthlyWfhCount: currentMonthCount + 1
  };

  saveAttendanceRecord(record);

  // Send local WFH check-in system notification
  createNotification({
    recipientEmployeeCode: employeeId,
    type: 'ATTENDANCE_CHECK_IN',
    category: 'ATTENDANCE',
    priority: 'LOW',
    title: 'WFH Attendance Logged',
    message: `You successfully submitted WFH attendance for today at ${record.checkInTime}.`,
    entityId: record.id,
    entityType: 'ATTENDANCE',
  }).catch((err) => console.warn('Failed to dispatch WFH notification:', err));

  if (navigator.onLine) {
    syncPendingAttendanceRecords().catch((err) =>
      console.warn('Background sync on WFH submission failed:', err)
    );
  }

  return record;
};

/**
 * Performs Client Visit Attendance Submission
 */
export const performClientVisitAttendance = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number } | null,
  townCity: string,
  clientName: string,
  clientLocation: string,
  purpose: string
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
  const docId = `${employeeId}_${todayStr}`;

  // Daily Attendance Lock check
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    throw new Error('Attendance session already logged for today.');
  }

  const now = new Date();
  const record: AttendanceRecord = {
    id: generateUUID(),
    docId,
    employeeId,
    employeeName: employeeName || 'Employee',
    date: todayStr,
    attendanceType: 'CLIENT_VISIT',
    checkInTime: getFormattedTimeStr(now),
    checkOutTime: null,
    workingHours: null,
    latitude: coords?.latitude || 0,
    longitude: coords?.longitude || 0,
    distance: 0,
    townCity: townCity || clientLocation || 'On Site',
    checkInMode: 'MANUAL',
    checkOutMode: 'N/A',
    exitTime: null,
    returnTime: null,
    reason: null,
    createdAtDeviceTime: now.toISOString(),
    syncStatus: 'Pending',
    serverSyncTime: null,
    isOffline: !navigator.onLine,
    reminderCount: 0,
    clientName,
    clientLocation,
    purpose
  };

  saveAttendanceRecord(record);

  // Send local Client Visit system notification
  createNotification({
    recipientEmployeeCode: employeeId,
    type: 'ATTENDANCE_CHECK_IN',
    category: 'ATTENDANCE',
    priority: 'LOW',
    title: 'Client Visit Logged',
    message: `Client visit attendance submitted at ${record.checkInTime} for client: ${clientName}.`,
    entityId: record.id,
    entityType: 'ATTENDANCE',
  }).catch((err) => console.warn('Failed to dispatch client visit notification:', err));

  if (navigator.onLine) {
    syncPendingAttendanceRecords().catch((err) =>
      console.warn('Background sync on Client Visit submission failed:', err)
    );
  }

  return record;
};

/**
 * Performs Outdoor Work Attendance Submission
 */
export const performOutdoorAttendance = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number } | null,
  townCity: string,
  outdoorType: string,
  description: string
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
  const docId = `${employeeId}_${todayStr}`;

  // Daily Attendance Lock check
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    throw new Error('Attendance session already logged for today.');
  }

  const now = new Date();
  const record: AttendanceRecord = {
    id: generateUUID(),
    docId,
    employeeId,
    employeeName: employeeName || 'Employee',
    date: todayStr,
    attendanceType: 'OUTDOOR',
    checkInTime: getFormattedTimeStr(now),
    checkOutTime: null,
    workingHours: null,
    latitude: coords?.latitude || 0,
    longitude: coords?.longitude || 0,
    distance: 0,
    townCity: townCity || 'Field',
    checkInMode: 'MANUAL',
    checkOutMode: 'N/A',
    exitTime: null,
    returnTime: null,
    reason: null,
    createdAtDeviceTime: now.toISOString(),
    syncStatus: 'Pending',
    serverSyncTime: null,
    isOffline: !navigator.onLine,
    reminderCount: 0,
    outdoorType,
    description
  };

  saveAttendanceRecord(record);

  // Send local Outdoor system notification
  createNotification({
    recipientEmployeeCode: employeeId,
    type: 'ATTENDANCE_CHECK_IN',
    category: 'ATTENDANCE',
    priority: 'LOW',
    title: 'Outdoor Work Logged',
    message: `Outdoor work attendance (${outdoorType}) submitted at ${record.checkInTime}.`,
    entityId: record.id,
    entityType: 'ATTENDANCE',
  }).catch((err) => console.warn('Failed to dispatch outdoor work notification:', err));

  if (navigator.onLine) {
    syncPendingAttendanceRecords().catch((err) =>
      console.warn('Background sync on Outdoor Work submission failed:', err)
    );
  }

  return record;
};

