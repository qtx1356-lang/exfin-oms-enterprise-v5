import { 
  AttendanceRecord, 
  CheckInMode, 
  CheckOutMode, 
  SyncStatus, 
  AttendanceState, 
  AttendanceEventType,
  AttendanceType
} from '../../types/attendance';
import { AutomaticAttendanceEngine } from './automaticAttendanceEngine';
import {
  getTodayAttendanceRecord,
  saveAttendanceRecord,
  getStoredAttendanceRecords
} from './attendanceStorage';
import { 
  enqueueAttendanceEvent, 
  generateIdempotentEventId, 
  getProcessedEventIds, 
  markEventIdProcessed 
} from './attendanceEventQueue';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';
import { createNotification } from '../notification/notificationService';

export const OFFICE_LOCATION = {
  name: 'EXFIN OFFICE',
  latitude: 23.616227,
  longitude: 87.117063,
  radius: 25, // 25 meters office geofence
  autoCheckoutDistanceThreshold: 25
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
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
};

export const getFormattedDateStr = (date: Date = new Date()): string => {
  try {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

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
 * State Machine Processor for Automatic & Manual Attendance Events
 */
export const processAttendanceStateTransition = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number },
  townCity: string,
  eventType: AttendanceEventType,
  source: 'AUTO_GEOFENCE' | 'MANUAL' | 'AUTO_SYSTEM_END_OF_DAY' = 'AUTO_GEOFENCE',
  eventTimestamp: Date = new Date(),
  attendanceMode: AttendanceType = 'OFFICE'
): AttendanceRecord => {
  return AutomaticAttendanceEngine.transitionState(
    employeeId,
    employeeName,
    coords,
    townCity,
    eventType,
    source,
    eventTimestamp,
    attendanceMode
  );
};

/**
 * Standard Manual or Auto Check-In Handler
 */
export const performCheckIn = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number },
  townCity: string,
  mode: CheckInMode
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
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

  if (distance > OFFICE_LOCATION.radius) {
    throw new Error(`Attendance check-in is allowed only within ${OFFICE_LOCATION.radius} meters of the office.`);
  }

  return AutomaticAttendanceEngine.transitionState(
    employeeId,
    employeeName,
    coords,
    townCity,
    'CHECK_IN',
    mode === 'AUTO' ? 'AUTO_GEOFENCE' : 'MANUAL',
    new Date(),
    'OFFICE'
  );
};

/**
 * Performs Manual Check-Out
 */
export const performCheckOut = (
  record: AttendanceRecord,
  coords: { latitude: number; longitude: number },
  townCity: string
): AttendanceRecord => {
  return AutomaticAttendanceEngine.processManualCheckout(record, coords, townCity);
};

/**
 * Smart Office Exit Log: Tracks Exit and Return times after Check-In without affecting attendance status.
 */
export const trackSmartOfficeExit = (
  record: AttendanceRecord,
  currentDistance: number,
  currentCoords?: { latitude: number; longitude: number },
  currentTownCity?: string
): AttendanceRecord => {
  if (!record || record.checkOutTime || record.manualRectified || record.isAdminRectified || record.correctedAt) {
    return record;
  }

  const coords = currentCoords || { latitude: record.latitude, longitude: record.longitude };
  const town = currentTownCity || record.townCity;

  const result = AutomaticAttendanceEngine.processLocationUpdate(
    coords.latitude,
    coords.longitude,
    record.employeeId,
    record.employeeName,
    town,
    new Date()
  );

  return result || record;
};

export const getIndiaTime = (): Date => {
  try {
    const now = new Date();
    const kolkataStr = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    return new Date(kolkataStr);
  } catch {
    return new Date();
  }
};

export const timeStrToMinutes = (timeStr: string): number => {
  try {
    const [time, modifier] = timeStr.trim().split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  } catch {
    return 0;
  }
};



/**
 * End-of-day attendance checkout finalizer (WFH/Client Visit -> 11:59 PM, Office -> last exit or NO checkout if still inside at 6:00 PM IST or later)
 */
