import { EmployeeProfile, ProfileChangeRequest } from '../../types/profile';

const PROFILE_CACHE_KEY_PREFIX = 'exfin_profile_cache_v1_';
const PENDING_CHANGE_REQUESTS_KEY = 'exfin_pending_profile_requests_v1';
const PENDING_PHOTO_UPLOADS_KEY = 'exfin_pending_photo_uploads_v1';

export interface PendingPhotoUpload {
  id: string;
  uid: string;
  employeeCode: string;
  base64Data: string;
  timestamp: string;
}

// Scoped Profile Caching (By Auth UID to prevent cross-account cache leaks)
export const getCachedProfile = (uid: string): EmployeeProfile | null => {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${PROFILE_CACHE_KEY_PREFIX}${uid}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('Failed to parse cached profile:', err);
    return null;
  }
};

export const saveCachedProfile = (profile: EmployeeProfile): void => {
  if (!profile.uid) return;
  try {
    localStorage.setItem(
      `${PROFILE_CACHE_KEY_PREFIX}${profile.uid}`,
      JSON.stringify(profile)
    );
  } catch (err) {
    console.error('Failed to save profile cache:', err);
  }
};

export const clearCachedProfile = (uid: string): void => {
  try {
    localStorage.removeItem(`${PROFILE_CACHE_KEY_PREFIX}${uid}`);
  } catch (err) {
    console.error('Failed to clear cached profile:', err);
  }
};

// Pending Change Requests (Offline Support)
export const getPendingProfileRequests = (): ProfileChangeRequest[] => {
  try {
    const raw = localStorage.getItem(PENDING_CHANGE_REQUESTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to get pending profile requests:', err);
    return [];
  }
};

export const savePendingProfileRequest = (request: ProfileChangeRequest): void => {
  const list = getPendingProfileRequests();
  const existingIdx = list.findIndex((r) => r.id === request.id);
  if (existingIdx >= 0) {
    list[existingIdx] = request;
  } else {
    list.push(request);
  }
  try {
    localStorage.setItem(PENDING_CHANGE_REQUESTS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save pending profile request:', err);
  }
};

export const removePendingProfileRequest = (id: string): void => {
  const list = getPendingProfileRequests().filter((r) => r.id !== id);
  try {
    localStorage.setItem(PENDING_CHANGE_REQUESTS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to remove pending profile request:', err);
  }
};

// Pending Photo Uploads (Offline Support)
export const getPendingPhotoUploads = (): PendingPhotoUpload[] => {
  try {
    const raw = localStorage.getItem(PENDING_PHOTO_UPLOADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to get pending photo uploads:', err);
    return [];
  }
};

export const savePendingPhotoUpload = (upload: PendingPhotoUpload): void => {
  const list = getPendingPhotoUploads().filter((u) => u.uid !== upload.uid);
  list.push(upload);
  try {
    localStorage.setItem(PENDING_PHOTO_UPLOADS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to save pending photo upload:', err);
  }
};

export const removePendingPhotoUpload = (id: string): void => {
  const list = getPendingPhotoUploads().filter((u) => u.id !== id);
  try {
    localStorage.setItem(PENDING_PHOTO_UPLOADS_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to remove pending photo upload:', err);
  }
};
