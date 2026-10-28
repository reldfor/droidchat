/**
 * Steam access tokens are JWTs. The app only reads the payload (`exp`, `nbf`,
 * `iat`) to decide when to refresh, so signature verification is unnecessary.
 */

import { base64ToBytes, bytesToUtf8 } from './bytes';

export type JwtPayload = {
  exp?: number;
  nbf?: number;
  iat?: number;
  sub?: string;
};

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return bytesToUtf8(base64ToBytes(padded));
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');

  if (parts.length < 2) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(parts[1]));

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

export function getJwtExpiry(token: string): number {
  return decodeJwtPayload(token)?.exp ?? 0;
}

/** `k_unSecTokenExpiryRefreshBuffer` in the app's JWT helpers. */
const TOKEN_EXPIRY_REFRESH_BUFFER_SECONDS = 900;
/** Shorter buffer the app falls back to for short-lived tokens. */
const TOKEN_EXPIRY_SHORT_BUFFER_SECONDS = 60;

/**
 * True when the access token is missing, unreadable, or close enough to
 * expiry that the app would refresh it. Mirrors `BShouldRefreshToken`:
 *
 *   lifetime = exp - iat
 *   margin   = lifetime < 1.5 * 900s ? (lifetime <= 60s ? 0 : 60s) : 900s
 *   refresh  = exp - margin < now
 */
export function shouldRefreshAccessToken(token: string, nowMs: number = Date.now()): boolean {
  const payload = decodeJwtPayload(token);
  const expiry = payload?.exp ?? 0;

  if (!expiry) {
    return true;
  }

  const issuedAt = payload?.iat ?? 0;
  const lifetime = expiry - issuedAt;

  let margin = TOKEN_EXPIRY_REFRESH_BUFFER_SECONDS;

  if (lifetime < margin * 1.5) {
    margin = lifetime <= TOKEN_EXPIRY_SHORT_BUFFER_SECONDS ? 0 : TOKEN_EXPIRY_SHORT_BUFFER_SECONDS;
  }

  return expiry - margin < nowMs / 1000;
}
