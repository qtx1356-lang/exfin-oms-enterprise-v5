import {
  AutomaticAttendanceEngine,
  getDistanceFromLatLonInM,
  getFormattedDateStr,
  OFFICE_LOCATION,
} from './automaticAttendanceEngine';
import { getTodayAttendanceRecord } from './attendanceStorage';

/**
 * Attendance rule: the first native RETURN/ENTER event of a day is also the
 * authoritative check-in. The event remains a RETURN for audit purposes, but
 * its native timestamp becomes the check-in timestamp. Later returns are left
 * completely unchanged.
 */
const engine = AutomaticAttendanceEngine as any;

if (!engine.__firstReturnCheckInPatchApplied) {
  const originalProcessGeofenceReturn = engine.processGeofenceReturn.bind(engine);

  engine.processGeofenceReturn = (
    employeeId: string,
    employeeName: string,
    coords: { latitude: number; longitude: number },
    townCity: string,
    timestamp: Date = new Date()
  ) => {
    try {
      const dateStr = getFormattedDateStr(timestamp);
      const record = getTodayAttendanceRecord(employeeId, dateStr);
      const savedCheckIn = (record?.checkInTime || '').trim();
      const hasValidCheckIn = !!savedCheckIn &&
        savedCheckIn !== '--:--' &&
        savedCheckIn !== 'Pending' &&
        savedCheckIn !== 'UNRESOLVED' &&
        savedCheckIn !== 'N/A';

      if (!hasValidCheckIn && coords &&
          Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
        const distance = getDistanceFromLatLonInM(
          coords.latitude,
          coords.longitude,
          OFFICE_LOCATION.latitude,
          OFFICE_LOCATION.longitude
        );

        if (distance <= OFFICE_LOCATION.radius) {
          console.log(
            `[AUTO_FIRST_RETURN_AS_CHECKIN] First return of ${dateStr} becomes check-in at ${timestamp.toISOString()}; native event timestamp is authoritative.`
          );

          // Create the check-in using the exact native RETURN timestamp.
          // Do not use Date.now() or the app-open time.
          engine.processGeofenceEntry(
            employeeId,
            employeeName,
            coords,
            townCity,
            timestamp
          );
        }
      }
    } catch (error) {
      console.warn('[AUTO_FIRST_RETURN_AS_CHECKIN] First-return check-in bridge failed; preserving original return handler:', error);
    }

    // Always run the existing return handler too, so the RETURN event and all
    // later-return behavior remain intact.
    return originalProcessGeofenceReturn(
      employeeId,
      employeeName,
      coords,
      townCity,
      timestamp
    );
  };

  engine.__firstReturnCheckInPatchApplied = true;
}
