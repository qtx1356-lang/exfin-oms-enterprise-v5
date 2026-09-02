// CORE BUSINESS RULE — DO NOT MODIFY WITHOUT ATTENDANCE ENGINE REVIEW

import { AttendanceRecord, AttendanceEventType, AttendanceType } from '../../types/attendance';
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
import { isAdminContextActive, logAttendanceWriteDiagnostic } from '../../utils/attendanceUtils';

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

export function isEmployeeApprovedLocally(employeeId: string): boolean {
  if (!employeeId || employeeId === 'ANONYMOUS' || employeeId === 'SYSTEM') return false;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('cached_registration_data') : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      const activeId = parsed.employeeCode || parsed.uid || parsed.id || parsed.employeeId;
      if (activeId === employeeId && parsed.status === 'Approved') {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

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
    if (isAdminContextActive()) {
      return null;
    }

    if (!employeeId || !isEmployeeApprovedLocally(employeeId)) {
      if (employeeId && employeeId !== 'ANONYMOUS' && employeeId !== 'SYSTEM') {
        console.warn(`[AutomaticAttendanceEngine] Ignored location update for unapproved/unknown employee: ${employeeId}`);
      }
      return null;
    }

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
      townCity: (townCity && townCity.trim()) ? townCity.trim() : 'Raniganj HQ',
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
    const timeStr = getFormattedTimeStr(timestamp);
    const currentState = record 
      ? (record.currentState || (record.checkOutTime ? 'FINALIZED_CHECKOUT' : (record.exitTime ? 'PENDING_FINAL_EXIT' : 'CHECKED_IN'))) 
      : 'OUTSIDE';

    if (currentState === 'OUTSIDE' && isInside) {
      console.log('[CURRENT_DAY_AUTO_CHECKIN_ALLOWED]', {
        employeeId,
        date: dateStr,
        reason: 'automatic_geofence_enter'
      });
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
      if ((currentState === 'CHECKED_IN' || currentState === 'ENTERING' || currentState === 'RETURNING_TO_OFFICE') && !isInside) {
        // EXIT GEOFENCE: CHECKED_IN -> PENDING_AUTO_CHECKOUT
        console.log('[AUTO_EXIT_DETECTED]', {
          employeeId,
          date: dateStr,
          distance: Math.round(distance),
          timestamp: timestamp.toISOString(),
          localTime: timeStr,
          source: 'FOREGROUND_GPS'
        });
        logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[AUTO_EXIT_DETECTED] Exited office geofence (${Math.round(distance)}m) at ${timeStr}. Transitioning to PENDING_AUTO_CHECKOUT.`);

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

      if (currentState === 'PENDING_FINAL_EXIT' || currentState === 'PENDING_EXIT_CONFIRMATION' || currentState === 'PENDING_AUTO_CHECKOUT' || currentState === 'CHECKOUT_NOT_DETECTED' || currentState === 'RETURNING_TO_OFFICE') {
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

          // Do NOT overwrite authoritative geofenceExitTime while waiting for confirmation or returning
          const timeStr = getFormattedTimeStr(timestamp);
          if (!record.geofenceExitTime && record.exitDetectionSource !== 'NONE') {
            record.geofenceExitTime = record.lastExitTime || timeStr;
            record.geofenceExitTimestamp = record.geofenceExitTimestamp || timestamp.toISOString();
            record.pendingCheckoutConfirmation = true;
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
      createdAt: eventIso,
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
          processedEvents,

          // Permanent Check-In Location
          checkInLatitude: coords.latitude,
          checkInLongitude: coords.longitude,
          checkInDistance: distance,
          checkInTownCity: townCity || 'Raniganj HQ',

          // Dynamic Current Location
          currentLatitude: coords.latitude,
          currentLongitude: coords.longitude,
          currentDistance: distance,
          currentTownCity: townCity || 'Raniganj HQ',
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
        if (record.currentState === 'CHECKED_IN' || record.currentState === 'ENTERING' || record.currentState === 'RETURNING_TO_OFFICE' || !record.currentState) {
          // State Transition: CHECKED_IN / RETURNING_TO_OFFICE -> PENDING_AUTO_CHECKOUT
          const newTimestampMs = eventTimestamp.getTime();
          const existingTimestampMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;

          if (record.currentState === 'RETURNING_TO_OFFICE' || !record.geofenceExitTime || !record.recordedExitTime || newTimestampMs < existingTimestampMs) {
            record.geofenceExitTime = timeStr;
            record.geofenceExitTimestamp = eventIso;
            record.recordedExitTime = timeStr;
            record.exitDetectedAt = eventIso;
            record.exitDetectedTime = timeStr;
            record.lastExitTime = timeStr;
            record.exitTime = record.exitTime || timeStr;
            record.exitDetectionSource = source === 'AUTO_GEOFENCE' ? 'NATIVE_GEOFENCE' : 'FOREGROUND_GPS';
          }
          record.pendingCheckoutConfirmation = true;
          record.returningToOffice = false;
          record.currentState = 'PENDING_AUTO_CHECKOUT';
          record.checkoutStatus = 'PENDING_AUTO_CHECKOUT';
          record.syncStatus = 'Pending';

          if (coords) {
            record.checkoutLatitude = coords.latitude;
            record.checkoutLongitude = coords.longitude;
            record.checkoutDistance = distance;
            record.checkoutTownCity = townCity || 'Raniganj HQ';
          }
          modified = true;

          console.log('[AUTO_EXIT_PENDING]', {
            employeeId,
            exitTime: record.recordedExitTime || timeStr,
            source: record.exitDetectionSource || source
          });

          console.log('[AUTO_EXIT_SAVED]', {
            employeeId,
            date: dateStr,
            distance: Math.round(distance),
            timestamp: eventIso,
            source,
            geofenceExitTime: record.geofenceExitTime,
            recordedExitTime: record.recordedExitTime
          });

          logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[AUTO_EXIT_SAVED] Office geofence exit recorded at ${timeStr}. State: PENDING_AUTO_CHECKOUT.`, {
            eventId,
            eventTimestamp: eventIso,
            metadata: {
              distance: Math.round(distance),
              source,
              geofenceExitTime: record.geofenceExitTime,
              recordedExitTime: record.recordedExitTime
            }
          });

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record } }));
            window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
          }
        }
        break;

      case 'GEOFENCE_RETURN':
        if (
          record.currentState === 'PENDING_FINAL_EXIT' ||
          record.currentState === 'PENDING_EXIT_CONFIRMATION' ||
          record.currentState === 'PENDING_AUTO_CHECKOUT' ||
          record.currentState === 'CHECKOUT_NOT_DETECTED' ||
          record.currentState === 'RETURNING_TO_OFFICE' ||
          record.pendingCheckoutConfirmation ||
          record.lastExitTime ||
          record.exitTime ||
          record.geofenceExitTime ||
          record.recordedExitTime
        ) {
          // State Transition: PENDING_AUTO_CHECKOUT -> CHECKED_IN
          const prevExitTime = record.recordedExitTime || record.geofenceExitTime || record.lastExitTime;
          record.returnTime = timeStr;
          record.lastExitTime = null;
          record.exitTime = null;
          record.geofenceExitTime = null;
          record.geofenceExitTimestamp = null;
          record.recordedExitTime = null;
          record.exitDetectedTime = null;
          record.exitDetectedAt = null;
          record.exitDetectionSource = 'NONE';
          record.pendingCheckoutConfirmation = false;
          record.returningToOffice = false;
          record.currentState = 'CHECKED_IN';
          record.checkoutStatus = undefined;
          record.checkOutTime = null;
          record.syncStatus = 'Pending';
          // Clear candidate exit checkout location
          delete record.checkoutLatitude;
          delete record.checkoutLongitude;
          delete record.checkoutDistance;
          delete record.checkoutTownCity;
          modified = true;

          console.log('[AUTO_EXIT_CANCELLED_RETURN]', {
            employeeId,
            exitTime: prevExitTime,
            returnTime: timeStr
          });

          logAttendanceEvent('RETURN_DETECTED', employeeId, `Return to office geofence detected at ${timeStr}. Pending exit cancelled and attendance remains active.`, {
            eventId,
            eventTimestamp: eventIso
          });

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
          }
        }
        break;

      case 'CHECK_OUT':
      case 'END_OF_DAY_CHECKOUT':
        // State Transition: (CHECKED_IN or PENDING_EXIT_CONFIRMATION) -> FINALIZED_CHECKOUT
        let checkoutTimeStr = timeStr;

        if (source === 'AUTO_SYSTEM_END_OF_DAY') {
          if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
            const nativeExit = record.recordedExitTime || record.geofenceExitTime;
            if (!nativeExit) {
              // Rule 7, 9 & 10: Cannot fabricate 11:59 PM checkout time without native exit event
              record.recordedExitTime = null;
              record.geofenceExitTime = null;
              record.checkOutTime = null;
              record.checkoutStatus = 'UNRESOLVED';
              record.attendanceStatus = 'UNRESOLVED';
              record.status = 'UNRESOLVED';
              record.currentState = 'UNRESOLVED';
              record.checkoutFinalizationSource = 'NONE';
              saveAttendanceRecord(record);
              logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `No native exit recorded for ${dateStr}. Transitioned session to UNRESOLVED workflow.`);
              return record;
            }
            checkoutTimeStr = nativeExit;
          } else {
            checkoutTimeStr = timeStr;
          }
        }

        const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);

        record.checkOutTime = checkoutTimeStr;
        record.checkOutMode = source === 'MANUAL' ? 'MANUAL' : 'AUTO_SYSTEM';
        record.checkoutType = source === 'MANUAL' ? 'MANUAL' : 'AUTO_CHECKOUT';
        record.checkoutSource = source === 'MANUAL' ? 'MANUAL' : 'EXIT_DETECTED';
        record.attendanceStatus = 'RESOLVED';
        record.status = 'completed';
        record.checkoutStatus = 'FINALIZED';
        record.checkoutFinalized = true;
        record.checkoutConfirmed = true;
        record.checkoutFinalizationSource = source === 'MANUAL' ? 'MANUAL_CHECKOUT' : 'END_OF_DAY_NATIVE_EXIT';
        if (source === 'MANUAL') {
          record.manualCheckoutTime = checkoutTimeStr;
        }
        record.workingHours = workingHours;
        record.currentState = 'FINALIZED_CHECKOUT';
        record.pendingCheckoutConfirmation = false;
        record.returningToOffice = false;

        if (coords && coords.latitude && coords.longitude) {
          record.checkoutLatitude = coords.latitude;
          record.checkoutLongitude = coords.longitude;
          record.checkoutDistance = distance;
          record.checkoutTownCity = townCity || 'Raniganj HQ';
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

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
        }

        break;
    }

    if (modified) {
      record.processedEvents = processedEvents;
      saveAttendanceRecord(record);
      markEventIdProcessed(eventId);

      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch((e) => console.warn('Sync error:', e));
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

    const distance = getDistanceFromLatLonInM(
      coords.latitude,
      coords.longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    // Reject manual checkout if they are outside geofence (25m) according to manual checkout rules
    if (distance > OFFICE_LOCATION.radius) {
      throw new Error(`Manual Check-Out is allowed ONLY within ${OFFICE_LOCATION.radius} meters of the office.`);
    }

    return this.transitionState(
      record.employeeId,
      record.employeeName,
      coords,
      townCity,
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
    if (!employeeId || !isEmployeeApprovedLocally(employeeId)) {
      if (employeeId && employeeId !== 'ANONYMOUS' && employeeId !== 'SYSTEM') {
        console.warn(`[AutomaticAttendanceEngine] Ignored geofence entry for unapproved/unknown employee: ${employeeId}`);
      }
      return null as any;
    }

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
    timestamp: Date = new Date(),
    isNativeEvent: boolean = false
  ): AttendanceRecord {
    if (!employeeId || !isEmployeeApprovedLocally(employeeId)) {
      if (employeeId && employeeId !== 'ANONYMOUS' && employeeId !== 'SYSTEM') {
        console.warn(`[AutomaticAttendanceEngine] Ignored geofence exit for unapproved/unknown employee: ${employeeId}`);
      }
      return null as any;
    }

    const dateStr = getFormattedDateStr(timestamp);
    const record = getTodayAttendanceRecord(employeeId, dateStr);

    const timeKolkata = getFormattedTimeStr(timestamp);
    console.log('[AUTO_EXIT_DETECTED]', {
      employeeId,
      timestamp: timestamp.toISOString(),
      localTime: timeKolkata,
      source: isNativeEvent ? 'NATIVE_GEOFENCE' : 'AUTO_GEOFENCE',
      distance: coords ? Math.round(getDistanceFromLatLonInM(coords.latitude, coords.longitude, OFFICE_LOCATION.latitude, OFFICE_LOCATION.longitude)) : 25
    });

    if (
      record &&
      record.checkInTime &&
      !record.checkOutTime
    ) {
      if (record.currentState === 'PENDING_FINAL_EXIT' || record.currentState === 'PENDING_EXIT_CONFIRMATION' || record.currentState === 'PENDING_AUTO_CHECKOUT') {
        const timeStr = getFormattedTimeStr(timestamp);
        const eventIso = timestamp.toISOString();
        const existingTimestampMs = record.geofenceExitTimestamp ? new Date(record.geofenceExitTimestamp).getTime() : Infinity;
        const newTimestampMs = timestamp.getTime();

        if (!record.geofenceExitTime || !record.recordedExitTime || newTimestampMs < existingTimestampMs) {
          record.geofenceExitTime = timeStr;
          record.geofenceExitTimestamp = eventIso;
          record.recordedExitTime = timeStr;
          record.exitDetectedAt = eventIso;
          record.exitDetectedTime = timeStr;
          record.exitDetectionSource = isNativeEvent ? 'NATIVE_GEOFENCE' : 'AUTO_GEOFENCE';
          record.lastExitTime = timeStr;
          record.exitTime = record.exitTime || timeStr;
          record.pendingCheckoutConfirmation = true;
          record.currentState = 'PENDING_AUTO_CHECKOUT';
          record.checkoutStatus = 'PENDING_AUTO_CHECKOUT';
          saveAttendanceRecord(record);
          console.log('[AUTO_EXIT_PENDING]', {
            employeeId,
            exitTime: timeStr,
            source: record.exitDetectionSource
          });
          console.log('[AUTO_EXIT_AUTHORITATIVE_TIMESTAMP_UPDATED]', {
            employeeId,
            geofenceExitTime: timeStr,
            recordedExitTime: timeStr,
            geofenceExitTimestamp: eventIso,
            isNativeEvent
          });
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record } }));
          window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
        }
        return record;
      }

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
   * Confirms employee checkout when the mandatory popup "Confirm Checkout" button is clicked.
   * The final checkout time is authoritative and set to the exact geofenceExitTime.
   */
  confirmCheckoutFromExit(
    employeeId: string,
    dateStr: string,
    currentCoords?: { latitude: number; longitude: number },
    currentTownCity?: string
  ): AttendanceRecord | null {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record || (record.checkOutTime && (record.checkoutStatus === 'FINALIZED' || record.checkoutStatus === 'COMPLETED'))) {
      return record;
    }

    // Authoritative checkout time MUST be the previously captured recordedExitTime / geofenceExitTime
    const nativeExitTime = record.recordedExitTime || record.geofenceExitTime;

    if (!nativeExitTime) {
      // Rule 9 & 10: If no native exit event exists, recordedExitTime MUST remain NULL and transition to UNRESOLVED workflow
      record.recordedExitTime = null;
      record.geofenceExitTime = null;
      record.checkOutTime = null;
      record.checkoutStatus = 'UNRESOLVED';
      record.attendanceStatus = 'UNRESOLVED';
      record.status = 'UNRESOLVED';
      record.currentState = 'UNRESOLVED';
      record.pendingCheckoutConfirmation = false;
      record.checkoutFinalizationSource = 'NONE';
      saveAttendanceRecord(record);
      logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `No native exit event recorded for ${dateStr}. Transitioned session to UNRESOLVED workflow.`);
      return record;
    }

    const checkoutTimeStr = nativeExitTime;
    const eventIso = new Date().toISOString();
    const eventId = generateIdempotentEventId(employeeId, dateStr, 'CHECK_OUT', checkoutTimeStr);

    const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);

    record.checkOutTime = checkoutTimeStr;
    record.checkOutMode = 'AUTO_SYSTEM';
    record.checkoutType = 'AUTO_CHECKOUT';
    record.checkoutSource = 'EXIT_DETECTED';
    record.attendanceStatus = 'RESOLVED';
    record.checkoutStatus = 'FINALIZED';
    record.checkoutFinalizationSource = 'CONFIRMED_NATIVE_EXIT';
    record.confirmationCompletedAt = eventIso;
    record.status = 'completed';
    record.workingHours = workingHours;
    record.currentState = 'FINALIZED_CHECKOUT';
    record.pendingCheckoutConfirmation = false;
    record.checkoutConfirmed = true;
    record.checkoutFinalized = true;
    record.returningToOffice = false;
    record.syncStatus = 'Pending';
    record.resolutionSource = 'AUTO_GEOFENCE';

    if (currentCoords && currentCoords.latitude && currentCoords.longitude) {
      record.checkoutLatitude = currentCoords.latitude;
      record.checkoutLongitude = currentCoords.longitude;
      record.checkoutTownCity = currentTownCity || 'Raniganj HQ';
    }

    record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));

    saveAttendanceRecord(record);
    markEventIdProcessed(eventId);

    logAttendanceEvent('CHECKOUT_CREATED', employeeId, `Employee confirmed checkout for geofence exit at ${checkoutTimeStr}`, {
      eventId,
      eventTimestamp: eventIso,
      metadata: {
        geofenceExitTime: checkoutTimeStr,
        recordedExitTime: record.recordedExitTime,
        checkoutFinalizationSource: 'CONFIRMED_NATIVE_EXIT',
        confirmedAt: eventIso
      }
    });

    createNotification({
      recipientEmployeeCode: employeeId,
      type: 'ATTENDANCE_CHECK_OUT',
      category: 'ATTENDANCE',
      priority: 'LOW',
      title: 'Checkout Confirmed',
      message: `Your check-out at ${checkoutTimeStr} has been confirmed. Total working hours: ${workingHours || '--'}.`,
      entityId: record.id,
      entityType: 'ATTENDANCE'
    }).catch((e) => console.warn('Notification error:', e));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on checkout confirmation:', e));
    }

    return record;
  },

  /**
   * Sets the attendance session to Returning to Office when the mandatory popup "Returning to Office" button is clicked.
   * Keeps the attendance session active and clears the popup state.
   */
  setReturningToOffice(
    employeeId: string,
    dateStr: string
  ): AttendanceRecord | null {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record || record.checkOutTime) {
      return record;
    }

    record.pendingCheckoutConfirmation = false;
    record.returningToOffice = true;
    record.currentState = 'RETURNING_TO_OFFICE';
    record.syncStatus = 'Pending';

    saveAttendanceRecord(record);

    logAttendanceEvent('GEOFENCE_EXIT', employeeId, `Employee indicated returning to office (exit recorded at ${record.recordedExitTime || record.geofenceExitTime || record.exitTime}). Active attendance session preserved.`, {
      metadata: {
        geofenceExitTime: record.geofenceExitTime,
        recordedExitTime: record.recordedExitTime,
        action: 'RETURNING_TO_OFFICE'
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on returning to office:', e));
    }

    return record;
  },

  /**
   * Submits checkout time provided by the employee when no automatic exit event was detected.
   * Marks the session as UNRESOLVED with verificationStatus: 'PENDING' for admin review.
   * Crucially, the employee's workflow is not blocked.
   */
  submitEmployeeCheckoutTime(
    employeeId: string,
    dateStr: string,
    checkoutTimeStr: string,
    isNextDay: boolean = false
  ): AttendanceRecord | null {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record) return null;

    const eventIso = new Date().toISOString();
    const workingHours = record.checkInTime ? calculateWorkingHours(record.checkInTime, checkoutTimeStr) : null;

    record.checkOutTime = checkoutTimeStr;
    record.employeeProvidedCheckoutTime = checkoutTimeStr;
    record.employeeProposedCheckoutTime = checkoutTimeStr;
    record.checkoutSource = 'EMPLOYEE_REPORTED';
    record.resolutionSource = 'EMPLOYEE_PROPOSED';
    record.checkoutStatus = 'UNRESOLVED';
    record.attendanceStatus = 'UNRESOLVED';
    record.status = 'UNRESOLVED';
    record.currentState = 'UNRESOLVED';
    record.verificationStatus = 'PENDING';
    record.workingHours = workingHours;
    record.pendingCheckoutConfirmation = false;
    record.checkoutConfirmed = true;
    record.checkoutFinalized = false;
    record.returningToOffice = false;
    record.resolutionReason = 'Checkout time provided by employee after missing automatic checkout detection.';
    record.syncStatus = 'Pending';
    record.updatedAt = eventIso;

    saveAttendanceRecord(record);

    if (isNextDay) {
      console.log('[UNRESOLVED_CHECKOUT_TIME_PROVIDED_NEXT_DAY]', {
        employeeId,
        previousDate: dateStr,
        checkoutTime: checkoutTimeStr
      });
    } else {
      console.log('[UNRESOLVED_CHECKOUT_TIME_PROVIDED]', {
        employeeId,
        attendanceDate: dateStr,
        checkoutTime: checkoutTimeStr
      });
    }

    logAttendanceEvent('CHECKOUT_CREATED', employeeId, `Employee entered checkout time ${checkoutTimeStr}. Session marked UNRESOLVED pending admin verification.`, {
      eventTimestamp: eventIso,
      metadata: {
        checkoutTime: checkoutTimeStr,
        isNextDay,
        checkoutStatus: 'UNRESOLVED',
        verificationStatus: 'PENDING'
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
    }

    if (typeof navigator !== 'undefined' && navigator.onLine) {
      syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on employee checkout time submit:', e));
    }

    return record;
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

    // Only finalize if state is PENDING_FINAL_EXIT / PENDING_EXIT_CONFIRMATION or they have an exit recorded
    if (
      record.currentState === 'PENDING_FINAL_EXIT' ||
      record.currentState === 'PENDING_EXIT_CONFIRMATION' ||
      record.currentState === 'RETURNING_TO_OFFICE' ||
      record.recordedExitTime ||
      record.geofenceExitTime ||
      record.lastExitTime ||
      record.exitTime
    ) {
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
   * Settles unresolved sessions at the 23:59 deadline or during past-day recovery
   */
  settleUnresolvedSession(
    employeeId: string,
    dateStr: string,
    timestamp: Date = new Date()
  ): AttendanceRecord | null {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record || (record.checkOutTime && (record.checkoutStatus === 'FINALIZED' || record.checkoutStatus === 'COMPLETED')) || record.attendanceStatus === 'RESOLVED') {
      return null;
    }

    if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
      const hasExitEvent = !!(record.recordedExitTime || record.geofenceExitTime || record.lastExitTime || record.exitTime || record.exitDetectedTime);
      if (hasExitEvent) {
        // CASE 1: Valid final exit exists (Auto finalized at recorded exit time at 11:59 PM settlement)
        const checkoutTimeStr = record.recordedExitTime || record.geofenceExitTime || record.lastExitTime || record.exitTime || record.exitDetectedTime!;
        const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);
        const settledIso = timestamp.toISOString();
        record.checkOutTime = checkoutTimeStr;
        record.settledAt = settledIso;
        record.checkoutStatus = 'FINALIZED';
        record.checkoutFinalizationSource = 'END_OF_DAY_NATIVE_EXIT';
        record.checkoutFinalized = true;
        record.checkoutConfirmed = true;
        record.attendanceStatus = 'RESOLVED';
        record.checkOutMode = 'AUTO_SYSTEM';
        record.checkoutType = 'AUTO_CHECKOUT';
        record.checkoutSource = 'EXIT_DETECTED';
        record.status = 'completed';
        record.workingHours = workingHours;
        record.currentState = 'FINALIZED_CHECKOUT';
        record.pendingCheckoutConfirmation = false;
        record.returningToOffice = false;
        record.resolutionSource = 'AUTO_GEOFENCE';
        console.log('[AUTO_EXIT_SETTLED]', {
          employeeId,
          exitTime: checkoutTimeStr,
          settledAt: settledIso
        });
        console.log('[AUTO_CHECKOUT_FINALIZED]', {
          employeeId,
          date: dateStr,
          distance: record.distance || 0,
          timestamp: settledIso,
          source: 'AUTO_SYSTEM_FINALIZER',
          checkoutFinalizationSource: 'END_OF_DAY_NATIVE_EXIT',
          checkoutTime: checkoutTimeStr
        });
        logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `[AUTO_CHECKOUT_FINALIZED] Settling session for ${dateStr} using recorded exit time: ${checkoutTimeStr} (FINALIZED)`);

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
          message: `Your attendance session for ${dateStr} was finalized at ${checkoutTimeStr} using recorded exit time.`,
          entityId: record.id,
          entityType: 'ATTENDANCE'
        }).catch((e) => console.warn('Notification error on settlement:', e));

        if (navigator.onLine) {
          syncPendingAttendanceRecords().catch((e) => console.warn('Sync error on settlement:', e));
        }

        return record;
      } else {
        // CASE 2 & 3: No exit event recorded
        const settledIso = timestamp.toISOString();
        if (record.checkoutSource === 'EMPLOYEE_REPORTED' || record.employeeProposedCheckoutTime || record.employeeProvidedCheckoutTime) {
          // CASE 2: Employee entered checkout time without native exit: MUST ALWAYS REMAIN UNRESOLVED
          logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `Preserved EMPLOYEE_REPORTED checkout for ${dateStr}. Status remains UNRESOLVED.`);
          record.settledAt = settledIso;
          record.checkoutStatus = 'UNRESOLVED';
          record.attendanceStatus = 'UNRESOLVED';
          record.status = 'UNRESOLVED';
          record.currentState = 'UNRESOLVED';
          record.verificationStatus = record.verificationStatus || 'PENDING';
          record.employeeProvidedCheckoutTime = record.employeeProvidedCheckoutTime || record.employeeProposedCheckoutTime || record.checkOutTime;
          record.checkoutFinalizationSource = 'NONE';
          record.exitDetectionSource = 'NONE';
        } else {
          // CASE 3: No checkout reported, no exit recorded: Mark UNRESOLVED_CHECKOUT, do NOT invent time
          record.checkOutTime = null;
          record.recordedExitTime = null;
          record.geofenceExitTime = null;
          record.settledAt = settledIso;
          record.unresolvedAt = settledIso;
          record.checkoutStatus = 'UNRESOLVED_CHECKOUT';
          record.attendanceStatus = 'UNRESOLVED';
          record.checkoutTownCity = 'Location unavailable';
          delete record.checkoutLatitude;
          delete record.checkoutLongitude;
          delete record.checkoutDistance;
          record.checkOutMode = 'AUTO_SYSTEM';
          record.checkoutType = 'UNRESOLVED';
          record.status = 'UNRESOLVED';
          record.workingHours = null;
          record.currentState = 'UNRESOLVED_CHECKOUT';
          record.checkoutFinalizationSource = 'NONE';
          record.exitDetectionSource = 'NONE';
          record.resolutionSource = null;
          record.resolutionReason = 'A valid checkout timestamp was not detected or supplied.';
          console.log('[UNRESOLVED_CHECKOUT_REQUIRES_INPUT]', {
            employeeId,
            attendanceDate: dateStr
          });
          logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `No valid exit event found for ${dateStr}. Marked checkoutStatus as UNRESOLVED_CHECKOUT.`);

          try {
            const locUnavailKey = `loc_unavail_${employeeId}_${dateStr}`;
            if (localStorage.getItem(locUnavailKey) === 'true') {
              record.checkoutSource = "END_OF_DAY_LOCATION_UNAVAILABLE";
              record.locationUnavailableDuringDay = true;
            }
          } catch (e) {}
        }

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
      // CASE 2: WFH / CLIENT_VISIT / OUTDOOR legit 11:59 PM EOD completion
      const checkoutTimeStr = '11:59 PM';
      const checkoutTypeStr = 'AUTO_CHECKOUT';
      const checkOutModeStr: 'AUTO_SYSTEM' | 'MANUAL' = 'AUTO_SYSTEM';
      logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `Settling WFH/CLIENT_VISIT session for ${dateStr} at 11:59 PM.`);

      const workingHours = calculateWorkingHours(record.checkInTime, checkoutTimeStr);

      record.checkOutTime = checkoutTimeStr;
      record.checkoutStatus = 'FINALIZED';
      record.checkoutFinalizationSource = 'END_OF_DAY_NATIVE_EXIT';
      record.attendanceStatus = 'RESOLVED';
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
