/** The long-lived credentials produced by a successful Steam sign-in. */
export type SteamCredentials = {
  steamId: string;
  accountName: string;
  accessToken: string;
  refreshToken: string;
  /** `new_guard_data` from the poll response; empty when Steam omits it. */
  guardData: string;
};

export function isSteamCredentials(value: unknown): value is SteamCredentials {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SteamCredentials>;
  return (
    typeof candidate.steamId === 'string' &&
    typeof candidate.accountName === 'string' &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string'
  );
}
