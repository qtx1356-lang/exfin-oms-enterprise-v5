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

const env = typeof import.meta !== 'undefined' && import.meta?.env ? import.meta.env : ({} as any);

export const OFFICE_LOCATION = {
  name: env.VITE_OFFICE_NAME || 'Main Office',
  latitude: typeof env.VITE_OFFICE_LATITUDE !== 'undefined' && env.VITE_OFFICE_LATITUDE !== '' && Number(env.VITE_OFFICE_LATITUDE) !== 0 ? Number(env.VITE_OFFICE_LATITUDE) : 23.616227,
  longitude: typeof env.VITE_OFFICE_LONGITUDE !== 'undefined' && env.VITE_OFFICE_LONGITUDE !== '' && Number(env.VITE_OFFICE_LONGITUDE) !== 0 ? Number(env.VITE_OFFICE_LONGITUDE) : 87.117063,
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
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
    throw new Error('Failed to parse parts');
  } catch (e) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
};

/**
 * Internal/helper parser: parseAttendanceTimeToMinutes()
 * Returns minutes from midnight (0 to 1439).
 * 
 * Rules:
 * "10:00 AM" -> 600
 * "6:00 PM" -> 1080
 * "10:00" -> 600
 * "18:00" -> 1080
 * "00:30" -> 30
 * "23:59" -> 1439
 * "12:00 AM" -> 0
 * "12:00 PM" -> 720
 * 
 * Validate:
 * hours: 0–23 for 24-hour format; 1–12 for AM/PM format
 * minutes: 0–59
 * Invalid strings return null.
 * 
 * DO NOT USE new Date() FOR THIS.
 * Do not depend on browser timezone.
 * Do not parse date using UTC.
 * Working hours is a simple same-day attendance calculation using minutes-from-midnight.
 */
export const parseAttendanceTimeToMinutes = (timeStr: string | null | undefined): number | null => {
  if (!timeStr) return null;
  const clean = timeStr.trim();
  if (
    !clean ||
    clean === 'Pending' ||
    clean === 'N/A' ||
    clean === 'UNRESOLVED' ||
    clean === '--:--'
  ) {
    return null;
  }

  // 1. 12-hour format: hh:mm AM/PM or h:mm AM/PM (with optional seconds, optional whitespace)
  const match12 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([aApP][mM])$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridian = match12[3].toUpperCase();

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
      return null;
    }

    if (meridian === 'AM') {
      if (hours === 12) hours = 0;
    } else if (meridian === 'PM') {
      if (hours < 12) hours += 12;
    }

    return hours * 60 + minutes;
  }

  // 2. 24-hour format: HH:mm or H:mm (with optional seconds)
  const match24 = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return hours * 60 + minutes;
  }

  // 3. Fallback for ISO strings: e.g. "2026-08-15T18:00:00.000Z"
  if (clean.includes('T')) {
    const timePart = clean.split('T')[1];
    if (timePart) {
      const sub = timePart.split('.')[0].substring(0, 5); // "18:00"
      return parseAttendanceTimeToMinutes(sub);
    }
  }

  return null;
};

export const calculateWorkingHours = (checkInTimeStr: string | null | undefined, checkOutTimeStr: string | null | undefined): string | null => {
  if (!checkInTimeStr || !checkOutTimeStr) return null;

  const inMins = parseAttendanceTimeToMinutes(checkInTimeStr);
  const outMins = parseAttendanceTimeToMinutes(checkOutTimeStr);

  if (inMins === null || outMins === null) {
    return null;
  }

  // EXFIN OFFICE BUSINESS RULE:
  // Office attendance is strictly same-day (10:00 AM -> 6:00 PM).
  // If checkout time is earlier than check-in time (outMins < inMins),
  // treat as INVALID data. DO NOT add 24 hours (1440 mins).
  if (outMins < inMins) {
    console.error('[INVALID_WORKING_HOURS] Checkout time is earlier than check-in time:', {
      checkInTimeStr,
      checkOutTimeStr,
      inMins,
      outMins
    });
    return null;
  }

  const diffMins = outMins - inMins;
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;

  return `${h}h ${m}m`;
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

  const coords = currentCoords || (record.latitude && record.longitude ? { latitude: record.latitude, longitude: record.longitude } : null);
  if (!coords) {
    return record;
  }

  const town = currentTownCity || record.townCity || 'Raniganj HQ';

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
      (rec.checkOutTime && (rec.checkoutStatus === 'FINALIZED' || rec.checkoutStatus === 'COMPLETED')) ||
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
