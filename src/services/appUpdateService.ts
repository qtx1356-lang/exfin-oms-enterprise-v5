import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';
import { ANDROID_UPDATE_MANIFEST_URL, GITHUB_RELEASES_LATEST_API_URL } from '../config/updateConfig';

export interface AndroidUpdateManifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releaseNotes?: string[] | string;
  minSupportedVersionCode?: number;
}

export interface InstalledAppVersion {
  versionCode: number;
  versionName: string;
  packageName: string;
  canInstallUnknownApps?: boolean;
}

export interface AppUpdateInfo {
  updateAvailable: boolean;
  installedVersion: InstalledAppVersion;
  remoteManifest: AndroidUpdateManifest | null;
}

export interface UpdateProgressEvent {
  status: 'DOWNLOADING' | 'DOWNLOADED' | 'FAILED';
  progress: number;
  bytesDownloaded?: number;
  bytesTotal?: number;
  fileSize?: number;
  error?: string;
}

interface ExfinUpdatePlugin {
  getInstalledVersion(): Promise<InstalledAppVersion>;
  canInstallUnknownApps(): Promise<{ canInstall: boolean }>;
  openInstallUnknownAppsSettings(): Promise<{ opened: boolean }>;
  downloadAndInstallUpdate(options: { updateUrl: string }): Promise<{ success: boolean; installerLaunched?: boolean }>;
  cancelUpdateDownload(): Promise<{ cancelled: boolean }>;
  addListener(
    eventName: 'updateDownloadProgress',
    listenerFunc: (progress: UpdateProgressEvent) => void
  ): Promise<PluginListenerHandle>;
}

export const ExfinUpdate = registerPlugin<ExfinUpdatePlugin>('ExfinUpdate');

const DISMISSED_VERSION_SESSION_KEY = 'exfin_dismissed_update_version_code';

/**
 * Validates that an object strictly conforms to the AndroidUpdateManifest schema.
 * Rejects any manifest with non-positive integer versionCode or non-HTTPS apkUrl.
 * Safely normalizes versionCode from string or number types.
 */
export function isValidAndroidManifest(manifest: any): manifest is AndroidUpdateManifest {
  if (!manifest || typeof manifest !== 'object') {
    return false;
  }
  
  // Safe normalization of versionCode to support both string and numeric types (Test F/Requirement 7)
  const parsedCode = Number(manifest.versionCode);
  if (isNaN(parsedCode) || !Number.isInteger(parsedCode) || parsedCode <= 0) {
    return false;
  }
  manifest.versionCode = parsedCode; // mutate in-place so downstream comparisons are strictly numeric!

  if (typeof manifest.versionName !== 'string' || manifest.versionName.trim().length === 0) {
    return false;
  }
  if (
    typeof manifest.apkUrl !== 'string' ||
    !manifest.apkUrl.trim().toLowerCase().startsWith('https://')
  ) {
    return false;
  }
  if (
    manifest.releaseNotes !== undefined &&
    !Array.isArray(manifest.releaseNotes) &&
    typeof manifest.releaseNotes !== 'string'
  ) {
    return false;
  }
  if (
    manifest.minSupportedVersionCode !== undefined
  ) {
    const minCode = Number(manifest.minSupportedVersionCode);
    if (isNaN(minCode) || !Number.isInteger(minCode)) {
      return false;
    }
    manifest.minSupportedVersionCode = minCode;
  }
  return true;
}

/**
 * Priority 1: Fetches the latest release metadata asset from GitHub Releases API with cache busting.
 */
async function fetchGithubReleaseManifest(): Promise<AndroidUpdateManifest | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${GITHUB_RELEASES_LATEST_API_URL}${GITHUB_RELEASES_LATEST_API_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const releaseResp = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!releaseResp.ok) {
      return null;
    }
    const releaseData = await releaseResp.json();
    if (!releaseData || !Array.isArray(releaseData.assets)) {
      return null;
    }

    // Find the release asset named exactly android-version-manifest.json
    const manifestAsset = releaseData.assets.find(
      (asset: any) => asset && asset.name === 'android-version-manifest.json'
    );
    if (!manifestAsset || typeof manifestAsset.browser_download_url !== 'string') {
      return null;
    }

    const assetController = new AbortController();
    const assetTimeoutId = setTimeout(() => assetController.abort(), 8000);
    try {
      const assetUrl = `${manifestAsset.browser_download_url}${manifestAsset.browser_download_url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      const assetResp = await fetch(assetUrl, {
        signal: assetController.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!assetResp.ok) {
        return null;
      }
      const data = await assetResp.json();
      return isValidAndroidManifest(data) ? data : null;
    } finally {
      clearTimeout(assetTimeoutId);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Priority 2: Fetches the raw GitHub manifest file with cache-busting.
 */
async function fetchRawManifest(): Promise<AndroidUpdateManifest | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${ANDROID_UPDATE_MANIFEST_URL}${ANDROID_UPDATE_MANIFEST_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    return isValidAndroidManifest(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Priority 3: Fetches the bundled / hosted /android-version-manifest.json file.
 */
async function fetchBundledManifest(): Promise<AndroidUpdateManifest | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `/android-version-manifest.json?t=${Date.now()}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    return isValidAndroidManifest(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches an explicitly supplied custom manifest URL.
 */
async function fetchCustomManifest(customUrl: string): Promise<AndroidUpdateManifest | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${customUrl}${customUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    if (!resp.ok) {
      return null;
    }
    const data = await resp.json();
    return isValidAndroidManifest(data) ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Checks if a specific version code was dismissed by the user in this app session.
 */
export const isUpdateDismissedForSession = (versionCode: number): boolean => {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false;
    const dismissed = window.sessionStorage.getItem(DISMISSED_VERSION_SESSION_KEY);
    return dismissed === String(versionCode);
  } catch {
    return false;
  }
};

/**
 * Marks a specific version code as dismissed for the remainder of this session.
 */
export const dismissUpdateForSession = (versionCode: number): void => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(DISMISSED_VERSION_SESSION_KEY, String(versionCode));
    }
  } catch {}
};

