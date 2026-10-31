import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { 
  AttendanceRecord, 
  AttendanceObservation, 
  EvidenceSource,
  AttendanceHistoryEvent
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
import { AutomaticAttendanceEngine, appendEventHistory } from './automaticAttendanceEngine';
import { createNotification, dismissUnresolvedNotificationForDate } from '../notification/notificationService';
import { isAdminContextActive, hasValidCheckoutTime } from '../../utils/attendanceUtils';
import { getAuthoritativeExitForCheckout } from '../../utils/forensicAuditUtils';
import { reconcileNativeGeofenceEvents, startNativeActiveSession, cancelPendingNativeExit, getNativeAttendanceState } from './nativeGeofenceBridge';
import { refreshAuthoritativeAttendanceFromServer, startAuthoritativeAttendanceListener } from './adminAttendanceReconciliation';

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

  return null;
};

/**
 * Native App-Resume Attendance Reconciliation
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

      // 0. FIRST: Pull authoritative Admin corrections before any local/native reconciliation.
      // This prevents stale employee-local checkout state from masking an Admin-edited checkout time.
      try {
        const refreshed = await refreshAuthoritativeAttendanceFromServer(employeeId, dateStr);
        if (refreshed?.checkOutTime) {
          console.log('[ResumeReconciliation] Applied authoritative Admin checkout before local reconciliation', {
            employeeId,
            date: dateStr,
            checkOutTime: refreshed.checkOutTime,
          });
        }
        await startAuthoritativeAttendanceListener(employeeId, dateStr);
      } catch (adminSyncErr) {
        console.warn('[ResumeReconciliation] Admin attendance reconciliation warning:', adminSyncErr);
      }

      // 1. FIRST: Reconcile any unconsumed native background geofence events BEFORE evaluating current resume GPS
      try {
        await reconcileNativeGeofenceEvents(employeeId, employeeName, townCity || 'Raniganj HQ');
      } catch (nativeErr) {
        console.warn('[ResumeReconciliation] Native background event reconciliation warning:', nativeErr);
      }

      // 2. Settle any past day unresolved sessions (Previous days protection)
      const allStored = getStoredAttendanceRecords();
      for (const rec of allStored) {
        if (rec.employeeId === employeeId && rec.date < dateStr) {
          if (hasValidCheckoutTime(rec)) {
            dismissUnresolvedNotificationForDate(rec.employeeId, rec.date, rec.id).catch(() => {});
          } else if (!rec.checkOutTime || rec.checkoutStatus !== 'COMPLETED') {
            AutomaticAttendanceEngine.settleUnresolvedSession(rec.employeeId, rec.date, now);
          }
        }
      }

      // 2. Fetch fresh GPS fix
      const pos = await getFreshResumePosition();
      if (!pos) {
        console.warn('[ResumeReconciliation] Could not obtain GPS fix on resume. Retaining current state.');
        const existingRecord = getTodayAttendanceRecord(employeeId, dateStr);
        if (existingRecord && !hasValidCheckoutTime(existingRecord)) {
          if (existingRecord.currentState === 'CHECKED_IN') {
            return existingRecord;
          }
          const exitCheck = getAuthoritativeExitForCheckout(existingRecord, existingRecord.eventHistory || []);
          if (exitCheck.isUnpairedExit && (existingRecord.pendingCheckoutConfirmation || existingRecord.currentState === 'PENDING_AUTO_CHECKOUT' || existingRecord.currentState === 'PENDING_EXIT_CONFIRMATION')) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record: existingRecord } }));
              window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
            }
          }
        }
        return existingRecord;
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
        evidenceSource: 'NATIVE_APP_RESUME_GPS_OBSERVATION'
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
          // Native app resumed inside office -> Auto Check-In on Resume
          logAttendanceEvent('GEOFENCE_ENTER', employeeId, `[NATIVE_APP_RESUME_GPS_OBSERVATION] Detected inside office (${Math.round(distance)}m) on resume. Auto check-in at ${timeStr}.`);

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
            evidenceSource: 'NATIVE_APP_RESUME_GPS_OBSERVATION',
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
            message: `You checked in automatically at ${timeStr}.`,
            entityId: record.id,
            entityType: 'ATTENDANCE'
          }).catch(() => {});

          startNativeActiveSession({
            employeeId,
            employeeName: record.employeeName || employeeName || 'Employee',
            townCity: cleanTown,
            date: dateStr,
            checkInTime: timeStr
          }).catch((err) => console.warn('[NativeGeofenceBridge] Failed to start native active session on resume checkin:', err));

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
        // Ensure native Android layer is synchronized with active session
        if (record.checkInTime && (!record.checkOutTime || record.checkoutStatus !== 'COMPLETED')) {
          startNativeActiveSession({
            employeeId,
            employeeName: record.employeeName || employeeName || 'Employee',
            townCity: cleanTown,
            date: dateStr,
            checkInTime: record.checkInTime
          }).catch(() => {});
        }

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
          // Record app open / resume timestamp separately
          record.appOpenedAt = nowIso;

          // If exit prompt has already been resolved while outside (Stay Active), do NOT prompt again!
          if (
            currentState === 'RETURNING_TO_OFFICE' ||
            currentState === 'EXIT_PROMPT_RESOLVED_OUTSIDE' ||
            record.returningToOffice === true ||
            record.exitPromptResolvedOutside === true
          ) {
            console.log('[GEOFENCE EXIT DEBUG] Exit candidate received');
            console.log(`[GEOFENCE EXIT DEBUG] Distance from office: ${Math.round(distance)}m`);
            console.log(`[GEOFENCE EXIT DEBUG] Current attendance state: ${currentState}`);
            console.log('[GEOFENCE EXIT DEBUG] Exit prompt resolved outside: true');
            console.log('[GEOFENCE EXIT DEBUG] Evaluation result: SUPPRESS_ALREADY_RESOLVED');
            saveAttendanceRecord(record);
            return;
          }

          if (
            currentState === 'CHECKED_IN' || 
            currentState === 'ENTERING' || 
            currentState === 'PENDING_EXIT_CONFIRMATION' ||
            currentState === 'PENDING_AUTO_CHECKOUT' ||
            record.pendingCheckoutConfirmation
          ) {
            // Check if native Android geofence or background location already recorded an authoritative exit time
            const hasExistingExit = !!(record.recordedExitTime || record.geofenceExitTime);

            if (hasExistingExit) {
              // PRESERVE EXISTING AUTHORITATIVE NATIVE EXIT TIME: Do NOT overwrite with resume time!
              const nativeExitTimestamp = record.geofenceExitTimestamp || record.exitDetectedAt || null;
              console.log('[RESUME_EXIT_RECONCILIATION]', {
                employeeId,
                nativeExitTimestamp,
                resumeTimestamp: nowIso,
                decision: 'PRESERVE_AUTHORITATIVE_EXIT'
              });
              logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[NATIVE_APP_RESUME_GPS_OBSERVATION] App opened at ${timeStr} outside office. Preserving authoritative native exit time: ${record.recordedExitTime || record.geofenceExitTime}.`);

              record.pendingCheckoutConfirmation = true;
              record.pendingCheckoutEventId = generateIdempotentEventId(employeeId, dateStr, 'GEOFENCE_EXIT', record.geofenceExitTimestamp || record.exitDetectedAt || nowIso);
              record.returningToOffice = false;
              record.currentState = 'PENDING_AUTO_CHECKOUT';
              record.checkoutStatus = 'PENDING_AUTO_CHECKOUT';
              record.exitDetectionSource = record.exitDetectionSource || 'NATIVE_GEOFENCE';
              record.evidenceSource = record.evidenceSource || 'NATIVE_GEOFENCE';
              record.syncStatus = 'Pending';

              if (!record.checkoutLatitude && pos) {
                record.checkoutLatitude = pos.latitude;
                record.checkoutLongitude = pos.longitude;
                record.checkoutDistance = distance;
                record.checkoutTownCity = cleanTown;
              }

              modified = true;

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record } }));
                window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
              }
            } else {
              // CASE C: Native app resumed outside without a recorded native exit event
              // NO PRIOR NATIVE EXIT RECORDED: DO NOT fabricate exit timestamp from app open time!
              console.log('[CHECKOUT_NOT_DETECTED]', {
                employeeId,
                attendanceDate: dateStr,
                currentDistance: Math.round(distance)
              });
              console.log('[RESUME_EXIT_RECONCILIATION]', {
                employeeId,
                nativeExitTimestamp: null,
                resumeTimestamp: nowIso,
                decision: 'NO_NATIVE_EVENT_UNRESOLVED'
              });
              logAttendanceEvent('GEOFENCE_EXIT', employeeId, `[NATIVE_APP_RESUME_GPS_OBSERVATION] App opened outside office at ${timeStr}. Checkout not detected. Showing non-blocking checkout recovery prompt.`);

              // Do not wipe historical exit fields if they already exist
              record.recordedExitTime = record.recordedExitTime || null;
              record.geofenceExitTime = record.geofenceExitTime || null;
              record.geofenceExitTimestamp = record.geofenceExitTimestamp || null;
              record.lastExitTime = record.lastExitTime || null;
              record.exitTime = record.exitTime || null;
              record.exitDetectedAt = record.exitDetectedAt || null;
              record.exitDetectedTime = record.exitDetectedTime || null;
              record.exitDetectionSource = record.exitDetectionSource || 'NONE';
              record.pendingCheckoutConfirmation = true;
              record.pendingCheckoutEventId = generateIdempotentEventId(employeeId, dateStr, 'GEOFENCE_EXIT', nowIso);
              record.returningToOffice = false;
              record.currentState = 'CHECKOUT_NOT_DETECTED';
              record.checkoutStatus = 'UNRESOLVED';
              record.attendanceStatus = 'UNRESOLVED';
              record.status = 'UNRESOLVED';
              record.checkoutFinalizationSource = 'NONE';
              record.syncStatus = 'Pending';

              if (!record.checkoutLatitude && pos) {
                record.checkoutLatitude = pos.latitude;
                record.checkoutLongitude = pos.longitude;
                record.checkoutDistance = distance;
                record.checkoutTownCity = cleanTown;
              }

              modified = true;

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record } }));
                window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
              }
            }
          }
        } else {
          // Employee is now INSIDE office
          if (
            currentState === 'PENDING_FINAL_EXIT' ||
            currentState === 'PENDING_EXIT_CONFIRMATION' ||
            currentState === 'PENDING_AUTO_CHECKOUT' ||
            currentState === 'CHECKOUT_NOT_DETECTED' ||
            currentState === 'RETURNING_TO_OFFICE' ||
            currentState === 'EXIT_PROMPT_RESOLVED_OUTSIDE' ||
            record.pendingCheckoutConfirmation ||
            record.returningToOffice ||
            record.exitPromptResolvedOutside ||
            record.lastExitTime ||
            record.geofenceExitTime ||
            record.recordedExitTime
          ) {
            console.log('[GEOFENCE EXIT DEBUG] Confirmed re-entry to 25m detected -> re-arming exit detection');
            console.log('[GEOFENCE EXIT DEBUG] Exit state reset: EXIT_PROMPT_RESOLVED_OUTSIDE cleared');

            // A resume-time GPS fix proves only that the employee is inside NOW.
            // It cannot establish when the 25m boundary was crossed while the app was closed.
            // On Android, keep this as an observation and wait for the native geofence/
            // foreground-service event to supply the immutable return event timestamp.
            if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
              record.returnObservationAt = pos.timestamp > 0 ? new Date(pos.timestamp).toISOString() : nowIso;
              record.returnObservationSource = 'NATIVE_APP_RESUME_GPS_OBSERVATION';
              record.currentState = 'CHECKED_IN';
              record.pendingCheckoutConfirmation = false;
              record.pendingCheckoutEventId = null;
              record.returningToOffice = false;
              record.exitPromptResolvedOutside = false;
              record.checkoutStatus = undefined;
              record.checkOutTime = null;
              record.evidenceSource = 'NATIVE_APP_RESUME_GPS_OBSERVATION';
              record.syncStatus = 'Pending';
              modified = true;

              // Do not append GEOFENCE_RETURN to eventHistory, set lastReturnTime,
              // enqueue a synthetic return, or clear the native pending exit here.
              // The native monitor remains armed to record the actual boundary return.
              logAttendanceEvent('RETURN_DETECTED', employeeId, '[NATIVE_APP_RESUME_GPS_OBSERVATION] Employee observed inside on resume; awaiting native boundary timestamp for forensic return event.');
            } else {
              // Return to office transition: Restore CHECKED_IN
              const eventId = generateIdempotentEventId(employeeId, dateStr, 'GEOFENCE_RETURN', timeStr);
  
              record.returnTime = timeStr;
              record.lastReturnTime = timeStr;
              record.lastReturnAt = nowIso;
  
              // CRITICAL BUG FIX: DO NOT clear lastExitTime, lastExitAt, or exitTime!
              // Retain historical exit timestamps for Admin Forensic Audit
              record.pendingCheckoutConfirmation = false;
              record.pendingCheckoutEventId = null;
              record.returningToOffice = false;
              record.exitPromptResolvedOutside = false;
              record.lastActedExitEventId = null;
              record.currentState = 'CHECKED_IN';
              record.checkoutStatus = undefined;
              record.checkOutTime = null;
              record.evidenceSource = 'NATIVE_APP_RESUME_GPS_OBSERVATION';
              record.syncStatus = 'Pending';
  
              delete record.checkoutLatitude;
              delete record.checkoutLongitude;
              delete record.checkoutDistance;
              delete record.checkoutTownCity;
  
              const returnHistEvent: AttendanceHistoryEvent = {
                eventId,
                employeeId,
                eventType: 'GEOFENCE_RETURN',
                eventTime: timeStr,
                timestamp: nowIso,
                source: 'NATIVE_APP_RESUME_GPS_OBSERVATION',
                location: pos ? {
                  latitude: pos.latitude,
                  longitude: pos.longitude,
                  distance,
                  townCity: cleanTown
                } : undefined,
                distance
              };
              record.eventHistory = appendEventHistory(record.eventHistory, returnHistEvent);
  
              record.returnObservations = [...(record.returnObservations || []), observation];
              record.processedEvents = Array.from(new Set([...(record.processedEvents || []), eventId]));
  
              enqueueAttendanceEvent({
                eventId,
                employeeId,
                attendanceDate: dateStr,
                eventType: 'GEOFENCE_RETURN',
                eventTime: timeStr,
                createdAt: nowIso,
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
  
              cancelPendingNativeExit().catch(() => {});
  
              logAttendanceEvent('RETURN_DETECTED', employeeId, `[NATIVE_APP_RESUME_GPS_OBSERVATION] Detected return to office (${Math.round(distance)}m) on resume at ${timeStr}. Restored CHECKED_IN.`);
  
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
              }
  
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

      if (record && (record.pendingCheckoutConfirmation || record.currentState === 'PENDING_AUTO_CHECKOUT' || record.currentState === 'PENDING_EXIT_CONFIRMATION') && !hasValidCheckoutTime(record)) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('exfin-checkout-confirmation-needed', { detail: { employeeId, record } }));
          window.dispatchEvent(new CustomEvent('exfin-attendance-updated'));
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
