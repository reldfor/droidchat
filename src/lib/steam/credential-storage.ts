import * as SecureStore from 'expo-secure-store';

import { isSteamCredentials, type SteamCredentials } from './credentials';

/**
 * Legacy single-account storage. It is kept so existing installs can migrate
 * into `account-storage`; new code should use the multi-account module.
 */
const STORAGE_PREFIX = 'steam.credentials.v1';

/**
 * Steam's access and refresh tokens are both JWTs. Storing them in one JSON
 * blob risks hitting SecureStore's per-value limits on iOS, so each field gets
 * its own key. `LEGACY_KEY` is the original single-blob format.
 */
const LEGACY_KEY = STORAGE_PREFIX;
const STORAGE_KEYS = {
  steamId: `${STORAGE_PREFIX}.steamId`,
  accountName: `${STORAGE_PREFIX}.accountName`,
  accessToken: `${STORAGE_PREFIX}.accessToken`,
  refreshToken: `${STORAGE_PREFIX}.refreshToken`,
  guardData: `${STORAGE_PREFIX}.guardData`,
} as const;

export async function writeStoredCredentials(next: SteamCredentials | null): Promise<void> {
  if (!next) {
    await Promise.all([
      SecureStore.deleteItemAsync(LEGACY_KEY),
      ...Object.values(STORAGE_KEYS).map((key) => SecureStore.deleteItemAsync(key)),
    ]);
    return;
  }

  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.steamId, next.steamId),
    SecureStore.setItemAsync(STORAGE_KEYS.accountName, next.accountName),
    SecureStore.setItemAsync(STORAGE_KEYS.accessToken, next.accessToken),
    SecureStore.setItemAsync(STORAGE_KEYS.guardData, next.guardData ?? ''),
  ]);
  // Refresh token last: a partial write is never mistaken for a usable session.
  await SecureStore.setItemAsync(STORAGE_KEYS.refreshToken, next.refreshToken);
}

export async function readStoredCredentials(): Promise<SteamCredentials | null> {
  const legacy = await SecureStore.getItemAsync(LEGACY_KEY);

  if (legacy) {
    try {
      const parsed: unknown = JSON.parse(legacy);

      if (isSteamCredentials(parsed)) {
        try {
          await writeStoredCredentials(parsed);
          await SecureStore.deleteItemAsync(LEGACY_KEY);
        } catch {
          // Keep the legacy blob if migration fails; the session still works.
        }
        return parsed;
      }
    } catch {
      // Malformed legacy data: drop it and fall through to the split keys.
    }

    await SecureStore.deleteItemAsync(LEGACY_KEY);
  }

  const [steamId, accountName, accessToken, refreshToken, guardData] = await Promise.all([
    SecureStore.getItemAsync(STORAGE_KEYS.steamId),
    SecureStore.getItemAsync(STORAGE_KEYS.accountName),
    SecureStore.getItemAsync(STORAGE_KEYS.accessToken),
    SecureStore.getItemAsync(STORAGE_KEYS.refreshToken),
    SecureStore.getItemAsync(STORAGE_KEYS.guardData),
  ]);

  if (!steamId || !accountName || !accessToken || !refreshToken) {
    return null;
  }

  return { steamId, accountName, accessToken, refreshToken, guardData: guardData ?? '' };
}
