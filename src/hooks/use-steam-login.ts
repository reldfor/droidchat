import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type AllowedConfirmation,
  type BeginAuthSessionResult,
  SteamApiError,
  beginAuthSessionViaCredentials,
  pickConfirmation,
  pollAuthSessionStatus,
  updateAuthSessionWithSteamGuardCode,
} from '@/lib/steam/auth-api';
import { AuthSessionGuardType, EResult } from '@/lib/steam/constants';
import type { SteamCredentials } from '@/lib/steam/credentials';
import { buildDeviceDetails, detectLanguage } from '@/lib/steam/device';

export type SteamLoginResult = SteamCredentials;

export type SteamLoginPhase =
  | 'idle'
  | 'starting'
  | 'guard-code'
  | 'device-confirmation'
  | 'email-confirmation'
  | 'finishing'
  | 'error';

export type SteamLoginState = {
  phase: SteamLoginPhase;
  /** Which Steam Guard code is expected while `phase === 'guard-code'`. */
  guardKind?: 'email' | 'device';
  /** Context Steam attaches to a device confirmation ("Steam Chat on ..."). */
  confirmationMessage?: string;
  /** EResult from the last failed call, useful for diagnostics. */
  eresult?: number;
  error?: string;
  /** `agreement_session_url` when Steam requires accepting the SSA. */
  agreementUrl?: string;
};

type PendingSession = BeginAuthSessionResult & {
  accountName: string;
  guardKind?: 'email' | 'device';
};

const GUARD_CODE_LENGTH = 5;

export function isValidGuardCode(code: string): boolean {
  return /^[0-9A-Za-z]{5}$/.test(code);
}

export const STEAM_GUARD_CODE_LENGTH = GUARD_CODE_LENGTH;

function describeFailure(eresult: number, fallback: string): string {
  switch (eresult) {
    case EResult.InvalidPassword:
      return 'That account name or password is incorrect.';
    case EResult.AccountNotFound:
      return 'No Steam account matches that name.';
    case EResult.InvalidLoginAuthCode:
    case EResult.TwoFactorCodeMismatch:
      return 'That Steam Guard code is not valid.';
    case EResult.ExpiredLoginAuthCode:
      return 'That Steam Guard code has expired. Request a new one.';
    case EResult.AccountLogonDenied:
      return 'Steam needs a Steam Guard code for this account.';
    case EResult.RateLimitExceeded:
      return 'Too many attempts. Wait a few minutes and try again.';
    case EResult.AccountDisabled:
      return 'This Steam account is disabled.';
    case EResult.ServiceUnavailable:
    case EResult.NoConnection:
      return 'Steam is unreachable right now. Check your connection and try again.';
    case EResult.MustAgreeToSSA:
      return 'This account has to accept the Steam Subscriber Agreement first.';
    case EResult.NeedCaptcha:
      return 'Steam wants a captcha for this sign-in. Finish it on steamcommunity.com, then try again.';
    default:
      return fallback;
  }
}

