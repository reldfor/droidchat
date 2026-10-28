/**
 * Helpers shared by the Steam chat UI.
 *
 * Steam encodes messages as BBCode and exposes avatars as SHA-1 hashes; both
 * conversions mirror the friendsui bundle.
 */

const STEAM_ID64_BASE = 76561197960265728n;

const DEFAULT_AVATAR_HASH = 'fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb';

const AVATAR_BASE_URL =
  'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/';

const BBCODE_TAG =
  /\[\/?(?:b|i|u|s|strike|code|spoiler|h[1-6]|list|\*|hr|quote|center|left|right|noparse|url|img|table|tr|td|th|ol|ul)(?:=[^\]]*)?\]/gi;

export function accountIdFromSteamId(steamId: string): number {
  try {
    return Number(BigInt(steamId) - STEAM_ID64_BASE);
  } catch {
    return 0;
  }
}

export function steamIdFromAccountId(accountId: number): string {
  return (STEAM_ID64_BASE + BigInt(accountId >>> 0)).toString();
}

/** `BuildAvatarURLFromHash(hash, 'full')` from the app. */
export function buildAvatarUrl(hash: string | null | undefined): string {
  const clean = !hash || /^0+$/.test(hash) ? DEFAULT_AVATAR_HASH : hash;
  const base = clean.length === 44 ? clean.slice(0, 40) : clean;
  const suffix = clean.length === 44 ? clean.slice(-4) : '.jpg';

  return `${AVATAR_BASE_URL}${base.slice(0, 2)}/${base}_full${suffix}`;
}

/** Turns Steam BBCode into readable text for a plain chat bubble. */
export function stripBbcode(input: string, trim = true): string {
  let text = input;

  text = text.replace(/\[img[^\]]*\][\s\S]*?\[\/img\]/gi, '[image]');
  text = text.replace(/\[img[^\]]*\](?:https:\/\/[^\s\[]+)?/gi, '[image]');
  text = text.replace(/\[emoticon\]([^\[]+)\[\/emoticon\]/gi, ':$1:');
  text = text.replace(/ː([^ː]+)ː/g, ':$1:');
  text = text.replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, '$1');
  text = text.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, '$1');
  text = text.replace(BBCODE_TAG, '');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'");

  return trim ? text.trim() : text;
}

export type FriendStatus = 'online' | 'away' | 'offline';

/**
 * `GenerateClientMessageID` from the app: 16 random hex characters. Steam uses
 * this to de-duplicate a retried send and to tag the echo of our own message.
 */
export function generateClientMessageId(): string {
  let id = '';

  for (let index = 0; index < 16; index += 1) {
    id += Math.floor(Math.random() * 16).toString(16);
  }

  return id;
}

/** `EPersonaState` -> the three states the friends list groups by. */
export function personaStatus(personaState: number | null | undefined): FriendStatus {
  switch (personaState) {
    case 1:
    case 5:
    case 6:
      return 'online';
    case 2:
    case 3:
    case 4:
      return 'away';
    default:
      return 'offline';
  }
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function formatMessageTime(timestampSeconds: number): string {
  if (!timestampSeconds) {
    return '';
  }

  const date = new Date(timestampSeconds * 1000);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Timestamp shown at the right edge of a chat row. */
export function formatChatListTime(timestampSeconds: number): string {
  if (!timestampSeconds) {
    return '';
  }

  const date = new Date(timestampSeconds * 1000);
  const now = new Date();
  const dayDifference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDifference <= 0) {
    return formatMessageTime(timestampSeconds);
  }

  if (dayDifference === 1) {
    return 'Yesterday';
  }

  if (dayDifference < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** Secondary line under a friend's name. */
export function describeFriendStatus(friend: {
  status: FriendStatus;
  gameName?: string;
  gameAppId?: number;
  lastOnline?: number;
}): string {
  if (friend.status === 'offline') {
    return formatLastOnline(friend.lastOnline);
  }

  if (friend.gameName) {
    return `In-Game: ${friend.gameName}`;
  }

  if (friend.gameAppId) {
    return 'In-Game';
  }

  return friend.status === 'away' ? 'Away' : 'Online';
}

/** "Last online ..." text for an offline friend. */
export function formatLastOnline(timestampSeconds: number | null | undefined): string {
  if (!timestampSeconds) {
    return 'Offline';
  }

  const date = new Date(timestampSeconds * 1000);
  const now = new Date();
  const dayDifference = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (dayDifference <= 0) {
    const minutes = Math.max(1, Math.floor((now.getTime() - date.getTime()) / 60_000));

    if (minutes < 60) {
      return `Last online ${minutes}m ago`;
    }

    return `Last online ${Math.floor(minutes / 60)}h ago`;
  }

  if (dayDifference === 1) {
    return 'Last online yesterday';
  }

  if (dayDifference < 7) {
    return `Last online ${date.toLocaleDateString(undefined, { weekday: 'long' })}`;
  }

  return `Last online ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
