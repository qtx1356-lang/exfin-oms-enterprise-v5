import { AttendanceRecord, AttendanceHistoryEvent } from '../types/attendance';
import { isAttendanceTimeInFuture } from './attendanceUtils';

export interface ForensicCycle {
  cycleId: number;
  exitEvent: AttendanceHistoryEvent;
  returnEvent?: AttendanceHistoryEvent | null;
  durationMinutes?: number | null;
  isResolved: boolean;
}

export interface ForensicAuditAnalysis {
  sortedEvents: AttendanceHistoryEvent[];
  cycles: ForensicCycle[];
  currentGeofenceState: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
  lastExitTime: string | null;
  lastExitTimestamp: string | null;
  lastReturnTime: string | null;
  lastReturnTimestamp: string | null;
  lastExitDisplay: string;
  lastReturnDisplay: string;
  isPendingReturn: boolean;
  activeCycle: ForensicCycle | null;
  lastCompletedCycle: ForensicCycle | null;
  totalExits: number;
  totalReturns: number;
}

export function parseEventTimeToMs(timeStr: string | undefined | null, baseDateStr?: string | null): number {
  if (!timeStr) return 0;
  if (timeStr.includes('T') || (timeStr.includes('-') && timeStr.length > 10)) {
    const parsed = new Date(timeStr).getTime();
    if (!isNaN(parsed)) return parsed;
  }

  const today = baseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)
    ? baseDateStr
    : new Date().toISOString().split('T')[0];
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const modifier = match[4]?.toUpperCase();
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    const istParsed = new Date(
      `${today}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}+05:30`
    ).getTime();
    if (!isNaN(istParsed)) return istParsed;
  }

  const fallback = new Date(`${today} ${timeStr}`).getTime();
  return isNaN(fallback) ? 0 : fallback;
}

function getEventCategory(eventType: string): 'CHECK_IN' | 'EXIT' | 'RETURN' | 'STAY_ACTIVE' | 'CHECK_OUT' | 'OTHER' {
  const upper = (eventType || '').toUpperCase();
  if (upper === 'CHECK_IN' || upper.includes('CHECKIN')) return 'CHECK_IN';
  if (upper.includes('EXIT') || upper === 'OUT') return 'EXIT';
  if (upper.includes('RETURN') || upper === 'ENTRY' || upper === 'REENTRY') return 'RETURN';
  if (upper.includes('STAY_ACTIVE') || upper.includes('CANCEL')) return 'STAY_ACTIVE';
  if (upper.includes('CHECK_OUT') || upper.includes('CHECKOUT')) return 'CHECK_OUT';
  return 'OTHER';
}

