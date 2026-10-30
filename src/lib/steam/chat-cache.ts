/**
 * Local chat cache.
 *
 * The UI should not wait for the CM connection before it can show the friends
 * list, the chat list, or an opened conversation. The cache stores the parts
 * of the state that are useful offline and can be validated on the next open:
 *
 * - friends (without live presence; presence is always server-provided)
 * - recent conversations and their latest page of messages
 * - group chats, rooms and their latest page of messages
 * - group author profiles
 *
 * Validation is deliberately conservative. A cache written by an older build
 * or a partially written file must never be able to corrupt the live state.
 */

import type { GroupAuthorProfile, GroupChat, GroupRoom } from '@/context/group-chat-state';
import type { ChatMessage, ChatPreview, Conversation, SteamFriend } from '@/context/steam-chat';
import { accountIdFromSteamId, buildAvatarUrl } from '@/lib/steam/chat-utils';
import {
  FRIEND_RELATIONSHIP_FRIEND,
  type ChatRoomUserGroupState,
  type ChatRoomUserRoomState,
} from '@/lib/steam/cm-proto';

export const CHAT_CACHE_VERSION = 1;

/**
 * A conversation older than this is checked against Steam even when the
 * server's "last message" hint has not changed. This catches lost pushes and
 * chats that were edited on another device without changing the newest
 * timestamp.
 */
export const CACHE_REFRESH_AFTER_MS = 10 * 60 * 1000;

const MAX_CACHED_CONVERSATIONS = 40;
const MAX_CACHED_MESSAGES = 200;
const MAX_CACHED_GROUPS = 40;
const MAX_CACHED_ROOM_MESSAGES = 200;

const UNKNOWN_FRIEND_NAME = 'Steam user';

export type ChatCacheSnapshot = {
  friends: Record<string, SteamFriend>;
  conversations: Record<string, Conversation>;
  groups: Record<string, GroupChat>;
  groupProfiles: Record<string, GroupAuthorProfile>;
};

export type ChatCache = {
  version: number;
  steamId: string;
  /** Unix milliseconds. */
  savedAt: number;
  friends: SteamFriend[];
  conversations: Record<string, Conversation>;
  groups: Record<string, GroupChat>;
  groupProfiles: Record<string, GroupAuthorProfile>;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSteamId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{17}$/.test(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function asCount(value: unknown): number {
  return Math.max(0, Math.floor(asNumber(value)));
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.sentAt - b.sentAt || a.ordinal - b.ordinal);
}

function newestMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return messages[messages.length - 1];
}

/* -------------------------------------------------------------------------- */
/* Staleness                                                                  */
/* -------------------------------------------------------------------------- */

type SyncableConversation = Pick<
  Conversation,
  'loaded' | 'messages' | 'lastActivity' | 'syncedAt'
>;

/**
 * True when the cached page cannot be considered authoritative:
 * - it was never fully loaded,
 * - Steam reported activity newer than the newest cached message,
 * - or the page is old enough that a missed notification cannot be ruled out.
 */
export function conversationNeedsSync(
  conversation: SyncableConversation,
  now = Date.now(),
): boolean {
  if (!conversation.loaded) {
    return true;
  }

  const newest = newestMessage(conversation.messages)?.sentAt ?? 0;

  if (conversation.lastActivity > newest) {
    return true;
  }

  if (newest === 0 && conversation.lastActivity > 0) {
    return true;
  }

  return conversation.syncedAt <= 0 || now - conversation.syncedAt > CACHE_REFRESH_AFTER_MS;
}

type SyncableRoom = Pick<GroupRoom, 'loaded' | 'messages' | 'lastMessageAt' | 'syncedAt'>;

