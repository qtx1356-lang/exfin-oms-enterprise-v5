import { AttendanceRecord, AttendanceHistoryEvent } from '../types/attendance';

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

/**
 * Parses time string (e.g., "06:17 PM" or "18:17") with an optional base date (YYYY-MM-DD)
 * into milliseconds since epoch.
 */
export function parseEventTimeToMs(timeStr: string | undefined | null, baseDateStr?: string | null): number {
  if (!timeStr) return 0;

  // If it's already an ISO timestamp or full date string
  if (timeStr.includes('T') || (timeStr.includes('-') && timeStr.length > 10)) {
    const parsed = new Date(timeStr).getTime();
    if (!isNaN(parsed)) return parsed;
  }

  const today = baseDateStr && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)
    ? baseDateStr
    : new Date().toISOString().split('T')[0];

  // Try parsing "hh:mm A" or "hh:mm:ss A"
  const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const modifier = match[4]?.toUpperCase();

    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;

    const padH = String(hours).padStart(2, '0');
    const padM = String(minutes).padStart(2, '0');
    const padS = String(seconds).padStart(2, '0');

    // Parse explicitly in Asia/Kolkata (+05:30) to align with ISO timestamps
    const istParsed = new Date(`${today}T${padH}:${padM}:${padS}+05:30`).getTime();
    if (!isNaN(istParsed)) return istParsed;

    const dateObj = new Date(`${today}T00:00:00`);
    dateObj.setHours(hours, minutes, seconds, 0);
    return dateObj.getTime();
  }

  // Fallback direct Date parse
  const fallback = new Date(`${today} ${timeStr}`).getTime();
  return isNaN(fallback) ? 0 : fallback;
}

/**
 * Normalizes event type to a standard category
 */
function getEventCategory(eventType: string): 'CHECK_IN' | 'EXIT' | 'RETURN' | 'STAY_ACTIVE' | 'CHECK_OUT' | 'OTHER' {
  const upper = (eventType || '').toUpperCase();
  if (upper === 'CHECK_IN' || upper.includes('CHECKIN')) return 'CHECK_IN';
  if (upper.includes('EXIT') || upper === 'OUT') return 'EXIT';
  if (upper.includes('RETURN') || upper === 'ENTRY' || upper === 'REENTRY') return 'RETURN';
  if (upper.includes('STAY_ACTIVE') || upper.includes('CANCEL')) return 'STAY_ACTIVE';
  if (upper.includes('CHECK_OUT') || upper.includes('CHECKOUT')) return 'CHECK_OUT';
  return 'OTHER';
}

/**
 * Performs strict chronological forensic sequence analysis for an attendance record and its audit events.
 * 
 * CORE RULE:
 * A RETURN can only belong to an EXIT that occurred BEFORE it.
 * If an EXIT occurs at 06:17 PM and no RETURN exists after 06:17 PM,
 * any prior return (e.g. 06:10 PM) belongs to an earlier cycle and MUST NOT
 * be presented as the return for the 06:17 PM exit.
 */
