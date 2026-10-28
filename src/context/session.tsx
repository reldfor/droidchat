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

import { generateAccessTokenForApp } from '@/lib/steam/auth-api';
import { EResult } from '@/lib/steam/constants';
import {
  readStoredCredentials,
  writeStoredCredentials,
} from '@/lib/steam/credential-storage';
import type { SteamCredentials } from '@/lib/steam/credentials';
import { shouldRefreshAccessToken } from '@/lib/steam/jwt';

export type { SteamCredentials } from '@/lib/steam/credentials';

type SessionStatus = 'loading' | 'signed-in' | 'signed-out';
type TokenRefresher = typeof generateAccessTokenForApp;

type SessionContextValue = {
  status: SessionStatus;
  credentials: SteamCredentials | null;
  accountName: string | null;
  signIn: (credentials: SteamCredentials) => void;
  signOut: () => void;
  /** Renews the access token when it is close to expiring. */
  refreshSession: () => Promise<void>;
  /** A supplied CM refresher forces a fresh, persisted upload cookie token. */
  getAccessToken: (refreshTokens?: TokenRefresher) => Promise<string>;
  /**
   * Forces a new website-scoped access token for Community requests, even if
   * the cached token has not expired locally.
   */
  getWebAccessToken: () => Promise<string>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [credentials, setCredentials] = useState<SteamCredentials | null>(null);
  const credentialsRef = useRef<SteamCredentials | null>(null);
  const sessionGenerationRef = useRef(0);
  const refreshingRef = useRef<{
    credentials: SteamCredentials;
    refresh: TokenRefresher;
    promise: Promise<void>;
  } | null>(null);

  const persist = useCallback(async (next: SteamCredentials | null) => {
    try {
      await writeStoredCredentials(next);
    } catch {
      // Persisting is best-effort: the in-memory session still works.
    }
  }, []);

  const signOut = useCallback(() => {
    sessionGenerationRef.current += 1;
    credentialsRef.current = null;
    setCredentials(null);
    setStatus('signed-out');
    void persist(null);
  }, [persist]);

  const refreshAccessToken = useCallback(function refreshWith(
    refreshTokens: TokenRefresher,
    force = false,
  ): Promise<void> {
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

        // The session may have been replaced (or signed out) while the request
        // was in flight; never clobber the newer credentials.
        if (credentialsRef.current !== current) {
          throw new Error('Your Steam session changed. Choose the image again.');
        }

        const next: SteamCredentials = {
          ...current,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || current.refreshToken,
        };

        credentialsRef.current = next;
        setCredentials(next);
        void persist(next);
      } catch (error) {
        // A failed refresh keeps the stored credentials for retry. AccessDenied
        // can mean the routing access token expired while refresh is still valid.
        const result = error instanceof Error && 'eresult' in error ? error.eresult : undefined;
        if (credentialsRef.current === current &&
          (result === EResult.Revoked || result === EResult.Expired ||
            result === EResult.AccountDisabled || result === EResult.AccountNotFound)) {
          signOut();
        }
        throw error;
      }
    })();
    const promise = refreshing.finally(() => {
      if (refreshingRef.current?.promise === promise) refreshingRef.current = null;
    });
    refreshingRef.current = { credentials: current, refresh: refreshTokens, promise };
    return promise;
  }, [persist, signOut]);

  const refreshSession = useCallback(async () => {
    // Background refresh is best effort; explicit token acquisition below
    // propagates failures and never falls back to an unusable access token.
    try { await refreshAccessToken(generateAccessTokenForApp); } catch { /* Retry on the next foreground refresh. */ }
  }, [refreshAccessToken]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const stored = await readStoredCredentials();

        if (cancelled) {
          return;
        }

        if (stored) {
          sessionGenerationRef.current += 1;
          credentialsRef.current = stored;
          setCredentials(stored);
          setStatus('signed-in');
          void refreshSession();
        } else {
          setStatus('signed-out');
        }
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
  }, [refreshSession]);

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
      sessionGenerationRef.current += 1;
      credentialsRef.current = next;
      setCredentials(next);
      setStatus('signed-in');
      void persist(next);
    },
    [persist],
  );

  const getAccessToken = useCallback(async (refreshTokens?: TokenRefresher) => {
    const account = credentialsRef.current?.steamId;
    await refreshAccessToken(refreshTokens ?? generateAccessTokenForApp, !!refreshTokens);
    const current = credentialsRef.current;
    if (!current?.accessToken) throw new Error('Sign in to Steam before uploading an image.');
    if (current.steamId !== account) throw new Error('Your Steam session changed. Choose the image again.');
    if (shouldRefreshAccessToken(current.accessToken)) throw new Error('Steam could not refresh the image upload session. Try again.');
    return current.accessToken;
  }, [refreshAccessToken]);

  const getWebAccessToken = useCallback(async () => {
    const account = credentialsRef.current?.steamId;
    // Always go through the auth service, including when the persisted token
    // was derived over the CM by an older build.
    await refreshAccessToken(generateAccessTokenForApp, true);
    const current = credentialsRef.current;
    if (!current?.accessToken) throw new Error('Sign in to Steam before uploading an image.');
    if (current.steamId !== account) throw new Error('Your Steam session changed. Choose the image again.');
    if (shouldRefreshAccessToken(current.accessToken)) throw new Error('Steam could not refresh the image upload session. Try again.');
    return current.accessToken;
  }, [refreshAccessToken]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      credentials,
      accountName: credentials?.accountName ?? null,
      signIn,
      signOut,
      refreshSession,
      getAccessToken,
      getWebAccessToken,
    }),
    [credentials, refreshSession, getAccessToken, getWebAccessToken, signIn, signOut, status],
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
