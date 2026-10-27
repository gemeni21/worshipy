/**
 * Google OAuth 2.0 & Google Identity Services (GIS) Client
 * Opens Google's native "Choose an account" dialog (accounts.google.com)
 * and retrieves verified account credentials.
 */

export const GOOGLE_CLIENT_ID_STORAGE_KEY = 'worshipy_google_client_id';

export function getGoogleClientId(): string {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
      if (stored && stored.trim()) {
        return stored.trim();
      }
    } catch {}
  }
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
}

export function setGoogleClientId(clientId: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (clientId && clientId.trim()) {
      localStorage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, clientId.trim());
    } else {
      localStorage.removeItem(GOOGLE_CLIENT_ID_STORAGE_KEY);
    }
  } catch {}
}

export interface GoogleVerifiedUser {
  email: string;
  displayName: string;
  photoURL?: string;
  emailVerified: boolean;
  googleSubId: string;
}

let gsiScriptLoadingPromise: Promise<void> | null = null;

export function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();

  // If already loaded
  const win = window as unknown as { google?: { accounts?: { oauth2?: unknown } } };
  if (win.google?.accounts?.oauth2) {
    return Promise.resolve();
  }

  if (gsiScriptLoadingPromise) {
    return gsiScriptLoadingPromise;
  }

  gsiScriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services script'));
    document.head.appendChild(script);
  });

  return gsiScriptLoadingPromise;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: { access_token?: string; error?: string; error_description?: string }) => void;
    error_callback?: (err: unknown) => void;
  }) => GoogleTokenClient;
}

/**
 * Triggers Google's official "Choose an account" popup window (accounts.google.com)
 * where the user can pick from their computer's stored Google accounts.
 */
export async function promptGoogleAccountPicker(): Promise<GoogleVerifiedUser> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID_REQUIRED');
  }

  await loadGoogleGsiScript();

  const win = window as unknown as {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2;
      };
    };
  };

  const oauth2 = win.google?.accounts?.oauth2;
  if (!oauth2) {
    throw new Error('Google Identity Services is not available in this browser.');
  }

  return new Promise((resolve, reject) => {
    let resolved = false;

    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (tokenResponse) => {
        if (resolved) return;
        resolved = true;

        if (tokenResponse.error) {
          reject(new Error(tokenResponse.error_description || tokenResponse.error));
          return;
        }

        if (!tokenResponse.access_token) {
          reject(new Error('No access token returned from Google.'));
          return;
        }

        try {
          // Fetch verified user profile directly from Google's OpenID UserInfo API
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
              Authorization: `Bearer ${tokenResponse.access_token}`,
            },
          });

          if (!res.ok) {
            throw new Error(`Google returned HTTP ${res.status} when verifying identity.`);
          }

          const data = await res.json();
          if (!data.email) {
            throw new Error('Google account did not return a valid email address.');
          }

          resolve({
            email: data.email,
            displayName: data.name || data.given_name || data.email.split('@')[0],
            photoURL: data.picture || undefined,
            emailVerified: Boolean(data.email_verified),
            googleSubId: data.sub,
          });
        } catch (fetchErr) {
          reject(fetchErr instanceof Error ? fetchErr : new Error('Failed to verify Google user info.'));
        }
      },
      error_callback: (err) => {
        if (!resolved) {
          resolved = true;
          reject(err instanceof Error ? err : new Error('Google sign-in popup failed.'));
        }
      },
    });

    // prompt: 'select_account' forces Google's account picker to show all accounts on this computer
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}
