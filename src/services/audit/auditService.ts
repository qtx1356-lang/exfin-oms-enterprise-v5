import { getDb } from '../firebase/config';
import { collection, doc, setDoc, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { AuditLogRecord, DeviceInfo, AuditActionCategory, AuditSource, AuditResult } from '../../types/audit';

export const getClientDeviceInfo = (): DeviceInfo => {
  const ua = navigator.userAgent || '';
  let browser = 'Unknown Browser';
  let os = 'Unknown OS';
  let deviceType = 'Desktop';

  if (/android/i.test(ua)) {
    os = 'Android';
    deviceType = 'Mobile';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
    deviceType = 'Mobile';
  } else if (/win/i.test(ua)) {
    os = 'Windows';
  } else if (/mac/i.test(ua)) {
    os = 'macOS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }

  if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/edg/i.test(ua)) browser = 'Edge';

  return {
    browser,
    os,
    deviceType,
    appVersion: '1.0.0'
  };
};

export interface CreateAuditLogParams {
  action: string;
  actionCategory: AuditActionCategory;
  performedByUserId: string;
  performedByName: string;
  performedByRole: string;
  employeeCode?: string;
  targetUserId?: string;
  targetUserName?: string;
  targetRecordId?: string;
  description: string;
  oldValue?: any;
  newValue?: any;
  result: AuditResult;
  failureReason?: string;
  source: AuditSource;
  deviceInfo?: DeviceInfo;
  metadata?: Record<string, any>;
}

export const createAuditLog = async (params: CreateAuditLogParams): Promise<void> => {
  try {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = new Date().toISOString();
    const deviceInfo = params.deviceInfo || getClientDeviceInfo();

    const record: AuditLogRecord = {
      id,
      timestamp,
      action: params.action,
      actionCategory: params.actionCategory,
      performedByUserId: params.performedByUserId || 'system',
      performedByName: params.performedByName || 'System',
      performedByRole: params.performedByRole || 'SYSTEM',
      employeeCode: params.employeeCode || '',
      targetUserId: params.targetUserId || '',
      targetUserName: params.targetUserName || '',
      targetRecordId: params.targetRecordId || '',
      description: params.description || '',
      oldValue: params.oldValue !== undefined ? params.oldValue : null,
      newValue: params.newValue !== undefined ? params.newValue : null,
      result: params.result || 'SUCCESS',
      failureReason: params.failureReason || '',
      source: params.source || 'ADMIN_PANEL',
      deviceInfo,
      metadata: params.metadata || {}
    };

    const activeDb = await getDb();
    if (activeDb) {
      await setDoc(doc(activeDb, 'audit_logs', id), record);
    }

    // Also keep local fallback cache in localStorage for immediate inspection / offline robustness
    try {
      const existingLocal = JSON.parse(localStorage.getItem('exfin_audit_logs_local') || '[]');
      existingLocal.unshift(record);
      if (existingLocal.length > 200) existingLocal.pop();
      localStorage.setItem('exfin_audit_logs_local', JSON.stringify(existingLocal));
    } catch (e) {
      // Ignore local storage quota errors
    }
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
};

export const formatIstTimestamp = (isoString?: string): string => {
  if (!isoString) return 'N/A';
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(date) + ' IST';
  } catch {
    return isoString;
  }
};
