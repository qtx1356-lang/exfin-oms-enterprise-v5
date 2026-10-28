import { Capacitor } from '@capacitor/core';

const PAGES_ORIGIN = 'https://exfin-oms-enterprise-v5.pages.dev';
// Cloudflare account subdomain previously configured for EXFIN OMS Workers.
// Can be overridden per deployment without changing the general API gateway.
const DEFAULT_VIDEO_API_ORIGIN = 'https://exfin-oms-video-api.sanjivsinha06.workers.dev';

/**
 * Resolves the general API base URL. Browser deployments use same-origin Pages
 * routes; Android uses Pages for existing non-video endpoints.
 */
export function getApiBaseUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_BASE_URL)
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : '';
  if (envUrl) return envUrl.replace(/\\/$/, '');
  try {
    if (Capacitor.isNativePlatform()) return PAGES_ORIGIN;
  } catch {
    // Keep normal same-origin behavior if platform detection is unavailable.
  }
  return '';
}

/** Video conferencing has its own deployed Worker, not a Pages /api route. */
export function getVideoApiBaseUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_VIDEO_API_BASE_URL)
    ? String(import.meta.env.VITE_VIDEO_API_BASE_URL).trim()
    : '';
  return (envUrl || DEFAULT_VIDEO_API_ORIGIN).replace(/\\/$/, '');
}

export const API_BASE_URL = getApiBaseUrl();
export const VIDEO_API_BASE_URL = getVideoApiBaseUrl();

function buildUrl(base: string, path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (!base) return cleanPath;
  if (base.endsWith('/api') && cleanPath.startsWith('/api')) return base + cleanPath.substring(4);
  return base + cleanPath;
}

export function buildApiUrl(path: string): string {
  return buildUrl(getApiBaseUrl(), path);
}

export function buildVideoApiUrl(path: string): string {
  return buildUrl(getVideoApiBaseUrl(), path);
}
