const DEFAULT_BACKEND_URL = 'https://ais-dev-cqv7gyt4sebhl5lxhbruzl-65234134226.asia-southeast1.run.app';

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim() !== '') {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('.pages.dev') || origin.includes('cloudflare')) {
      return DEFAULT_BACKEND_URL;
    }
  }
  return '';
}

export const API_BASE_URL = getApiBaseUrl();

