import {
  isStoredAccount,
  mostRecentlyUsed,
  type StoredAccount,
  type StoredAccounts,
} from './accounts';
import { readStoredCredentials, writeStoredCredentials } from './credential-storage';

/**
 * Web has no secure key-value store. Keep every saved session in one
 * localStorage document, matching the existing single-account behavior; the
 * tokens never leave this origin.
 */
const INDEX_KEY = 'steam.accounts.v2';

type WebAccountsDocument = {
  version: 1;
  activeSteamId: string | null;
  accounts: StoredAccount[];
};

function emptyState(): StoredAccounts {
  return { accounts: [], activeSteamId: null };
}

function parseDocument(raw: string): StoredAccounts | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const candidate = parsed as Partial<WebAccountsDocument>;

    if (candidate.version !== 1 || !Array.isArray(candidate.accounts)) {
      return null;
    }

    const accounts = candidate.accounts.filter(isStoredAccount);
    const active =
      accounts.find((account) => account.steamId === candidate.activeSteamId) ??
      mostRecentlyUsed(accounts);

    return {
      accounts,
      activeSteamId: active?.steamId ?? null,
    };
  } catch {
    return null;
  }
}

async function migrateLegacyCredentials(): Promise<StoredAccounts> {
  const legacy = await readStoredCredentials();

  if (!legacy) {
    return emptyState();
  }

  const now = Date.now();
  const account: StoredAccount = {
    steamId: legacy.steamId,
    accountName: legacy.accountName,
    personaName: null,
    addedAt: now,
    lastUsedAt: now,
    credentials: legacy,
  };
  const state: StoredAccounts = {
    accounts: [account],
    activeSteamId: legacy.steamId,
  };

  try {
    await persistStoredAccounts(state);
    await writeStoredCredentials(null);
  } catch {
    // Keep the legacy session if the new format cannot be written.
  }

  return state;
}

async function readStoredAccountsInternal(): Promise<StoredAccounts> {
  if (typeof window === 'undefined') {
    return emptyState();
  }

  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    const parsed = raw ? parseDocument(raw) : null;

    if (parsed && parsed.accounts.length > 0) {
      return parsed;
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

/** Deduplicates concurrent restores while the legacy format migrates. */
let pendingRead: Promise<StoredAccounts> | null = null;

export function readStoredAccounts(): Promise<StoredAccounts> {
  if (!pendingRead) {
    pendingRead = readStoredAccountsInternal().finally(() => {
      pendingRead = null;
    });
  }

  return pendingRead;
}

export async function persistStoredAccounts(state: StoredAccounts): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (state.accounts.length === 0) {
    window.localStorage.removeItem(INDEX_KEY);
    return;
  }

  const document: WebAccountsDocument = {
    version: 1,
    activeSteamId: state.activeSteamId,
    accounts: state.accounts,
  };

  window.localStorage.setItem(INDEX_KEY, JSON.stringify(document));
}