export function useSteamLogin(onSuccess: (result: SteamLoginResult) => void) {
  const [state, setState] = useState<SteamLoginState>({ phase: 'idle' });

  const sessionRef = useRef<PendingSession | null>(null);
  const pollRef = useRef<{ cancelled: boolean; timer: ReturnType<typeof setTimeout> | null } | null>(
    null,
  );
  /** Invalidates in-flight requests when the user cancels or starts over. */
  const attemptRef = useRef(0);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      pollRef.current.cancelled = true;
      if (pollRef.current.timer) {
        clearTimeout(pollRef.current.timer);
      }
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      // Invalidate any request that is still in flight when the screen unmounts.
      attemptRef.current += 1;
      stopPolling();
    };
  }, [stopPolling]);

  const fail = useCallback(
    (message: string, eresult?: number, agreementUrl?: string) => {
      attemptRef.current += 1;
      stopPolling();
      sessionRef.current = null;
      setState({ phase: 'error', error: message, eresult, agreementUrl });
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (session: PendingSession, immediate: boolean) => {
      stopPolling();

      const handle = { cancelled: false, timer: null as ReturnType<typeof setTimeout> | null };
      pollRef.current = handle;

      const schedule = () => {
        if (handle.cancelled) {
          return;
        }
        handle.timer = setTimeout(tick, session.intervalMs);
      };

      const tick = async () => {
        if (handle.cancelled) {
          return;
        }

        try {
          const { eresult, result } = await pollAuthSessionStatus({
            clientId: session.clientId,
            requestId: session.requestId,
          });

          if (handle.cancelled) {
            return;
          }

          if (result.refreshToken) {
            stopPolling();
            sessionRef.current = null;
            setState({ phase: 'finishing' });
            onSuccessRef.current({
              steamId: session.steamId,
              accountName: result.accountName || session.accountName,
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              guardData: result.newGuardData,
            });
            return;
          }

          if (result.newClientId && result.newClientId !== '0') {
            session.clientId = result.newClientId;
          }

          if (eresult === EResult.Expired || eresult === EResult.FileNotFound) {
            fail('The sign-in request expired. Start over to get a fresh one.', eresult);
            return;
          }

          if (eresult === EResult.Fail) {
            // The app treats a bare `Fail` as a generic, terminal failure.
            fail('Steam could not complete this sign-in. Please try again.', eresult);
            return;
          }

          if (eresult === EResult.RateLimitExceeded) {
            fail(describeFailure(eresult, 'Too many attempts.'), eresult);
            return;
          }

          if (eresult === EResult.MustAgreeToSSA) {
            fail(describeFailure(eresult, 'Steam needs you to accept the SSA.'), eresult);
            return;
          }

          schedule();
        } catch (error) {
          if (handle.cancelled) {
            return;
          }

          if (error instanceof SteamApiError) {
            const terminal =
              error.eresult === EResult.Expired ||
              error.eresult === EResult.FileNotFound ||
              error.eresult === EResult.RateLimitExceeded ||
              error.eresult === EResult.MustAgreeToSSA ||
              error.eresult === EResult.AccessDenied ||
              error.eresult === EResult.Revoked;

            if (terminal) {
              fail(describeFailure(error.eresult, error.message), error.eresult);
              return;
            }
          }

          // Network hiccup (or a transient Steam error): keep polling, the
          // session stays alive for a while.
          schedule();
        }
      };

      if (immediate) {
        void tick();
      } else {
        schedule();
      }
    },
    [fail, stopPolling],
  );

  const applyConfirmation = useCallback(
    (session: PendingSession, confirmation: AllowedConfirmation | undefined) => {
      const type = confirmation?.confirmationType ?? AuthSessionGuardType.None;

      if (type === AuthSessionGuardType.EmailCode) {
        session.guardKind = 'email';
        setState({ phase: 'guard-code', guardKind: 'email' });
        // The Android app does not poll while waiting for an email code: the
        // session cannot progress until the code is submitted.
        return;
      }

      if (type === AuthSessionGuardType.DeviceCode) {
        session.guardKind = 'device';
        setState({ phase: 'guard-code', guardKind: 'device' });
        startPolling(session, false);
        return;
      }

      if (type === AuthSessionGuardType.DeviceConfirmation) {
        // A code from the authenticator is an accepted alternative while the
        // confirmation prompt is pending (the app's "UseCodeOverride").
        session.guardKind = 'device';
        setState({
          phase: 'device-confirmation',
          confirmationMessage: confirmation?.associatedMessage || undefined,
        });
        startPolling(session, false);
        return;
      }

      if (type === AuthSessionGuardType.EmailConfirmation) {
        session.guardKind = 'email';
        setState({ phase: 'email-confirmation' });
        startPolling(session, false);
        return;
      }

      // AuthSessionGuardType_None (and anything unexpected): just wait for the token.
      setState({ phase: 'finishing' });
      startPolling(session, true);
    },
    [startPolling],
  );

  const signIn = useCallback(
    async (accountName: string, password: string, persistLogin = true) => {
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      stopPolling();
      sessionRef.current = null;
      setState({ phase: 'starting' });

      try {
        const result = await beginAuthSessionViaCredentials({
          accountName,
          password,
          persistLogin,
          deviceDetails: buildDeviceDetails(),
          language: detectLanguage(),
        });

        if (attempt !== attemptRef.current) {
          return;
        }

        const session: PendingSession = { ...result, accountName };
        sessionRef.current = session;

        applyConfirmation(session, pickConfirmation(result.allowedConfirmations));
      } catch (error) {
        if (attempt !== attemptRef.current) {
          return;
        }

        if (error instanceof SteamApiError) {
          fail(describeFailure(error.eresult, error.message), error.eresult, error.agreementUrl);
          return;
        }

        fail(
          error instanceof Error
            ? error.message
            : 'Could not reach Steam. Check your connection and try again.',
        );
      }
    },
    [applyConfirmation, fail, stopPolling],
  );

  const submitGuardCode = useCallback(
    async (code: string) => {
      const session = sessionRef.current;

      if (!session) {
        fail('The sign-in request expired. Start over.');
        return;
      }

      const attempt = attemptRef.current;

      if (!isValidGuardCode(code)) {
        setState((current) => ({
          ...current,
          phase: 'guard-code',
          guardKind: session.guardKind,
          error: `Steam Guard codes are ${GUARD_CODE_LENGTH} letters or digits.`,
        }));
        return;
      }

      const codeType =
        session.guardKind === 'email'
          ? AuthSessionGuardType.EmailCode
          : AuthSessionGuardType.DeviceCode;

      setState({ phase: 'finishing' });

      try {
        const eresult = await updateAuthSessionWithSteamGuardCode({
          clientId: session.clientId,
          steamId: session.steamId,
          code: code.trim(),
          codeType,
        });

        if (attempt !== attemptRef.current) {
          return;
        }

        if (eresult === EResult.OK) {
          startPolling(session, true);
          return;
        }

        if (eresult === EResult.InvalidLoginAuthCode || eresult === EResult.TwoFactorCodeMismatch) {
          setState({
            phase: 'guard-code',
            guardKind: session.guardKind,
            eresult,
            error: 'That code is not valid. Check it and try again.',
          });
          return;
        }

        fail(describeFailure(eresult, 'Steam rejected that Steam Guard code.'), eresult);
      } catch (error) {
        if (attempt !== attemptRef.current) {
          return;
        }

        if (error instanceof SteamApiError) {
          fail(describeFailure(error.eresult, error.message), error.eresult);
          return;
        }

        fail(error instanceof Error ? error.message : 'Could not reach Steam.');
      }
    },
    [fail, startPolling],
  );

  /**
   * Switches a pending confirmation to code entry, mirroring the app's
   * `UseCodeOverride`. Polling keeps running, so approving on the phone still
   * works while the code field is open.
   */
  const useCodeInstead = useCallback(() => {
    const session = sessionRef.current;

    if (!session?.guardKind) {
      return;
    }

    setState({ phase: 'guard-code', guardKind: session.guardKind });
  }, []);

  const reset = useCallback(() => {
    attemptRef.current += 1;
    stopPolling();
    sessionRef.current = null;
    setState({ phase: 'idle' });
  }, [stopPolling]);

  return { state, signIn, submitGuardCode, useCodeInstead, reset };
}
