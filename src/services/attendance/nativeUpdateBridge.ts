import { registerPlugin } from '@capacitor/core';

export interface ExfinUpdatePlugin {
  getInstalledVersion(): Promise<{ versionCode: number; versionName: string; packageName: string }>;
  downloadAndInstallUpdate(options: { updateUrl: string }): Promise<{ success: boolean }>;
}

const ExfinUpdate = registerPlugin<ExfinUpdatePlugin>('ExfinUpdate');

export interface AppVersionConfig {
  latestVersionCode: number;
  latestVersionName: string;
  minimumSupportedVersionCode: number;
  updateUrl: string;
  releaseNotes: string;
  forceUpdate: boolean;
  published: boolean;
  releaseDate?: string;
}

export interface InstalledVersionInfo {
  versionCode: number;
  versionName: string;
  packageName: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  isForceUpdate: boolean;
  installed: InstalledVersionInfo;
  remote: AppVersionConfig;
}

const UPDATE_CACHE_KEY = 'exfin_oms_last_update_check';
const LATER_DISMISSED_VERSION_KEY = 'exfin_oms_dismissed_version_code';
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours cache

export async function getInstalledAppVersion(): Promise<InstalledVersionInfo> {
  try {
    const res = await ExfinUpdate.getInstalledVersion();
    return {
      versionCode: res.versionCode || 25,
      versionName: res.versionName || '2.5.0',
      packageName: res.packageName || 'com.exfin.oms',
    };
  } catch (err) {
    console.warn('[NativeUpdate] Could not get native installed version, fallback to defaults:', err);
    return {
      versionCode: 25,
      versionName: '2.5.0',
      packageName: 'com.exfin.oms',
    };
  }
}

export async function fetchRemoteVersionConfig(): Promise<AppVersionConfig | null> {
  try {
    const response = await fetch('/api/app-version', {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    const data = await response.json();
    return data as AppVersionConfig;
  } catch (err) {
    console.warn('[NativeUpdate] Failed to fetch remote version config (offline/network unavailable):', err);
    return null;
  }
}

export async function checkForAppUpdate(forceRecheck = false): Promise<UpdateCheckResult | null> {
  try {
    const installed = await getInstalledAppVersion();
    const remote = await fetchRemoteVersionConfig();

    if (!remote || !remote.published) {
      return null;
    }

    const hasNewerVersion = remote.latestVersionCode > installed.versionCode;
    const isBelowMinimum = installed.versionCode < remote.minimumSupportedVersionCode;
    const isForceUpdate = remote.forceUpdate || isBelowMinimum;

    if (!hasNewerVersion && !isBelowMinimum) {
      return {
        hasUpdate: false,
        isForceUpdate: false,
        installed,
        remote,
      };
    }

    return {
      hasUpdate: true,
      isForceUpdate,
      installed,
      remote,
    };
  } catch (err) {
    console.error('[NativeUpdate] Error checking for app update:', err);
    return null;
  }
}

export async function startAppUpdateDownload(updateUrl: string): Promise<boolean> {
  try {
    console.log('[NativeUpdate] Starting APK download from:', updateUrl);
    await ExfinUpdate.downloadAndInstallUpdate({ updateUrl });
    return true;
  } catch (err) {
    console.error('[NativeUpdate] Failed to download and install update:', err);
    throw err;
  }
}
