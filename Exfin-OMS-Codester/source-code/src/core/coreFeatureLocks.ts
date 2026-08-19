/**
 * EXFIN OMS - CORE FEATURE LOCKS
 * 
 * IMPORTANT: 
 * The following constants define protected core application behaviors.
 * DO NOT modify these values, expose them to UI controls, or allow 
 * remote/database configuration to override them.
 * 
 * Only change these if explicitly instructed to "UNLOCK [FEATURE]".
 */

// CORE FEATURE LOCK — DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
// OFFLINE-FIRST STARTUP
export const OFFLINE_FIRST_STARTUP = true;
export const OFFLINE_FIRST_LOCKED = true;

// CORE FEATURE LOCK — DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
// 25M OFFICE GEOFENCE
export const GEOFENCE_LOCKED = true;
export const OFFICE_GEOFENCE_RADIUS_METERS = 25;

// CORE FEATURE LOCK — DO NOT MODIFY WITHOUT EXPLICIT AUTHORIZATION
// LOCATION ACCURACY / VALIDATION
export const LOCATION_VALIDATION_LOCKED = true;
