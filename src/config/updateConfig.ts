/**
 * Android Remote Update Manifest Configuration
 * The manifest URL is configurable and can be overridden via VITE_ANDROID_UPDATE_MANIFEST_URL.
 * By default, it checks the raw repository manifest for qtx1356-lang/exfin-oms-enterprise-v5,
 * or falls back to the hosted /android-version-manifest.json endpoint.
 */
export const ANDROID_UPDATE_MANIFEST_URL: string =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANDROID_UPDATE_MANIFEST_URL) ||
  'https://raw.githubusercontent.com/qtx1356-lang/exfin-oms-enterprise-v5/main/public/android-version-manifest.json';

export const GITHUB_RELEASES_LATEST_API_URL: string =
  'https://api.github.com/repos/qtx1356-lang/exfin-oms-enterprise-v5/releases/latest';


