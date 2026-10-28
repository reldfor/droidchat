import { isSteamCredentials, type SteamCredentials } from './credentials';

/**
 * Non-secret account metadata used by the account switcher. Tokens live in
 * `StoredAccount.credentials` and are only read by the session provider.
 */
export type SessionAccount = {
  steamId: string;
  accountName: string;
  /** Last persona name Steam reported for this account. */
  personaName: string | null;
  /** Unix milliseconds. */
  addedAt: number;
  /** Unix milliseconds; the active account is the one used most recently. */
  lastUsedAt: number;
};

export type StoredAccount = SessionAccount & {
  credentials: SteamCredentials;
};

export type StoredAccounts = {
  accounts: StoredAccount[];
  activeSteamId: string | null;
};

export function toSessionAccount(account: StoredAccount): SessionAccount {
  return {
    steamId: account.steamId,
    accountName: account.accountName,
    personaName: account.personaName,
    addedAt: account.addedAt,
    lastUsedAt: account.lastUsedAt,
  };
}

export function accountDisplayName(
  account: Pick<SessionAccount, 'accountName' | 'personaName'>,
): string {
  const personaName = account.personaName?.trim();
  return personaName || account.accountName;
}

export function mostRecentlyUsed<T extends { lastUsedAt: number }>(
  accounts: readonly T[],
): T | null {
  let latest: T | null = null;

  for (const account of accounts) {
    if (!latest || account.lastUsedAt > latest.lastUsedAt) {
      latest = account;
    }
  }

  return latest;
}

export function isSessionAccount(value: unknown): value is SessionAccount {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SessionAccount>;

  return (
    typeof candidate.steamId === 'string' &&
    /^\d+$/.test(candidate.steamId) &&
    typeof candidate.accountName === 'string' &&
    (candidate.personaName === null || typeof candidate.personaName === 'string') &&
    typeof candidate.addedAt === 'number' &&
    Number.isFinite(candidate.addedAt) &&
    typeof candidate.lastUsedAt === 'number' &&
    Number.isFinite(candidate.lastUsedAt)
  );
}

export function isStoredAccount(value: unknown): value is StoredAccount {
  if (!isSessionAccount(value)) {
    return false;
  }

  const candidate = value as Partial<StoredAccount>;

  return (
    isSteamCredentials(candidate.credentials) &&
    candidate.credentials.steamId === candidate.steamId
  );
}
