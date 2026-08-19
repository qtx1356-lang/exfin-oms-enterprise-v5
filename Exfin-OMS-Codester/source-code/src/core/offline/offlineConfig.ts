import { OFFLINE_FIRST_STARTUP, OFFLINE_FIRST_LOCKED } from '../coreFeatureLocks';

/**
 * OFFLINE-FIRST ARCHITECTURE LOCK
 * 
 * This file structurally protects the offline-first boot architecture of Exfin OMS.
 * 
 * CORE ARCHITECTURE REQUIREMENT:
 * 1. SERVICE WORKER / CACHED APPLICATION SHELL
 * 2. APPLICATION BOOT
 * 3. LOCAL SESSION / LOCAL STATE
 * 4. UI RENDER
 * 5. NETWORK DETECTION
 * 6. NETWORK SERVICES
 * 7. BACKGROUND SYNCHRONIZATION
 * 
 * The application shell MUST be able to start without any network requests.
 * Network-dependent services (Firebase, real-time location, etc.) MUST initialize
 * AFTER the offline shell has loaded.
 * 
 * DO NOT MODIFY THIS BEHAVIOR UNLESS EXPLICITLY COMMANDED TO:
 * "UNLOCK OFFLINE-FIRST"
 */

export const getOfflineConfig = () => {
  return {
    isOfflineFirstStartupEnabled: OFFLINE_FIRST_STARTUP,
    isOfflineFirstLocked: OFFLINE_FIRST_LOCKED,
    allowNetworkBlockingStartup: false, // Permanently false
    requireFirebaseForBoot: false, // Permanently false
    requireLocationForBoot: false, // Permanently false
  };
};
