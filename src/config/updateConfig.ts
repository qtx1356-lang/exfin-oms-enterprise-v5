/**
 * Android Remote Update Manifest Configuration
 * The manifest URL is configurable and can be overridden via VITE_ANDROID_UPDATE_MANIFEST_URL.
 */
export const ANDROID_UPDATE_MANIFEST_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANDROID_UPDATE_MANIFEST_URL) ||
  '/android-version-manifest.json';
