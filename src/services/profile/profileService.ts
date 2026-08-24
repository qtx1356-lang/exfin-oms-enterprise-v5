import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { EmployeeProfile, ProfileChangeRequest, AuditLogEntry } from '../../types/profile';
import {
  getCachedProfile,
  saveCachedProfile,
  savePendingProfileRequest,
  getPendingProfileRequests,
  removePendingProfileRequest,
  savePendingPhotoUpload,
  getPendingPhotoUploads,
  removePendingPhotoUpload,
} from './profileStorage';
import { createNotification } from '../notification/notificationService';
import { recordSyncFailure, recordSyncSuccess } from '../sync/syncQueueService';

export const buildProfileFromEmployeeData = (data: any, uid: string): EmployeeProfile => {
  return {
    id: data.id || uid,
    uid: data.uid || uid,
    employeeCode: data.employeeCode || 'EXFRNG000',
    name: data.name || 'Employee',
    mobileNumber: data.mobileNumber || '',
    email: data.email || `${(data.employeeCode || 'employee').toLowerCase()}@company.internal`,
    department: data.department || data.departmentName || data.office || 'Operations',
    designation: data.designation || (data.isTeamLeader ? 'Team Leader' : 'Executive'),
    teamLeaderCode: data.teamLeaderCode || null,
    teamLeaderName: data.teamLeaderName || null,
    joiningDate: data.registrationDate ? new Date(data.registrationDate).toLocaleDateString() : 'N/A',
    employmentStatus: data.status === 'Approved' ? 'Active' : data.status || 'Active',
    profilePhotoUrl: data.profilePhotoUrl || data.selfieUrl || null,
    officeLocation: data.officeLocation || data.workLocation || 'Raniganj HQ',
    reportingManager: data.teamLeaderName || 'Branch Admin',
    workLocation: data.workLocation || data.officeLocation || 'Raniganj HQ',
    emergencyContact: data.emergencyContact || 'Not Provided',
    role: data.role || (data.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE'),
    baseSalary: data.baseSalary !== undefined ? data.baseSalary : undefined,
    createdAt: data.registrationDate,
    updatedAt: new Date().toISOString(),
  };
};

export const getInstantProfile = (uid: string, employeeData?: any): EmployeeProfile | null => {
  if (employeeData && (employeeData.name || employeeData.employeeCode)) {
    return buildProfileFromEmployeeData(employeeData, uid);
  }
  if (uid) {
    const cached = getCachedProfile(uid);
    if (cached) return cached;
  }
  try {
    const raw = localStorage.getItem('cached_registration_data');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.name || parsed.employeeCode)) {
        return buildProfileFromEmployeeData(parsed, uid || parsed.uid || parsed.id || '');
      }
    }
  } catch {
    // Ignore error
  }
  return null;
};

export const loadProfile = async (uid: string, employeeCode?: string): Promise<EmployeeProfile | null> => {
  if (!uid) return null;

  // Attempt online load
  if (navigator.onLine && db) {
    try {
      const docRef = doc(db, 'registrations', uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const profile: EmployeeProfile = {
          id: docSnap.id,
          uid: data.uid || uid,
          employeeCode: data.employeeCode || employeeCode || 'EXFRNG000',
          name: data.name || 'Employee',
          mobileNumber: data.mobileNumber || '',
          email: data.email || `${(data.employeeCode || 'employee').toLowerCase()}@company.internal`,
          department: data.department || data.departmentName || data.office || 'Operations',
          designation: data.designation || (data.isTeamLeader ? 'Team Leader' : 'Executive'),
          teamLeaderCode: data.teamLeaderCode || null,
          teamLeaderName: data.teamLeaderName || null,
          joiningDate: data.registrationDate ? new Date(data.registrationDate).toLocaleDateString() : 'N/A',
          employmentStatus: data.status === 'Approved' ? 'Active' : data.status || 'Active',
          profilePhotoUrl: data.profilePhotoUrl || data.selfieUrl || null,
          officeLocation: data.officeLocation || data.workLocation || 'Raniganj HQ',
          reportingManager: data.teamLeaderName || 'Branch Admin',
          workLocation: data.workLocation || data.officeLocation || 'Raniganj HQ',
          emergencyContact: data.emergencyContact || 'Not Provided',
          role: data.role || (data.isTeamLeader ? 'TEAM_LEADER' : 'EMPLOYEE'),
          baseSalary: data.baseSalary !== undefined ? data.baseSalary : undefined,
          createdAt: data.registrationDate,
          updatedAt: new Date().toISOString(),
        };

        saveCachedProfile(profile);
        return profile;
      }
    } catch (err) {
      console.warn('Failed to fetch profile online, loading cached fallback:', err);
    }
  }

  // Offline fallback
  return getCachedProfile(uid);
};

