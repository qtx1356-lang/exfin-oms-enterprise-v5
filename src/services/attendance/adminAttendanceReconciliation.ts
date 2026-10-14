// Authoritative Admin checkout sync: this module keeps employee attendance aligned with Firestore corrections.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  Unsubscribe,
  where,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { AttendanceRecord } from '../../types/attendance';
import {
  getStoredAttendanceRecords,
  saveAttendanceRecord,
} from './attendanceStorage';
import {
  isServerAttendanceAuthoritative,
  recoverAuthoritativeAdminFields,
} from '../../utils/attendanceUtils';

const activeListeners = new Map<string, Unsubscribe>();

const isValidCheckout = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return !!v && !['UNRESOLVED', '--:--', 'Pending', 'N/A'].includes(v);
};

const findLocalRecord = (employeeId: string, date: string): AttendanceRecord | null => {
  const normalized = employeeId.trim().toLowerCase();
  return getStoredAttendanceRecords().find((record) => {
    const recordEmployee = (record.employeeId || record.employeeCode || '').trim().toLowerCase();
    return recordEmployee === normalized && record.date === date;
  }) || null;
};

const applyAuthoritativeServerRecord = (
  employeeId: string,
  date: string,
  serverData: any,
  serverDocId: string
): AttendanceRecord | null => {
  if (!serverData) return null;

  const recovered = recoverAuthoritativeAdminFields(serverData);
  const adminAuthoritative =
    isServerAttendanceAuthoritative(serverData) ||
    !!recovered?.checkOutTime ||
    serverData.isAdminRectified === true ||
    serverData.manualRectified === true ||
    serverData.resolutionSource === 'ADMIN_CORRECTION' ||
    serverData.resolutionSource === 'ADMIN_APPROVED_PROPOSAL';

  if (!adminAuthoritative) return null;

  const local = findLocalRecord(employeeId, date);
  const authoritativeCheckout =
    recovered?.checkOutTime ||
    (isValidCheckout(serverData.checkOutTime) ? serverData.checkOutTime : null);

  const merged: AttendanceRecord = {
    ...(local || {}),
    ...serverData,
    id: local?.id || serverData.id || serverDocId,
    docId: serverData.docId || local?.docId || serverDocId,
    employeeId: serverData.employeeId || local?.employeeId || employeeId,
    employeeName: serverData.employeeName || local?.employeeName || '',
    date: serverData.date || local?.date || date,
    eventHistory: Array.isArray(serverData.eventHistory) && serverData.eventHistory.length > 0
      ? serverData.eventHistory
      : local?.eventHistory,
    exitObservations: Array.isArray(local?.exitObservations) && local.exitObservations.length > 0
      ? local.exitObservations
      : serverData.exitObservations,
    returnObservations: Array.isArray(local?.returnObservations) && local.returnObservations.length > 0
      ? local.returnObservations
      : serverData.returnObservations,
    currentLatitude: local?.currentLatitude ?? serverData.currentLatitude,
    currentLongitude: local?.currentLongitude ?? serverData.currentLongitude,
    currentDistance: local?.currentDistance ?? serverData.currentDistance,
    currentLocationTimestamp: local?.currentLocationTimestamp || serverData.currentLocationTimestamp,
    currentLocationStatus: local?.currentLocationStatus || serverData.currentLocationStatus,
    syncStatus: 'Synced',
  };

  if (authoritativeCheckout) {
    merged.checkOutTime = authoritativeCheckout;
    merged.checkoutStatus = 'COMPLETED';
    merged.attendanceStatus = 'RESOLVED';
    merged.checkoutFinalized = true;
    merged.currentState = 'CHECKED_OUT';
    merged.status = 'completed';
    merged.isAdminRectified = true;
    merged.manualRectified = true;
    merged.checkoutResolvedBy =
      serverData.checkoutResolvedBy || recovered?.checkoutResolvedBy || merged.checkoutResolvedBy || 'admin';
    merged.checkoutResolvedAt =
      serverData.checkoutResolvedAt || recovered?.checkoutResolvedAt || merged.checkoutResolvedAt || serverData.updatedAt;
  }

  saveAttendanceRecord(merged);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('exfin-attendance-updated', {
      detail: {
        source: 'ADMIN_AUTHORITATIVE_SYNC',
        employeeId: merged.employeeId,
        date: merged.date,
        checkOutTime: merged.checkOutTime,
      },
    }));
  }

  console.log('[AdminAttendanceSync] Applied authoritative admin attendance update', {
    employeeId: merged.employeeId,
    date: merged.date,
    checkOutTime: merged.checkOutTime,
    source: 'FIRESTORE_ATTENDANCE',
  });

  return merged;
};

