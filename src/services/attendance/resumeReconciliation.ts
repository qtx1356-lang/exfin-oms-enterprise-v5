import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { 
  AttendanceRecord, 
  AttendanceObservation, 
  EvidenceSource 
} from '../../types/attendance';
import { 
  OFFICE_LOCATION, 
  getDistanceFromLatLonInM, 
  getFormattedDateStr, 
  getFormattedTimeStr,
  generateUUID 
} from './smartAttendanceEngine';
import { 
  getTodayAttendanceRecord, 
  saveAttendanceRecord, 
  getStoredAttendanceRecords 
} from './attendanceStorage';
import { 
  generateIdempotentEventId, 
  enqueueAttendanceEvent, 
  markEventIdProcessed 
} from './attendanceEventQueue';
import { logAttendanceEvent } from './attendanceLogger';
import { syncPendingAttendanceRecords } from './syncEngine';
import { updateLiveEmployeeLocation } from '../location/liveLocationService';
import { AutomaticAttendanceEngine } from './automaticAttendanceEngine';
import { createNotification } from '../notification/notificationService';
import { isAdminContextActive } from '../../utils/attendanceUtils';

let activeResumePromise: Promise<AttendanceRecord | null> | null = null;

/**
 * Fetches high-accuracy GPS fix with graceful fallback
 */
const getFreshResumePosition = async (): Promise<{
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
} | null> => {
  try {
    if (Capacitor.isNativePlatform()) {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 0
      });
      if (pos?.coords) {
        return {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now()
        };
      }
    }
  } catch (nativeErr) {
    console.warn('[ResumeReconciliation] Native GPS error:', nativeErr);
  }

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const webPos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 7000,
          maximumAge: 0
        });
      });
      if (webPos?.coords) {
        return {
          latitude: webPos.coords.latitude,
          longitude: webPos.coords.longitude,
          accuracy: webPos.coords.accuracy,
          timestamp: webPos.timestamp || Date.now()
        };
      }
    } catch (webErr) {
      console.warn('[ResumeReconciliation] Web Geolocation error:', webErr);
    }
  }

  return null;
};

/**
 * Authoritative PWA-Resume Attendance Reconciliation
 * 
 * Reconciles local attendance state on app resume (visibilitychange, focus, pageshow, online, app boot)
 * without fabricating past unobserved timestamps. Uses the first fresh observation upon resume.
 */