export const uploadProfilePhoto = async (
  uid: string,
  employeeCode: string,
  imageBase64: string
): Promise<{ success: boolean; photoUrl?: string }> => {
  const uploadId = `photo_${Date.now()}`;

  if (navigator.onLine && storage && db) {
    try {
      const storagePath = `profile_photos/${uid}/profile_${Date.now()}.jpg`;
      const storageRef = ref(storage, storagePath);

      console.log(`Profile Service: Uploading photo to Storage path: ${storagePath}`);
      await uploadString(storageRef, imageBase64, 'data_url');
      const downloadUrl = await getDownloadURL(storageRef);

      // Update Firestore registration document
      try {
        const regRef = doc(db, 'registrations', uid);
        await updateDoc(regRef, {
          profilePhotoUrl: downloadUrl,
          selfieUrl: downloadUrl,
          updatedAt: new Date().toISOString(),
        });
      } catch (firestoreErr) {
        console.error('Profile photo Firestore update error:', firestoreErr);
        throw new Error('STORAGE_SUCCESS_FIRESTORE_FAIL');
      }

      // Update local cached profile
      const cached = getCachedProfile(uid);
      if (cached) {
        cached.profilePhotoUrl = downloadUrl;
        cached.localPhotoData = null;
        saveCachedProfile(cached);
      }

      await createNotification({
        recipientEmployeeCode: employeeCode,
        recipientUserId: uid,
        type: 'SYSTEM_ALERT',
        category: 'SYSTEM',
        priority: 'NORMAL',
        title: 'Profile Photo Updated',
        message: 'Your profile photo has been successfully updated.',
        entityId: uid,
        entityType: 'PROFILE',
      });

      recordSyncSuccess('Attendance', uploadId);
      return { success: true, photoUrl: downloadUrl };
    } catch (uploadErr: any) {
      console.error('Profile photo upload error:', uploadErr);
      recordSyncFailure('Attendance', uploadId, uploadErr?.message || 'Photo upload failed', 'Profile photo upload');
      throw uploadErr; // Rethrow to let UI handle the error
    }
  }

  // If we reach here, we are either offline or storage/db was not available
  if (!navigator.onLine) {
    // Save for offline synchronization
    savePendingPhotoUpload({
      id: uploadId,
      uid,
      employeeCode,
      base64Data: imageBase64,
      timestamp: new Date().toISOString(),
    });

    const cached = getCachedProfile(uid);
    if (cached) {
      cached.localPhotoData = imageBase64;
      saveCachedProfile(cached);
    }

    return { success: true, photoUrl: imageBase64 };
  }
  
  throw new Error('Unable to connect to upload service.');
};