/** Group chat equivalent of {@link conversationNeedsSync}. */
export function groupRoomNeedsSync(room: SyncableRoom, now = Date.now()): boolean {
  if (!room.loaded) {
    return true;
  }

  const newest = newestMessage(room.messages)?.sentAt ?? 0;

  if (room.lastMessageAt > newest) {
    return true;
  }

  if (newest === 0 && room.lastMessageAt > 0) {
    return true;
  }

  return room.syncedAt <= 0 || now - room.syncedAt > CACHE_REFRESH_AFTER_MS;
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

function cacheableMessage(message: ChatMessage): ChatMessage | null {
  if (message.pending || message.failed || !message.text) {
    return null;
  }

  return {
    id: message.id,
    authorSteamId: message.authorSteamId,
    text: message.text,
    content: message.content && message.content !== message.text ? message.content : undefined,
    sentAt: message.sentAt,
    ordinal: message.ordinal,
    mine: message.mine,
  };
}

function trimMessages(
  messages: ChatMessage[],
  limit: number,
): { messages: ChatMessage[]; truncated: boolean } {
  const clean = sortMessages(messages)
    .map(cacheableMessage)
    .filter((message): message is ChatMessage => message !== null);

  if (clean.length <= limit) {
    return { messages: clean, truncated: false };
  }

  return { messages: clean.slice(clean.length - limit), truncated: true };
}

function buildPreview(conversation: Conversation, messages: ChatMessage[]): ChatPreview | undefined {
  const newest = newestMessage(messages);

  if (!newest) {
    return conversation.preview;
  }

  if (conversation.preview && conversation.preview.sentAt >= newest.sentAt) {
    return conversation.preview;
  }

  return { text: newest.text, sentAt: newest.sentAt, mine: newest.mine };
}

function buildConversation(conversation: Conversation): Conversation {
  const { messages, truncated } = trimMessages(conversation.messages, MAX_CACHED_MESSAGES);
  const oldest = messages[0];
  const newest = newestMessage(messages);

  return {
    ...conversation,
    messages,
    loading: false,
    hasMore: conversation.hasMore || truncated,
    oldestTime: oldest?.sentAt ?? 0,
    oldestOrdinal: oldest?.ordinal ?? 0,
    lastActivity: Math.max(conversation.lastActivity, newest?.sentAt ?? 0),
    preview: buildPreview(conversation, messages),
    error: undefined,
    syncedAt: conversation.syncedAt,
    fromCache: undefined,
  };
}

function buildRoom(room: GroupRoom): GroupRoom {
  const { messages, truncated } = trimMessages(room.messages, MAX_CACHED_ROOM_MESSAGES);
  const oldest = messages[0];
  const newest = newestMessage(messages);

  return {
    ...room,
    messages,
    loading: false,
    hasMore: room.hasMore || truncated,
    oldestTime: oldest?.sentAt ?? 0,
    oldestOrdinal: oldest?.ordinal ?? 0,
    lastMessageAt: Math.max(room.lastMessageAt, newest?.sentAt ?? 0),
    error: undefined,
    syncedAt: room.syncedAt,
  };
}

function buildGroup(group: GroupChat): GroupChat {
  const rooms: Record<string, GroupRoom> = {};

  for (const room of Object.values(group.rooms)) {
    rooms[room.chatId] = buildRoom(room);
  }

  const roomOrder = group.roomOrder.filter((chatId) => Boolean(rooms[chatId]));

  for (const chatId of Object.keys(rooms)) {
    if (!roomOrder.includes(chatId)) {
      roomOrder.push(chatId);
    }
  }

  const selectedChatId = rooms[group.selectedChatId]
    ? group.selectedChatId
    : rooms[group.defaultChatId]
      ? group.defaultChatId
      : (roomOrder[0] ?? '');

  return {
    ...group,
    rooms,
    roomOrder,
    selectedChatId,
    unread: Object.values(rooms).some((room) => room.unread),
  };
}

/** Build the exact document that will be written to disk. */
export function buildChatCache(
  steamId: string,
  snapshot: ChatCacheSnapshot,
  now = Date.now(),
): ChatCache {
  const friends = Object.values(snapshot.friends)
    .filter((friend) => friend.relationship === FRIEND_RELATIONSHIP_FRIEND)
    .map<SteamFriend>((friend) => ({
      steamId: friend.steamId,
      accountId: friend.accountId || accountIdFromSteamId(friend.steamId),
      name: friend.name,
      avatarUrl: friend.avatarUrl,
      // Presence is only trusted while connected. The CM replaces this on
      // the next logon.
      status: 'offline',
      lastOnline: friend.lastOnline,
      onSteamDeck: false,
      relationship: friend.relationship,
    }));

  const conversations: Record<string, Conversation> = {};

  for (const conversation of Object.values(snapshot.conversations)
    .filter(
      (entry) => entry.lastActivity > 0 || entry.messages.length > 0 || entry.preview !== undefined,
    )
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, MAX_CACHED_CONVERSATIONS)) {
    conversations[conversation.steamId] = buildConversation(conversation);
  }

  const groups: Record<string, GroupChat> = {};

  for (const group of Object.values(snapshot.groups)
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, MAX_CACHED_GROUPS)) {
    groups[group.chatGroupId] = buildGroup(group);
  }

  const groupProfiles: Record<string, GroupAuthorProfile> = {};

  for (const [profileSteamId, profile] of Object.entries(snapshot.groupProfiles)) {
    if (isSteamId(profileSteamId) && profile.name.trim()) {
      groupProfiles[profileSteamId] = {
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      };
    }
  }

  return {
    version: CHAT_CACHE_VERSION,
    steamId,
    savedAt: now,
    friends,
    conversations,
    groups,
    groupProfiles,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

function parseMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const authorSteamId = asString(value.authorSteamId);
  const text = asString(value.text);

  if (!id || !isSteamId(authorSteamId) || !text) {
    return null;
  }

  const content = asString(value.content);

  return {
    id,
    authorSteamId,
    text,
    content: content && content !== text ? content : undefined,
    sentAt: asCount(value.sentAt),
    ordinal: asCount(value.ordinal),
    mine: asBoolean(value.mine),
  };
}

