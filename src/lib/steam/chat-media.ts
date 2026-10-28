import { stripBbcode } from './chat-utils';
import { allOf, asBytes, asNumber, asString, firstOf, readMessage } from './protobuf';

export type SteamEmoticon = { name: string; lastUsed: number; useCount: number };

export function normalizeEmoticonName(name: string): string | null {
  const clean = name.replace(/^[:ː]+|[:ː]+$/g, '');
  return /^[a-zA-Z0-9_+-]{1,128}$/.test(clean) ? clean : null;
}

export function emoticonUrl(name: string): string {
  return `https://steamcommunity.com/economy/emoticonlarge/${encodeURIComponent(name)}`;
}

/** Player.GetEmoticonList#1; entries are the current account's collection. */
export function decodeEmoticonList(bytes: Uint8Array): SteamEmoticon[] {
  const unique = new Map<string, SteamEmoticon>();
  for (const field of allOf(readMessage(bytes), 1)) {
    const entry = readMessage(asBytes(field));
    const name = normalizeEmoticonName(asString(firstOf(entry, 1)));
    if (name) unique.set(name, { name, lastUsed: asNumber(firstOf(entry, 3)), useCount: asNumber(firstOf(entry, 4)) });
  }
  return [...unique.values()].sort((a, b) => b.lastUsed - a.lastUsed || b.useCount - a.useCount || a.name.localeCompare(b.name));
}

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'emoticon'; name: string; url: string }
  | { type: 'image'; url: string; thumbnailUrl?: string; width?: number; height?: number };

export function isSteamImageUrl(value: string): boolean {
  // Render Steam-hosted uploads, including old Akamai and current CDN URLs.
  // Never treat file:, javascript:, or arbitrary message text as an image URI.
  return /^https:\/\/(?:[a-z0-9-]+\.)*(?:steamusercontent\.com|steamuserimages-a\.akamaihd\.net|steamusercontent-a\.akamaihd\.net)\//i.test(value)
    && !/[\s<>"\[\]]/.test(value);
}

/** Preserve media separately from the plain text used in chat-list previews. */
export function parseMessageContent(content: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const tokens = /\[img([^\]]*)\](?:([^\[]*?)\[\/img\]|(https:\/\/[^\s\[]+))?|\[emoticon\]([^\[]+)\[\/emoticon\]|([:ː])([a-zA-Z0-9_+-]{1,128})\5/g;
  let cursor = 0;
  const text = (value: string) => {
    const plain = stripBbcode(value, false);
    if (plain) parts.push({ type: 'text', text: plain });
  };
  for (const match of content.matchAll(tokens)) {
    text(content.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (match[1] !== undefined) {
      const attributes = match[1];
      const url = /\bsrc\s*=\s*["']?([^\s"']+)/i.exec(attributes)?.[1] || match[2]?.trim() || match[3] || '';
      if (isSteamImageUrl(url)) {
        const width = Number(/\bwidth\s*=\s*["']?(\d+)/i.exec(attributes)?.[1]);
        const height = Number(/\bheight\s*=\s*["']?(\d+)/i.exec(attributes)?.[1]);
        const thumbnail = /\bthumbnail_src\s*=\s*["']?([^\s"']+)/i.exec(attributes)?.[1];
        parts.push({ type: 'image', url, thumbnailUrl: thumbnail && isSteamImageUrl(thumbnail) ? thumbnail : undefined, width: width > 0 ? width : undefined, height: height > 0 ? height : undefined });
      } else {
        parts.push({ type: 'text', text: '[image]' });
      }
    } else {
      const name = normalizeEmoticonName(match[4] || match[6]);
      if (name) parts.push({ type: 'emoticon', name, url: emoticonUrl(name) });
      else text(match[0]);
    }
  }
  text(content.slice(cursor));
  return parts;
}
