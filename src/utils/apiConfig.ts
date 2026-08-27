/**
 * Resolves the API Base URL for backend Express requests.
 * 
 * In production (e.g. Cloudflare Pages frontend hosted separately from Cloud Run Express backend),
 * this returns either:
 * 1. VITE_API_BASE_URL (if specified at build time or runtime env)
 * 2. The production Cloud Run backend URL when running on external origins (like *.pages.dev)
 * 3. Relative empty string ('') when running in full-stack Express container where SPA and API share origin.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
  if (envUrl !== '') {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    // If hosted on Cloudflare Pages or external static frontend domain separate from Cloud Run backend
    if (host.includes('pages.dev') || host.includes('cloudflare')) {
      return 'https://ais-dev-cqv7gyt4sebhl5lxhbruzl-65234134226.asia-southeast1.run.app';
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


