export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim() !== '') {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, '');
  }
  return '';
}

export const API_BASE_URL = getApiBaseUrl();