function parseMessages(value: unknown): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();

  for (const entry of asArray(value)) {
    const message = parseMessage(entry);

    if (message) {
      byId.set(message.id, message);
    }
  }

  return sortMessages([...byId.values()]);
}

function parsePreview(value: unknown): ChatPreview | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const text = asString(value.text);

  if (!text) {
    return undefined;
  }

  return {
    text,
    sentAt: asCount(value.sentAt),
    mine: asBoolean(value.mine),
  };
}

function parseConversation(steamId: string, value: unknown): Conversation | null {
  if (!isRecord(value)) {
    return null;
  }

  let messages = parseMessages(value.messages);
  let truncated = false;

  if (messages.length > MAX_CACHED_MESSAGES) {
    messages = messages.slice(messages.length - MAX_CACHED_MESSAGES);
    truncated = true;
  }

  const oldest = messages[0];
  const newest = newestMessage(messages);

  return {
    steamId,
    messages,
    loaded: asBoolean(value.loaded),
    loading: false,
    hasMore: asBoolean(value.hasMore) || truncated,
    oldestTime: oldest?.sentAt ?? 0,
    oldestOrdinal: oldest?.ordinal ?? 0,
    lastActivity: Math.max(asCount(value.lastActivity), newest?.sentAt ?? 0),
    unread: asCount(value.unread),
    preview:
      parsePreview(value.preview) ??
      (newest ? { text: newest.text, sentAt: newest.sentAt, mine: newest.mine } : undefined),
    syncedAt: asCount(value.syncedAt),
    fromCache: true,
  };
}

function parseRoomState(value: unknown): ChatRoomUserRoomState | null {
  if (!isRecord(value)) {
    return null;
  }

  const chatId = asString(value.chatId);

  if (!chatId) {
    return null;
  }

  return {
    chatId,
    timeJoined: asCount(value.timeJoined),
    timeLastAck: asCount(value.timeLastAck),
    desktopNotificationLevel: asCount(value.desktopNotificationLevel),
    mobileNotificationLevel: asCount(value.mobileNotificationLevel),
    timeLastMention: asCount(value.timeLastMention),
    unreadIndicatorMuted: asBoolean(value.unreadIndicatorMuted),
    timeFirstUnread: asCount(value.timeFirstUnread),
  };
}

