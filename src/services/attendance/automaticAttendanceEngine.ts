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

    const distance = getDistanceFromLatLonInM(
      latitude,
      longitude,
      OFFICE_LOCATION.latitude,
      OFFICE_LOCATION.longitude
    );

    const isInside = distance <= OFFICE_LOCATION.radius;

    // Check if check-in exists for today
    const dateStr = getFormattedDateStr(timestamp);
    const record = getTodayAttendanceRecord(employeeId, dateStr);

    // Dynamic Current Location update on existing record
    if (record) {
      record.currentLatitude = latitude;
      record.currentLongitude = longitude;
      if (typeof accuracy === 'number') {
        record.currentAccuracy = accuracy;
      }
      record.currentDistance = distance;
      record.currentTownCity = (townCity && townCity.trim()) ? townCity.trim() : 'Location name unavailable';
      record.currentLocationTimestamp = timestamp.toISOString();
      record.currentLocationStatus = 'LIVE';
      record.syncStatus = 'Pending';
      saveAttendanceRecord(record);
      if (navigator.onLine) {
        syncPendingAttendanceRecords().catch(() => {});
      }
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

          // Preserve and update last valid exit time while employee remains outside geofence
          const timeStr = getFormattedTimeStr(timestamp);
          if (record.lastExitTime !== timeStr) {
            record.lastExitTime = timeStr;
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
        if (record.currentState === 'CHECKED_IN' || record.currentState === 'ENTERING' || !record.currentState) {
          // State Transition: CHECKED_IN -> PENDING_FINAL_EXIT
          record.lastExitTime = timeStr;
          record.exitTime = record.exitTime || timeStr;
          record.currentState = 'PENDING_FINAL_EXIT';
          record.syncStatus = 'Pending';

          if (coords) {
            record.checkoutLatitude = coords.latitude;
            record.checkoutLongitude = coords.longitude;
            record.checkoutDistance = distance;
            record.checkoutTownCity = townCity || 'Raniganj HQ';
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

        if (source === 'AUTO_SYSTEM_END_OF_DAY') {
          if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
            // Final exit rule: check out at actual final exit timestamp
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
        record.checkoutStatus = 'COMPLETED';
        record.workingHours = workingHours;
        record.currentState = 'FINALIZED_CHECKOUT';

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
   * Settles unresolved sessions at the 23:59 deadline or during past-day recovery
   */
  settleUnresolvedSession(
    employeeId: string,
    dateStr: string,
    timestamp: Date = new Date()
  ): AttendanceRecord | null {
    const record = getTodayAttendanceRecord(employeeId, dateStr);
    if (!record || (record.checkOutTime && record.checkoutStatus === 'COMPLETED')) {
      return null;
    }

    if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
      const hasExitEvent = !!(record.lastExitTime || record.exitTime);
      if (hasExitEvent) {
        // CASE 1: Valid final exit exists
        const checkoutTimeStr = record.lastExitTime || record.exitTime || '11:59 PM';
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
        // DO NOT automatically use 11:59 PM. Mark as UNRESOLVED.
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
      // CASE 2: WFH / CLIENT_VISIT / OUTDOOR legit 11:59 PM EOD completion
      const checkoutTimeStr = '11:59 PM';
      const checkoutTypeStr = 'AUTO_CHECKOUT';
      const checkOutModeStr: 'AUTO_SYSTEM' | 'MANUAL' = 'AUTO_SYSTEM';
      logAttendanceEvent('END_OF_DAY_PROCESSING', employeeId, `Settling WFH/CLIENT_VISIT session for ${dateStr} at 11:59 PM.`);

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