const resolveAttendanceDocument = async (
  employeeId: string,
  date: string
): Promise<{ ref: ReturnType<typeof doc>; data: any } | null> => {
  const activeDb = db.concrete || db;
  if (!activeDb) return null;

  const directRef = doc(activeDb, 'attendance', `${employeeId}_${date}`);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    return { ref: directRef, data: directSnap.data() };
  }

  const qByEmployee = query(
    collection(activeDb, 'attendance'),
    where('employeeId', '==', employeeId),
    where('date', '==', date),
    limit(1)
  );
  const employeeSnap = await getDocs(qByEmployee);
  if (!employeeSnap.empty) {
    const found = employeeSnap.docs[0];
    return { ref: found.ref, data: found.data() };
  }

  const qByCode = query(
    collection(activeDb, 'attendance'),
    where('employeeCode', '==', employeeId),
    where('date', '==', date),
    limit(1)
  );
  const codeSnap = await getDocs(qByCode);
  if (!codeSnap.empty) {
    const found = codeSnap.docs[0];
    return { ref: found.ref, data: found.data() };
  }

  return null;
};

export const refreshAuthoritativeAttendanceFromServer = async (
  employeeId: string,
  date: string
): Promise<AttendanceRecord | null> => {
  if (!employeeId || !date || typeof navigator !== 'undefined' && !navigator.onLine) return null;

  try {
    const resolved = await resolveAttendanceDocument(employeeId, date);
    if (!resolved) return null;
    return applyAuthoritativeServerRecord(employeeId, date, resolved.data, resolved.ref.id);
  } catch (error) {
    console.warn('[AdminAttendanceSync] One-time authoritative refresh failed:', error);
    return null;
  }
};

export const startAuthoritativeAttendanceListener = async (
  employeeId: string,
  date: string
): Promise<void> => {
  if (!employeeId || !date) return;

  const key = `${employeeId}_${date}`.toLowerCase();
  if (activeListeners.has(key)) return;

  const activeDb = db.concrete || db;
  if (!activeDb) return;

  try {
    const resolved = await resolveAttendanceDocument(employeeId, date);
    if (!resolved) return;

    applyAuthoritativeServerRecord(employeeId, date, resolved.data, resolved.ref.id);

    const unsubscribe = onSnapshot(
      resolved.ref,
      (snapshot) => {
        if (!snapshot.exists()) return;
        applyAuthoritativeServerRecord(employeeId, date, snapshot.data(), snapshot.id);
      },
      (error) => {
        console.warn('[AdminAttendanceSync] Attendance listener stopped:', error);
        activeListeners.delete(key);
      }
    );

    activeListeners.set(key, unsubscribe);
  } catch (error) {
    console.warn('[AdminAttendanceSync] Failed to start attendance listener:', error);
  }
};

export const stopAuthoritativeAttendanceListener = (employeeId: string, date: string): void => {
  const key = `${employeeId}_${date}`.toLowerCase();
  const unsubscribe = activeListeners.get(key);
  if (unsubscribe) {
    unsubscribe();
    activeListeners.delete(key);
  }
};