export function analyzeAttendanceForensics(
  record: AttendanceRecord | null | undefined,
  rawEvents: AttendanceHistoryEvent[] = []
): ForensicAuditAnalysis {
  const baseDate = record?.date || new Date().toISOString().split('T')[0];
  const targetEmpId = (record?.employeeId || (record as any)?.employeeCode || '').trim().toLowerCase();
  const checkInTimeStr = record?.checkInTime;
  const checkInMs = checkInTimeStr ? parseEventTimeToMs(checkInTimeStr, baseDate) : 0;

  // 1. Gather all events scoped to target employee and attendance date
  const allEventsMap = new Map<string, AttendanceHistoryEvent>();

  const isEventMatchingSession = (evt: AttendanceHistoryEvent | null | undefined): boolean => {
    if (!evt) return false;
    // Employee scoping
    if (targetEmpId && evt.employeeId) {
      const eEmp = evt.employeeId.trim().toLowerCase();
      if (eEmp && eEmp !== targetEmpId) return false;
    }
    // Date scoping: if timestamp has ISO date, it MUST match baseDate
    if (evt.timestamp && evt.timestamp.includes('-')) {
      const evtDate = evt.timestamp.substring(0, 10);
      if (evtDate.length === 10 && evtDate !== baseDate) {
        return false;
      }
    }
    // Check-in boundary: EXIT or RETURN cannot occur before check-in time of this session
    const cat = getEventCategory(evt.eventType);
    if ((cat === 'EXIT' || cat === 'RETURN') && checkInMs > 0) {
      const evtMs = evt.timestamp ? parseEventTimeToMs(evt.timestamp, baseDate) : (evt.eventTime ? parseEventTimeToMs(evt.eventTime, baseDate) : 0);
      if (evtMs > 0 && evtMs < checkInMs) {
        return false;
      }
    }
    return true;
  };

  if (record && Array.isArray(record.eventHistory)) {
    for (const evt of record.eventHistory) {
      if (evt && (evt.eventId || evt.timestamp || evt.eventTime) && isEventMatchingSession(evt)) {
        const key = evt.eventId || `${evt.eventType}_${evt.timestamp || evt.eventTime}`;
        allEventsMap.set(key, evt);
      }
    }
  }

  for (const evt of rawEvents) {
    if (evt && (evt.eventId || evt.timestamp || evt.eventTime) && isEventMatchingSession(evt)) {
      const key = evt.eventId || `${evt.eventType}_${evt.timestamp || evt.eventTime}`;
      allEventsMap.set(key, evt);
    }
  }

  // 2. Synthesize event items from record top-level timestamps only if session state is NOT CHECKED_IN
  // and the timestamp belongs to baseDate and is after check-in
  const isCurrentlyCheckedIn = record?.currentState === 'CHECKED_IN';

  if (!isCurrentlyCheckedIn && (record?.lastExitTime || record?.geofenceExitTime || record?.exitTime)) {
    const exitTime = record.lastExitTime || record.geofenceExitTime || record.exitTime!;
    const exitIso = record.lastExitAt || record.geofenceExitTimestamp || record.exitDetectedAt || null;
    const exitDatePart = exitIso && exitIso.includes('-') ? exitIso.substring(0, 10) : baseDate;

    // Verify exit belongs to this attendance date
    if (exitDatePart === baseDate) {
      const exitMs = exitIso ? parseEventTimeToMs(exitIso, baseDate) : parseEventTimeToMs(exitTime, baseDate);
      if (checkInMs === 0 || exitMs >= checkInMs) {
        const key = `synth_exit_${exitTime}`;
        const exists = Array.from(allEventsMap.values()).some(e => 
          getEventCategory(e.eventType) === 'EXIT' && (e.eventTime === exitTime || (exitIso && e.timestamp === exitIso))
        );
        if (!exists) {
          allEventsMap.set(key, {
            eventId: key,
            employeeId: record.employeeId || record.employeeCode || 'emp',
            eventType: 'GEOFENCE_EXIT',
            eventTime: exitTime,
            timestamp: exitIso || new Date(exitMs).toISOString(),
            source: record.exitDetectionSource || 'RECORD_STATE'
          });
        }
      }
    }
  }

  if (record?.lastReturnTime || record?.returnTime) {
    const returnTime = record.lastReturnTime || record.returnTime!;
    const returnIso = record.lastReturnAt || null;
    const returnDatePart = returnIso && returnIso.includes('-') ? returnIso.substring(0, 10) : baseDate;

    if (returnDatePart === baseDate) {
      const returnMs = returnIso ? parseEventTimeToMs(returnIso, baseDate) : parseEventTimeToMs(returnTime, baseDate);
      if (checkInMs === 0 || returnMs >= checkInMs) {
        const key = `synth_return_${returnTime}`;
        const exists = Array.from(allEventsMap.values()).some(e => 
          getEventCategory(e.eventType) === 'RETURN' && (e.eventTime === returnTime || (returnIso && e.timestamp === returnIso))
        );
        if (!exists) {
          allEventsMap.set(key, {
            eventId: key,
            employeeId: record.employeeId || record.employeeCode || 'emp',
            eventType: 'GEOFENCE_RETURN',
            eventTime: returnTime,
            timestamp: returnIso || new Date(returnMs).toISOString(),
            source: 'RECORD_STATE'
          });
        }
      }
    }
  }

  // 3. Convert all events to sortable items with numeric epoch timestamp
  const eventList = Array.from(allEventsMap.values());
  const enrichedEvents = eventList.map(evt => {
    let epochMs = 0;
    if (evt.timestamp) {
      epochMs = parseEventTimeToMs(evt.timestamp, baseDate);
    }
    if (!epochMs && evt.eventTime) {
      epochMs = parseEventTimeToMs(evt.eventTime, baseDate);
    }

    const cat = getEventCategory(evt.eventType);
    const categoryPriority = {
      'CHECK_IN': 1,
      'EXIT': 2,
      'STAY_ACTIVE': 3,
      'RETURN': 4,
      'CHECK_OUT': 5,
      'OTHER': 6
    }[cat];

    return {
      event: evt,
      epochMs,
      category: cat,
      categoryPriority
    };
  });

  // Sort chronologically ascending
  enrichedEvents.sort((a, b) => {
    if (a.epochMs !== b.epochMs) {
      return a.epochMs - b.epochMs;
    }
    return a.categoryPriority - b.categoryPriority;
  });

  const sortedEvents = enrichedEvents.map(e => e.event);

  // 4. Chronological Exit -> Return Cycle Machine
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

      // If an exit was already open without a return, mark it as superseded or open
      if (currentOpenExit) {
        cycles.push({
          cycleId: cycleCounter++,
          exitEvent: currentOpenExit,
          returnEvent: null,
          isResolved: false
        });
      }

      currentOpenExit = event;
      currentOpenExitMs = epochMs;
    } else if (category === 'RETURN') {
      totalReturns++;
      state = 'INSIDE';

      if (currentOpenExit && epochMs >= currentOpenExitMs) {
        // Valid Exit -> Return Pair
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
        // Return without open preceding exit (e.g. initial re-entry log)
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
      // Stay active acts as a soft acknowledgment while outside or returning
      state = 'INSIDE';
    } else if (category === 'CHECK_OUT') {
      state = 'OUTSIDE';
    }
  }

  let activeCycle: ForensicCycle | null = null;
  if (currentOpenExit) {
    activeCycle = {
      cycleId: cycleCounter++,
      exitEvent: currentOpenExit,
      returnEvent: null,
      isResolved: false
    };
    cycles.push(activeCycle);
  }

  // Find last completed cycle
  const completedCycles = cycles.filter(c => c.isResolved && c.returnEvent);
  const lastCompletedCycle = completedCycles.length > 0 ? completedCycles[completedCycles.length - 1] : null;

  // Determine authoritative Last Exit and Last Return
  let lastExitTime: string | null = null;
  let lastExitTimestamp: string | null = null;
  let lastReturnTime: string | null = null;
  let lastReturnTimestamp: string | null = null;
  let isPendingReturn = false;

  if (activeCycle) {
    // There is an active/open exit with NO subsequent return!
    lastExitTime = activeCycle.exitEvent.eventTime;
    lastExitTimestamp = activeCycle.exitEvent.timestamp;
    lastReturnTime = null; // NEVER show an older return as the return for this exit!
    lastReturnTimestamp = null;
    isPendingReturn = true;
    state = 'OUTSIDE';
  } else if (lastCompletedCycle) {
    // The most recent exit cycle was completed by a return
    lastExitTime = lastCompletedCycle.exitEvent.eventTime;
    lastExitTimestamp = lastCompletedCycle.exitEvent.timestamp;
    lastReturnTime = lastCompletedCycle.returnEvent?.eventTime || null;
    lastReturnTimestamp = lastCompletedCycle.returnEvent?.timestamp || null;
    isPendingReturn = false;
    state = 'INSIDE';
  } else {
    // Check fallback record attributes with timestamp sanity check
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
        // Return occurred chronologically AFTER exit
        lastReturnTime = recReturnTime;
        lastReturnTimestamp = recReturnIso;
        isPendingReturn = false;
        state = 'INSIDE';
      } else {
        // Return occurred BEFORE the last exit!
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

  // Determine current geofence state override from record currentState if available
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

  const lastExitDisplay = lastExitTime || (lastReturnTime ? 'Not Detected' : '—');
  const lastReturnDisplay = lastReturnTime || (isPendingReturn || lastExitTime ? 'Pending' : '—');

  return {
    sortedEvents,
    cycles,
    currentGeofenceState: state,
    lastExitTime,
    lastExitTimestamp,
    lastReturnTime,
    lastReturnTimestamp,
    lastExitDisplay,
    lastReturnDisplay,
    isPendingReturn,
    activeCycle,
    lastCompletedCycle,
    totalExits,
    totalReturns
  };
}

