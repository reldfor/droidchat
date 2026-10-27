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

import { SteamApiError, generateAccessTokenForApp } from '@/lib/steam/auth-api';
import { EResult } from '@/lib/steam/constants';
import {
  readStoredCredentials,
  writeStoredCredentials,
} from '@/lib/steam/credential-storage';
import type { SteamCredentials } from '@/lib/steam/credentials';
import { shouldRefreshAccessToken } from '@/lib/steam/jwt';

export type { SteamCredentials } from '@/lib/steam/credentials';

type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

type SessionContextValue = {
  status: SessionStatus;
  credentials: SteamCredentials | null;
  accountName: string | null;
  signIn: (credentials: SteamCredentials) => void;
  signOut: () => void;
  /** Renews the access token when it is close to expiring. */
  refreshSession: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [credentials, setCredentials] = useState<SteamCredentials | null>(null);
  const credentialsRef = useRef<SteamCredentials | null>(null);
  const refreshingRef = useRef(false);

  const persist = useCallback(async (next: SteamCredentials | null) => {
    try {
      await writeStoredCredentials(next);
    } catch {
      // Persisting is best-effort: the in-memory session still works.
    }
  }, []);

  const signOut = useCallback(() => {
    credentialsRef.current = null;
    setCredentials(null);
    setStatus('signed-out');
    void persist(null);
  }, [persist]);

  const refreshSession = useCallback(async () => {
    const current = credentialsRef.current;

    if (!current || refreshingRef.current || !shouldRefreshAccessToken(current.accessToken)) {
      return;
    }

    refreshingRef.current = true;

    try {
      const result = await generateAccessTokenForApp({
        refreshToken: current.refreshToken,
        steamId: current.steamId,
        accessToken: current.accessToken,
      });

      if (!result.accessToken) {
        return;
      }

      // The session may have been replaced (or signed out) while the request
      // was in flight; never clobber the newer credentials.
      if (credentialsRef.current !== current) {
        return;
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
      // The app only logs a failed refresh and keeps the stored credentials, so
      // the same session can be retried later. `AccessDenied` is deliberately
      // not treated as fatal: Steam also returns it when the *access* token
      // (which only routes the call) has already expired, even though the
      // refresh token is still good.
      if (
        error instanceof SteamApiError &&
        (error.eresult === EResult.Revoked ||
          error.eresult === EResult.Expired ||
          error.eresult === EResult.AccountDisabled ||
          error.eresult === EResult.AccountNotFound)
      ) {
        signOut();
      }
    } finally {
      refreshingRef.current = false;
    }
  }, [persist, signOut]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const stored = await readStoredCredentials();

        if (cancelled) {
          return;
        }

        if (stored) {
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
      credentialsRef.current = next;
      setCredentials(next);
      setStatus('signed-in');
      void persist(next);
    },
    [persist],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      credentials,
      accountName: credentials?.accountName ?? null,
      signIn,
      signOut,
      refreshSession,
    }),
    [credentials, refreshSession, signIn, signOut, status],
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
