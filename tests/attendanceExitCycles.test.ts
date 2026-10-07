import { analyzeAttendanceForensics, getAuthoritativeExitForCheckout, getUnresolvedPastAttendanceRecords } from '../src/utils/forensicAuditUtils';
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

// -------------------------------------------------------------
// TEST 7:
// 10:03 AM CHECK-IN -> NO EXIT -> STILL INSIDE (TODAY'S SCENARIO)
// Expected: isUnpairedExit = false, authoritativeExitTime = null, state = INSIDE -> NO POPUP
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '10:03 AM', timestamp: '2026-10-06T04:33:00.000Z', source: 'FOREGROUND_GPS' },
  ];

  const record = {
    id: 'att_7',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '10:03 AM',
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    lastExitTime: null,
    lastExitAt: null,
    lastReturnTime: null,
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === null, 'Test 7: Authoritative exit is NULL when employee remains inside');
  assert(res.isUnpairedExit === false, 'Test 7: isUnpairedExit is FALSE (NO POPUP)');
  assert(res.currentGeofenceState === 'INSIDE', 'Test 7: Current state must be INSIDE');

  const forensic = analyzeAttendanceForensics(record, events);
  assert(forensic.lastExitDisplay === '—', 'Test 7: Last exit display is —');
  assert(forensic.lastReturnDisplay === '—', 'Test 7: Last return display is —');
  assert(forensic.activeCycle === null, 'Test 7: Active cycle is null');
}

// -------------------------------------------------------------
// TEST 8:
// PREVIOUS DAY: CHECK-IN 10:03 AM, NO EXIT
// Expected: getUnresolvedPastAttendanceRecords MUST NOT return this record (NO POPUP)
// -------------------------------------------------------------
{
  const pastEvents: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '10:03 AM', timestamp: '2026-10-05T04:33:00.000Z', source: 'FOREGROUND_GPS' },
  ];

  const pastRecord = {
    id: 'att_prev_no_exit',
    employeeId: 'EMP01',
    date: '2026-10-05',
    checkInTime: '10:03 AM',
    checkOutTime: null,
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    eventHistory: pastEvents,
  } as unknown as AttendanceRecord;

  const unresolved = getUnresolvedPastAttendanceRecords([pastRecord], ['EMP01'], '2026-10-06');
  assert(unresolved.length === 0, 'Test 8: Previous day with CHECK-IN and NO EXIT must NOT trigger popup (unresolved = 0)');
}

// -------------------------------------------------------------
// TEST 9:
// PREVIOUS DAY: CHECK-IN 10:03 AM, VALID EXIT 06:17 PM, NO RETURN, exitTime MISSING
// Expected: getUnresolvedPastAttendanceRecords MUST return this record (TRIGGER POPUP)
// -------------------------------------------------------------
{
  const pastEvents: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '10:03 AM', timestamp: '2026-10-05T04:33:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '06:17 PM', timestamp: '2026-10-05T12:47:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const pastRecord = {
    id: 'att_prev_with_exit',
    employeeId: 'EMP01',
    date: '2026-10-05',
    checkInTime: '10:03 AM',
    checkOutTime: null,
    attendanceType: 'OFFICE',
    currentState: 'PENDING_AUTO_CHECKOUT',
    lastExitTime: '06:17 PM',
    lastExitAt: '2026-10-05T12:47:00.000Z',
    eventHistory: pastEvents,
  } as unknown as AttendanceRecord;

  const unresolved = getUnresolvedPastAttendanceRecords([pastRecord], ['EMP01'], '2026-10-06');
  assert(unresolved.length === 1, 'Test 9: Previous day with VALID EXIT and missing checkout MUST trigger popup (unresolved = 1)');
  assert(unresolved[0].date === '2026-10-05', 'Test 9: Date is 2026-10-05');
}

// -------------------------------------------------------------
// TEST 10:
// 10:03 CHECK-IN -> EXIT 14:03 -> RETURN 14:30 -> EMPLOYEE STILL INSIDE
// Expected: NO POPUP (all exits are closed/paired)
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '10:03 AM', timestamp: '2026-10-06T04:33:00.000Z', source: 'FOREGROUND_GPS' },
    { eventId: 'e2', employeeId: 'EMP01', eventType: 'GEOFENCE_EXIT', eventTime: '02:03 PM', timestamp: '2026-10-06T08:33:00.000Z', source: 'NATIVE_GEOFENCE' },
    { eventId: 'e3', employeeId: 'EMP01', eventType: 'GEOFENCE_RETURN', eventTime: '02:30 PM', timestamp: '2026-10-06T09:00:00.000Z', source: 'NATIVE_GEOFENCE' },
  ];

  const record = {
    id: 'att_10',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '10:03 AM',
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    lastExitTime: '02:03 PM',
    lastExitAt: '2026-10-06T08:33:00.000Z',
    lastReturnTime: '02:30 PM',
    lastReturnAt: '2026-10-06T09:00:00.000Z',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === null, 'Test 10: Authoritative exit is null after returning');
  assert(res.isUnpairedExit === false, 'Test 10: isUnpairedExit is FALSE (NO POPUP)');
  assert(res.currentGeofenceState === 'INSIDE', 'Test 10: Current state is INSIDE');
}

// -------------------------------------------------------------
// TEST 11:
// REPEATED APP RESUME WHILE EMPLOYEE REMAINS INSIDE
// Expected: isUnpairedExit remains false, state remains INSIDE, NO POPUP
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '10:03 AM', timestamp: '2026-10-06T04:33:00.000Z', source: 'FOREGROUND_GPS' },
  ];

  const record = {
    id: 'att_11',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '10:03 AM',
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    eventHistory: events,
  } as unknown as AttendanceRecord;

  for (let resumeCount = 1; resumeCount <= 5; resumeCount++) {
    const res = getAuthoritativeExitForCheckout(record, events);
    assert(res.authoritativeExitTime === null, `Test 11 (Resume #${resumeCount}): Authoritative exit is null`);
    assert(res.isUnpairedExit === false, `Test 11 (Resume #${resumeCount}): isUnpairedExit is false (NO POPUP)`);
    assert(res.currentGeofenceState === 'INSIDE', `Test 11 (Resume #${resumeCount}): State is INSIDE`);
  }
}

// -------------------------------------------------------------
// TEST 12:
// NETWORK TEMPORARILY OFFLINE / LOCATION UNAVAILABLE WHILE INSIDE
// Expected: NO FALSE EXIT, NO FALSE CHECKOUT
// -------------------------------------------------------------
{
  const events: AttendanceHistoryEvent[] = [
    { eventId: 'e1', employeeId: 'EMP01', eventType: 'CHECK_IN', eventTime: '10:03 AM', timestamp: '2026-10-06T04:33:00.000Z', source: 'FOREGROUND_GPS' },
  ];

  const record = {
    id: 'att_12',
    employeeId: 'EMP01',
    date: '2026-10-06',
    checkInTime: '10:03 AM',
    attendanceType: 'OFFICE',
    currentState: 'CHECKED_IN',
    isOffline: true,
    eventHistory: events,
  } as unknown as AttendanceRecord;

  const res = getAuthoritativeExitForCheckout(record, events);
  assert(res.authoritativeExitTime === null, 'Test 12: Offline status does not create false exit');
  assert(res.isUnpairedExit === false, 'Test 12: isUnpairedExit is false');
  assert(res.currentGeofenceState === 'INSIDE', 'Test 12: Employee remains INSIDE');
}

console.log('\n=== ALL 12 TESTS PASSED SUCCESSFULLY! ===\n');
