import * as SecureStore from 'expo-secure-store';

import { normalizeInterfaceSettings, type InterfaceSettings } from './settings';

const STORAGE_KEY = 'droiddeck.settings.v1';

/**
 * SecureStore writes are asynchronous. Serialize them so a fast sequence of
 * toggles cannot land out of order and restore an older value on next launch.
 */
let writeQueue: Promise<void> = Promise.resolve();

export async function readInterfaceSettings(): Promise<InterfaceSettings | null> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    return stored ? normalizeInterfaceSettings(JSON.parse(stored)) : null;
  } catch {
    // Settings are best-effort; the in-memory defaults still work.
    return null;
  }
}

export function writeInterfaceSettings(settings: InterfaceSettings): Promise<void> {
  const run = writeQueue.then(async () => {
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // A storage failure must not make the settings screens unusable.
    }
  });

  writeQueue = run.catch(() => {});
  return run;
}
