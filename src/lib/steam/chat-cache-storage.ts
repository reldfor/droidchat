import { Directory, File, Paths } from 'expo-file-system';

import { parseChatCache, type ChatCache } from './chat-cache';

/**
 * Chat history is too large for SecureStore. Keep it in the app's private
 * documents directory instead, one JSON document per Steam account.
 */
const CACHE_DIRECTORY = 'steam-chat-cache';
const FILE_PREFIX = 'chat-cache-v1';

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

function cacheDirectory(): Directory {
  const directory = new Directory(Paths.document, CACHE_DIRECTORY);

  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }

  return directory;
}

function cacheFile(steamId: string): File {
  return new File(cacheDirectory(), `${FILE_PREFIX}-${steamId}.json`);
}

function isValidSteamId(steamId: string): boolean {
  return /^\d{17}$/.test(steamId);
}

export async function readChatCache(steamId: string): Promise<ChatCache | null> {
  if (!isValidSteamId(steamId)) {
    return null;
  }

  try {
    const file = cacheFile(steamId);

    if (!file.exists) {
      return null;
    }

    const cache = parseChatCache(JSON.parse(await file.text()));

    return cache?.steamId === steamId ? cache : null;
  } catch {
    // A missing or corrupt cache must only mean a slower first paint.
    return null;
  }
}

export function writeChatCache(steamId: string, cache: ChatCache): Promise<void> {
  if (!isValidSteamId(steamId) || cache.steamId !== steamId) {
    return Promise.resolve();
  }

  const document = JSON.stringify(cache);

  return enqueueWrite(async () => {
    try {
      await cacheFile(steamId).write(document);
    } catch {
      // Caching is best effort; the live state still works without it.
    }
  });
}

export async function clearChatCaches(steamIds: readonly string[]): Promise<void> {
  await Promise.all([...new Set(steamIds)].map((steamId) => clearChatCache(steamId)));
}

export function clearChatCache(steamId: string): Promise<void> {
  if (!isValidSteamId(steamId)) {
    return Promise.resolve();
  }

  return enqueueWrite(async () => {
    try {
      const file = cacheFile(steamId);

      if (file.exists) {
        file.delete();
      }
    } catch {
      // Signing out must never be blocked by a cache cleanup failure.
    }
  });
}