function parseUserState(value: unknown): ChatRoomUserGroupState | null {
  if (!isRecord(value)) {
    return null;
  }

  const chatGroupId = asString(value.chatGroupId);

  if (!chatGroupId) {
    return null;
  }

  const userChatRoomStates = asArray(value.userChatRoomStates)
    .map(parseRoomState)
    .filter((state): state is ChatRoomUserRoomState => state !== null);

  return {
    chatGroupId,
    timeJoined: asCount(value.timeJoined),
    userChatRoomStates,
    desktopNotificationLevel: asCount(value.desktopNotificationLevel),
    mobileNotificationLevel: asCount(value.mobileNotificationLevel),
    timeLastGroupAck: asCount(value.timeLastGroupAck),
    unreadIndicatorMuted: asBoolean(value.unreadIndicatorMuted),
    directMessagesAllowed: asBoolean(value.directMessagesAllowed),
  };
}

function parseRoom(value: unknown): GroupRoom | null {
  if (!isRecord(value)) {
    return null;
  }

  const chatId = asString(value.chatId);

  if (!chatId) {
    return null;
  }

  let messages = parseMessages(value.messages);
  let truncated = false;

  if (messages.length > MAX_CACHED_ROOM_MESSAGES) {
    messages = messages.slice(messages.length - MAX_CACHED_ROOM_MESSAGES);
    truncated = true;
  }

  const oldest = messages[0];
  const newest = newestMessage(messages);

  return {
    chatId,
    name: asString(value.name),
    sortOrder: asCount(value.sortOrder),
    voiceAllowed: asBoolean(value.voiceAllowed),
    messages,
    loaded: asBoolean(value.loaded),
    loading: false,
    hasMore: asBoolean(value.hasMore) || truncated,
    oldestTime: oldest?.sentAt ?? 0,
    oldestOrdinal: oldest?.ordinal ?? 0,
    lastMessageAt: Math.max(asCount(value.lastMessageAt), newest?.sentAt ?? 0),
    lastMessage: asString(value.lastMessage),
    lastMessageAccountId: asCount(value.lastMessageAccountId),
    unread: asBoolean(value.unread),
    syncedAt: asCount(value.syncedAt),
  };
}

function parseGroup(value: unknown): GroupChat | null {
  if (!isRecord(value)) {
    return null;
  }

  const chatGroupId = asString(value.chatGroupId);

  if (!chatGroupId) {
    return null;
  }

  const rooms: Record<string, GroupRoom> = {};
  const rawRooms = isRecord(value.rooms) ? value.rooms : {};

  for (const [chatId, rawRoom] of Object.entries(rawRooms)) {
    const room = parseRoom(rawRoom);

    if (room && room.chatId === chatId) {
      rooms[chatId] = room;
    }
  }

  const roomOrder: string[] = [];

  for (const chatId of asArray(value.roomOrder)) {
    if (typeof chatId === 'string' && rooms[chatId] && !roomOrder.includes(chatId)) {
      roomOrder.push(chatId);
    }
  }

  for (const chatId of Object.keys(rooms)) {
    if (!roomOrder.includes(chatId)) {
      roomOrder.push(chatId);
    }
  }

  const requestedDefault = asString(value.defaultChatId);
  const defaultChatId = rooms[requestedDefault] ? requestedDefault : (roomOrder[0] ?? '');
  const requestedSelection = asString(value.selectedChatId);
  const topMemberIds = asArray(value.topMemberIds)
    .map((accountId) => asCount(accountId))
    .filter((accountId) => accountId > 0);

  return {
    chatGroupId,
    name: asString(value.name),
    tagline: asString(value.tagline),
    avatarSha: typeof value.avatarSha === 'string' ? value.avatarSha : null,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
    memberCount: asCount(value.memberCount),
    topMemberIds,
    defaultChatId,
    roomOrder,
    rooms,
    selectedChatId: rooms[requestedSelection] ? requestedSelection : defaultChatId,
    userState: parseUserState(value.userState),
    lastActivity: Math.max(
      asCount(value.lastActivity),
      ...Object.values(rooms).map((room) => room.lastMessageAt),
      0,
    ),
    unread:
      asBoolean(value.unread) || Object.values(rooms).some((room) => room.unread),
  };
}