export const runAutoCheckoutFinalizer = (): void => {
  const now = getIndiaTime();
  const records = getStoredAttendanceRecords();
  let todayStr = getFormattedDateStr(now);
  try {
    todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  } catch (e) {
    console.warn('Failed to calculate Kolkata date string:', e);
  }
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const is1159PMOrLater = hours === 23 && minutes >= 59;

  logAttendanceEvent('END_OF_DAY_PROCESSING', 'SYSTEM', 'Running end-of-day attendance checkout finalizer...', {
    eventTimestamp: now.toISOString(),
    metadata: {
      hours,
      minutes,
      todayStr
    }
  });

  records.forEach((rec) => {
    if (
      (rec.checkOutTime && rec.checkoutStatus === 'COMPLETED') ||
      rec.checkoutStatus === 'UNRESOLVED' ||
      rec.checkoutStatus === 'PENDING_ADMIN_REVIEW' ||
      rec.manualRectified ||
      rec.isAdminRectified ||
      rec.correctedAt
    ) {
      return;
    }

    const isPastDay = rec.date < todayStr;
    const isToday = rec.date === todayStr;

    if (isPastDay) {
      // Previous days (missed checkouts) - MUST be settled immediately under next-day protection
      AutomaticAttendanceEngine.settleUnresolvedSession(rec.employeeId, rec.date, now);
    } else if (isToday) {
      // Today's record - settled only at the end-of-day settlement deadline (23:59 IST / 11:59 PM)
      if (is1159PMOrLater) {
        AutomaticAttendanceEngine.settleUnresolvedSession(rec.employeeId, rec.date, now);
      }
    }
  });
};

/**
 * Checks and triggers Auto System Checkout at 11:59 PM if employee forgot checkout & is > 25m away with recorded exit
 */
export const checkAndTriggerAutoCheckout = (
  employeeId: string,
  currentCoords?: { latitude: number; longitude: number }
): AttendanceRecord | null => {
  const todayStr = getFormattedDateStr();
  const record = getTodayAttendanceRecord(employeeId, todayStr);

  if (!record || record.checkOutTime) {
    return null;
  }

  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();

  const is1159PMOrLater = hours === 23 && minutes >= 59;

  if (is1159PMOrLater) {
    return AutomaticAttendanceEngine.settleUnresolvedSession(employeeId, todayStr, now);
  }

  return null;
};

export const getCheckoutReminderStatus = (
  record: AttendanceRecord | null
): { isReminderActive: boolean; nextReminderTimeStr: string | null; currentReminderCount: number } => {
  if (!record || record.checkOutTime) {
    return { isReminderActive: false, nextReminderTimeStr: null, currentReminderCount: record?.reminderCount || 0 };
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const closingMinutes = 18 * 60; // 06:00 PM
  const endOfDayMinutes = 23 * 60 + 59; // 11:59 PM

  if (currentMinutes >= closingMinutes && currentMinutes <= endOfDayMinutes) {
    const minutesSinceClosing = currentMinutes - closingMinutes;
    const elapsedSlots = Math.floor(minutesSinceClosing / 10) + 1;

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

export const getMonthlyWfhCount = (employeeId: string, dateStr: string = getFormattedDateStr()): number => {
  const currentMonth = dateStr.substring(0, 7);
  const records = getStoredAttendanceRecords();
  return records.filter(
    (r) => r.employeeId === employeeId && 
           r.date.startsWith(currentMonth) && 
           (r.attendanceType === 'WFH')
  ).length;
};

export const performWFHAttendance = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number } | null,
  townCity: string,
  wfhReason: string,
  workPlan: string
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    throw new Error('Attendance session already logged for today.');
  }

  const currentMonthCount = getMonthlyWfhCount(employeeId, todayStr);
  if (currentMonthCount >= 2) {
    throw new Error('Monthly WFH limit exceeded (max 2 per calendar month).');
  }

  const record = processAttendanceStateTransition(
    employeeId,
    employeeName,
    coords || { latitude: 0, longitude: 0 },
    townCity || 'Home',
    'CHECK_IN',
    'MANUAL',
    new Date(),
    'WFH'
  );

  record.wfhReason = wfhReason;
  record.workPlan = workPlan;
  record.monthlyWfhCount = currentMonthCount + 1;
  saveAttendanceRecord(record);

  return record;
};

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
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    throw new Error('Attendance session already logged for today.');
  }

  const record = processAttendanceStateTransition(
    employeeId,
    employeeName,
    coords || { latitude: 0, longitude: 0 },
    townCity || clientLocation || 'On Site',
    'CHECK_IN',
    'MANUAL',
    new Date(),
    'CLIENT_VISIT'
  );

  record.clientName = clientName;
  record.clientLocation = clientLocation;
  record.purpose = purpose;
  saveAttendanceRecord(record);

  return record;
};

export const performOutdoorAttendance = (
  employeeId: string,
  employeeName: string,
  coords: { latitude: number; longitude: number } | null,
  townCity: string,
  outdoorType: string,
  description: string
): AttendanceRecord => {
  const todayStr = getFormattedDateStr();
  const existingRecord = getTodayAttendanceRecord(employeeId, todayStr);
  if (existingRecord) {
    throw new Error('Attendance session already logged for today.');
  }

  const record = processAttendanceStateTransition(
    employeeId,
    employeeName,
    coords || { latitude: 0, longitude: 0 },
    townCity || 'Field',
    'CHECK_IN',
    'MANUAL',
    new Date(),
    'OUTDOOR'
  );

  record.outdoorType = outdoorType;
  record.description = description;
  saveAttendanceRecord(record);

  return record;
};
