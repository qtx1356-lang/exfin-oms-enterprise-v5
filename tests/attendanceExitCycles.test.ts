import { analyzeAttendanceForensics, getAuthoritativeExitForCheckout } from '../src/utils/forensicAuditUtils';
import { AttendanceRecord, AttendanceHistoryEvent } from '../src/types/attendance';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`TEST FAILED: ${msg}`);
  }
  console.log(`✓ PASS: ${msg}`);
}

console.log('=== RUNNING MULTIPLE EXIT/RETURN CYCLE TESTS ===\n');

// -------------------------------------------------------------
// TEST 1:
// EXIT 14:03 (02:03 PM) -> RETURN 14:30 (02:30 PM) -> EXIT 18:17 (06:17 PM) -> NO RETURN
// Expected: checkout = 06:17 PM (18:17)
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '09:55 AM', timestamp: '2026-10-06T04:25:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '02:03 PM', timestamp: '2026-10-06T08:33:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e3', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '02:30 PM', timestamp: '2026-10-06T09:00:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e4', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_1',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '09:55 AM',
    attendanceType: 'OFFICE',
    currentState: 'PENDING_AUTO_CHECKOUT',
    lastExitTime: '06:17 PM',
    lastExitAt: '2026-10-06T12:47:00.000Z',
    lastReturnTime: '02:30 PM',
    lastReturnAt: '2026-10-06T09:00:00.000Z',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === '06:17 PM', 'Test 1: Checkout must be 06:17 PM');
  assert(res.isUnpairedExit === true, 'Test 1: Must be unpaired exit');
  assert(res.currentGeofenceState === 'OUTSIDE', 'Test 1: Current state must be OUTSIDE');

  const forensic = analyzeAttendanceForensics(record, events);
  assert(forensic.lastExitDisplay === '06:17 PM', 'Test 1: Last exit display is 06:17 PM');
  assert(forensic.lastReturnDisplay === 'Pending', 'Test 1: Last return display is Pending (not 02:30 PM)');
}

// -------------------------------------------------------------
// TEST 2:
// EXIT 14:03 -> RETURN 14:30 -> EXIT 18:17 -> RETURN 18:30
// Expected: 18:17 exit is closed by 18:30 return. Checkout must NOT be 18:17.
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '09:55 AM', timestamp: '2026-10-06T04:25:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '02:03 PM', timestamp: '2026-10-06T08:33:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e3', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '02:30 PM', timestamp: '2026-10-06T09:00:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e4', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e5', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '06:30 PM', timestamp: '2026-10-06T13:00:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_2',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '09:55 AM',
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    lastExitTime: '06:17 PM',
    lastExitAt: '2026-10-06T12:47:00.000Z',
    lastReturnTime: '06:30 PM',
    lastReturnAt: '2026-10-06T13:00:00.000Z',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === null, 'Test 2: Authoritative exit is null because employee returned');
  assert(res.isUnpairedExit === false, 'Test 2: No unpaired exit');
  assert(res.currentGeofenceState === 'INSIDE', 'Test 2: Employee is INSIDE office');

  const forensic = analyzeAttendanceForensics(record, events);
  assert(forensic.lastExitDisplay === '06:17 PM', 'Test 2: Last exit is 06:17 PM');
  assert(forensic.lastReturnDisplay === '06:30 PM', 'Test 2: Last return is 06:30 PM');
}

// -------------------------------------------------------------
// TEST 3:
// EXIT 14:03 -> NO RETURN
// Expected: checkout = 14:03 (02:03 PM)
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '09:55 AM', timestamp: '2026-10-06T04:25:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '02:03 PM', timestamp: '2026-10-06T08:33:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_3',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '09:55 AM',
    attendanceType: 'OFFICE',
    currentState: 'PENDING_AUTO_CHECKOUT',
    lastExitTime: '02:03 PM',
    lastExitAt: '2026-10-06T08:33:00.000Z',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === '02:03 PM', 'Test 3: Checkout is 02:03 PM');
  assert(res.isUnpairedExit === true, 'Test 3: Single unpaired exit');
}

// -------------------------------------------------------------
// TEST 4 (CRITICAL REGRESSION TEST):
// EXIT 14:03 -> RETURN 14:30 -> EXIT 18:17 (APP CLOSED) -> NO RETURN
// Expected: checkout = 18:17 (06:17 PM)
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '09:55 AM', timestamp: '2026-10-06T04:25:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '02:03 PM', timestamp: '2026-10-06T08:33:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e3', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '02:30 PM', timestamp: '2026-10-06T09:00:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e4', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_4',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '09:55 AM',
    attendanceType: 'OFFICE',
    currentState: 'PENDING_AUTO_CHECKOUT',
    recordedExitTime: '06:17 PM',
    lastExitTime: '06:17 PM',
    lastExitAt: '2026-10-06T12:47:00.000Z',
    lastReturnTime: null,
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === '06:17 PM', 'Test 4: Checkout MUST be 06:17 PM (NOT 02:03 PM)');
  assert(res.isUnpairedExit === true, 'Test 4: Correctly identified as open exit');
}

// -------------------------------------------------------------
// TEST 5:
// EXIT 14:03 -> RETURN 14:30 -> EXIT 18:17 (APP CLOSED) -> RETURN 18:45
// Expected: 18:17 is paired with 18:45 return. Do not finalize using 14:03.
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '09:55 AM', timestamp: '2026-10-06T04:25:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '02:03 PM', timestamp: '2026-10-06T08:33:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e3', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '02:30 PM', timestamp: '2026-10-06T09:00:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e4', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e5', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '06:45 PM', timestamp: '2026-10-06T13:15:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_5',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '09:55 AM',
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    lastExitTime: '06:17 PM',
    lastExitAt: '2026-10-06T12:47:00.000Z',
    lastReturnTime: '06:45 PM',
    lastReturnAt: '2026-10-06T13:15:00.000Z',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === null, 'Test 5: Do not finalize at 02:03 or 06:17 because employee returned');
  assert(res.currentGeofenceState === 'INSIDE', 'Test 5: Inside office after 06:45 PM return');
}

// -------------------------------------------------------------
// TEST 6:
// Multiple duplicate geofence EXIT callbacks around 18:17
// Expected: One logical exit event.
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '09:55 AM', timestamp: '2026-10-06T04:25:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e3', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-06T12:47:01.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_6',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '09:55 AM',
    attendanceType: 'OFFICE',
    currentState: 'PENDING_AUTO_CHECKOUT',
    lastExitTime: '06:17 PM',
    lastExitAt: '2026-10-06T12:47:00.000Z',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const forensic = analyzeAttendanceForensics(record, events);
  assert(forensic.activeCycle !== null, 'Test 6: Active cycle present');
  assert(forensic.lastExitDisplay === '06:17 PM', 'Test 6: Exit display is 06:17 PM');
}

console.log('\n=== ALL 6 TESTS PASSED SUCCESSFULLY! ===\n');