/**
 * Determines the authoritative exit time to use for checkout finalization.
 * 
 * CORE RULES:
 * 1. If multiple EXIT -> RETURN cycles occurred, only the CURRENT UNPAIRED EXIT
 *    (an exit with NO subsequent return) can be used as the final checkout time.
 * 2. An older EXIT that was followed by a RETURN is closed and MUST NEVER be used as final checkout
 *    if a newer unpaired EXIT exists or if the employee returned to the office.
 * 3. Never downgrade a newer exit to an older exit.
 */
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
    return {
      authoritativeExitTime: null,
      authoritativeExitTimestamp: null,
      isUnpairedExit: false,
      currentGeofenceState: 'UNKNOWN'
    };
  }

  // CORE RULE: If employee is currently CHECKED_IN, they are INSIDE the office.
  // There is NO unpaired exit, NO pending checkout, and NO checkout confirmation.
  if (record.currentState === 'CHECKED_IN') {
    return {
      authoritativeExitTime: null,
      authoritativeExitTimestamp: null,
      isUnpairedExit: false,
      currentGeofenceState: 'INSIDE'
    };
  }

  const analysis = analyzeAttendanceForensics(record, events);

  if (analysis.activeCycle) {
    const exitEvt = analysis.activeCycle.exitEvent;
    const evtDate = exitEvt.timestamp && exitEvt.timestamp.includes('-') ? exitEvt.timestamp.substring(0, 10) : record.date;
    const checkInMs = record.checkInTime ? parseEventTimeToMs(record.checkInTime, record.date) : 0;
    const exitMs = exitEvt.timestamp ? parseEventTimeToMs(exitEvt.timestamp, record.date) : parseEventTimeToMs(exitEvt.eventTime, record.date);

    if (evtDate === record.date && (checkInMs === 0 || exitMs >= checkInMs)) {
      return {
        authoritativeExitTime: exitEvt.eventTime,
        authoritativeExitTimestamp: exitEvt.timestamp || null,
        isUnpairedExit: true,
        currentGeofenceState: 'OUTSIDE'
      };
    }
  }

  // If no active cycle detected from events list, evaluate direct record timestamps
  const recExit = record.lastExitTime || record.geofenceExitTime || record.recordedExitTime || record.exitTime || null;
  const recExitIso = record.lastExitAt || record.geofenceExitTimestamp || record.exitDetectedAt || null;
  const recReturnIso = record.lastReturnAt || null;

  if (recExit) {
    const exitDatePart = recExitIso && recExitIso.includes('-') ? recExitIso.substring(0, 10) : record.date;
    const checkInMs = record.checkInTime ? parseEventTimeToMs(record.checkInTime, record.date) : 0;
    const exitMs = recExitIso ? parseEventTimeToMs(recExitIso, record.date) : parseEventTimeToMs(recExit, record.date);

    // Only consider exit if it belongs to this exact record date AND occurred after check-in
    if (exitDatePart === record.date && (checkInMs === 0 || exitMs >= checkInMs)) {
      if (!recReturnIso || !recExitIso) {
        if (
          record.currentState === 'PENDING_AUTO_CHECKOUT' ||
          record.currentState === 'PENDING_FINAL_EXIT' ||
          record.currentState === 'PENDING_EXIT_CONFIRMATION' ||
          record.currentState === 'CHECKOUT_NOT_DETECTED' ||
          record.pendingCheckoutConfirmation
        ) {
          return {
            authoritativeExitTime: recExit,
            authoritativeExitTimestamp: recExitIso,
            isUnpairedExit: true,
            currentGeofenceState: 'OUTSIDE'
          };
        }
      } else {
        const returnMs = new Date(recReturnIso).getTime();
        if (exitMs >= returnMs) {
          return {
            authoritativeExitTime: recExit,
            authoritativeExitTimestamp: recExitIso,
            isUnpairedExit: true,
            currentGeofenceState: 'OUTSIDE'
          };
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

/**
 * Identifies previous attendance days with a valid check-in but unresolved/missing checkout.
 * Returns records sorted chronologically ascending (oldest unresolved day first).
 */
export function getUnresolvedPastAttendanceRecords(
  records: AttendanceRecord[],
  employeeIds: string[],
  todayStr: string
): AttendanceRecord[] {
  if (!Array.isArray(records) || records.length === 0) return [];

  const cleanCandidates = employeeIds.map(id => (id || '').trim().toLowerCase()).filter(Boolean);

  const unresolved = records.filter(rec => {
    if (!rec || !rec.date) return false;
    // Only previous days
    if (rec.date >= todayStr) return false;

    // Filter by employee identity
    const recEmp = (rec.employeeId || (rec as any).employeeCode || rec.id || '').trim().toLowerCase();
    const recDocId = (rec.docId || '').trim().toLowerCase();
    const matchesEmp = cleanCandidates.length === 0 || cleanCandidates.some(cid => recEmp === cid || recDocId.includes(cid));
    if (!matchesEmp) return false;

    // Must have a valid check-in
    if (!rec.checkInTime || rec.checkInTime === '--:--' || rec.checkInTime === 'null') {
      return false;
    }

    // Never re-prompt if already finalized by Admin
    if (rec.isAdminRectified || rec.manualRectified) {
      return false;
    }

    const coTime = (rec.checkOutTime || '').trim();
    const isCompleted = rec.checkoutFinalized === true ||
      rec.checkoutConfirmed === true ||
      rec.checkoutStatus === 'FINALIZED' ||
      rec.checkoutStatus === 'COMPLETED';

    if (isCompleted && coTime && coTime !== '--:--' && coTime !== 'UNRESOLVED' && coTime !== 'Pending' && coTime !== 'N/A') {
      return false;
    }

    // CORE ACCEPTANCE RULE:
    // A missing checkout on a past day ONLY triggers manual confirmation if there is evidence
    // that a valid EXIT actually occurred and remained unpaired.
    // If a past day only has CHECK_IN with NO EXIT event, do NOT trigger the popup.
    const exitAnalysis = getAuthoritativeExitForCheckout(rec, rec.eventHistory || []);
    const hasExplicitExit = Boolean(
      exitAnalysis.isUnpairedExit ||
      rec.lastExitTime ||
      rec.geofenceExitTime ||
      rec.recordedExitTime ||
      rec.exitTime ||
      rec.exitDetectedAt ||
      (Array.isArray(rec.eventHistory) && rec.eventHistory.some(e => (e.eventType || '').toUpperCase().includes('EXIT')))
    );

    // If there is an explicit return that closed the exit, ensure it is not considered an unresolved exit
    if (exitAnalysis.currentGeofenceState === 'INSIDE' && !exitAnalysis.isUnpairedExit) {
      return false;
    }

    return hasExplicitExit;
  });

  return unresolved.sort((a, b) => a.date.localeCompare(b.date));
}