export function analyzeAttendanceForensics(
  record: AttendanceRecord | null | undefined,
  rawEvents: AttendanceHistoryEvent[] = []
): ForensicAuditAnalysis {
  const baseDate = record?.date || new Date().toISOString().split('T')[0];
  const targetEmpId = (record?.employeeId || (record as any)?.employeeCode || '').trim().toLowerCase();
  const checkInMs = record?.checkInTime ? parseEventTimeToMs(record.checkInTime, baseDate) : 0;
  const allEventsMap = new Map<string, AttendanceHistoryEvent>();

  const isEventMatchingSession = (evt: AttendanceHistoryEvent | null | undefined): boolean => {
    if (!evt) return false;
    if (targetEmpId && evt.employeeId) {
      const eEmp = evt.employeeId.trim().toLowerCase();
      if (eEmp && eEmp !== targetEmpId) return false;
    }
    if (evt.timestamp && evt.timestamp.includes('-')) {
      const evtDate = evt.timestamp.substring(0, 10);
      if (evtDate.length === 10 && evtDate !== baseDate) return false;
    }
    const category = getEventCategory(evt.eventType);
    if ((category === 'EXIT' || category === 'RETURN') && checkInMs > 0) {
      const evtMs = evt.timestamp
        ? parseEventTimeToMs(evt.timestamp, baseDate)
        : parseEventTimeToMs(evt.eventTime, baseDate);
      if (evtMs > 0 && evtMs < checkInMs) return false;
    }
    return true;
  };

  const addEvent = (evt: AttendanceHistoryEvent) => {
    if (!evt || !(evt.eventId || evt.timestamp || evt.eventTime) || !isEventMatchingSession(evt)) return;
    const key = evt.eventId || `${evt.eventType}_${evt.timestamp || evt.eventTime}`;
    allEventsMap.set(key, evt);
  };

  if (Array.isArray(record?.eventHistory)) record.eventHistory.forEach(addEvent);
  if (Array.isArray(rawEvents)) rawEvents.forEach(addEvent);

  // IMPORTANT: eventHistory/rawEvents are the authoritative chronological audit trail.
  // Top-level lastExitTime/lastReturnTime are summaries/caches and may be stale.
  // Never synthesize a second EXIT/RETURN merely because the summary timestamp differs.
  const isCurrentlyCheckedIn = record?.currentState === 'CHECKED_IN';
  const hasHistoricalExitEvent = Array.from(allEventsMap.values()).some(e => getEventCategory(e.eventType) === 'EXIT');
  const hasHistoricalReturnEvent = Array.from(allEventsMap.values()).some(e => getEventCategory(e.eventType) === 'RETURN');

  if (!isCurrentlyCheckedIn && !hasHistoricalExitEvent && (record?.lastExitTime || record?.geofenceExitTime || record?.exitTime)) {
    const exitTime = record.lastExitTime || record.geofenceExitTime || record.exitTime!;
    const exitIso = record.lastExitAt || record.geofenceExitTimestamp || record.exitDetectedAt || null;
    const exitDatePart = exitIso && exitIso.includes('-') ? exitIso.substring(0, 10) : baseDate;
    if (exitDatePart === baseDate) {
      const exitMs = exitIso ? parseEventTimeToMs(exitIso, baseDate) : parseEventTimeToMs(exitTime, baseDate);
      if (checkInMs === 0 || exitMs >= checkInMs) {
        const key = `synth_exit_${exitTime}`;
        allEventsMap.set(key, {
          eventId: key,
          employeeId: record.employeeId || (record as any).employeeCode || 'emp',
          eventType: 'GEOFENCE_EXIT',
          eventTime: exitTime,
          timestamp: exitIso || new Date(exitMs).toISOString(),
          source: (record as any).exitDetectionSource || 'RECORD_STATE'
        });
      }
    }
  }

  if (!hasHistoricalReturnEvent && (record?.lastReturnTime || record?.returnTime)) {
    const returnTime = record.lastReturnTime || record.returnTime!;
    const returnIso = record.lastReturnAt || null;
    const returnDatePart = returnIso && returnIso.includes('-') ? returnIso.substring(0, 10) : baseDate;
    if (returnDatePart === baseDate) {
      const returnMs = returnIso ? parseEventTimeToMs(returnIso, baseDate) : parseEventTimeToMs(returnTime, baseDate);
      if (checkInMs === 0 || returnMs >= checkInMs) {
        const key = `synth_return_${returnTime}`;
        allEventsMap.set(key, {
          eventId: key,
          employeeId: record.employeeId || (record as any).employeeCode || 'emp',
          eventType: 'GEOFENCE_RETURN',
          eventTime: returnTime,
          timestamp: returnIso || new Date(returnMs).toISOString(),
          source: 'RECORD_STATE'
        });
      }
    }
  }

  const enrichedEvents = Array.from(allEventsMap.values()).map(event => {
    let epochMs = event.timestamp ? parseEventTimeToMs(event.timestamp, baseDate) : 0;
    if (!epochMs && event.eventTime) epochMs = parseEventTimeToMs(event.eventTime, baseDate);
    const category = getEventCategory(event.eventType);
    const categoryPriority = { CHECK_IN: 1, EXIT: 2, STAY_ACTIVE: 3, RETURN: 4, CHECK_OUT: 5, OTHER: 6 }[category];
    return { event, epochMs, category, categoryPriority };
  });

  enrichedEvents.sort((a, b) => a.epochMs !== b.epochMs
    ? a.epochMs - b.epochMs
    : a.categoryPriority - b.categoryPriority);

  const sortedEvents = enrichedEvents.map(e => e.event);
  const cycles: ForensicCycle[] = [];
  let currentOpenExit: AttendanceHistoryEvent | null = null;
  let currentOpenExitMs = 0;
  let cycleCounter = 1;
  let state: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN' = 'UNKNOWN';
  let totalExits = 0;
  let totalReturns = 0;

  for (const item of enrichedEvents) {
    const { event, epochMs, category } = item;
    if (category === 'CHECK_IN') {
      state = 'INSIDE';
    } else if (category === 'EXIT') {
      totalExits++;
      state = 'OUTSIDE';
      if (currentOpenExit) {
        cycles.push({ cycleId: cycleCounter++, exitEvent: currentOpenExit, returnEvent: null, isResolved: false });
      }
      currentOpenExit = event;
      currentOpenExitMs = epochMs;
    } else if (category === 'RETURN') {
      totalReturns++;
      state = 'INSIDE';
      if (currentOpenExit && epochMs >= currentOpenExitMs) {
        const durationMin = currentOpenExitMs > 0 && epochMs > currentOpenExitMs
          ? Math.round((epochMs - currentOpenExitMs) / 60000)
          : null;
        cycles.push({
          cycleId: cycleCounter++,
          exitEvent: currentOpenExit,
          returnEvent: event,
          durationMinutes: durationMin,
          isResolved: true
        });
        currentOpenExit = null;
        currentOpenExitMs = 0;
      } else {
        cycles.push({
          cycleId: cycleCounter++,
          exitEvent: {
            eventId: `inferred_exit_${cycleCounter}`,
            employeeId: event.employeeId,
            eventType: 'GEOFENCE_EXIT',
            eventTime: 'Prior to return',
            timestamp: event.timestamp,
            source: 'INFERRED'
          },
          returnEvent: event,
          isResolved: true
        });
      }
    } else if (category === 'STAY_ACTIVE') {
      state = 'INSIDE';
    } else if (category === 'CHECK_OUT') {
      state = 'OUTSIDE';
    }
  }

  let activeCycle: ForensicCycle | null = null;
  if (currentOpenExit) {
    activeCycle = { cycleId: cycleCounter++, exitEvent: currentOpenExit, returnEvent: null, isResolved: false };
    cycles.push(activeCycle);
  }

  const completedCycles = cycles.filter(c => c.isResolved && c.returnEvent);
  const lastCompletedCycle = completedCycles.length > 0 ? completedCycles[completedCycles.length - 1] : null;

  let lastExitTime: string | null = null;
  let lastExitTimestamp: string | null = null;
  let lastReturnTime: string | null = null;
  let lastReturnTimestamp: string | null = null;
  let isPendingReturn = false;

  if (activeCycle) {
    lastExitTime = activeCycle.exitEvent.eventTime;
    lastExitTimestamp = activeCycle.exitEvent.timestamp;
    lastReturnTime = null;
    lastReturnTimestamp = null;
    isPendingReturn = true;
    state = 'OUTSIDE';
  } else if (lastCompletedCycle) {
    lastExitTime = lastCompletedCycle.exitEvent.eventTime;
    lastExitTimestamp = lastCompletedCycle.exitEvent.timestamp;
    lastReturnTime = lastCompletedCycle.returnEvent?.eventTime || null;
    lastReturnTimestamp = lastCompletedCycle.returnEvent?.timestamp || null;
    isPendingReturn = false;
    state = 'INSIDE';
  } else {
    const recExitTime = record?.lastExitTime || record?.geofenceExitTime || record?.exitTime || null;
    const recReturnTime = record?.lastReturnTime || record?.returnTime || null;
    const recExitIso = record?.lastExitAt || record?.geofenceExitTimestamp || null;
    const recReturnIso = record?.lastReturnAt || null;

    if (recExitTime && recReturnTime) {
      const exitMs = recExitIso ? parseEventTimeToMs(recExitIso, baseDate) : parseEventTimeToMs(recExitTime, baseDate);
      const returnMs = recReturnIso ? parseEventTimeToMs(recReturnIso, baseDate) : parseEventTimeToMs(recReturnTime, baseDate);
      lastExitTime = recExitTime;
      lastExitTimestamp = recExitIso;
      if (returnMs > exitMs) {
        lastReturnTime = recReturnTime;
        lastReturnTimestamp = recReturnIso;
        isPendingReturn = false;
        state = 'INSIDE';
      } else {
        lastReturnTime = null;
        lastReturnTimestamp = null;
        isPendingReturn = true;
        state = 'OUTSIDE';
      }
    } else if (recExitTime) {
      lastExitTime = recExitTime;
      lastExitTimestamp = recExitIso;
      lastReturnTime = null;
      isPendingReturn = true;
      state = 'OUTSIDE';
    } else if (recReturnTime) {
      lastReturnTime = recReturnTime;
      lastReturnTimestamp = recReturnIso;
      state = 'INSIDE';
    }
  }

  if (record?.currentState) {
    if (
      record.currentState === 'PENDING_AUTO_CHECKOUT' ||
      record.currentState === 'PENDING_FINAL_EXIT' ||
      record.currentState === 'PENDING_EXIT_CONFIRMATION' ||
      record.currentState === 'CHECKOUT_NOT_DETECTED' ||
      record.pendingCheckoutConfirmation
    ) {
      state = 'OUTSIDE';
      if (!lastReturnTime) isPendingReturn = true;
    } else if (record.currentState === 'CHECKED_IN') {
      state = 'INSIDE';
    }
  }

  return {
    sortedEvents,
    cycles,
    currentGeofenceState: state,
    lastExitTime,
    lastExitTimestamp,
    lastReturnTime,
    lastReturnTimestamp,
    lastExitDisplay: lastExitTime || (lastReturnTime ? 'Not Detected' : '—'),
    lastReturnDisplay: lastReturnTime || (isPendingReturn || lastExitTime ? 'Pending' : '—'),
    isPendingReturn,
    activeCycle,
    lastCompletedCycle,
    totalExits,
    totalReturns
  };
}

