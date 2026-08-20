// CORE BUSINESS RULE — DO NOT MODIFY WITHOUT ATTENDANCE ENGINE REVIEW

import { AttendanceRecord, AttendanceEventType, AttendanceType } from '../../types/attendance';
import { getIndiaTimeParts } from '../../utils/indiaTime';
import { 
  getTodayAttendanceRecord, 
  saveAttendanceRecord, 
  getStoredAttendanceRecords 
} from './attendanceStorage';
import { 
  generateIdempotentEventId, 
  enqueueAttendanceEvent, 
  getProcessedEventIds, 
  markEventIdProcessed 
} from './attendanceEventQueue';
import { logAttendanceEvent } from './attendanceLogger';
import { createNotification } from '../notification/notificationService';
import { syncPendingAttendanceRecords } from './syncEngine';
import { updateLiveEmployeeLocation } from '../location/liveLocationService';
import { startNativeBackgroundLocation, stopNativeBackgroundLocation } from './nativeBackgroundLocationBridge';

import { OFFICE_GEOFENCE_RADIUS_METERS } from '../../core/coreFeatureLocks';

// CORE FEATURE LOCK — DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
// 25M OFFICE GEOFENCE
export const OFFICE_LOCATION = {
  name: 'EXFIN OFFICE',
  latitude: 23.616227,
  longitude: 87.117063,
  radius: OFFICE_GEOFENCE_RADIUS_METERS, // 25 meters office geofence
  autoCheckoutDistanceThreshold: OFFICE_GEOFENCE_RADIUS_METERS
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
      const sub = timePart.split('.')[0].substring(0, 5);
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

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
};

