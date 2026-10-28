import * as SecureStore from 'expo-secure-store';

import {
  isSessionAccount,
  mostRecentlyUsed,
  toSessionAccount,
  type SessionAccount,
  type StoredAccount,
  type StoredAccounts,
} from './accounts';
import { readStoredCredentials, writeStoredCredentials } from './credential-storage';
import type { SteamCredentials } from './credentials';

/**
 * v2 account storage. Steam's tokens are JWTs, so each secret gets its own
 * SecureStore key (the same reason the single-account format was split). The
 * manifest is a small JSON document with the non-secret metadata and the
 * active account id.
 */
const INDEX_KEY = 'steam.accounts.v2.index';
const SECRET_PREFIX = 'steam.accounts.v2';

type AccountsManifest = {
  version: 1;
  activeSteamId: string | null;
  accounts: SessionAccount[];
};

type AccountSecretKeys = {
  accessToken: string;
  refreshToken: string;
  guardData: string;
};

function secretKeys(steamId: string): AccountSecretKeys {
  return {
    accessToken: `${SECRET_PREFIX}.${steamId}.accessToken`,
    refreshToken: `${SECRET_PREFIX}.${steamId}.refreshToken`,
    guardData: `${SECRET_PREFIX}.${steamId}.guardData`,
  };
}

/**
 * SecureStore has no transactions. Serialize writes so a slow switch cannot
 * overwrite a newer account list with a stale one.
 */
let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

function emptyState(): StoredAccounts {
  return { accounts: [], activeSteamId: null };
}

function storedAccountFromCredentials(
  credentials: SteamCredentials,
  now: number,
): StoredAccount {
  return {
    steamId: credentials.steamId,
    accountName: credentials.accountName,
    personaName: null,
    addedAt: now,
    lastUsedAt: now,
    credentials,
  };
}

async function readManifest(): Promise<AccountsManifest | null> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const candidate = parsed as Partial<AccountsManifest>;

    if (candidate.version !== 1 || !Array.isArray(candidate.accounts)) {
      return null;
    }

    return {
      version: 1,
      activeSteamId:
        typeof candidate.activeSteamId === 'string' ? candidate.activeSteamId : null,
      accounts: candidate.accounts.filter(isSessionAccount),
    };
  } catch {
    return null;
  }
}

async function readAccount(metadata: SessionAccount): Promise<StoredAccount | null> {
  const keys = secretKeys(metadata.steamId);
  const [accessToken, refreshToken, guardData] = await Promise.all([
    SecureStore.getItemAsync(keys.accessToken),
    SecureStore.getItemAsync(keys.refreshToken),
    SecureStore.getItemAsync(keys.guardData),
  ]);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    ...metadata,
    credentials: {
      steamId: metadata.steamId,
      accountName: metadata.accountName,
      accessToken,
      refreshToken,
      guardData: guardData ?? '',
    },
  };
}

async function migrateLegacyCredentials(): Promise<StoredAccounts> {
  const legacy = await readStoredCredentials();

  if (!legacy) {
    return emptyState();
  }

  const account = storedAccountFromCredentials(legacy, Date.now());
  const state: StoredAccounts = {
    accounts: [account],
    activeSteamId: legacy.steamId,
  };

  try {
    // Write the new format first: if it fails, the legacy session is still
    // there for the next launch.
    await persistStoredAccounts(state);
    await writeStoredCredentials(null);
  } catch {
    // Keep the legacy credentials; the in-memory session still works.
  }

  return state;
}

async function readStoredAccountsInternal(): Promise<StoredAccounts> {
  try {
    const manifest = await readManifest();

    if (manifest && manifest.accounts.length > 0) {
      const accounts = (
        await Promise.all(
          manifest.accounts.map(async (metadata) => {
            try {
              return await readAccount(metadata);
            } catch {
              // One unreadable key should not hide the other accounts.
              return null;
            }
          }),
        )
      ).filter((account): account is StoredAccount => account !== null);

      if (accounts.length > 0) {
        const active =
          accounts.find((account) => account.steamId === manifest.activeSteamId) ??
          mostRecentlyUsed(accounts);

        return {
          accounts,
          activeSteamId: active?.steamId ?? null,
        };
      }
    }
  } catch {
    // Fall through to the legacy single-account format.
  }

  try {
    return await migrateLegacyCredentials();
  } catch {
    return emptyState();
  }
}

/**
 * Deduplicates concurrent restores (for example React's development Strict
 * Mode), which could otherwise race while migrating the legacy format.
 */
let pendingRead: Promise<StoredAccounts> | null = null;

export function readStoredAccounts(): Promise<StoredAccounts> {
  if (!pendingRead) {
    pendingRead = readStoredAccountsInternal().finally(() => {
      pendingRead = null;
    });
  }

  return pendingRead;
}

export function persistStoredAccounts(state: StoredAccounts): Promise<void> {
  return enqueueWrite(async () => {
    let previous: AccountsManifest | null = null;

    try {
      previous = await readManifest();
    } catch {
      // A missing manifest just means there is nothing to clean up.
    }

    const currentIds = new Set(state.accounts.map((account) => account.steamId));
    const removedIds = (previous?.accounts ?? [])
      .map((account) => account.steamId)
      .filter((steamId) => !currentIds.has(steamId));

    for (const account of state.accounts) {
      const keys = secretKeys(account.steamId);

      await Promise.all([
        SecureStore.setItemAsync(keys.accessToken, account.credentials.accessToken),
        SecureStore.setItemAsync(keys.guardData, account.credentials.guardData ?? ''),
      ]);
      // Refresh token last: a partial write is never mistaken for a usable
      // account if the manifest has not been updated yet.
      await SecureStore.setItemAsync(keys.refreshToken, account.credentials.refreshToken);
    }

    await Promise.allSettled(
      removedIds.flatMap((steamId) =>
        Object.values(secretKeys(steamId)).map((key) => SecureStore.deleteItemAsync(key)),
      ),
    );

    const manifest: AccountsManifest = {
      version: 1,
      activeSteamId: state.activeSteamId,
      accounts: state.accounts.map(toSessionAccount),
    };

    // Manifest last: the accounts it references are fully written by now.
    await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(manifest));
  });
}
