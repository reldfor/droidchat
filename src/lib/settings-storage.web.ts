import { normalizeInterfaceSettings, type InterfaceSettings } from './settings';

const STORAGE_KEY = 'droiddeck.settings.v1';

export async function readInterfaceSettings(): Promise<InterfaceSettings | null> {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? normalizeInterfaceSettings(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export async function writeInterfaceSettings(settings: InterfaceSettings): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings are best-effort; storage may be unavailable in private mode.
  }
}
