export type CheckInMode = 'AUTO' | 'MANUAL';
export type CheckOutMode = 'MANUAL' | 'AUTO_SYSTEM' | 'N/A';
export type SyncStatus = 'Pending' | 'Synced';
export type AttendanceType = 'OFFICE' | 'WFH' | 'CLIENT_VISIT' | 'OUTDOOR';

export type AttendanceState = 
  | 'OUTSIDE'
  | 'ENTERING'
  | 'CHECKED_IN'
  | 'PENDING_FINAL_EXIT'
  | 'FINALIZED_CHECKOUT'
  | 'NO_ATTENDANCE'
  | 'CHECKED_OUT'
  | 'UNRESOLVED';

export type AttendanceEventType = 
  | 'CHECK_IN' 
  | 'GEOFENCE_EXIT' 
  | 'GEOFENCE_RETURN' 
  | 'CHECK_OUT' 
  | 'END_OF_DAY_CHECKOUT'
  | 'END_OF_DAY_UNRESOLVED';

export type AttendanceLogCategory =
  | 'GEOFENCE_ENTER'
  | 'GEOFENCE_EXIT'
  | 'CHECKIN_CREATED'
  | 'CHECKOUT_CREATED'
  | 'RETURN_DETECTED'
  | 'OFFLINE_EVENT_QUEUED'
  | 'SYNC_STARTED'
  | 'SYNC_SUCCESS'
  | 'SYNC_FAILED'
  | 'END_OF_DAY_PROCESSING';

export interface OfflineAttendanceEvent {
  eventId: string; // Unique, e.g. EMP101-2026-08-10-CHECKIN-100201 or UUID
  employeeId: string;
  attendanceDate: string; // YYYY-MM-DD
  eventType: AttendanceEventType;
  eventTime: string; // Formatted e.g. "10:02 AM"
  location: {
    latitude: number;
    longitude: number;
    townCity: string;
    distance: number;
  };
  attendanceMode: AttendanceType;
  source: 'AUTO_GEOFENCE' | 'MANUAL' | 'AUTO_SYSTEM_END_OF_DAY';
  createdAt: string; // ISO timestamp when event occurred
  syncStatus: SyncStatus;
  syncedAt?: string | null;
  meta?: Record<string, any>;
}

export interface AttendanceDiagnosticLog {
  id: string;
  timestamp: string;
  category: AttendanceLogCategory;
  employeeId: string;
  eventId?: string;
  eventTimestamp?: string;
  syncStatus?: SyncStatus | 'N/A';
  details: string;
  metadata?: Record<string, any>;
}

export type OutdoorWorkTypeOption = 
  | 'Market Visit'
  | 'Site Visit'
  | 'Field Work'
  | 'Survey'
  | 'Installation'
  | 'Collection'
  | 'Delivery'
  | 'Inspection';

export interface AttendanceCorrection {
  id: string;
  originalCheckIn: string;
  correctedCheckIn: string;
  originalCheckOut: string | null;
  correctedCheckOut: string | null;
  reason: string;
  correctedBy: string;
  correctedByRole: string;
  correctedAt: string;
}

export interface AttendanceRecord {
  id: string; // UUID
  docId: string; // Key: ${employeeId}_${date} e.g. EMP101_2026-08-07
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  attendanceType: AttendanceType;
  checkInTime: string; // Formatted time e.g. "09:30 AM"
  checkOutTime: string | null; // Formatted time e.g. "06:00 PM"
  workingHours: string | null; // Calculated duration string e.g. "8h 30m"
  latitude: number;
  longitude: number;
  distance: number; // Distance from office in meters
  townCity: string; // Town / City or District or State
  checkInMode: CheckInMode;
  checkOutMode: CheckOutMode;
  exitTime: string | null; // Exit time if employee leaves geofence after check-in
  returnTime: string | null; // Return time if employee returns to geofence
  reason: string | null; // Auto Checkout Reason e.g. "Forgot Checkout"
  reminderCount: number; // Number of reminders triggered
  createdAtDeviceTime: string; // Original Event ISO timestamp
  syncStatus: SyncStatus;
  serverSyncTime: string | null;
  isOffline: boolean;
  correctionHistory?: AttendanceCorrection[];
  lastExitTime?: string | null;
  pendingCheckoutConfirmation?: boolean;
  checkoutConfirmed?: boolean;
  checkoutFinalized?: boolean;
  checkoutSource?: string;
  checkoutFinalizedAt?: string;
  manualRectified?: boolean;
  isAdminRectified?: boolean;
  correctedAt?: string;
  updatedAt?: string;
  version?: number;
  checkoutDismissed?: boolean;

  // Unresolved Checkout & Mandatory Resolution fields
  checkoutStatus?: 'COMPLETED' | 'UNRESOLVED' | 'PENDING_ADMIN_REVIEW';
  employeeProposedCheckoutTime?: string | null;
  employeeResolutionReason?: string | null;
  previousStatus?: string | null;
  previousCheckoutTime?: string | null;
  previousCheckoutStatus?: string | null;
  resolutionReason?: string | null;
  migratedAt?: string | null;
  checkoutResolvedBy?: string | null;
  checkoutResolvedAt?: string | null;
  resolutionSource?: 'ADMIN_CORRECTION' | 'EMPLOYEE_PROPOSED' | 'AUTO_GEOFENCE' | 'AUTO_SYSTEM' | 'MANUAL' | string | null;

  // New fields requested for auto checkout alignment
  checkoutType?: 'AUTO_CHECKOUT' | 'MANUAL' | string;
  status?: 'completed' | 'active' | string;
  locationUnavailableDuringDay?: boolean;

  // State Machine & Idempotency tracking
  currentState?: AttendanceState;
  processedEvents?: string[]; // List of eventIds processed for this record

  // Work From Home (WFH) fields
  wfhReason?: string | null;
  workPlan?: string | null;
  monthlyWfhCount?: number;

  // Client Visit fields
  clientName?: string | null;
  clientLocation?: string | null;
  purpose?: string | null;

  // Outdoor Work fields
  outdoorType?: OutdoorWorkTypeOption | string | null;
  description?: string | null;
}


