import { AttendanceRecord, CheckInMode, CheckOutMode } from '../../types/attendance';
import {
  getTodayAttendanceRecord,
  saveAttendanceRecord,
  getStoredAttendanceRecords
} from './attendanceStorage';
import { syncPendingAttendanceRecords } from './syncEngine';

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

  const now = new Date();
  const record: AttendanceRecord = {
    id: generateUUID(),
    docId,
    employeeId,
    employeeName: employeeName || 'Employee',
    date: todayStr,
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

  if (distance > OFFICE_LOCATION.radius) {
    throw new Error(
      `Check-Out is allowed ONLY inside the ${OFFICE_LOCATION.radius} meter office geofence. Current distance: ${distance.toFixed(1)}m`
    );
  }

  const now = new Date();
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
  if (!record || record.checkOutTime) {
    return record; // Completed session or no check-in
  }

  let modified = false;
  const now = new Date();
  const updatedRecord = { ...record };

  // Employee exited geofence (> 25m) after check-in
  if (currentDistance > OFFICE_LOCATION.radius && !updatedRecord.exitTime) {
    updatedRecord.exitTime = getFormattedTimeStr(now);
    updatedRecord.syncStatus = 'Pending';
    modified = true;
    console.log(`Smart Office Exit Logged: Exit Time ${updatedRecord.exitTime}`);
  }

  // Employee returned to geofence (<= 25m) after exiting
  if (currentDistance <= OFFICE_LOCATION.radius && updatedRecord.exitTime && !updatedRecord.returnTime) {
    updatedRecord.returnTime = getFormattedTimeStr(now);
    updatedRecord.syncStatus = 'Pending';
    modified = true;
    console.log(`Smart Office Exit Logged: Return Time ${updatedRecord.returnTime}`);
  }

  if (modified) {
    saveAttendanceRecord(updatedRecord);
  }

  return updatedRecord;
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

  // Check if time is 23:59 (11:59 PM) or later
  const is1159PMOrLater = hours === 23 && minutes >= 59;

  let isOutsideGeofence = false;
  if (currentCoords) {
    const dist = getDistanceFromLatLonInM(
      currentCoords.latitude,
      currentCoords.longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );
    isOutsideGeofence = dist > OFFICE_LOCATION.radius; // > 25m
  } else {
    isOutsideGeofence = record.distance > OFFICE_LOCATION.radius;
  }

  if (is1159PMOrLater && isOutsideGeofence) {
    const checkOutTimeStr = '06:00 PM'; // Office Closing Time
    const workingHours = calculateWorkingHours(record.checkInTime, checkOutTimeStr);

    const updatedRecord: AttendanceRecord = {
      ...record,
      checkOutTime: checkOutTimeStr,
      checkOutMode: 'AUTO_SYSTEM',
      reason: 'Forgot Checkout',
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
    const elapsedSlots = Math.floor(minutesSinceClosing / 15) + 1;

    // Update reminder count if changed
    if (elapsedSlots > record.reminderCount) {
      record.reminderCount = elapsedSlots;
      saveAttendanceRecord(record);
    }

    const remainder = minutesSinceClosing % 15;
    const nextSlotMinutes = currentMinutes + (15 - remainder);
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
