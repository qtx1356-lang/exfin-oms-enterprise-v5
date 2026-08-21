/**
 * EXFIN OMS Centralized Startup Coordinator & State Machine
 * Coordinates deterministic offline-first startup flow:
 * BOOTING -> LOCAL_STATE_RESTORED -> REGISTERED/UNREGISTERED -> ONLINE/OFFLINE -> SYNCING -> READY
 */

import { logStartupTag } from './startupPerformanceLogger';
import { networkStatusService } from '../network/networkStatusService';
import { getDeviceSessionFromDB, saveDeviceSessionToDB, PersistentDeviceSession } from '../storage/indexedDBService';

export type StartupState =
  | 'BOOTING'
  | 'LOCAL_STATE_RESTORED'
  | 'REGISTERED'
  | 'UNREGISTERED'
  | 'ONLINE'
  | 'OFFLINE'
  | 'SYNCING'
  | 'READY';

export type DiagnosticTag =
  | 'APP_BOOT_START'
  | 'LOCAL_STATE_RESTORED'
  | 'PWA_CACHE_READY'
  | 'NETWORK_ONLINE'
  | 'NETWORK_OFFLINE'
  | 'OFFLINE_STARTUP'
  | 'SESSION_RESTORED'
  | 'DEVICE_STATE_RESTORED'
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED'
  | 'SYNC_FAILED'
  | 'SERVICE_WORKER_UPDATED';

type StateListener = (state: StartupState) => void;

class StartupCoordinator {
  private currentState: StartupState = 'BOOTING';
  private listeners: Set<StateListener> = new Set();
  private restoredSession: PersistentDeviceSession | null = null;
  private isInitialized = false;

  constructor() {
    this.emitDiagnostic('APP_BOOT_START', `Initial boot initiated (online=${typeof navigator !== 'undefined' ? navigator.onLine : 'unknown'})`);
  }

  public emitDiagnostic(tag: DiagnosticTag, details?: string): void {
    logStartupTag(tag, details);
  }

  public getState(): StartupState {
    return this.currentState;
  }

  public setState(nextState: StartupState): void {
    if (this.currentState === nextState) return;
    this.currentState = nextState;
    this.listeners.forEach((listener) => {
      try {
        listener(nextState);
      } catch (err) {
        console.error('Error in startup state listener:', err);
      }
    });
  }

  public subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Restores persistent state from IndexedDB / localStorage synchronously/asynchronously
   * WITHOUT blocking React UI rendering.
   */
  public async restoreLocalState(): Promise<PersistentDeviceSession | null> {
    if (this.isInitialized && this.restoredSession) {
      return this.restoredSession;
    }

    this.setState('BOOTING');

    // 1. Fast path: Read from localStorage first
    let localRegId = localStorage.getItem('registrationId');
    let cachedProfileRaw = localStorage.getItem('cached_registration_data');
    let cachedProfile: any = null;

    if (cachedProfileRaw) {
      try {
        cachedProfile = JSON.parse(cachedProfileRaw);
      } catch (e) {}
    }

    // 2. Durable path: Check IndexedDB fallback if localStorage is empty or to reconcile
    try {
      const dbSession = await getDeviceSessionFromDB();
      if (dbSession) {
        if (!localRegId && dbSession.registrationId) {
          localRegId = dbSession.registrationId;
          localStorage.setItem('registrationId', dbSession.registrationId);
        }
        if (!cachedProfile && dbSession.cachedProfile) {
          cachedProfile = dbSession.cachedProfile;
          try {
            localStorage.setItem('cached_registration_data', JSON.stringify(dbSession.cachedProfile));
          } catch (e) {}
        }
      }
    } catch (err) {
      console.warn('IndexedDB session lookup warning:', err);
    }

    const isOnline = networkStatusService.getStatus().isOnline;

    if (localRegId) {
      this.restoredSession = {
        deviceId: localStorage.getItem('deviceId') || '',
        registrationId: localRegId,
        employeeCode: cachedProfile?.employeeCode || cachedProfile?.employeeId || '',
        employeeName: cachedProfile?.name || cachedProfile?.employeeName || '',
        registrationStatus: cachedProfile?.status || 'Approved',
        cachedProfile: cachedProfile || { id: localRegId, status: 'Approved' },
        lastSyncTime: new Date().toISOString(),
        appVersion: 'v6.0.0',
      };

      this.emitDiagnostic('LOCAL_STATE_RESTORED', `Session restored for ${this.restoredSession.employeeName || this.restoredSession.employeeCode || localRegId}`);
      this.emitDiagnostic('DEVICE_STATE_RESTORED', `Device ID: ${this.restoredSession.deviceId || 'local'}`);
      this.emitDiagnostic('SESSION_RESTORED', `Status: ${this.restoredSession.registrationStatus}`);

      this.setState('LOCAL_STATE_RESTORED');
      this.setState('REGISTERED');

      if (!isOnline) {
        this.emitDiagnostic('OFFLINE_STARTUP', 'Starting in deterministic offline mode with restored credentials');
        this.setState('OFFLINE');
      } else {
        this.setState('ONLINE');
      }
    } else {
      this.emitDiagnostic('LOCAL_STATE_RESTORED', 'No active local device registration found');
      this.setState('LOCAL_STATE_RESTORED');
      this.setState('UNREGISTERED');

      if (!isOnline) {
        this.emitDiagnostic('OFFLINE_STARTUP', 'Unregistered device in offline mode');
        this.setState('OFFLINE');
      } else {
        this.setState('ONLINE');
      }
    }

    this.isInitialized = true;
    return this.restoredSession;
  }

  public async persistSession(session: PersistentDeviceSession): Promise<void> {
    this.restoredSession = session;
    if (session.registrationId) {
      localStorage.setItem('registrationId', session.registrationId);
    }
    if (session.cachedProfile) {
      try {
        localStorage.setItem('cached_registration_data', JSON.stringify(session.cachedProfile));
      } catch (e) {}
    }
    await saveDeviceSessionToDB(session).catch(() => {});
  }
}

export const startupCoordinator = new StartupCoordinator();
