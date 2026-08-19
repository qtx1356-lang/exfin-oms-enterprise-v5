import { OfflineAttendanceEvent, AttendanceEventType, AttendanceType, SyncStatus } from '../../types/attendance';
import { logAttendanceEvent } from './attendanceLogger';

const EVENT_QUEUE_KEY = 'exfin_attendance_event_queue_v1';
const PROCESSED_IDS_KEY = 'exfin_processed_event_ids_v1';

export const getAttendanceEventQueue = (): OfflineAttendanceEvent[] => {
  try {
    const raw = localStorage.getItem(EVENT_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read attendance event queue:', err);
    return [];
  }
};

export const saveAttendanceEventQueue = (queue: OfflineAttendanceEvent[]): void => {
  try {
    localStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save attendance event queue:', err);
  }
};

export const getProcessedEventIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(PROCESSED_IDS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (err) {
    return new Set();
  }
};

export const markEventIdProcessed = (eventId: string): void => {
  try {
    const set = getProcessedEventIds();
    set.add(eventId);
    localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch (err) {
    console.error('Failed to mark event ID processed:', err);
  }
};

export const generateIdempotentEventId = (
  employeeId: string,
  date: string,
  type: AttendanceEventType,
  timeOrCount?: string
): string => {
  const sanitizeTime = (timeOrCount || new Date().toISOString())
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  return `${employeeId}-${date}-${type}-${sanitizeTime}`;
};

export const enqueueAttendanceEvent = (
  eventData: Omit<OfflineAttendanceEvent, 'eventId' | 'createdAt' | 'syncStatus'> & { eventId?: string }
): OfflineAttendanceEvent => {
  const eventId = eventData.eventId || generateIdempotentEventId(
    eventData.employeeId,
    eventData.attendanceDate,
    eventData.eventType,
    eventData.eventTime
  );

  const processedIds = getProcessedEventIds();
  const queue = getAttendanceEventQueue();

  const isAlreadyInQueue = queue.some((e) => e.eventId === eventId);
  if (processedIds.has(eventId) || isAlreadyInQueue) {
    console.log(`Event Queue: Event ${eventId} is already processed or queued. Skipping duplicate.`);
    logAttendanceEvent('OFFLINE_EVENT_QUEUED', eventData.employeeId, `Duplicate event ${eventId} ignored.`, {
      eventId,
      eventTimestamp: eventData.eventTime,
      syncStatus: 'Synced'
    });
    const existing = queue.find((e) => e.eventId === eventId);
    if (existing) return existing;
    return {
      ...eventData,
      eventId,
      createdAt: new Date().toISOString(),
      syncStatus: 'Synced'
    };
  }

  const newEvent: OfflineAttendanceEvent = {
    ...eventData,
    eventId,
    createdAt: new Date().toISOString(),
    syncStatus: 'Pending'
  };

  queue.push(newEvent);
  saveAttendanceEventQueue(queue);

  logAttendanceEvent('OFFLINE_EVENT_QUEUED', eventData.employeeId, `Enqueued event ${eventId} (${eventData.eventType})`, {
    eventId,
    eventTimestamp: newEvent.createdAt,
    syncStatus: 'Pending',
    metadata: {
      location: newEvent.location,
      source: newEvent.source,
      mode: newEvent.attendanceMode
    }
  });

  return newEvent;
};

export const getPendingEventsFromQueue = (): OfflineAttendanceEvent[] => {
  const queue = getAttendanceEventQueue();
  return queue.filter((e) => e.syncStatus === 'Pending');
};

export const markEventSyncedInQueue = (eventId: string): void => {
  const queue = getAttendanceEventQueue();
  const index = queue.findIndex((e) => e.eventId === eventId);
  if (index >= 0) {
    queue[index].syncStatus = 'Synced';
    queue[index].syncedAt = new Date().toISOString();
    saveAttendanceEventQueue(queue);
    markEventIdProcessed(eventId);
  }
};

export const removeEventFromQueue = (eventId: string): void => {
  const queue = getAttendanceEventQueue();
  const filtered = queue.filter((e) => e.eventId !== eventId);
  saveAttendanceEventQueue(filtered);
};