/**
 * Silently checks remote sources for the newest valid Android update manifest.
 * Collects all valid manifests and chooses the one with the HIGHEST numeric versionCode.
 * Fails safely and gracefully without blocking or throwing.
 */
export const checkAppUpdateSilently = async (
  customManifestUrl?: string
): Promise<AppUpdateInfo | null> => {
  try {
    const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    if (!isAndroid) {
      return null;
    }

    // 1. Get installed native app version code strictly from BuildConfig via UpdatePlugin
    const installed = await ExfinUpdate.getInstalledVersion();
    if (!installed || typeof installed.versionCode !== 'number') {
      return null;
    }

    console.log('[EXFIN UPDATE] Check started');
    console.log('[EXFIN UPDATE] Manifest URL:', customManifestUrl || GITHUB_RELEASES_LATEST_API_URL);
    console.log('[EXFIN UPDATE] Installed versionCode:', installed.versionCode);
    console.log('[EXFIN UPDATE] Installed versionName:', installed.versionName);

    const candidateManifests: AndroidUpdateManifest[] = [];

    if (customManifestUrl) {
      // When customManifestUrl is supplied, use it directly
      const customManifest = await fetchCustomManifest(customManifestUrl);
      if (customManifest) {
        candidateManifests.push(customManifest);
      }
    } else {
      // Priority 1: GitHub Releases API asset (latest released APK metadata)
      const releaseManifest = await fetchGithubReleaseManifest();
      if (releaseManifest && isValidAndroidManifest(releaseManifest)) {
        candidateManifests.push(releaseManifest);
      } else {
        // Priority 2 (Fallback): Raw GitHub Manifest file
        const rawManifest = await fetchRawManifest();
        if (rawManifest && isValidAndroidManifest(rawManifest)) {
          candidateManifests.push(rawManifest);
        }
      }
    }

    if (candidateManifests.length === 0) {
      console.log('[EXFIN UPDATE] No candidate manifests retrieved');
      return null;
    }

    // Select the manifest with the HIGHEST numeric versionCode
    let bestManifest = candidateManifests[0];
    for (let i = 1; i < candidateManifests.length; i++) {
      if (candidateManifests[i].versionCode > bestManifest.versionCode) {
        bestManifest = candidateManifests[i];
      }
    }

    // 4. Authoritative version comparison: remote.versionCode > installed.versionCode
    const updateAvailable = bestManifest.versionCode > installed.versionCode;

    console.log('[EXFIN UPDATE] Remote versionCode:', bestManifest.versionCode);
    console.log('[EXFIN UPDATE] Remote versionName:', bestManifest.versionName);
    console.log('[EXFIN UPDATE] APK URL:', bestManifest.apkUrl);
    console.log('[EXFIN UPDATE] Update available:', updateAvailable);

    return {
      updateAvailable,
      installedVersion: installed,
      remoteManifest: updateAvailable ? bestManifest : null,
    };
  } catch (err) {
    // Fail silently: never disrupt application startup or user experience
    console.debug('[AppUpdate] Update check skipped/failed silently:', err);
    return null;
  }
};

/**
 * Initiates the download and installation of the update APK.
 */
export const startApkDownloadAndInstall = async (
  apkUrl: string
): Promise<{ success: boolean; installerLaunched?: boolean }> => {
  if (!apkUrl.toLowerCase().startsWith('https://')) {
    throw new Error('Security Error: Only HTTPS update URLs are permitted.');
  }
  return await ExfinUpdate.downloadAndInstallUpdate({ updateUrl: apkUrl });
};

/**
 * Checks if the app is authorized to install unknown apps.
 */
export const checkCanInstallUnknownApps = async (): Promise<boolean> => {
  try {
    if (!Capacitor.isNativePlatform()) return true;
    const res = await ExfinUpdate.canInstallUnknownApps();
    return res?.canInstall ?? true;
  } catch {
    return true;
  }
};

/**
 * Opens system settings for granting install unknown apps permission.
 */
export const openUnknownAppsSettings = async (): Promise<void> => {
  try {
    if (Capacitor.isNativePlatform()) {
      await ExfinUpdate.openInstallUnknownAppsSettings();
    }
  } catch (e) {
    console.error('[AppUpdate] Failed to open unknown apps settings:', e);
  }
};
