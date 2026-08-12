import { 
  AttendanceRecord, 
  CheckInMode, 
  CheckOutMode, 
  SyncStatus, 
  AttendanceState, 
  AttendanceEventType,
  AttendanceType
} from '../../types/attendance';
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
  const dateStr = getFormattedDateStr(eventTimestamp);
  const docId = `${employeeId}_${dateStr}`;
  const timeStr = getFormattedTimeStr(eventTimestamp);
  const eventIso = eventTimestamp.toISOString();

  const distance = getDistanceFromLatLonInM(
    coords.latitude,
    coords.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  const eventId = generateIdempotentEventId(employeeId, dateStr, eventType, timeStr);

  // Check Idempotency
  const processedSet = getProcessedEventIds();
  let record = getTodayAttendanceRecord(employeeId, dateStr);

  if (record && record.processedEvents?.includes(eventId)) {
    console.log(`State Machine: Event ${eventId} already processed for record ${docId}. Skipping.`);
    return record;
  }

  // Enqueue event locally first for offline safety
  const queuedEvent = enqueueAttendanceEvent({
    eventId,
    employeeId,
    attendanceDate: dateStr,
    eventType,
    eventTime: timeStr,
    location: {
      latitude: coords.latitude,
      longitude: coords.longitude,
      townCity: townCity || 'Raniganj HQ',
      distance
    },
    attendanceMode,
    source
  });

  const processedEvents = Array.from(new Set([...(record?.processedEvents || []), eventId]));

  if (!record) {
    if (eventType === 'CHECK_IN') {
      record = {
        id: generateUUID(),
        docId,
        employeeId,
        employeeName: employeeName || 'Employee',
        date: dateStr,
        attendanceType: attendanceMode,
        checkInTime: timeStr,
        checkOutTime: null,
        workingHours: null,
        latitude: coords.latitude,
        longitude: coords.longitude,
        distance,
        townCity: townCity || 'Raniganj HQ',
        checkInMode: source === 'AUTO_GEOFENCE' ? 'AUTO' : 'MANUAL',
        checkOutMode: 'N/A',
        exitTime: null,
        returnTime: null,
        reason: null,
        createdAtDeviceTime: eventIso,
        syncStatus: 'Pending',
        serverSyncTime: null,
        isOffline: !navigator.onLine,
        reminderCount: 0,
        currentState: 'CHECKED_IN',
        processedEvents
      };

      saveAttendanceRecord(record);
      markEventIdProcessed(eventId);

      logAttendanceEvent('CHECKIN_CREATED', employeeId, `Check-in created at ${timeStr} (${source})`, {
        eventId,
        eventTimestamp: eventIso,
        syncStatus: record.syncStatus
      });

      createNotification({
        recipientEmployeeCode: employeeId,
        type: 'ATTENDANCE_CHECK_IN',
        category: 'ATTENDANCE',
        priority: 'LOW',
        title: 'Attendance Check-In Logged',
        message: `You successfully checked in at ${timeStr} (${source}).`,
        entityId: record.id,
        entityType: 'ATTENDANCE'
      }).catch((e) => console.warn('Check-in notification error:', e));

      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch((e) => console.warn('Sync on check-in error:', e));
      }

      return record;
    } else {
      // No record exists and event is not CHECK_IN -> Return null or dummy state
      logAttendanceEvent('GEOFENCE_ENTER', employeeId, `Received ${eventType} event with no active check-in record.`, {
        eventId,
        eventTimestamp: eventIso
      });
      return null as any;
    }
  }

  // Record exists: handle state machine transitions
  if (record.checkOutTime) {
    // Session is already completed for today
    return record;
  }

  let modified = false;

  switch (eventType) {
    case 'CHECK_IN':
      // Already checked in, ignore duplicate
      break;

    case 'GEOFENCE_EXIT':
      if (record.currentState === 'CHECKED_IN' || !record.currentState) {
        record.lastExitTime = timeStr;
        record.exitTime = record.exitTime || timeStr;
        record.currentState = 'PENDING_FINAL_EXIT';
        record.processedEvents = processedEvents;
        modified = true;

        logAttendanceEvent('GEOFENCE_EXIT', employeeId, `Office geofence exit detected at ${timeStr} (Distance: ${Math.round(distance)}m)`, {
          eventId,
          eventTimestamp: eventIso,
          syncStatus: record.syncStatus
        });
      }
      break;

    case 'GEOFENCE_RETURN':
      if (record.currentState === 'PENDING_FINAL_EXIT' || record.lastExitTime || record.exitTime) {
        record.returnTime = timeStr;
        // CRITICAL: Employee returned inside 25m range!
        // Cancel the pending exit event by clearing lastExitTime and exitTime.
        record.lastExitTime = null;
        record.exitTime = null;
        record.currentState = 'CHECKED_IN';
        record.processedEvents = processedEvents;
        modified = true;

        logAttendanceEvent('RETURN_DETECTED', employeeId, `Return to office geofence logged at ${timeStr}. Pending exit cancelled.`, {
          eventId,
          eventTimestamp: eventIso,
          syncStatus: record.syncStatus
        });
      }
      break;

    case 'CHECK_OUT':
    case 'END_OF_DAY_CHECKOUT':
      let checkoutTimeStr = timeStr;
      if (source === 'AUTO_SYSTEM_END_OF_DAY') {
        if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
          checkoutTimeStr = record.lastExitTime || record.exitTime || timeStr;
        } else {
          checkoutTimeStr = timeStr;
        }
      }

      const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);

      record.checkOutTime = checkoutTimeStr;
      record.checkOutMode = source === 'MANUAL' ? 'MANUAL' : 'AUTO_SYSTEM';
      record.checkoutType = source === 'MANUAL' ? 'MANUAL' : 'AUTO_CHECKOUT';
      record.status = 'completed';
      record.workingHours = workingHours;
      record.currentState = 'CHECKED_OUT';
      record.syncStatus = 'Pending';
      record.processedEvents = processedEvents;
      modified = true;

      logAttendanceEvent('CHECKOUT_CREATED', employeeId, `Check-out finalized at ${checkoutTimeStr} (${source})`, {
        eventId,
        eventTimestamp: eventIso,
        syncStatus: record.syncStatus
      });

      createNotification({
        recipientEmployeeCode: employeeId,
        type: 'ATTENDANCE_CHECK_OUT',
        category: 'ATTENDANCE',
        priority: 'LOW',
        title: 'Attendance Check-Out Logged',
        message: `Check-out recorded at ${checkoutTimeStr}. Total working hours: ${workingHours}.`,
        entityId: record.id,
        entityType: 'ATTENDANCE'
      }).catch((e) => console.warn('Check-out notification error:', e));

      break;
  }

  if (modified) {
    record.processedEvents = processedEvents;
    saveAttendanceRecord(record);
    markEventIdProcessed(eventId);

    if (navigator.onLine) {
      syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on state transition:', e));
    }
  }

  return record;
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

  return processAttendanceStateTransition(
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
  const distance = getDistanceFromLatLonInM(
    coords.latitude,
    coords.longitude,
    OFFICE_LOCATION.latitude,
    OFFICE_LOCATION.longitude
  );

  return processAttendanceStateTransition(
    record.employeeId,
    record.employeeName,
    coords,
    townCity,
    'CHECK_OUT',
    'MANUAL',
    new Date(),
    record.attendanceType
  );
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

  // Employee exited geofence (> 25m) after check-in
  if (currentDistance > OFFICE_LOCATION.radius && record.currentState !== 'PENDING_FINAL_EXIT') {
    return processAttendanceStateTransition(
      record.employeeId,
      record.employeeName,
      coords,
      town,
      'GEOFENCE_EXIT',
      'AUTO_GEOFENCE',
      new Date(),
      record.attendanceType
    );
  }

  // Employee returned to geofence (<= 25m) after exiting
  if (currentDistance <= OFFICE_LOCATION.radius && (record.currentState === 'PENDING_FINAL_EXIT' || record.lastExitTime || record.exitTime)) {
    return processAttendanceStateTransition(
      record.employeeId,
      record.employeeName,
      coords,
      town,
      'GEOFENCE_RETURN',
      'AUTO_GEOFENCE',
      new Date(),
      record.attendanceType
    );
  }

  return record;
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
    if (rec.checkOutTime || rec.manualRectified || rec.isAdminRectified || rec.correctedAt) {
      return;
    }

    const isPastDay = rec.date < todayStr;
    const isToday = rec.date === todayStr;

    if (isPastDay) {
      // Previous days (missed checkouts)
      if (rec.attendanceType === 'WFH' || rec.attendanceType === 'CLIENT_VISIT') {
        processAttendanceStateTransition(
          rec.employeeId,
          rec.employeeName,
          { latitude: rec.latitude, longitude: rec.longitude },
          rec.townCity,
          'END_OF_DAY_CHECKOUT',
          'AUTO_SYSTEM_END_OF_DAY',
          now,
          rec.attendanceType
        );
      } else if (rec.attendanceType === 'OFFICE' || !rec.attendanceType) {
        if (rec.currentState === 'PENDING_FINAL_EXIT' || rec.lastExitTime || rec.exitTime) {
          processAttendanceStateTransition(
            rec.employeeId,
            rec.employeeName,
            { latitude: rec.latitude, longitude: rec.longitude },
            rec.townCity,
            'END_OF_DAY_CHECKOUT',
            'AUTO_SYSTEM_END_OF_DAY',
            now,
            'OFFICE'
          );
        } else {
          logAttendanceEvent('END_OF_DAY_PROCESSING', rec.employeeId, `Missed checkout from previous day (${rec.date}). Employee inside geofence. Remains checked in.`);
        }
      }
    } else if (isToday) {
      // Today's record
      if (rec.attendanceType === 'OFFICE' || !rec.attendanceType) {
        // Office mode automatic checkout only at day end (11:59 PM) if they have left the office geofence
        if (is1159PMOrLater) {
          const hasExit = rec.currentState === 'PENDING_FINAL_EXIT' || rec.lastExitTime || rec.exitTime;
          if (hasExit) {
            processAttendanceStateTransition(
              rec.employeeId,
              rec.employeeName,
              { latitude: rec.latitude, longitude: rec.longitude },
              rec.townCity,
              'END_OF_DAY_CHECKOUT',
              'AUTO_SYSTEM_END_OF_DAY',
              now,
              'OFFICE'
            );
          } else {
            logAttendanceEvent('END_OF_DAY_PROCESSING', rec.employeeId, `Employee still inside office geofence at day end. No automatic checkout applied.`);
          }
        }
      } else if (rec.attendanceType === 'WFH' || rec.attendanceType === 'CLIENT_VISIT') {
        // WFH & Client Visit: only auto checkout at 11:59 PM
        if (is1159PMOrLater) {
          processAttendanceStateTransition(
            rec.employeeId,
            rec.employeeName,
            { latitude: rec.latitude, longitude: rec.longitude },
            rec.townCity,
            'END_OF_DAY_CHECKOUT',
            'AUTO_SYSTEM_END_OF_DAY',
            now,
            rec.attendanceType
          );
        }
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
    if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
      if (!record.lastExitTime && !record.exitTime) {
        return null;
      }
    }

    return processAttendanceStateTransition(
      employeeId,
      record.employeeName,
      currentCoords || { latitude: record.latitude, longitude: record.longitude },
      record.townCity,
      'END_OF_DAY_CHECKOUT',
      'AUTO_SYSTEM_END_OF_DAY',
      now,
      record.attendanceType
    );
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
