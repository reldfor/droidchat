import { isSteamCredentials, type SteamCredentials } from './credentials';

/**
 * Legacy single-account storage. It is kept so existing installs can migrate
 * into `account-storage`; new code should use the multi-account module.
 *
 * Web has no secure key-value store. Keep the session in localStorage so a
 * reload does not sign the user out; the tokens never leave this origin.
 */
const STORAGE_KEY = 'steam.credentials.v1';

export async function readStoredCredentials(): Promise<SteamCredentials | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      return null;
    }

    const parsed: unknown = JSON.parse(stored);
    return isSteamCredentials(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeStoredCredentials(next: SteamCredentials | null): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (!next) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