function parseFriend(value: unknown): SteamFriend | null {
  if (!isRecord(value) || !isSteamId(value.steamId)) {
    return null;
  }

  const relationship = asCount(value.relationship);

  // The friends list only ever shows accepted friends. Ignore stale entries
  // for blocked or invited users that may have been written by another build.
  if (relationship !== FRIEND_RELATIONSHIP_FRIEND) {
    return null;
  }

  return {
    steamId: value.steamId,
    accountId: asCount(value.accountId) || accountIdFromSteamId(value.steamId),
    name: asString(value.name) || UNKNOWN_FRIEND_NAME,
    avatarUrl: asString(value.avatarUrl) || buildAvatarUrl(null),
    status: 'offline',
    lastOnline: asCount(value.lastOnline) || undefined,
    onSteamDeck: false,
    relationship,
  };
}

function parseProfile(value: unknown): GroupAuthorProfile | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = asString(value.name);

  if (!name.trim()) {
    return null;
  }

  return {
    name,
    avatarUrl: typeof value.avatarUrl === 'string' ? value.avatarUrl : null,
  };
}

/**
 * Validate and normalize a persisted cache document. Returns `null` for a
 * missing, old, or malformed document, which makes the caller fall back to a
 * normal Steam load.
 */
export function parseChatCache(value: unknown): ChatCache | null {
  if (!isRecord(value) || value.version !== CHAT_CACHE_VERSION) {
    return null;
  }

  const steamId = asString(value.steamId);

  if (!isSteamId(steamId)) {
    return null;
  }

  const friends = new Map<string, SteamFriend>();

  for (const entry of asArray(value.friends)) {
    const friend = parseFriend(entry);

    if (friend) {
      friends.set(friend.steamId, friend);
    }
  }

  const conversations: Record<string, Conversation> = {};
  const rawConversations = isRecord(value.conversations) ? value.conversations : {};

  for (const [conversationSteamId, rawConversation] of Object.entries(rawConversations)) {
    if (!isSteamId(conversationSteamId)) {
      continue;
    }

    const conversation = parseConversation(conversationSteamId, rawConversation);

    if (conversation) {
      conversations[conversationSteamId] = conversation;
    }
  }

  const groups: Record<string, GroupChat> = {};
  const rawGroups = isRecord(value.groups) ? value.groups : {};

  for (const [chatGroupId, rawGroup] of Object.entries(rawGroups)) {
    const group = parseGroup(rawGroup);

    if (group && group.chatGroupId === chatGroupId) {
      groups[chatGroupId] = group;
    }
  }

  const groupProfiles: Record<string, GroupAuthorProfile> = {};
  const rawProfiles = isRecord(value.groupProfiles) ? value.groupProfiles : {};

  for (const [profileSteamId, rawProfile] of Object.entries(rawProfiles)) {
    if (!isSteamId(profileSteamId)) {
      continue;
    }

    const profile = parseProfile(rawProfile);

    if (profile) {
      groupProfiles[profileSteamId] = profile;
    }
  }

  const trimmedConversations: Record<string, Conversation> = {};

  for (const conversation of Object.values(conversations)
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, MAX_CACHED_CONVERSATIONS)) {
    trimmedConversations[conversation.steamId] = conversation;
  }

  const trimmedGroups: Record<string, GroupChat> = {};

  for (const group of Object.values(groups)
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, MAX_CACHED_GROUPS)) {
    trimmedGroups[group.chatGroupId] = group;
  }

  return {
    version: CHAT_CACHE_VERSION,
    steamId,
    savedAt: asCount(value.savedAt),
    friends: [...friends.values()],
    conversations: trimmedConversations,
    groups: trimmedGroups,
    groupProfiles,
  };
}
