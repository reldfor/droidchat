import type { ChatCache } from './chat-cache';

/**
 * Disk usage of the cached data, split the same way the Storage screen shows
 * it. The values are measured from the parsed cache document, so they describe
 * the data itself; the document's small JSON envelope is included in the
 * total but not in any single section.
 */
export type ChatCacheUsage = {
  friendsBytes: number;
  chatBytes: number;
  groupsBytes: number;
  totalBytes: number;
  friendCount: number;
  conversationCount: number;
  chatMessageCount: number;
  groupCount: number;
  groupMessageCount: number;
};

export const EMPTY_CHAT_CACHE_USAGE: ChatCacheUsage = {
  friendsBytes: 0,
  chatBytes: 0,
  groupsBytes: 0,
  totalBytes: 0,
  friendCount: 0,
  conversationCount: 0,
  chatMessageCount: 0,
  groupCount: 0,
  groupMessageCount: 0,
};

/**
 * The cache is written as UTF-8, so `String#length` (UTF-16 code units) would
 * overstate names and messages with non-ASCII characters.
 */
function utf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair encodes one 4-byte code point.
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }

  return bytes;
}

export function measureChatCache(cache: ChatCache): ChatCacheUsage {
  const friendsBytes = utf8ByteLength(JSON.stringify(cache.friends));
  const chatBytes = utf8ByteLength(JSON.stringify(cache.conversations));
  // Group author profiles are only used to render rooms, so they belong to
  // the group section rather than to the direct-message history.
  const groupsBytes =
    utf8ByteLength(JSON.stringify(cache.groups)) +
    utf8ByteLength(JSON.stringify(cache.groupProfiles));

  let chatMessageCount = 0;

  for (const conversation of Object.values(cache.conversations)) {
    chatMessageCount += conversation.messages.length;
  }

  let groupMessageCount = 0;

  for (const group of Object.values(cache.groups)) {
    for (const room of Object.values(group.rooms)) {
      groupMessageCount += room.messages.length;
    }
  }

  return {
    friendsBytes,
    chatBytes,
    groupsBytes,
    totalBytes: friendsBytes + chatBytes + groupsBytes,
    friendCount: cache.friends.length,
    conversationCount: Object.keys(cache.conversations).length,
    chatMessageCount,
    groupCount: Object.keys(cache.groups).length,
    groupMessageCount,
  };
}

export function combineChatCacheUsage(entries: readonly ChatCacheUsage[]): ChatCacheUsage {
  const combined: ChatCacheUsage = { ...EMPTY_CHAT_CACHE_USAGE };

  for (const entry of entries) {
    combined.friendsBytes += entry.friendsBytes;
    combined.chatBytes += entry.chatBytes;
    combined.groupsBytes += entry.groupsBytes;
    combined.totalBytes += entry.totalBytes;
    combined.friendCount += entry.friendCount;
    combined.conversationCount += entry.conversationCount;
    combined.chatMessageCount += entry.chatMessageCount;
    combined.groupCount += entry.groupCount;
    combined.groupMessageCount += entry.groupMessageCount;
  }

  return combined;
}

/** Short, honest sizes for the settings list: "0 B", "12.4 KB", "1.2 MB". */
export function formatChatCacheSize(bytes: number): string {
  const safeBytes = Math.max(0, Math.round(bytes));

  if (safeBytes < 1024) {
    return `${safeBytes} B`;
  }

  if (safeBytes < 1024 * 1024) {
    return `${(safeBytes / 1024).toFixed(1)} KB`;
  }

  if (safeBytes < 1024 * 1024 * 1024) {
    return `${(safeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(safeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
