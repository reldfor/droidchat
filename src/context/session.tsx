import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { persistStoredAccounts, readStoredAccounts } from '@/lib/steam/account-storage';
import {
  mostRecentlyUsed,
  toSessionAccount,
  type SessionAccount,
  type StoredAccount,
  type StoredAccounts,
} from '@/lib/steam/accounts';
import { generateAccessTokenForApp } from '@/lib/steam/auth-api';
import { EResult } from '@/lib/steam/constants';
import type { SteamCredentials } from '@/lib/steam/credentials';
import { shouldRefreshAccessToken } from '@/lib/steam/jwt';

export type { SessionAccount } from '@/lib/steam/accounts';
export type { SteamCredentials } from '@/lib/steam/credentials';

type SessionStatus = 'loading' | 'signed-in' | 'signed-out';
type TokenRefresher = typeof generateAccessTokenForApp;

type SessionContextValue = {
  status: SessionStatus;
  /** Credentials for the active account, or `null` when signed out. */
  credentials: SteamCredentials | null;
  /** Every saved account, active first, then most recently used. */
  accounts: SessionAccount[];
  activeAccount: SessionAccount | null;
  accountName: string | null;
  /** Changes whenever credentials are explicitly replaced, even for the same account. */
  authRevision: number;
  signIn: (credentials: SteamCredentials) => void;
  switchAccount: (steamId: string) => void;
  removeAccount: (steamId: string) => void;
  signOut: () => void;
  /** Renews the active account's access token when it is close to expiring. */
  refreshSession: () => Promise<void>;
  /** A supplied CM refresher forces a fresh, persisted upload cookie token. */
  getAccessToken: (refreshTokens?: TokenRefresher) => Promise<string>;
  /**
   * Forces a new website-scoped access token for Community requests, even if
   * the cached token has not expired locally.
   */
  getWebAccessToken: () => Promise<string>;
  updateAccountProfile: (steamId: string, profile: { personaName?: string }) => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [accounts, setAccounts] = useState<SessionAccount[]>([]);
  const [activeSteamId, setActiveSteamId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<SteamCredentials | null>(null);
  const [authRevision, setAuthRevision] = useState(0);

  const storedRef = useRef<StoredAccount[]>([]);
  const activeSteamIdRef = useRef<string | null>(null);
  const credentialsRef = useRef<SteamCredentials | null>(null);
  /** Bumped whenever the active session is replaced, including account switches. */
  const sessionGenerationRef = useRef(0);
  const refreshingRef = useRef<{
    credentials: SteamCredentials;
    refresh: TokenRefresher;
    promise: Promise<void>;
  } | null>(null);

  /**
   * Keep the in-memory graph and the React state in sync. Refs are updated
   * synchronously so callbacks can use the newest account immediately.
   */
  const applyState = useCallback((nextAccounts: StoredAccount[], nextActiveId: string | null) => {
    storedRef.current = nextAccounts;
    activeSteamIdRef.current = nextActiveId;
    sessionGenerationRef.current += 1;

    const active = nextAccounts.find((account) => account.steamId === nextActiveId) ?? null;

    credentialsRef.current = active?.credentials ?? null;
    setAccounts(nextAccounts.map(toSessionAccount));
    setActiveSteamId(nextActiveId);
    setCredentials(active?.credentials ?? null);
    setStatus(active ? 'signed-in' : 'signed-out');
  }, []);

  const persist = useCallback(() => {
    const state: StoredAccounts = {
      accounts: storedRef.current,
      activeSteamId: activeSteamIdRef.current,
    };

    // Persisting is best-effort: the in-memory session still works.
    void persistStoredAccounts(state).catch(() => {});
  }, []);

  const removeAccount = useCallback(
    (steamId: string) => {
      if (!storedRef.current.some((account) => account.steamId === steamId)) {
        return;
      }

      const remaining = storedRef.current.filter((account) => account.steamId !== steamId);
      const nextActiveId =
        activeSteamIdRef.current === steamId
          ? (mostRecentlyUsed(remaining)?.steamId ?? null)
          : activeSteamIdRef.current;

      applyState(remaining, nextActiveId);
      persist();
    },
    [applyState, persist],
  );

  const refreshAccessToken = useCallback(
    function refreshWith(refreshTokens: TokenRefresher, force = false): Promise<void> {
      const current = credentialsRef.current;
      if (!current) return Promise.resolve();
      const generation = sessionGenerationRef.current;
      const running = refreshingRef.current;

      if (running?.credentials === current) {
        // A CM upload refresh must not inherit a failed HTTP refresh. Wait for
        // it to finish (including any token rotation), then use the CM transport.
        if (force && running.refresh !== refreshTokens) {
          return running.promise.catch(() => {}).then(() => {
            if (sessionGenerationRef.current !== generation) {
              throw new Error('Your Steam session changed. Choose the image again.');
            }
            return refreshWith(refreshTokens, force);
          });
        }
        return running.promise;
      }
      if (!force && !shouldRefreshAccessToken(current.accessToken)) {
        return Promise.resolve();
      }

      const refreshing = (async () => {
        try {
          const result = await refreshTokens({
            refreshToken: current.refreshToken,
            steamId: current.steamId,
          });

          if (!result.accessToken || shouldRefreshAccessToken(result.accessToken)) {
            throw new Error('Steam could not refresh the image upload session. Try again.');
          }

          const stored = storedRef.current.find(
            (account) => account.steamId === current.steamId,
          );

          // The account was removed or signed in again while the request was in
          // flight; never overwrite the newer credentials.
          if (!stored || stored.credentials !== current) {
            throw new Error('Your Steam session changed. Choose the image again.');
          }

          const nextCredentials: SteamCredentials = {
            ...current,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken || current.refreshToken,
          };
          const nextAccounts = storedRef.current.map((account) =>
            account.steamId === current.steamId
              ? { ...account, credentials: nextCredentials }
              : account,
          );

          storedRef.current = nextAccounts;
          setAccounts(nextAccounts.map(toSessionAccount));

          // The user may have switched accounts while the request was in
          // flight. The refreshed token is still useful for the saved account,
          // but only the active account may update the live credentials.
          if (activeSteamIdRef.current === current.steamId) {
            credentialsRef.current = nextCredentials;
            setCredentials(nextCredentials);
          }

          persist();

          if (sessionGenerationRef.current !== generation) {
            throw new Error('Your Steam session changed. Choose the image again.');
          }
        } catch (error) {
          // A failed refresh keeps the stored credentials for retry. AccessDenied
          // can mean the routing access token expired while refresh is still valid.
          const result = error instanceof Error && 'eresult' in error ? error.eresult : undefined;
          const stored = storedRef.current.find(
            (account) => account.steamId === current.steamId,
          );

          if (
            stored?.credentials === current &&
            credentialsRef.current === current &&
            (result === EResult.Revoked ||
              result === EResult.Expired ||
              result === EResult.AccountDisabled ||
              result === EResult.AccountNotFound)
          ) {
            removeAccount(current.steamId);
          }
          throw error;
        }
      })();

      const promise = refreshing.finally(() => {
        if (refreshingRef.current?.promise === promise) refreshingRef.current = null;
      });
      refreshingRef.current = { credentials: current, refresh: refreshTokens, promise };
      return promise;
    },
    [persist, removeAccount],
  );

  const refreshSession = useCallback(async () => {
    // Background refresh is best effort; explicit token acquisition below
    // propagates failures and never falls back to an unusable access token.
    try {
      await refreshAccessToken(generateAccessTokenForApp);
    } catch {
      /* Retry on the next foreground refresh. */
    }
  }, [refreshAccessToken]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const stored = await readStoredAccounts();

        if (cancelled) {
          return;
        }

        if (stored.accounts.length === 0) {
          setStatus('signed-out');
          return;
        }

        const active =
          stored.accounts.find((account) => account.steamId === stored.activeSteamId) ??
          mostRecentlyUsed(stored.accounts);

        applyState(stored.accounts, active?.steamId ?? null);
        void refreshSession();
      } catch {
        if (!cancelled) {
          setStatus('signed-out');
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [applyState, refreshSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refreshSession();
      }
    });

    return () => subscription.remove();
  }, [refreshSession]);

  // A chat app can stay in the foreground for days, so also check periodically
  // instead of only when the app returns from the background.
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshSession();
    }, 15 * 60 * 1000);

    return () => clearInterval(timer);
  }, [refreshSession]);

  const signIn = useCallback(
    (next: SteamCredentials) => {
      const now = Date.now();
      const existing = storedRef.current.find((account) => account.steamId === next.steamId);
      const account: StoredAccount = {
        steamId: next.steamId,
        accountName: next.accountName,
        personaName: existing?.personaName ?? null,
        addedAt: existing?.addedAt ?? now,
        lastUsedAt: now,
        credentials: next,
      };
      const nextAccounts = [
        account,
        ...storedRef.current.filter((entry) => entry.steamId !== next.steamId),
      ];

      applyState(nextAccounts, next.steamId);
      setAuthRevision((current) => current + 1);
      persist();
    },
    [applyState, persist],
  );

  const switchAccount = useCallback(
    (steamId: string) => {
      if (steamId === activeSteamIdRef.current) {
        return;
      }

      const target = storedRef.current.find((account) => account.steamId === steamId);

      if (!target) {
        return;
      }

      const now = Date.now();
      const nextAccounts = storedRef.current.map((account) =>
        account.steamId === steamId ? { ...account, lastUsedAt: now } : account,
      );

      applyState(nextAccounts, steamId);
      persist();
      void refreshSession();
    },
    [applyState, persist, refreshSession],
  );

  const signOut = useCallback(() => {
    const activeId = activeSteamIdRef.current;

    if (activeId) {
      removeAccount(activeId);
    }
  }, [removeAccount]);

  const updateAccountProfile = useCallback(
    (steamId: string, profile: { personaName?: string }) => {
      const personaName = profile.personaName?.trim();

      if (!steamId || !personaName) {
        return;
      }

      const account = storedRef.current.find((entry) => entry.steamId === steamId);

      if (!account || account.personaName === personaName) {
        return;
      }

      const nextAccounts = storedRef.current.map((entry) =>
        entry.steamId === steamId ? { ...entry, personaName } : entry,
      );

      storedRef.current = nextAccounts;
      setAccounts(nextAccounts.map(toSessionAccount));
      persist();
    },
    [persist],
  );

  const getAccessToken = useCallback(
    async (refreshTokens?: TokenRefresher) => {
      const account = credentialsRef.current?.steamId;
      await refreshAccessToken(refreshTokens ?? generateAccessTokenForApp, !!refreshTokens);
      const current = credentialsRef.current;
      if (!current?.accessToken) throw new Error('Sign in to Steam before uploading an image.');
      if (current.steamId !== account) {
        throw new Error('Your Steam session changed. Choose the image again.');
      }
      if (shouldRefreshAccessToken(current.accessToken)) {
        throw new Error('Steam could not refresh the image upload session. Try again.');
      }
      return current.accessToken;
    },
    [refreshAccessToken],
  );

  const getWebAccessToken = useCallback(async () => {
    const account = credentialsRef.current?.steamId;
    // Always go through the auth service, including when the persisted token
    // was derived over the CM by an older build.
    await refreshAccessToken(generateAccessTokenForApp, true);
    const current = credentialsRef.current;
    if (!current?.accessToken) throw new Error('Sign in to Steam before uploading an image.');
    if (current.steamId !== account) {
      throw new Error('Your Steam session changed. Choose the image again.');
    }
    if (shouldRefreshAccessToken(current.accessToken)) {
      throw new Error('Steam could not refresh the image upload session. Try again.');
    }
    return current.accessToken;
  }, [refreshAccessToken]);

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      if (a.steamId === activeSteamId) {
        return -1;
      }

      if (b.steamId === activeSteamId) {
        return 1;
      }

      return b.lastUsedAt - a.lastUsedAt;
    });
  }, [accounts, activeSteamId]);

  const activeAccount = useMemo(
    () => sortedAccounts.find((account) => account.steamId === activeSteamId) ?? null,
    [activeSteamId, sortedAccounts],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      credentials,
      accounts: sortedAccounts,
      activeAccount,
      accountName: credentials?.accountName ?? null,
      authRevision,
      signIn,
      switchAccount,
      removeAccount,
      signOut,
      refreshSession,
      getAccessToken,
      getWebAccessToken,
      updateAccountProfile,
    }),
    [
      activeAccount,
      authRevision,
      credentials,
      getAccessToken,
      getWebAccessToken,
      refreshSession,
      removeAccount,
      signIn,
      signOut,
      sortedAccounts,
      status,
      switchAccount,
      updateAccountProfile,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error('useSession must be used inside SessionProvider');
  }

  return session;
}