export function getAuthoritativeExitForCheckout(
  record: AttendanceRecord | null | undefined,
  events: AttendanceHistoryEvent[] = []
): {
  authoritativeExitTime: string | null;
  authoritativeExitTimestamp: string | null;
  isUnpairedExit: boolean;
  currentGeofenceState: 'INSIDE' | 'OUTSIDE' | 'UNKNOWN';
} {
  if (!record) {
    return { authoritativeExitTime: null, authoritativeExitTimestamp: null, isUnpairedExit: false, currentGeofenceState: 'UNKNOWN' };
  }

  const finalizedCheckoutTime = (record.checkOutTime || '').trim();
  const isTerminalCheckout =
    record.checkoutFinalized === true ||
    record.checkoutConfirmed === true ||
    record.checkoutStatus === 'FINALIZED' ||
    record.checkoutStatus === 'COMPLETED' ||
    record.currentState === 'FINALIZED_CHECKOUT' ||
    record.currentState === 'CHECKED_OUT';

  if (
    isTerminalCheckout && finalizedCheckoutTime &&
    finalizedCheckoutTime !== '--:--' && finalizedCheckoutTime !== 'UNRESOLVED' &&
    finalizedCheckoutTime !== 'Pending' && finalizedCheckoutTime !== 'N/A'
  ) {
    return { authoritativeExitTime: null, authoritativeExitTimestamp: null, isUnpairedExit: false, currentGeofenceState: 'OUTSIDE' };
  }

  if (record.currentState === 'CHECKED_IN') {
    return { authoritativeExitTime: null, authoritativeExitTimestamp: null, isUnpairedExit: false, currentGeofenceState: 'INSIDE' };
  }

  const analysis = analyzeAttendanceForensics(record, events);
  if (analysis.activeCycle) {
    const exitEvt = analysis.activeCycle.exitEvent;
    const evtDate = exitEvt.timestamp && exitEvt.timestamp.includes('-') ? exitEvt.timestamp.substring(0, 10) : record.date;
    const checkInMs = record.checkInTime ? parseEventTimeToMs(record.checkInTime, record.date) : 0;
    const exitMs = exitEvt.timestamp ? parseEventTimeToMs(exitEvt.timestamp, record.date) : parseEventTimeToMs(exitEvt.eventTime, record.date);
    if (evtDate === record.date && (checkInMs === 0 || exitMs >= checkInMs) && !isAttendanceTimeInFuture(exitEvt.eventTime, record.date)) {
      return {
        authoritativeExitTime: exitEvt.eventTime,
        authoritativeExitTimestamp: exitEvt.timestamp || null,
        isUnpairedExit: true,
        currentGeofenceState: 'OUTSIDE'
      };
    }
  }

  const recExit = record.lastExitTime || record.geofenceExitTime || record.recordedExitTime || record.exitTime || null;
  const recExitIso = record.lastExitAt || record.geofenceExitTimestamp || record.exitDetectedAt || null;
  const recReturnIso = record.lastReturnAt || null;

  if (recExit) {
    const exitDatePart = recExitIso && recExitIso.includes('-') ? recExitIso.substring(0, 10) : record.date;
    const checkInMs = record.checkInTime ? parseEventTimeToMs(record.checkInTime, record.date) : 0;
    const exitMs = recExitIso ? parseEventTimeToMs(recExitIso, record.date) : parseEventTimeToMs(recExit, record.date);

    if (exitDatePart === record.date && (checkInMs === 0 || exitMs >= checkInMs) && !isAttendanceTimeInFuture(recExit, record.date)) {
      if (!recReturnIso || !recExitIso) {
        if (
          record.currentState === 'PENDING_AUTO_CHECKOUT' ||
          record.currentState === 'PENDING_FINAL_EXIT' ||
          record.currentState === 'PENDING_EXIT_CONFIRMATION' ||
          record.currentState === 'CHECKOUT_NOT_DETECTED' ||
          record.pendingCheckoutConfirmation
        ) {
          return { authoritativeExitTime: recExit, authoritativeExitTimestamp: recExitIso, isUnpairedExit: true, currentGeofenceState: 'OUTSIDE' };
        }
      } else {
        const returnMs = new Date(recReturnIso).getTime();
        if (exitMs >= returnMs) {
          return { authoritativeExitTime: recExit, authoritativeExitTimestamp: recExitIso, isUnpairedExit: true, currentGeofenceState: 'OUTSIDE' };
        }
      }
    }
  }

  return {
    authoritativeExitTime: null,
    authoritativeExitTimestamp: null,
    isUnpairedExit: false,
    currentGeofenceState: analysis.currentGeofenceState === 'OUTSIDE' ? 'OUTSIDE' : 'INSIDE'
  };
}