export const reconcileAttendanceOnResume = async (
  employeeId: string,
  employeeName: string,
  townCity: string = 'Raniganj HQ'
): Promise<AttendanceRecord | null> => {
  if (!employeeId || isAdminContextActive()) {
    return null;
  }

  if (activeResumePromise) {
    console.log('[ResumeReconciliation] Single-flight lock active, awaiting existing reconciliation.');
    return activeResumePromise;
  }

  activeResumePromise = (async () => {
    try {
      const now = new Date();
      const dateStr = getFormattedDateStr(now);
      const timeStr = getFormattedTimeStr(now);
      const nowIso = now.toISOString();

      // 1. Settle any past day unresolved sessions (Previous days protection)
      const allStored = getStoredAttendanceRecords();
      for (const rec of allStored) {
        if (rec.employeeId === employeeId && rec.date < dateStr) {
          if (!rec.checkOutTime || rec.checkoutStatus !== 'COMPLETED') {
            AutomaticAttendanceEngine.settleUnresolvedSession(rec.employeeId, rec.date, now);
          }
        }
      }

      // 2. Fetch fresh GPS fix
      const pos = await getFreshResumePosition();
      if (!pos) {
        console.warn('[ResumeReconciliation] Could not obtain GPS fix on resume. Retaining current state.');
        return getTodayAttendanceRecord(employeeId, dateStr);
      }

      const distance = getDistanceFromLatLonInM(
        pos.latitude,
        pos.longitude,
        OFFICE_LOCATION.latitude,
        OFFICE_LOCATION.longitude
      );

      const isInside = distance <= OFFICE_LOCATION.radius;
      const cleanTown = townCity && townCity.trim() ? townCity.trim() : 'Raniganj HQ';

      const observation: AttendanceObservation = {
        timestamp: nowIso,
        timeStr,
        latitude: pos.latitude,
        longitude: pos.longitude,
        distance,
        accuracy: pos.accuracy,
        townCity: cleanTown,
        isInsideOffice: isInside,
        evidenceSource: 'PWA_RESUME_GPS'
      };

      // Independent Live Location Update
      updateLiveEmployeeLocation({
        employeeId,
        employeeName,
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        distanceFromOffice: distance,
        townCity: cleanTown,
        timestamp: now
      }).catch(() => {});

      let record = getTodayAttendanceRecord(employeeId, dateStr);

      // CASE A: No Attendance Record for Today yet
      if (!record) {
        if (isInside) {
          // Employee opened PWA inside office -> Auto Check-In on Resume
          logAttendanceEvent('GEOFENCE_ENTER', employeeId, `[PWA_RESUME_GPS] Detected inside office (${Math.round(distance)}m) on resume. Auto check-in at ${timeStr}.`);

          const eventId = generateIdempotentEventId(employeeId, dateStr, 'CHECK_IN', timeStr);
          const docId = `${employeeId}_${dateStr}`;

          record = {
            id: generateUUID(),
            docId,
            employeeId,
            employeeName,
            date: dateStr,
            attendanceType: 'OFFICE',
            checkInTime: timeStr,
            checkOutTime: null,
            workingHours: null,
            latitude: pos.latitude,
            longitude: pos.longitude,
            distance,
            townCity: cleanTown,
            checkInMode: 'AUTO',
            checkOutMode: 'N/A',
            exitTime: null,
            returnTime: null,
            reason: null,
            reminderCount: 0,
            createdAtDeviceTime: nowIso,
            syncStatus: 'Pending',
            serverSyncTime: null,
            isOffline: !navigator.onLine,
            currentState: 'CHECKED_IN',
            processedEvents: [eventId],
            evidenceSource: 'PWA_RESUME_GPS',
            lastObservation: observation,

            // Permanent Check-In Coordinates
            checkInLatitude: pos.latitude,
            checkInLongitude: pos.longitude,
            checkInDistance: distance,
            checkInTownCity: cleanTown,

            // Current Coordinates
            currentLatitude: pos.latitude,
            currentLongitude: pos.longitude,
            currentDistance: distance,
            currentTownCity: cleanTown,
            currentLocationTimestamp: nowIso,
            currentLocationStatus: 'LIVE'
          };

          saveAttendanceRecord(record);
          markEventIdProcessed(eventId);

          enqueueAttendanceEvent({
            eventId,
            employeeId,
            attendanceDate: dateStr,
            eventType: 'CHECK_IN',
            eventTime: timeStr,
            location: {
              latitude: pos.latitude,
              longitude: pos.longitude,
              townCity: cleanTown,
              distance
            },
            attendanceMode: 'OFFICE',
            source: 'AUTO_GEOFENCE'
          });

          createNotification({
            recipientEmployeeCode: employeeId,
            type: 'ATTENDANCE_CHECK_IN',
            category: 'ATTENDANCE',
            priority: 'LOW',
            title: 'Attendance Check-In Logged',
            message: `You checked in automatically at ${timeStr} (PWA Resume).`,
            entityId: record.id,
            entityType: 'ATTENDANCE'
          }).catch(() => {});

          if (navigator.onLine) {
            syncPendingAttendanceRecords().catch(() => {});
          }

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
          }

          return record;
        } else {
          // No record and outside office -> remain outside
          return null;
        }
      }

      // If record is already finalized/checked out, do not change state
      if (record.checkOutTime && record.checkoutStatus === 'COMPLETED') {
        return record;
      }

      // CASE B: Record exists for Today (OFFICE mode)
      if (record.attendanceType === 'OFFICE' || !record.attendanceType) {
        const currentState = record.currentState || 'CHECKED_IN';
        let modified = false;

        // Update dynamic current location & last observation
        record.currentLatitude = pos.latitude;
        record.currentLongitude = pos.longitude;
        record.currentDistance = distance;
        record.currentTownCity = cleanTown;
        record.currentLocationTimestamp = nowIso;
        record.currentLocationStatus = 'LIVE';
        record.lastObservation = observation;

        if (!isInside) {
          // Employee is now OUTSIDE office
          if (currentState === 'CHECKED_IN' || currentState === 'ENTERING' || currentState === 'RETURNING_TO_OFFICE') {
            // Transition: CHECKED_IN -> PENDING_EXIT_CONFIRMATION
            // NO PAST FABRICATION: The observation time is the authoritative exit time
            const episodeId = `ep_${employeeId}_${dateStr}_exit_${Date.now()}`;
            const eventId = generateIdempotentEventId(employeeId, dateStr, 'GEOFENCE_EXIT', timeStr);

            record.episodeId = episodeId;
            record.lastExitTime = timeStr;
            record.exitTime = record.exitTime || timeStr;
            record.geofenceExitTime = timeStr;
            record.geofenceExitTimestamp = nowIso;
            record.pendingCheckoutConfirmation = true;
            record.returningToOffice = false;
            record.currentState = 'PENDING_EXIT_CONFIRMATION';
            record.evidenceSource = 'PWA_RESUME_GPS';
            record.syncStatus = 'Pending';

            record.checkoutLatitude = pos.latitude;
            record.checkoutLongitude = pos.longitude;
            record.checkoutDistance = distance;
            record.checkoutTownCity = cleanTown;

            record.exitObservations = [...(record.exitObservations || []), observation];
            record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));

            enqueueAttendanceEvent({
              eventId,
              employeeId,
              attendanceDate: dateStr,
              eventType: 'GEOFENCE_EXIT',
              eventTime: timeStr,
              location: {
                latitude: pos.latitude,
                longitude: pos.longitude,
                townCity: cleanTown,
                distance
              },
              attendanceMode: 'OFFICE',
              source: 'AUTO_GEOFENCE'
            });

            markEventIdProcessed(eventId);
            modified = true;

            logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[PWA_RESUME_GPS] Detected exit from office (${Math.round(distance)}m) on resume at ${timeStr}. State: PENDING_EXIT_CONFIRMATION.`);

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record } }));
              window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
            }
          }
        } else {
          // Employee is now INSIDE office
          if (
            currentState === 'PENDING_FINAL_EXIT' ||
            currentState === 'PENDING_EXIT_CONFIRMATION' ||
            currentState === 'RETURNING_TO_OFFICE' ||
            record.pendingCheckoutConfirmation ||
            record.lastExitTime ||
            record.geofenceExitTime
          ) {
            // Return to office transition: Restore CHECKED_IN
            const eventId = generateIdempotentEventId(employeeId, dateStr, 'GEOFENCE_RETURN', timeStr);

            record.returnTime = timeStr;
            record.lastExitTime = null;
            record.exitTime = null;
            record.geofenceExitTime = null;
            record.geofenceExitTimestamp = null;
            record.pendingCheckoutConfirmation = false;
            record.returningToOffice = false;
            record.currentState = 'CHECKED_IN';
            record.evidenceSource = 'PWA_RESUME_GPS';
            record.syncStatus = 'Pending';

            delete record.checkoutLatitude;
            delete record.checkoutLongitude;
            delete record.checkoutDistance;
            delete record.checkoutTownCity;

            record.returnObservations = [...(record.returnObservations || []), observation];
            record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));

            enqueueAttendanceEvent({
              eventId,
              employeeId,
              attendanceDate: dateStr,
              eventType: 'GEOFENCE_RETURN',
              eventTime: timeStr,
              location: {
                latitude: pos.latitude,
                longitude: pos.longitude,
                townCity: cleanTown,
                distance
              },
              attendanceMode: 'OFFICE',
              source: 'AUTO_GEOFENCE'
            });

            markEventIdProcessed(eventId);
            modified = true;

            logAttendanceEvent('RETURN_DETECTED', employeeId, `[PWA_RESUME_GPS] Detected return to office (${Math.round(distance)}m) on resume at ${timeStr}. Restored CHECKED_IN.`);

            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
            }
          } else {
            // Already inside and checked in
            modified = true;
          }
        }

        if (modified) {
          saveAttendanceRecord(record);
          if (navigator.onLine) {
            syncPendingAttendanceRecords().catch(() => {});
          }
        }
      }

      return record;
    } catch (err) {
      console.error('[ResumeReconciliation] Error during resume reconciliation:', err);
      return null;
    } finally {
      activeResumePromise = null;
    }
  })();

  return activeResumePromise;
};
