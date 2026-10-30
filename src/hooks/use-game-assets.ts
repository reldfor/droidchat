import { useEffect, useMemo, useState } from 'react';

import {
  getCachedGameAssets,
  loadGameAssets,
  type GameAssets,
} from '@/lib/steam/game-assets';

/**
 * Resolve the games currently being played to store assets. The cache lives
 * at module scope, so opening the friends list again does not re-fetch.
 */
export function useGameAssets(appIds: readonly number[]): Record<number, GameAssets> {
  const key = useMemo(
    () => [...new Set(appIds)].sort((a, b) => a - b).join(','),
    [appIds],
  );
  const [assets, setAssets] = useState<Record<number, GameAssets>>(() =>
    getCachedGameAssets(key ? key.split(',').map(Number) : []),
  );

  useEffect(() => {
    if (!key) {
      return;
    }

    let cancelled = false;
    const ids = key.split(',').map(Number);

    void loadGameAssets(ids)
      .then((next) => {
        if (!cancelled && Object.keys(next).length > 0) {
          setAssets((current) => ({ ...current, ...next }));
        }
      })
      .catch(() => {
        // The friends list remains usable with its wordmark fallback.
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return assets;
}