export function getUnresolvedPastAttendanceRecords(
  records: AttendanceRecord[],
  employeeIds: string[],
  todayStr: string
): AttendanceRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const cleanCandidates = employeeIds.map(id => (id || '').trim().toLowerCase()).filter(Boolean);

  const unresolved = records.filter(rec => {
    if (!rec || !rec.date || rec.date >= todayStr) return false;
    const recEmp = (rec.employeeId || (rec as any).employeeCode || rec.id || '').trim().toLowerCase();
    const recDocId = (rec as any).docId ? String((rec as any).docId).trim().toLowerCase() : '';
    const matchesEmp = cleanCandidates.length === 0 || cleanCandidates.some(cid => recEmp === cid || recDocId.includes(cid));
    if (!matchesEmp) return false;
    if (!rec.checkInTime || rec.checkInTime === '--:--' || rec.checkInTime === 'null') return false;
    if ((rec as any).isAdminRectified || (rec as any).manualRectified) return false;

    const coTime = (rec.checkOutTime || '').trim();
    const isCompleted = rec.checkoutFinalized === true || rec.checkoutConfirmed === true || rec.checkoutStatus === 'FINALIZED' || rec.checkoutStatus === 'COMPLETED';
    if (isCompleted && coTime && coTime !== '--:--' && coTime !== 'UNRESOLVED' && coTime !== 'Pending' && coTime !== 'N/A') return false;

    const exitAnalysis = getAuthoritativeExitForCheckout(rec, rec.eventHistory || []);
    const hasExplicitExit = Boolean(
      exitAnalysis.isUnpairedExit ||
      rec.lastExitTime ||
      rec.geofenceExitTime ||
      (rec as any).recordedExitTime ||
      rec.exitTime ||
      rec.exitDetectedAt ||
      (Array.isArray(rec.eventHistory) && rec.eventHistory.some(e => (e.eventType || '').toUpperCase().includes('EXIT')))
    );

    if (exitAnalysis.currentGeofenceState === 'INSIDE' && !exitAnalysis.isUnpairedExit) return false;
    return hasExplicitExit;
  });

  return unresolved.sort((a, b) => a.date.localeCompare(b.date));
}
