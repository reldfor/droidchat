import { parseChatCache, type ChatCache } from './chat-cache';

/**
 * Web has no private app directory. localStorage is origin-scoped and the
 * cache is already bounded by the serializer, so keep one document per
 * account there.
 */
const STORAGE_PREFIX = 'droiddeck.chat-cache.v1';

function storageKey(steamId: string): string {
  return `${STORAGE_PREFIX}.${steamId}`;
}

function isValidSteamId(steamId: string): boolean {
  return /^\d{17}$/.test(steamId);
}

export async function readChatCache(steamId: string): Promise<ChatCache | null> {
  if (!isValidSteamId(steamId) || typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(storageKey(steamId));

    if (!stored) {
      return null;
    }

    const cache = parseChatCache(JSON.parse(stored));

    return cache?.steamId === steamId ? cache : null;
  } catch {
    return null;
  }
}

export async function writeChatCache(steamId: string, cache: ChatCache): Promise<void> {
  if (!isValidSteamId(steamId) || cache.steamId !== steamId || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey(steamId), JSON.stringify(cache));
  } catch {
    // Private mode or a full quota only makes the cache unavailable.
  }
}

export async function clearChatCaches(steamIds: readonly string[]): Promise<void> {
  await Promise.all([...new Set(steamIds)].map((steamId) => clearChatCache(steamId)));
}

export async function clearChatCache(steamId: string): Promise<void> {
  if (!isValidSteamId(steamId) || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey(steamId));
  } catch {
    // Ignore storage failures during sign-out.
  }
}