export const submitProfileChangeRequest = async (
  requestData: Omit<ProfileChangeRequest, 'id' | 'status' | 'createdAtDeviceTime'>
): Promise<ProfileChangeRequest> => {
  const reqId = `pcr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const changeRequest: ProfileChangeRequest = {
    ...requestData,
    id: reqId,
    status: 'Pending',
    createdAtDeviceTime: now,
    syncStatus: navigator.onLine ? 'Synced' : 'Pending Sync',
  };

  if (navigator.onLine && db) {
    try {
      await setDoc(doc(db, 'profile_change_requests', reqId), changeRequest);

      // Notify Employee
      await createNotification({
        recipientEmployeeCode: changeRequest.employeeCode,
        recipientUserId: changeRequest.uid,
        type: 'SYSTEM_ALERT',
        category: 'SYSTEM',
        priority: 'NORMAL',
        title: 'Profile Change Requested',
        message: `Your request to update ${changeRequest.fieldLabel} has been submitted for admin approval.`,
        entityId: reqId,
        entityType: 'PROFILE',
      });

      recordSyncSuccess('Attendance', reqId);
    } catch (err: any) {
      console.error('Failed to submit profile change request to Firestore:', err);
      changeRequest.syncStatus = 'Pending Sync';
      savePendingProfileRequest(changeRequest);
      recordSyncFailure('Attendance', reqId, err?.message || 'Request submit failed', `Profile change ${changeRequest.fieldLabel}`);
    }
  } else {
    savePendingProfileRequest(changeRequest);
  }

  return changeRequest;
};

export const reviewProfileChangeRequest = async (
  requestId: string,
  reviewerUid: string,
  reviewerName: string,
  reviewerRole: string,
  action: 'APPROVE' | 'REJECT',
  rejectionReason?: string
): Promise<void> => {
  if (!db) throw new Error('Database not connected');

  const reqRef = doc(db, 'profile_change_requests', requestId);
  const reqSnap = await getDoc(reqRef);

  if (!reqSnap.exists()) {
    throw new Error('Change request not found');
  }

  const reqData = reqSnap.data() as ProfileChangeRequest;
  const now = new Date().toISOString();

  // Update request doc
  await updateDoc(reqRef, {
    status: action === 'APPROVE' ? 'Approved' : 'Rejected',
    reviewedBy: reviewerName,
    reviewedAt: now,
    rejectionReason: rejectionReason || null,
  });

  // If approved, update authoritative employee registration record
  if (action === 'APPROVE') {
    const regRef = doc(db, 'registrations', reqData.uid);
    const updatePayload: Record<string, any> = {
      updatedAt: now,
    };

    if (reqData.field === 'mobileNumber') updatePayload.mobileNumber = reqData.requestedValue;
    if (reqData.field === 'email') updatePayload.email = reqData.requestedValue;
    if (reqData.field === 'emergencyContact') updatePayload.emergencyContact = reqData.requestedValue;
    if (reqData.field === 'profilePhotoUrl') {
      updatePayload.profilePhotoUrl = reqData.requestedValue;
      updatePayload.selfieUrl = reqData.requestedValue;
    }

    await updateDoc(regRef, updatePayload);

    // Update local cache if target user is currently on device
    const cached = getCachedProfile(reqData.uid);
    if (cached) {
      (cached as any)[reqData.field] = reqData.requestedValue;
      saveCachedProfile(cached);
    }
  }

  // Create Employee Notification
  await createNotification({
    recipientEmployeeCode: reqData.employeeCode,
    recipientUserId: reqData.uid,
    type: action === 'APPROVE' ? 'SYSTEM_ALERT' : 'SYSTEM_ALERT',
    category: 'SYSTEM',
    priority: action === 'APPROVE' ? 'NORMAL' : 'HIGH',
    title: action === 'APPROVE' ? 'Profile Request Approved' : 'Profile Request Rejected',
    message: action === 'APPROVE'
      ? `Your requested update for ${reqData.fieldLabel} has been approved.`
      : `Your requested update for ${reqData.fieldLabel} was rejected. Reason: ${rejectionReason || 'Admin decision.'}`,
    entityId: requestId,
    entityType: 'PROFILE',
  });

  // Create Audit Log Entry
  const auditEntry: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    actorUid: reviewerUid,
    actorName: reviewerName,
    actorRole: reviewerRole,
    action: action === 'APPROVE' ? 'APPROVE_PROFILE_CHANGE' : 'REJECT_PROFILE_CHANGE',
    targetEmployeeUid: reqData.uid,
    targetEmployeeCode: reqData.employeeCode,
    fieldChanged: reqData.fieldLabel,
    oldValue: reqData.oldValue,
    newValue: reqData.requestedValue,
    timestamp: now,
    reason: rejectionReason || (action === 'APPROVE' ? 'Approved by Admin' : 'Rejected by Admin'),
  };

  await addDoc(collection(db, 'audit_logs'), auditEntry);
};

export const syncPendingProfileChanges = async (): Promise<{ syncedCount: number; errorsCount: number }> => {
  if (!navigator.onLine) return { syncedCount: 0, errorsCount: 0 };

  let syncedCount = 0;
  let errorsCount = 0;

  // 1. Sync pending photo uploads
  const pendingPhotos = getPendingPhotoUploads();
  for (const photo of pendingPhotos) {
    try {
      const res = await uploadProfilePhoto(photo.uid, photo.employeeCode, photo.base64Data);
      if (res.success) {
        removePendingPhotoUpload(photo.id);
        syncedCount++;
      }
    } catch (err) {
      console.error('Failed to sync pending photo upload:', err);
      errorsCount++;
    }
  }

  // 2. Sync pending profile change requests
  const pendingRequests = getPendingProfileRequests();
  for (const req of pendingRequests) {
    try {
      if (db) {
        await setDoc(doc(db, 'profile_change_requests', req.id), {
          ...req,
          syncStatus: 'Synced',
        });
        removePendingProfileRequest(req.id);
        syncedCount++;
      }
    } catch (err) {
      console.error('Failed to sync pending profile change request:', err);
      errorsCount++;
    }
  }

  return { syncedCount, errorsCount };
};
