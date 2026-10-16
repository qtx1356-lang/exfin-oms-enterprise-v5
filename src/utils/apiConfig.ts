/**
 * Resolves the API Base URL for browser and native clients.
 *
 * Browser deployments on Cloudflare Pages use same-origin relative API routes.
 * Capacitor Android runs the bundled UI on its local WebView origin, so relative
 * /api requests would target the local app instead of the deployed Pages Functions.
 * VITE_API_BASE_URL remains the explicit override for deployments using another API.
 */
export function getApiBaseUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL)
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : '';
  if (envUrl !== '') {
    return envUrl.replace(/\/$/, '');
  }

  // Keep browser requests same-origin. Native Android must use the Pages project
  // configured by wrangler.jsonc and the deploy script: office-management-system.
  if (typeof window !== 'undefined') {
    try {
      const capacitor = (window as any).Capacitor;
      if (typeof capacitor?.isNativePlatform === 'function' && capacitor.isNativePlatform()) {
        return 'https://office-management-system.pages.dev';
      }
    } catch {
      // Fall through to same-origin behavior if native-platform detection fails.
    }
  }

  return '';
}

export const API_BASE_URL = getApiBaseUrl();

/**
 * Builds a normalized, absolute or relative API URL avoiding duplicate /api paths.
 */
export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (!base) {
    return cleanPath;
  }
  if (base.endsWith('/api') && cleanPath.startsWith('/api')) {
    return base + cleanPath.substring(4);
  }
  return base + cleanPath;
}
