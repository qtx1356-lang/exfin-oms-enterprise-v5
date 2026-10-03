import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';
import { ANDROID_UPDATE_MANIFEST_URL, GITHUB_RELEASES_LATEST_API_URL } from '../config/updateConfig';

export interface AndroidUpdateManifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  releaseNotes?: string[];
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
 * Silently checks the remote manifest against installed native version code.
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

    // 1. Get installed native app version code
    const installed = await ExfinUpdate.getInstalledVersion();
    if (!installed || typeof installed.versionCode !== 'number') {
      return null;
    }

    // 2. Multi-tier reliable manifest resolution:
    // Priority 1: Fetch raw manifest with cache-busting timestamp
    let manifest: AndroidUpdateManifest | null = null;
    const rawUrl = customManifestUrl
      ? customManifestUrl
      : `${ANDROID_UPDATE_MANIFEST_URL}${ANDROID_UPDATE_MANIFEST_URL.includes('?') ? '&' : '?'}t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const resp = await fetch(rawUrl, {
        signal: controller.signal,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      clearTimeout(timeoutId);

      if (resp.ok) {
        manifest = await resp.json();
      }
    } catch {
      manifest = null;
    }

    // Priority 2: GitHub Releases API fallback if raw fetch failed
    if (!manifest && !customManifestUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const releaseResp = await fetch(GITHUB_RELEASES_LATEST_API_URL, {
          signal: controller.signal,
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'Cache-Control': 'no-cache',
          },
        });
        clearTimeout(timeoutId);

        if (releaseResp.ok) {
          const releaseData = await releaseResp.json();
          // Find android-version-manifest.json in release assets
          const manifestAsset = Array.isArray(releaseData?.assets)
            ? releaseData.assets.find((a: any) => a?.name === 'android-version-manifest.json')
            : null;

          if (manifestAsset?.browser_download_url) {
            const assetController = new AbortController();
            const assetTimeoutId = setTimeout(() => assetController.abort(), 8000);
            const assetResp = await fetch(manifestAsset.browser_download_url, {
              signal: assetController.signal,
              headers: {
                'Cache-Control': 'no-cache',
              },
            });
            clearTimeout(assetTimeoutId);

            if (assetResp.ok) {
              manifest = await assetResp.json();
            }
          }
        }
      } catch {
        manifest = null;
      }
    }

    // Priority 3: Bundled/hosted /android-version-manifest.json fallback
    if (!manifest && !customManifestUrl) {
      try {
        const fallbackResp = await fetch('/android-version-manifest.json', {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (fallbackResp.ok) {
          manifest = await fallbackResp.json();
        }
      } catch {
        manifest = null;
      }
    }

    if (!manifest) {
      return null;
    }

    // 3. Validate manifest schema
    if (
      !manifest ||
      typeof manifest.versionCode !== 'number' ||
      manifest.versionCode <= 0 ||
      typeof manifest.apkUrl !== 'string' ||
      !manifest.apkUrl.toLowerCase().startsWith('https://')
    ) {
      return null;
    }

    // 4. Authoritative version comparison: remote.versionCode > installed.versionCode
    const updateAvailable = manifest.versionCode > installed.versionCode;

    return {
      updateAvailable,
      installedVersion: installed,
      remoteManifest: updateAvailable ? manifest : null,
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
