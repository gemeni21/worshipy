export const CLOUD_HUB_STORAGE_KEY = 'worshipy_cloud_hub_url';

/**
 * Returns the active Cloud Hub origin URL (e.g. "https://worshipy.vercel.app").
 * If running on the web, returns empty string (meaning relative path to current origin).
 * If running in the desktop app, checks for a custom cloud URL in localStorage or environment.
 */
export function getCloudHubUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const custom = window.localStorage.getItem(CLOUD_HUB_STORAGE_KEY);
      if (custom && custom.trim()) {
        return custom.trim().replace(/\/+$/, '');
      }
    } catch {}
  }
  const envUrl = process.env.NEXT_PUBLIC_CLOUD_HUB_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '';
}

/**
 * Persists the Cloud Hub URL into localStorage for the desktop application.
 */
export function setCloudHubUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (url && url.trim()) {
      window.localStorage.setItem(
        CLOUD_HUB_STORAGE_KEY,
        url.trim().replace(/\/+$/, '')
      );
    } else {
      window.localStorage.removeItem(CLOUD_HUB_STORAGE_KEY);
    }
  } catch {}
}

/**
 * Formats an API endpoint URL to target the active Cloud Hub or relative path.
 * Example: apiUrl('/api/live/sessions') -> 'https://worshipy.vercel.app/api/live/sessions'
 */
export function apiUrl(endpoint: string): string {
  const base = getCloudHubUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${path}` : path;
}