export const AutomaticAttendanceEngine = {
  /**
   * Evaluates location update, transitions states accordingly
   */
  processLocationUpdate(
    latitude: number,
    longitude: number,
    employeeId: string,
    employeeName: string,
    townCity: string,
    timestamp: Date = new Date(),
    accuracy?: number
  ): AttendanceRecord | null {
    if (!employeeId) return null;

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      console.warn('[processLocationUpdate] Ignored invalid GPS coordinates:', { latitude, longitude });
      return null;
    }

    const distance = getDistanceFromLatLonInM(
      latitude,
      longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    const isInside = distance <= OFFICE_LOCATION.radius;

    // Independent Live Location persistence in live_locations/{employeeId}
    updateLiveEmployeeLocation({
      employeeId,
      employeeName,
      latitude,
      longitude,
      accuracy,
      distanceFromOffice: distance,
      townCity: (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable',
      timestamp
    }).catch((e) => console.warn('[processLocationUpdate] Failed to write live location:', e));

    // Check if check-in exists for today
    const dateStr = getFormattedDateStr(timestamp);
    const record = getTodayAttendanceRecord(employeeId, dateStr);

    // Dynamic Current Location update on existing record (throttled to once per 30s for passive updates)
    if (record) {
      const lastLocTime = record.currentLocationTimestamp ? new Date(record.currentLocationTimestamp).getTime() : 0;
      const nowMs = timestamp.getTime();
      const shouldUpdateRecordLoc = lastLocTime === 0 || (nowMs - lastLocTime >= 30000);

      if (shouldUpdateRecordLoc) {
        record.currentLatitude = latitude;
        record.currentLongitude = longitude;
        if (typeof accuracy === 'number' && Number.isFinite(accuracy)) {
          record.currentAccuracy = accuracy;
        }
        record.currentDistance = distance;
        record.currentTownCity = (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable';
        record.currentLocationTimestamp = timestamp.toISOString();
        record.currentLocationStatus = 'LIVE';
        record.syncStatus = 'Pending';
        saveAttendanceRecord(record);
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          syncPendingAttendanceRecords().catch(() => {});
        }
      }

      console.log('[EXFIN_CURRENT_GPS]', {
        latitude,
        longitude,
        accuracy,
        timestamp: timestamp.toISOString()
      });

      console.log('[EXFIN_CURRENT_DISTANCE]', {
        currentLatitude: latitude,
        currentLongitude: longitude,
        officeLatitude: OFFICE_LOCATION.latitude,
        officeLongitude: OFFICE_LOCATION.longitude,
        calculatedDistanceMeters: distance
      });

      console.log('[CURRENT_LOCATION_UPDATE]', {
        latitude,
        longitude,
        accuracy,
        calculatedDistance: distance,
        timestamp: timestamp.toISOString()
      });

      console.log('[CURRENT_DISTANCE_CALCULATION]', {
        currentLatitude: latitude,
        currentLongitude: longitude,
        officeLatitude: OFFICE_LOCATION.latitude,
        officeLongitude: OFFICE_LOCATION.longitude,
        distanceMeters: distance
      });
    }

    // Initial state setup if record doesn't exist
    const currentState = record 
      ? (record.currentState || (record.checkOutTime ? 'FINALIZED_CHECKOUT' : (record.exitTime ? 'PENDING_FINAL_EXIT' : 'CHECKED_IN'))) 
      : 'OUTSIDE';

    if (currentState === 'OUTSIDE' && isInside) {
      // ENTER GEOFENCE and no check-in today: immediate auto check-in (ENTERING -> CHECKED_IN)
      logAttendanceEvent('GEOFENCE_ENTER', employeeId, `Entered office geofence (${Math.round(distance)}m). Triggering immediate automatic check-in.`);
      
      // Transition from OUTSIDE -> ENTERING -> CHECKED_IN
      return this.transitionState(
        employeeId,
        employeeName,
        { latitude, longitude },
        townCity,
        'CHECK_IN',
        'AUTO_GEOFENCE',
        timestamp
      );
    }

    if (record && !record.checkOutTime && (record.attendanceType === 'OFFICE' || !record.attendanceType)) {
      if ((currentState === 'CHECKED_IN' || currentState === 'ENTERING') && !isInside) {
        // EXIT GEOFENCE: CHECKED_IN -> PENDING_FINAL_EXIT
        console.log('[AUTO_EXIT_DETECTED]', {
          employeeId,
          date: dateStr,
          distance: Math.round(distance),
          timestamp: timestamp.toISOString(),
          source: 'FOREGROUND_GPS'
        });
        logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[AUTO_EXIT_DETECTED] Exited office geofence (${Math.round(distance)}m). Transitioning to PENDING_FINAL_EXIT.`);

        return this.transitionState(
          employeeId,
          employeeName,
          { latitude, longitude },
          townCity,
          'GEOFENCE_EXIT',
          'AUTO_GEOFENCE',
          timestamp
        );
      }

      if (currentState === 'PENDING_FINAL_EXIT') {
        if (distance <= 23) {
          let currentCount = 0;
          try {
            const countKey = `consecutive_return_${employeeId}_${dateStr}`;
            currentCount = parseInt(localStorage.getItem(countKey) || '0', 10);
            const newCount = currentCount + 1;
            localStorage.setItem(countKey, String(newCount));
            
            if (newCount >= 3) {
              localStorage.removeItem(countKey);
              console.log('[AUTO_EXIT_RETURNED]', {
                employeeId,
                date: dateStr,
                distance: Math.round(distance),
                timestamp: timestamp.toISOString(),
                source: 'FOREGROUND_GPS'
              });
              logAttendanceEvent('RETURN_DETECTED', employeeId, `[AUTO_EXIT_RETURNED] Returned to office geofence stably (${Math.round(distance)}m) after 3 consecutive readings. Cancelling pending exit.`);
              return this.transitionState(
                employeeId,
                employeeName,
                { latitude, longitude },
                townCity,
                'GEOFENCE_RETURN',
                'AUTO_GEOFENCE',
                timestamp
              );
            } else {
              console.log(`[AttendanceEngine] Return candidate detected at ${Math.round(distance)}m (count: ${newCount}/3). Preserving exit candidate.`);
            }
          } catch (e) {
            console.log('[AUTO_EXIT_RETURNED]', {
              employeeId,
              date: dateStr,
              distance: Math.round(distance),
              timestamp: timestamp.toISOString(),
              source: 'FOREGROUND_GPS'
            });
            logAttendanceEvent('RETURN_DETECTED', employeeId, `[AUTO_EXIT_RETURNED] Returned to office geofence (${Math.round(distance)}m). Cancelling pending exit.`);
            return this.transitionState(
              employeeId,
              employeeName,
              { latitude, longitude },
              townCity,
              'GEOFENCE_RETURN',
              'AUTO_GEOFENCE',
              timestamp
            );
          }
        } else {
          try {
            localStorage.removeItem(`consecutive_return_${employeeId}_${dateStr}`);
          } catch (e) {}

          // Preserve recorded geofence exit time while employee remains outside geofence.
          // Do NOT overwrite lastExitTime with subsequent clock times.
          if (!record.lastExitTime && record.exitTime) {
            record.lastExitTime = record.exitTime;
            record.syncStatus = 'Pending';
            saveAttendanceRecord(record);
            if (navigator.onLine) {
              syncPendingAttendanceRecords().catch(() => {});
            }
          }
        }
      }
    }

    return record;
  },

  /**
   * Explicit transition state handler following state machine rules
   */
  transitionState(
    employeeId: string,
    employeeName: string,
    coords: { latitude: number; longitude: number },
    townCity: string,
    eventType: AttendanceEventType,
    source: 'AUTO_GEOFENCE' | 'MANUAL' | 'AUTO_SYSTEM_END_OF_DAY',
    eventTimestamp: Date = new Date(),
    attendanceMode: AttendanceType = 'OFFICE'
  ): AttendanceRecord {
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

    // Read existing record or assume empty
    let record = getTodayAttendanceRecord(employeeId, dateStr);

    // Prevent duplicate processing of the exact same event
    if (record && record.processedEvents?.includes(eventId)) {
      console.log(`AutomaticAttendanceEngine: Event ${eventId} already processed for ${docId}. Skipping.`);
      return record;
    }

    // Queue the event offline for idempotency
    enqueueAttendanceEvent({
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
        // State Transition: OUTSIDE -> ENTERING -> CHECKED_IN
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
          townCity: (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable',
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
          processedEvents,

          // Permanent Check-In Location
          checkInLatitude: coords.latitude,
          checkInLongitude: coords.longitude,
          checkInDistance: distance,
          checkInTownCity: (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable',

          // Dynamic Current Location
          currentLatitude: coords.latitude,
          currentLongitude: coords.longitude,
          currentDistance: distance,
          currentTownCity: (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable',
          currentLocationTimestamp: eventIso,
          currentLocationStatus: 'LIVE'
        };

        saveAttendanceRecord(record);
        markEventIdProcessed(eventId);

        logAttendanceEvent('CHECKIN_CREATED', employeeId, `Check-in recorded at ${timeStr} (${source})`, {
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
        }).catch((e) => console.warn('Notification error:', e));

        if (navigator.onLine) {
          syncPendingAttendanceRecords().catch((e) => console.warn('Sync error:', e));
        }

        // Start native Android background location tracking for active attendance session
        startNativeBackgroundLocation(employeeId, employeeName).catch((e) => console.warn('Native bg location start error:', e));

        return record;
      } else {
        throw new Error(`Cannot process event ${eventType} when status is OUTSIDE (no active check-in).`);
      }
    }

    // Record exists and is already checked out, do not allow further transitions
    if (record.checkOutTime) {
      return record;
    }

    let modified = false;

    switch (eventType) {
      case 'CHECK_IN':
        // Daily Lock rule: once checked in today, do not overwrite check-in
        break;

      case 'GEOFENCE_EXIT':
        if (record.currentState === 'CHECKED_IN' || record.currentState === 'ENTERING' || !record.currentState) {
          // State Transition: CHECKED_IN -> PENDING_FINAL_EXIT
          // Authoritative geofence exit time: record the exact timestamp when the employee crossed outside the 25m boundary
          record.lastExitTime = record.lastExitTime || timeStr;
          record.exitTime = record.exitTime || timeStr;
          record.currentState = 'PENDING_FINAL_EXIT';
          record.syncStatus = 'Pending';

          if (coords) {
            record.checkoutLatitude = coords.latitude;
            record.checkoutLongitude = coords.longitude;
            record.checkoutDistance = distance;
            record.checkoutTownCity = (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable';
          }
          modified = true;

          console.log('[AUTO_EXIT_SAVED]', {
            employeeId,
            date: dateStr,
            distance: Math.round(distance),
            timestamp: eventIso,
            source
          });

          logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[AUTO_EXIT_SAVED] Office geofence exit recorded and saved at ${timeStr}`, {
            eventId,
            eventTimestamp: eventIso,
            metadata: {
              distance: Math.round(distance),
              source
            }
          });
        }
        break;

      case 'GEOFENCE_RETURN':
        if (record.currentState === 'PENDING_FINAL_EXIT' || record.lastExitTime || record.exitTime) {
          // State Transition: PENDING_FINAL_EXIT -> CHECKED_IN
          record.returnTime = timeStr;
          record.lastExitTime = null;
          record.exitTime = null;
          record.currentState = 'CHECKED_IN';
          // Clear candidate exit checkout location
          delete record.checkoutLatitude;
          delete record.checkoutLongitude;
          delete record.checkoutDistance;
          delete record.checkoutTownCity;
          modified = true;

          logAttendanceEvent('RETURN_DETECTED', employeeId, `Return to office geofence detected at ${timeStr}. Pending exit cleared.`, {
            eventId,
            eventTimestamp: eventIso
          });
        }
        break;

      case 'CHECK_OUT':
      case 'END_OF_DAY_CHECKOUT':
        // State Transition: (CHECKED_IN or PENDING_FINAL_EXIT) -> FINALIZED_CHECKOUT
        let checkoutTimeStr = timeStr;

        // Authoritative geofence exit timestamp hierarchy:
        // 1. lastExitTime
        // 2. exitTime
        // 3. Fallback to timeStr if no exit event was recorded
        const authoritativeExitTime = (record.lastExitTime && record.lastExitTime !== 'Pending' && record.lastExitTime !== 'N/A' && record.lastExitTime !== '--:--')
          ? record.lastExitTime
          : (record.exitTime && record.exitTime !== 'Pending' && record.exitTime !== 'N/A' && record.exitTime !== '--:--')
          ? record.exitTime
          : null;

        if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
          // CORE ATTENDANCE RULE:
          // For OFFICE attendance with a recorded geofence exit (PENDING_FINAL_EXIT or recorded exit timestamp):
          // GEOFENCE EXIT TIME = ACTUAL CHECKOUT TIME
          // The confirmation time (when the employee taps "Confirm Check-Out" or app opens later) is confirmation metadata ONLY.
          if (record.currentState === 'PENDING_FINAL_EXIT' || authoritativeExitTime) {
            if (authoritativeExitTime) {
              checkoutTimeStr = authoritativeExitTime;
            }
          }
        }

        const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);

        record.checkOutTime = checkoutTimeStr;
        record.checkOutMode = source === 'MANUAL' ? 'MANUAL' : 'AUTO_SYSTEM';
        record.checkoutType = source === 'MANUAL' ? 'MANUAL' : 'AUTO_CHECKOUT';
        record.status = 'completed';
        record.checkoutStatus = 'COMPLETED';
        record.workingHours = workingHours;
        record.currentState = 'FINALIZED_CHECKOUT';
        record.checkoutConfirmedAt = timeStr;
        record.checkoutConfirmationTime = timeStr;
        record.checkoutFinalizedAt = eventIso;

        if (coords && coords.latitude && coords.longitude) {
          record.checkoutLatitude = coords.latitude;
          record.checkoutLongitude = coords.longitude;
          record.checkoutDistance = distance;
          record.checkoutTownCity = (townCity && townCity.trim()) ? townCity.trim() : (record.checkoutTownCity || 'Location name unavailable');
        } else if (!record.checkoutLatitude && !record.checkoutTownCity) {
          record.checkoutTownCity = 'Location unavailable';
        }

        modified = true;

        logAttendanceEvent('CHECKOUT_CREATED', employeeId, `Check-out finalized at ${checkoutTimeStr} (${source})`, {
          eventId,
          eventTimestamp: eventIso
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
        }).catch((e) => console.warn('Notification error:', e));

        break;
    }

    if (modified) {
      record.processedEvents = processedEvents;
      saveAttendanceRecord(record);
      markEventIdProcessed(eventId);

      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch((e) => console.warn('Sync error:', e));
      }

      if (eventType === 'CHECK_OUT') {
        stopNativeBackgroundLocation().catch((e) => console.warn('Native bg location stop error:', e));
      }
    }

    return record;
  },

  /**
   * Processes manual checkout safely rejecting invalid operations
   */
  processManualCheckout(
    record: AttendanceRecord,
    coords: { latitude: number; longitude: number },
    townCity: string
  ): AttendanceRecord {
    // Check if checked out already
    if (record.checkOutTime) {
      return record;
    }

    const hasRecordedExit = record.currentState === 'PENDING_FINAL_EXIT' || !!record.lastExitTime || !!record.exitTime;

    const distance = getDistanceFromLatLonInM(
      coords.latitude,
      coords.longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    // Reject manual checkout if they are outside geofence (25m) UNLESS they have a recorded geofence exit (PENDING_FINAL_EXIT)
    if (!hasRecordedExit && distance > OFFICE_LOCATION.radius) {
      throw new Error(`Manual Check-Out is allowed ONLY within ${OFFICE_LOCATION.radius} meters of the office.`);
    }

    // Use recorded exit coordinates/town if present, otherwise provided coords
    const finalCoords = (hasRecordedExit && record.checkoutLatitude && record.checkoutLongitude)
      ? { latitude: record.checkoutLatitude, longitude: record.checkoutLongitude }
      : coords;
    const finalTown = (hasRecordedExit && record.checkoutTownCity && record.checkoutTownCity !== 'Location name unavailable' && record.checkoutTownCity !== 'Location unavailable')
      ? record.checkoutTownCity
      : townCity;

    return this.transitionState(
      record.employeeId,
      record.employeeName,
      finalCoords,
      finalTown,
      'CHECK_OUT',
      'MANUAL',
      new Date(),
      record.attendanceType
    );
  },

  /**
   * Triggers entry geofence manually or programmatically
   */
  processGeofenceEntry(
    employeeId: string,
    employeeName: string,
    coords: { latitude: number; longitude: number },
    townCity: string,
    timestamp: Date = new Date()
  ): AttendanceRecord {
    const dateStr = getFormattedDateStr(timestamp);
    const record = getTodayAttendanceRecord(employeeId, dateStr);

    if (!record || !record.checkInTime) {
      return this.transitionState(
        employeeId,
        employeeName,
        coords,
        townCity,
        'CHECK_IN',
        'AUTO_GEOFENCE',
        timestamp
      );
    } else if (record.currentState === 'PENDING_FINAL_EXIT' || record.lastExitTime || record.exitTime) {
      return this.transitionState(
        employeeId,
        employeeName,
        coords,
        townCity,
        'GEOFENCE_RETURN',
        'AUTO_GEOFENCE',
        timestamp
      );
    }
    return record;
  },

  /**
   * Triggers exit geofence manually or programmatically
   */
  processGeofenceExit(
    employeeId: string,
    employeeName: string,
    coords: { latitude: number; longitude: number },
    townCity: string,
    timestamp: Date = new Date()
  ): AttendanceRecord {
    const dateStr = getFormattedDateStr(timestamp);
    const record = getTodayAttendanceRecord(employeeId, dateStr);

    if (record && record.checkInTime && !record.checkOutTime && record.currentState !== 'PENDING_FINAL_EXIT') {
      return this.transitionState(
        employeeId,
        employeeName,
        coords,
        townCity,
        'GEOFENCE_EXIT',
        'AUTO_GEOFENCE',
        timestamp
      );
    }
    return record!;
  },

  /**
   * Recovers and finalizes pending exit (for app reopen or end of day)
   */
  finalizePendingExit(
    employeeId: string,
    dateStr: string,
    timestamp: Date = new Date()
  ): AttendanceRecord | null {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record || record.checkOutTime) {
      return null;
    }

    // Only finalize if state is PENDING_FINAL_EXIT or they have an exit recorded
    if (record.currentState === 'PENDING_FINAL_EXIT' || record.lastExitTime || record.exitTime) {
      return this.transitionState(
        employeeId,
        record.employeeName,
        { latitude: record.latitude, longitude: record.longitude },
        record.townCity,
        'END_OF_DAY_CHECKOUT',
        'AUTO_SYSTEM_END_OF_DAY',
        timestamp,
        record.attendanceType
      );
    }

    return null;
  },

  /**
   * Settles unresolved sessions at the 6:00 PM deadline or during past-day recovery
   */
  async settleUnresolvedSession(
    employeeId: string,
    dateStr: string,
    timestamp: Date = new Date()
  ): Promise<AttendanceRecord | null> {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record || (record.checkOutTime && record.checkoutStatus === 'COMPLETED')) {
      return null;
    }

    if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
      let hasExitEvent = !!(record.lastExitTime || record.exitTime);
      let checkoutTimeStr = record.lastExitTime || record.exitTime || '';

      if (!hasExitEvent) {
        try {
          const { getNativeLastUnresolvedExit, clearNativeUnresolvedExit } = await import('./nativeGeofenceBridge');
          const nativeExit = await getNativeLastUnresolvedExit();
          if (nativeExit.hasUnresolvedExit && nativeExit.date === dateStr && nativeExit.time) {
            hasExitEvent = true;
            checkoutTimeStr = nativeExit.time;
            await clearNativeUnresolvedExit();
            logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `Recovered native exit event for ${dateStr}: ${checkoutTimeStr}`);
          }
        } catch (err) {
          console.warn('Failed to retrieve native unresolved exit:', err);
        }
      }

      if (hasExitEvent) {
        // CASE 1: Valid final exit exists
        const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);
        record.checkOutTime = checkoutTimeStr;
        record.checkoutStatus = 'COMPLETED';
        record.checkOutMode = 'AUTO_SYSTEM';
        record.checkoutType = 'AUTO_CHECKOUT';
        record.status = 'completed';
        record.workingHours = workingHours;
        record.currentState = 'FINALIZED_CHECKOUT';
        record.resolutionSource = 'AUTO_GEOFENCE';
        console.log('[AUTO_CHECKOUT_FINALIZED]', {
          employeeId,
          date: dateStr,
          distance: record.distance || 0,
          timestamp: new Date().toISOString(),
          source: 'AUTO_SYSTEM_FINALIZER'
        });
        logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `[AUTO_CHECKOUT_FINALIZED] Settling session for ${dateStr} using recovered final exit time: ${checkoutTimeStr}`);

        const eventId = generateIdempotentEventId(employeeId, dateStr, 'END_OF_DAY_CHECKOUT', checkoutTimeStr);
        record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));

        saveAttendanceRecord(record);
        markEventIdProcessed(eventId);

        createNotification({
          recipientEmployeeCode: employeeId,
          type: 'ATTENDANCE_CHECK_OUT',
          category: 'ATTENDANCE',
          priority: 'LOW',
          title: 'Attendance Session Settled',
          message: `Your attendance session for ${dateStr} was settled at ${checkoutTimeStr} (AUTO_CHECKOUT).`,
          entityId: record.id,
          entityType: 'ATTENDANCE'
        }).catch((e) => console.warn('Notification error on settlement:', e));

        if (navigator.onLine) {
          syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on settlement:', e));
        }

        return record;
      } else {
        // CASE 3: No reliable checkout exists (GPS stopped before exit, missing location updates, etc.)
        // DO NOT automatically use 11:59 PM.
        const isToday = dateStr === getIndiaTimeParts().dateStr;
        if (isToday) {
            logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `Employee still inside office on ${dateStr} (past 6 PM). Not finalizing.`);
            return null;
        }

        // Past day - Mark as UNRESOLVED
        record.checkOutTime = null;
        record.checkoutStatus = 'UNRESOLVED';
        record.checkoutTownCity = 'Location unavailable';
        delete record.checkoutLatitude;
        delete record.checkoutLongitude;
        delete record.checkoutDistance;
        record.checkOutMode = 'AUTO_SYSTEM';
        record.checkoutType = 'UNRESOLVED';
        record.status = 'UNRESOLVED';
        record.workingHours = null;
        record.currentState = 'UNRESOLVED';
        record.resolutionSource = null;
        logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `No valid exit event found for ${dateStr}. Marked checkoutStatus as UNRESOLVED.`);

        try {
          const locUnavailKey = `loc_unavail_${employeeId}_${dateStr}`;
          if (localStorage.getItem(locUnavailKey) === 'true') {
            record.checkoutSource = "END_OF_DAY_LOCATION_UNAVAILABLE";
            record.locationUnavailableDuringDay = true;
          }
        } catch (e) {}

        const eventId = generateIdempotentEventId(employeeId, dateStr, 'END_OF_DAY_UNRESOLVED', 'UNRESOLVED');
        record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));

        saveAttendanceRecord(record);
        markEventIdProcessed(eventId);

        // Notify Admin & Employee without duplicate alerts
        createNotification({
          recipientEmployeeCode: 'ADMIN',
          type: 'ATTENDANCE_UNRESOLVED',
          category: 'ATTENDANCE',
          priority: 'HIGH',
          title: 'Attendance Requires Action',
          message: `${record.employeeName || employeeId} (${employeeId}) - Date: ${dateStr}, Checkout: UNRESOLVED`,
          entityId: record.id,
          entityType: 'ATTENDANCE',
          idempotencyKey: `admin_unresolved_${employeeId}_${dateStr}`
        }).catch((e) => console.warn('Admin notification error on unresolved settlement:', e));

        createNotification({
          recipientEmployeeCode: employeeId,
          type: 'ATTENDANCE_UNRESOLVED',
          category: 'ATTENDANCE',
          priority: 'HIGH',
          title: 'Checkout Requires Resolution',
          message: `Your checkout time for ${dateStr} could not be reliably determined. Please resolve your checkout.`,
          entityId: record.id,
          entityType: 'ATTENDANCE',
          idempotencyKey: `emp_unresolved_${employeeId}_${dateStr}`
        }).catch((e) => console.warn('Employee notification error on unresolved settlement:', e));

        if (navigator.onLine) {
          syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on settlement:', e));
        }

        return record;
      }
    } else {
      // CASE 2: WFH / CLIENT_VISIT / OUTDOOR legit 06:00 PM EOD completion
      const checkoutTimeStr = '06:00 PM';
      const checkoutTypeStr = 'AUTO_CHECKOUT';
      const checkOutModeStr: 'AUTO_SYSTEM' | 'MANUAL' = 'AUTO_SYSTEM';
      logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `Settling WFH/CLIENT_VISIT session for ${dateStr} at 06:00 PM.`);

      const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);

      record.checkOutTime = checkoutTimeStr;
      record.checkoutStatus = 'COMPLETED';
      record.checkOutMode = checkOutModeStr;
      record.checkoutType = checkoutTypeStr;
      record.status = 'completed';
      record.workingHours = workingHours;
      record.currentState = 'FINALIZED_CHECKOUT';
      record.resolutionSource = 'AUTO_SYSTEM';

      const eventId = generateIdempotentEventId(employeeId, dateStr, 'END_OF_DAY_CHECKOUT', checkoutTimeStr);
      record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));

      saveAttendanceRecord(record);
      markEventIdProcessed(eventId);

      createNotification({
        recipientEmployeeCode: employeeId,
        type: 'ATTENDANCE_CHECK_OUT',
        category: 'ATTENDANCE',
        priority: 'LOW',
        title: 'Attendance Session Settled',
        message: `Your attendance session for ${dateStr} was settled at ${checkoutTimeStr} (${checkoutTypeStr}).`,
        entityId: record.id,
        entityType: 'ATTENDANCE'
      }).catch((e) => console.warn('Notification error on settlement:', e));

      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on settlement:', e));
      }

      return record;
    }
  }
};
