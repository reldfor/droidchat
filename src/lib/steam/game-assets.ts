/**
 * Store metadata for the games friends are playing.
 *
 * Steam's client gets game icons from its local app-info cache. A chat-only
 * client does not have that cache, so the public StoreBrowse service is the
 * smallest way to resolve an app id to a community icon. Requests are batched,
 * cached for the session, and treated as optional: the friends list still
 * works when the store cannot be reached.
 */

export type GameAssets = {
  appId: number;
  name: string | null;
  /** Steam community icon; null when the store omitted the hash. */
  iconUrl: string | null;
};

type UnknownRecord = Record<string, unknown>;

type CachedGameAssets = {
  assets: GameAssets;
  fetchedAt: number;
};

const STORE_BROWSE_URL = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';
const COMMUNITY_ICON_BASE = 'https://shared.steamstatic.com/community_assets/images/apps/';
const STORE_ASSET_BASE = 'https://shared.steamstatic.com/store_item_assets/steam/apps/';
const MAX_BATCH_SIZE = 50;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

const cache = new Map<number, CachedGameAssets>();
const pending = new Map<number, Promise<GameAssets | null>>();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function appIdOf(value: unknown): number | null {
  const appId = typeof value === 'number' ? value : Number(value);

  return Number.isInteger(appId) && appId > 0 ? appId : null;
}

export function communityIconUrl(appId: number, hash: string): string {
  return `${COMMUNITY_ICON_BASE}${appId}/${hash}.jpg`;
}

/**
 * A wordmark with a transparent background. Used while the community icon is
 * loading or when the store response cannot provide one; the component draws
 * it contained on a dark tile.
 */
export function gameLogoUrl(appId: number): string {
  return `${STORE_ASSET_BASE}${appId}/logo.png`;
}

/** Parse the `store_items` payload without trusting its shape. */
export function parseStoreItems(value: unknown): GameAssets[] {
  if (!isRecord(value) || !isRecord(value.response)) {
    return [];
  }

  const items = value.response.store_items;

  if (!Array.isArray(items)) {
    return [];
  }

  const assets: GameAssets[] = [];

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    const appId = appIdOf(item.appid);

    if (!appId) {
      continue;
    }

    const itemAssets = isRecord(item.assets) ? item.assets : {};
    const hash =
      typeof itemAssets.community_icon === 'string' && itemAssets.community_icon.trim()
        ? itemAssets.community_icon.trim()
        : null;
    const name =
      typeof item.name === 'string' && item.name.trim() ? item.name.trim() : null;

    assets.push({
      appId,
      name,
      iconUrl: hash ? communityIconUrl(appId, hash) : null,
    });
  }

  return assets;
}

async function fetchBatch(appIds: number[]): Promise<GameAssets[]> {
  const input = {
    ids: appIds.map((appid) => ({ appid })),
    context: { language: 'english', country_code: 'US' },
    data_request: { include_assets: true },
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${STORE_BROWSE_URL}?input_json=${encodeURIComponent(JSON.stringify(input))}`,
      { signal: controller.signal },
    );

    if (!response.ok) {
      throw new Error(`Steam store returned ${response.status}`);
    }

    return parseStoreItems(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

function freshAssets(appId: number, now: number): GameAssets | null {
  const entry = cache.get(appId);

  if (!entry || now - entry.fetchedAt > CACHE_TTL_MS) {
    return null;
  }

  return entry.assets;
}

/**
 * Resolve any number of app ids, reusing the session cache. Assets that are
 * already cached are returned without a network request. A failed lookup is
 * deliberately not cached, so a later friend-list visit can retry.
 */
export async function loadGameAssets(
  appIds: readonly number[],
): Promise<Record<number, GameAssets>> {
  const ids = [...new Set(appIds.map(appIdOf).filter((id): id is number => id !== null))];
  const now = Date.now();
  const assets: Record<number, GameAssets> = {};
  const missing: number[] = [];

  for (const appId of ids) {
    const cached = freshAssets(appId, now);

    if (cached) {
      assets[appId] = cached;
    } else if (!pending.has(appId)) {
      missing.push(appId);
    }
  }

  if (missing.length > 0) {
    const batches = chunks(missing, MAX_BATCH_SIZE);
    const request = Promise.allSettled(batches.map(fetchBatch)).then((results) => {
      const fetched: GameAssets[] = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          fetched.push(...result.value);
        }
      }

      const fetchedAt = Date.now();

      for (const entry of fetched) {
        cache.set(entry.appId, { assets: entry, fetchedAt });
      }

      return fetched;
    });

    for (const appId of missing) {
      pending.set(
        appId,
        request
          .then((fetched) => fetched.find((entry) => entry.appId === appId) ?? null)
          .catch(() => null),
      );
    }

    void request
      .finally(() => {
        for (const appId of missing) {
          pending.delete(appId);
        }
      })
      .catch(() => {
        // Individual waiters already resolve to null.
      });
  }

  const waits = ids
    .filter((appId) => !assets[appId] && pending.has(appId))
    .map((appId) => pending.get(appId)!);

  await Promise.all(waits);

  const resolvedAt = Date.now();

  for (const appId of ids) {
    const cached = freshAssets(appId, resolvedAt);

    if (cached) {
      assets[appId] = cached;
    }
  }

  return assets;
}

/** Synchronous lookup for a warm session cache (used for the first render). */
export function getCachedGameAssets(appIds: readonly number[]): Record<number, GameAssets> {
  const now = Date.now();
  const assets: Record<number, GameAssets> = {};

  for (const appId of appIds) {
    const cached = freshAssets(appId, now);

    if (cached) {
      assets[appId] = cached;
    }
  }

  return assets;
}
