export type CheckInMode = 'AUTO' | 'MANUAL';
export type CheckOutMode = 'MANUAL' | 'AUTO_SYSTEM' | 'N/A';
export type SyncStatus = 'Pending' | 'Synced';
export type AttendanceType = 'OFFICE' | 'WFH' | 'CLIENT_VISIT' | 'OUTDOOR';

export type OutdoorWorkTypeOption = 
  | 'Market Visit'
  | 'Site Visit'
  | 'Field Work'
  | 'Survey'
  | 'Installation'
  | 'Collection'
  | 'Delivery'
  | 'Inspection';

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

