import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import { getRandomBytes } from 'expo-crypto';

import {
  SteamCmClient,
  SteamCmError,
  type SteamCmConnectionState,
  type SteamCmEvent,
} from '@/lib/steam/cm-client';
import {
  FRIEND_RELATIONSHIP_FRIEND,
  type ChatRoomHistoryMessage,
  type ChatRoomSummaryPair,
  type CmFriend,
  type CmPersona,
  type IncomingMessage,
  type MessageSession,
  type RecentMessage,
} from '@/lib/steam/cm-proto';
import {
  accountIdFromSteamId,
  buildAvatarUrl,
  generateClientMessageId,
  personaStatus,
  richPresenceText,
  steamIdFromAccountId,
  stripBbcode,
  type FriendStatus,
} from '@/lib/steam/chat-utils';
import { EResult } from '@/lib/steam/constants';
import type { SteamEmoticon } from '@/lib/steam/chat-media';
import { bytesToHex } from '@/lib/steam/bytes';
import type { ChatImage } from '@/lib/steam/image-picker';
import { uploadChatImage, uploadChatRoomImage } from '@/lib/steam/image-upload';
import {
  buildChatCache,
  conversationNeedsSync,
  groupRoomNeedsSync,
  type ChatCacheSnapshot,
} from '@/lib/steam/chat-cache';
import {
  clearChatCaches,
  readChatCache,
  writeChatCache,
} from '@/lib/steam/chat-cache-storage';
import {
  groupDisplayName,
  groupReducer,
  initialGroupChatState,
  latestGroupRoom,
  type GroupAuthorProfile,
  type GroupChat,
  type GroupChatSlice,
} from '@/context/group-chat-state';
import { useSession } from '@/context/session';

const INITIAL_MESSAGE_COUNT = 100;
const MORE_MESSAGE_COUNT = 50;
const INITIAL_GROUP_MESSAGE_COUNT = 100;
const MORE_GROUP_MESSAGE_COUNT = 50;
const GROUP_HISTORY_INFINITE = 0x7fffffff;
const GROUP_PROFILE_BATCH_SIZE = 100;
const MAX_PREVIEWS = 12;
const MAX_SESSIONS = 30;
const PERSONA_FALLBACK_DELAY_MS = 2_500;
/** Matches the app: send at most one typing notification per 10s per chat. */
const TYPING_SEND_INTERVAL_MS = 10_000;
/** Matches the app: a friend stops "typing" after 11s without a new notice. */
const TYPING_CLEAR_MS = 11_000;
/** A caught-up cache needs at most a couple of pages of new messages. */
const MAX_SYNC_PAGES = 3;

function newestConversationMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return messages[messages.length - 1];
}

function newestIncomingMessage(messages: RecentMessage[]): RecentMessage | undefined {
  let newest: RecentMessage | undefined;

  for (const message of messages) {
    if (
      !newest ||
      message.timestamp > newest.timestamp ||
      (message.timestamp === newest.timestamp && message.ordinal > newest.ordinal)
    ) {
      newest = message;
    }
  }

  return newest;
}

function newestGroupMessage(messages: ChatRoomHistoryMessage[]): ChatRoomHistoryMessage | undefined {
  let newest: ChatRoomHistoryMessage | undefined;

  for (const message of messages) {
    if (
      !newest ||
      message.timestamp > newest.timestamp ||
      (message.timestamp === newest.timestamp && message.ordinal > newest.ordinal)
    ) {
      newest = message;
    }
  }

  return newest;
}

/**
 * Fetch only the messages newer than the newest cached one, matching the
 * official client's `GetMessagesFromTimeRange` behavior. This preserves the
 * older cached history and leaves no gap when a chat was active on desktop.
 */
async function fetchNewerConversationMessages(
  client: SteamCmClient,
  steamId: string,
  boundary: ChatMessage,
  isCurrent: () => boolean,
): Promise<RecentMessage[]> {
  const collected: RecentMessage[] = [];
  let time = boundary.sentAt;
  let ordinal = boundary.ordinal;

  for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
    const response = await client.getRecentMessages(steamId, {
      count: INITIAL_MESSAGE_COUNT,
      startTime: time,
      startOrdinal: ordinal,
    });

    if (!isCurrent()) {
      return collected;
    }

    collected.push(...response.messages);

    if (!response.moreAvailable || response.messages.length === 0) {
      break;
    }

    const newest = newestIncomingMessage(response.messages);

    if (!newest || newest.timestamp < time || (newest.timestamp === time && newest.ordinal <= ordinal)) {
      break;
    }

    time = newest.timestamp;
    ordinal = newest.ordinal;
  }

  return collected;
}

async function fetchNewerGroupMessages(
  client: SteamCmClient,
  chatGroupId: string,
  chatId: string,
  boundary: ChatMessage,
  isCurrent: () => boolean,
): Promise<ChatRoomHistoryMessage[]> {
  const collected: ChatRoomHistoryMessage[] = [];
  let time = boundary.sentAt;
  let ordinal = boundary.ordinal;

  for (let page = 0; page < MAX_SYNC_PAGES; page += 1) {
    const response = await client.getChatRoomHistory({
      chatGroupId,
      chatId,
      startTime: time,
      startOrdinal: ordinal,
      lastTime: GROUP_HISTORY_INFINITE,
      lastOrdinal: 0,
      maxCount: INITIAL_GROUP_MESSAGE_COUNT,
    });

    if (!isCurrent()) {
      return collected;
    }

    collected.push(...response.messages);

    if (!response.moreAvailable || response.messages.length === 0) {
      break;
    }

    const newest = newestGroupMessage(response.messages);

    if (!newest || newest.timestamp < time || (newest.timestamp === time && newest.ordinal <= ordinal)) {
      break;
    }

    time = newest.timestamp;
    ordinal = newest.ordinal;
  }

  return collected;
}

/** Shown until the server sends a persona name for a friend. */
export const UNKNOWN_FRIEND_NAME = 'Steam user';

export type SteamFriend = {
  steamId: string;
  accountId: number;
  name: string;
  avatarUrl: string;
  status: FriendStatus;
  gameAppId?: number;
  gameName?: string;
  /** Short status line published by the running game, e.g. "Online". */
  richPresence?: string;
  lastOnline?: number;
  onSteamDeck: boolean;
  relationship: number;
};

export type ChatMessage = {
  id: string;
  authorSteamId: string;
  text: string;
  /** Original Steam markup; text remains a readable chat-list preview. */
  content?: string;
  sentAt: number;
  ordinal: number;
  mine: boolean;
  pending?: boolean;
  failed?: boolean;
};

export type ChatPreview = {
  text: string;
  sentAt: number;
  mine: boolean;
};

export type Conversation = {
  steamId: string;
  messages: ChatMessage[];
  loaded: boolean;
  loading: boolean;
  hasMore: boolean;
  oldestTime: number;
  oldestOrdinal: number;
  lastActivity: number;
  unread: number;
  preview?: ChatPreview;
  error?: string;
  /** Unix milliseconds when this page was last reconciled with Steam. */
  syncedAt: number;
  /** True while the conversation is only backed by disk cache. */
  fromCache?: boolean;
};

export type ChatListItem = {
  conversation: Conversation;
  friend: SteamFriend;
};

export type GroupChatListItem = {
  group: GroupChat;
  name: string;
  avatarUrl: string | null;
  preview?: ChatPreview;
  unread: boolean;
  lastActivity: number;
};

type SteamChatState = {
  connection: SteamCmConnectionState;
  loggedOn: boolean;
  selfSteamId: string | null;
  personaName: string | null;
  friends: Record<string, SteamFriend>;
  conversations: Record<string, Conversation>;
  active: string | null;
  /** Steam IDs currently typing in a direct chat. */
  typing: Record<string, true>;
  /** Set when Steam refuses the chat session token; the session is kept. */
  authError: number | null;
};

type Action =
  | { type: 'reset' }
  | {
      type: 'hydrate';
      friends: SteamFriend[];
      conversations: Record<string, Conversation>;
    }
  | { type: 'connection'; state: SteamCmConnectionState }
  | { type: 'logged-on' }
  | { type: 'auth-error'; eresult: number }
  | { type: 'self'; steamId: string }
  | { type: 'account-info'; personaName: string }
  | { type: 'friends'; friends: CmFriend[]; incremental: boolean }
  | { type: 'persona'; updates: CmPersona[] }
  | { type: 'message'; message: IncomingMessage }
  | { type: 'typing'; steamId: string; typing: boolean }
  | { type: 'sessions'; sessions: MessageSession[] }
  | { type: 'preview'; steamId: string; preview: ChatPreview }
  | { type: 'open'; steamId: string }
  | { type: 'close'; steamId: string }
  | { type: 'loading'; steamId: string }
  | {
      type: 'loaded';
      steamId: string;
      messages: RecentMessage[];
      moreAvailable: boolean;
      direction?: 'initial' | 'older' | 'newer';
    }
  | { type: 'load-error'; steamId: string; error: string }
  | { type: 'send-pending'; steamId: string; message: ChatMessage }
  | { type: 'send-ok'; steamId: string; id: string; timestamp: number; ordinal: number }
  | { type: 'send-failed'; steamId: string; id: string }
  | { type: 'mark-read'; steamId: string };

const initialState: SteamChatState = {
  connection: 'disconnected',
  loggedOn: false,
  selfSteamId: null,
  personaName: null,
  friends: {},
  conversations: {},
  active: null,
  typing: {},
  authError: null,
};

function placeholderFriend(steamId: string): SteamFriend {
  return {
    steamId,
    accountId: accountIdFromSteamId(steamId),
    name: UNKNOWN_FRIEND_NAME,
    avatarUrl: buildAvatarUrl(null),
    status: 'offline',
    onSteamDeck: false,
    relationship: 0,
  };
}

function emptyConversation(steamId: string): Conversation {
  return {
    steamId,
    messages: [],
    loaded: false,
    loading: false,
    hasMore: false,
    oldestTime: 0,
    oldestOrdinal: 0,
    lastActivity: 0,
    unread: 0,
    syncedAt: 0,
  };
}

function mergePersona(friend: SteamFriend, update: CmPersona): SteamFriend {
  const status =
    update.personaState === null ? friend.status : personaStatus(update.personaState);
  const appChanged =
    update.gamePlayedAppId !== null && update.gamePlayedAppId !== friend.gameAppId;
  const gameAppId =
    update.personaState === 0 ? undefined : (update.gamePlayedAppId ?? friend.gameAppId);
  const gameName =
    update.personaState === 0
      ? undefined
      : (update.gameName ?? (appChanged ? undefined : friend.gameName));
  const richPresence =
    update.richPresence !== null
      ? richPresenceText(update.richPresence)
      : update.personaState === 0 || appChanged
        ? undefined
        : friend.richPresence;

  return {
    ...friend,
    name: update.playerName ?? friend.name,
    avatarUrl: update.avatarHash ? buildAvatarUrl(update.avatarHash) : friend.avatarUrl,
    status,
    gameAppId,
    gameName,
    richPresence,
    lastOnline: update.lastSeenOnline ?? update.lastLogoff ?? friend.lastOnline,
    onSteamDeck: update.onSteamDeck ?? friend.onSteamDeck,
  };
}

function messageKey(message: ChatMessage): string {
  if (message.ordinal > 0) {
    return `o:${message.ordinal}`;
  }

  return `t:${message.sentAt}:${message.authorSteamId}:${message.text}`;
}

function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.sentAt - b.sentAt || a.ordinal - b.ordinal);
}

function lastMessagePreview(messages: ChatMessage[]): ChatPreview | undefined {
  const last = messages[messages.length - 1];

  return last ? { text: last.text, sentAt: last.sentAt, mine: last.mine } : undefined;
}

function findLastMessageIndex(
  messages: ChatMessage[],
  predicate: (message: ChatMessage) => boolean,
): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (predicate(messages[index])) {
      return index;
    }
  }

  return -1;
}

function mergeHistory(
  conversation: Conversation,
  history: RecentMessage[],
  selfSteamId: string | null,
): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();

  for (const message of history) {
    const authorSteamId = steamIdFromAccountId(message.accountId);
    const entry: ChatMessage = {
      id: `h-${message.ordinal}-${message.timestamp}-${message.accountId}`,
      authorSteamId,
      text: stripBbcode(message.message),
      content: message.message,
      sentAt: message.timestamp,
      ordinal: message.ordinal,
      mine: selfSteamId !== null && authorSteamId === selfSteamId,
    };

    byKey.set(messageKey(entry), entry);
  }

  for (const message of conversation.messages) {
    if (message.pending || message.failed) {
      byKey.set(message.id, message);
      continue;
    }

    const key = messageKey(message);

    if (!byKey.has(key)) {
      byKey.set(key, message);
    }
  }

  return sortMessages([...byKey.values()]);
}

/**
 * Restore a conversation from disk without discarding anything the live CM
 * has already delivered. Live messages and presence always win over cache.
 */
function mergeCachedConversation(
  existing: Conversation | undefined,
  cached: Conversation,
): Conversation {
  if (!existing) {
    return { ...cached, fromCache: true };
  }

  const byKey = new Map<string, ChatMessage>();

  for (const message of cached.messages) {
    byKey.set(messageKey(message), message);
  }

  for (const message of existing.messages) {
    byKey.set(messageKey(message), message);
  }

  const messages = sortMessages([...byKey.values()]);
  const oldest = messages[0];
  const newest = messages[messages.length - 1];
  const preview =
    existing.preview && cached.preview
      ? existing.preview.sentAt >= cached.preview.sentAt
        ? existing.preview
        : cached.preview
      : (existing.preview ?? cached.preview);

  return {
    ...existing,
    messages,
    loaded: existing.loaded || cached.loaded,
    hasMore: existing.loaded ? existing.hasMore : cached.hasMore,
    oldestTime: oldest?.sentAt ?? 0,
    oldestOrdinal: oldest?.ordinal ?? 0,
    lastActivity: Math.max(existing.lastActivity, cached.lastActivity, newest?.sentAt ?? 0),
    preview,
    syncedAt: existing.loaded ? existing.syncedAt : cached.syncedAt,
    fromCache: false,
  };
}

function resolveHasMoreAfterLoad(
  conversation: Conversation,
  direction: 'initial' | 'older' | 'newer' | undefined,
  incoming: RecentMessage[],
  moreAvailable: boolean,
): boolean {
  if (direction === 'newer') {
    return conversation.hasMore;
  }

  if (direction === 'older' || !conversation.loaded || conversation.messages.length === 0) {
    return moreAvailable;
  }

  // An initial refresh returns the newest page. If our cache already has
  // messages older than that page, `more_available` describes a window we
  // already covered, so keep the cached flag instead of enabling a load that
  // can only return duplicates.
  const incomingOldest = incoming.reduce(
    (oldest, message) => (message.timestamp > 0 && message.timestamp < oldest ? message.timestamp : oldest),
    Number.POSITIVE_INFINITY,
  );

  if (Number.isFinite(incomingOldest) && conversation.oldestTime > 0 && incomingOldest > conversation.oldestTime) {
    return conversation.hasMore;
  }

  return moreAvailable;
}

function reduce(state: SteamChatState, action: Action): SteamChatState {
  switch (action.type) {
    case 'reset':
      return initialState;

    case 'hydrate': {
      const friends = { ...state.friends };

      for (const friend of action.friends) {
        const existing = friends[friend.steamId];

        if (!existing) {
          friends[friend.steamId] = friend;
          continue;
        }

        // A persona update can arrive before the cached list. Fill in the
        // missing identity without replacing live presence.
        if (existing.name === UNKNOWN_FRIEND_NAME) {
          friends[friend.steamId] = {
            ...friend,
            status: existing.status,
            gameAppId: existing.gameAppId,
            gameName: existing.gameName,
            richPresence: existing.richPresence,
            lastOnline: existing.lastOnline ?? friend.lastOnline,
            onSteamDeck: existing.onSteamDeck,
          };
        }
      }

      const conversations = { ...state.conversations };

      for (const [steamId, cached] of Object.entries(action.conversations)) {
        conversations[steamId] = mergeCachedConversation(conversations[steamId], cached);
      }

      return { ...state, friends, conversations };
    }

    case 'connection':
      return {
        ...state,
        connection: action.state,
        loggedOn: action.state === 'connected' ? state.loggedOn : false,
        authError: action.state === 'connected' ? null : state.authError,
      };

    case 'logged-on':
      return { ...state, loggedOn: true, authError: null };

    case 'auth-error':
      return { ...state, loggedOn: false, authError: action.eresult };

    case 'self':
      return { ...state, selfSteamId: action.steamId };

    case 'account-info':
      return { ...state, personaName: action.personaName || state.personaName };

    case 'friends': {
      const nextFriends: Record<string, SteamFriend> = { ...state.friends };
      const incomingIds = new Set(
        action.friends
          .filter((entry) => entry.relationship === FRIEND_RELATIONSHIP_FRIEND)
          .map((entry) => entry.steamId),
      );

      if (!action.incremental) {
        for (const [steamId, friend] of Object.entries(nextFriends)) {
          if (friend.relationship === FRIEND_RELATIONSHIP_FRIEND && !incomingIds.has(steamId)) {
            delete nextFriends[steamId];
          }
        }
      }

      for (const entry of action.friends) {
        if (entry.relationship !== FRIEND_RELATIONSHIP_FRIEND) {
          delete nextFriends[entry.steamId];
          continue;
        }

        const existing = nextFriends[entry.steamId] ?? placeholderFriend(entry.steamId);
        nextFriends[entry.steamId] = { ...existing, relationship: entry.relationship };
      }

      return { ...state, friends: nextFriends };
    }

    case 'persona': {
      if (action.updates.length === 0) {
        return state;
      }

      const nextFriends = { ...state.friends };

      for (const update of action.updates) {
        const existing = nextFriends[update.steamId] ?? placeholderFriend(update.steamId);
        nextFriends[update.steamId] = mergePersona(existing, update);
      }

      return { ...state, friends: nextFriends };
    }

    case 'typing': {
      if (action.typing) {
        return state.typing[action.steamId]
          ? state
          : { ...state, typing: { ...state.typing, [action.steamId]: true } };
      }

      if (!state.typing[action.steamId]) {
        return state;
      }

      const typing = { ...state.typing };
      delete typing[action.steamId];
      return { ...state, typing };
    }

    case 'message': {
      const message = action.message;

      if (message.chatEntryType !== 1) {
        return state;
      }

      const text = stripBbcode(message.messageNoBbcode || message.message);
      const content = message.message || message.messageNoBbcode;

      if (!text) {
        return state;
      }

      const steamId = message.steamIdFriend;
      const mine = message.localEcho;
      const friends = {
        ...state.friends,
        [steamId]: state.friends[steamId] ?? placeholderFriend(steamId),
      };
      const conversation = state.conversations[steamId] ?? emptyConversation(steamId);
      let messages = conversation.messages;

      const existingIndex =
        message.ordinal > 0
          ? messages.findIndex((entry) => entry.ordinal === message.ordinal)
          : -1;

      if (existingIndex >= 0) {
        messages = messages.map((entry, index) =>
          index === existingIndex
            ? {
                ...entry,
                text,
                content,
                sentAt: message.timestamp || entry.sentAt,
                ordinal: message.ordinal,
                pending: false,
                failed: false,
              }
            : entry,
        );
      } else if (mine) {
        const pendingIndex = findLastMessageIndex(
          messages,
          (entry) => entry.mine && Boolean(entry.pending || entry.failed) && entry.text === text,
        );

        if (pendingIndex >= 0) {
          messages = messages.map((entry, index) =>
            index === pendingIndex
              ? {
                  ...entry,
                  text,
                  content,
                  sentAt: message.timestamp || entry.sentAt,
                  ordinal: message.ordinal,
                  pending: false,
                  failed: false,
                }
              : entry,
          );
        } else {
          // The send response can clear `pending` before the server echo
          // arrives. Match that recently sent copy instead of duplicating it.
          const recentIndex = findLastMessageIndex(
            messages,
            (entry) =>
              entry.mine &&
              entry.text === text &&
              message.timestamp > 0 &&
              Math.abs(entry.sentAt - message.timestamp) <= 60,
          );

          if (recentIndex >= 0) {
            messages = messages.map((entry, index) =>
              index === recentIndex
                ? {
                    ...entry,
                    content,
                    sentAt: message.timestamp || entry.sentAt,
                    ordinal: message.ordinal,
                    pending: false,
                    failed: false,
                  }
                : entry,
            );
          } else {
            messages = [
              ...messages,
              {
                id: `msg-${message.ordinal}-${message.timestamp}`,
                authorSteamId: state.selfSteamId ?? '',
                text,
                content,
                sentAt: message.timestamp,
                ordinal: message.ordinal,
                mine: true,
              },
            ];
          }
        }
      } else {
        messages = [
          ...messages,
          {
            id: `msg-${message.ordinal}-${message.timestamp}-${steamId}`,
            authorSteamId: steamId,
            text,
            content,
            sentAt: message.timestamp,
            ordinal: message.ordinal,
            mine: false,
          },
        ];
      }

      messages = sortMessages(messages);

      let typing = state.typing;

      if (!mine && typing[steamId]) {
        typing = { ...typing };
        delete typing[steamId];
      }

      return {
        ...state,
        friends,
        typing,
        conversations: {
          ...state.conversations,
          [steamId]: {
            ...conversation,
            messages,
            lastActivity: Math.max(conversation.lastActivity, message.timestamp),
            unread:
              !mine && state.active !== steamId ? conversation.unread + 1 : conversation.unread,
            preview: lastMessagePreview(messages) ?? conversation.preview,
            fromCache: false,
          },
        },
      };
    }

    case 'sessions': {
      const sessions = [...action.sessions]
        .filter((session) => session.lastMessage > 0)
        .sort((a, b) => b.lastMessage - a.lastMessage)
        .slice(0, MAX_SESSIONS);

      if (sessions.length === 0) {
        return state;
      }

      const friends = { ...state.friends };
      const conversations = { ...state.conversations };

      for (const session of sessions) {
        const steamId = steamIdFromAccountId(session.accountIdFriend);
        const conversation = conversations[steamId] ?? emptyConversation(steamId);

        friends[steamId] = friends[steamId] ?? placeholderFriend(steamId);
        conversations[steamId] = {
          ...conversation,
          lastActivity: Math.max(conversation.lastActivity, session.lastMessage),
          // Sessions carry the server's authoritative unread count. A cached
          // count can be days old (or already read on desktop), so replace it
          // instead of keeping the higher of the two. Live arrivals that race
          // this response are still merged below by the message reducer.
          unread:
            state.active === steamId
              ? 0
              : conversation.fromCache
                ? session.unreadMessageCount
                : Math.max(conversation.unread, session.unreadMessageCount),
          fromCache: false,
        };
      }

      return { ...state, friends, conversations };
    }

    case 'preview': {
      const conversation = state.conversations[action.steamId] ?? emptyConversation(action.steamId);

      if (conversation.preview && conversation.preview.sentAt >= action.preview.sentAt) {
        return state;
      }

      return {
        ...state,
        friends: {
          ...state.friends,
          [action.steamId]:
            state.friends[action.steamId] ?? placeholderFriend(action.steamId),
        },
        conversations: {
          ...state.conversations,
          [action.steamId]: {
            ...conversation,
            preview: action.preview,
            lastActivity: Math.max(conversation.lastActivity, action.preview.sentAt),
            fromCache: false,
          },
        },
      };
    }

    case 'open': {
      const conversation = state.conversations[action.steamId] ?? emptyConversation(action.steamId);

      return {
        ...state,
        active: action.steamId,
        conversations: {
          ...state.conversations,
          [action.steamId]: { ...conversation, unread: 0 },
        },
      };
    }

    case 'close':
      return state.active === action.steamId ? { ...state, active: null } : state;

    case 'mark-read': {
      const conversation = state.conversations[action.steamId];

      if (!conversation || conversation.unread === 0) {
        return state;
      }

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: { ...conversation, unread: 0, fromCache: false },
        },
      };
    }

    case 'loading': {
      const conversation = state.conversations[action.steamId] ?? emptyConversation(action.steamId);

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: { ...conversation, loading: true, error: undefined },
        },
      };
    }

    case 'loaded': {
      const conversation = state.conversations[action.steamId] ?? emptyConversation(action.steamId);
      const messages = mergeHistory(conversation, action.messages, state.selfSteamId);
      const oldest = messages[0];
      const newest = messages[messages.length - 1];

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: {
            ...conversation,
            messages,
            loaded: true,
            loading: false,
            hasMore: resolveHasMoreAfterLoad(
              conversation,
              action.direction,
              action.messages,
              action.moreAvailable,
            ),
            oldestTime: oldest?.sentAt ?? 0,
            oldestOrdinal: oldest?.ordinal ?? 0,
            lastActivity: Math.max(conversation.lastActivity, newest?.sentAt ?? 0),
            preview: lastMessagePreview(messages) ?? conversation.preview,
            error: undefined,
            syncedAt: Date.now(),
            fromCache: false,
          },
        },
      };
    }

    case 'load-error': {
      const conversation = state.conversations[action.steamId] ?? emptyConversation(action.steamId);

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: { ...conversation, loading: false, error: action.error },
        },
      };
    }

    case 'send-pending': {
      const conversation = state.conversations[action.steamId] ?? emptyConversation(action.steamId);
      const messages = sortMessages([...conversation.messages, action.message]);

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: {
            ...conversation,
            messages,
            lastActivity: Math.max(conversation.lastActivity, action.message.sentAt),
            preview: lastMessagePreview(messages) ?? conversation.preview,
            fromCache: false,
          },
        },
      };
    }

    case 'send-ok': {
      const conversation = state.conversations[action.steamId];

      if (!conversation) {
        return state;
      }

      const messages = sortMessages(
        conversation.messages.map((message) =>
          message.id === action.id
            ? {
                ...message,
                pending: false,
                failed: false,
                sentAt: action.timestamp || message.sentAt,
                ordinal: action.ordinal,
              }
            : message,
        ),
      );

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: {
            ...conversation,
            messages,
            preview: lastMessagePreview(messages) ?? conversation.preview,
            fromCache: false,
          },
        },
      };
    }

    case 'send-failed': {
      const conversation = state.conversations[action.steamId];

      if (!conversation) {
        return state;
      }

      return {
        ...state,
        conversations: {
          ...state.conversations,
          [action.steamId]: {
            ...conversation,
            messages: conversation.messages.map((message) =>
              // A server echo may already have confirmed delivery while the
              // request was waiting for its reply. Do not undo that evidence.
              message.id === action.id && message.pending
                ? { ...message, pending: false, failed: true }
                : message,
            ),
          },
        },
      };
    }

    default:
      return state;
  }
}

function describeError(error: unknown): string {
  if (error instanceof SteamCmError) {
    switch (error.eresult) {
      case EResult.NoConnection:
        return 'Steam is not reachable right now. Check your connection and try again.';
      case EResult.Timeout:
        return 'Steam did not respond in time. Try again.';
      case EResult.RateLimitExceeded:
        return 'Steam is rate limiting requests. Wait a moment and try again.';
      default:
        return error.message;
    }
  }

  return 'Something went wrong. Try again.';
}

type SteamChatContextValue = SteamChatState &
  GroupChatSlice & {
    chats: ChatListItem[];
    groupChats: GroupChatListItem[];
    ready: boolean;
    sendMessage: (steamId: string, text: string) => Promise<void>;
    getEmoticons: () => Promise<SteamEmoticon[]>;
    sendImage: (steamId: string, image: ChatImage) => Promise<void>;
    openConversation: (steamId: string) => void;
    closeConversation: (steamId: string) => void;
    loadConversation: (steamId: string, force?: boolean) => void;
    loadMore: (steamId: string) => void;
    markRead: (steamId: string, timestamp: number) => void;
    sendTyping: (steamId: string) => void;
    retryConnection: () => void;
    refreshGroups: () => Promise<void>;
    createGroupChat: (invitees: string[], name?: string) => Promise<string>;
    openGroup: (chatGroupId: string, chatId?: string) => void;
    closeGroup: (chatGroupId: string) => void;
    selectGroupRoom: (chatGroupId: string, chatId: string) => void;
    loadGroupHistory: (chatGroupId: string, chatId: string, force?: boolean) => void;
    loadMoreGroupHistory: (chatGroupId: string, chatId: string) => void;
    markGroupRead: (chatGroupId: string, chatId: string, timestamp: number) => void;
    sendGroupMessage: (chatGroupId: string, chatId: string, text: string) => Promise<void>;
    sendGroupImage: (chatGroupId: string, chatId: string, image: ChatImage) => Promise<void>;
    /** Deletes every saved account's on-disk chat cache. */
    clearCache: () => Promise<void>;
  };

const SteamChatContext = createContext<SteamChatContextValue | null>(null);

export function SteamChatProvider({ children }: { children: ReactNode }) {
  const { status, credentials, authRevision, accounts, getWebAccessToken, updateAccountProfile } =
    useSession();
  const [state, dispatch] = useReducer(reduce, initialState);
  const [groupState, groupDispatch] = useReducer(groupReducer, initialGroupChatState);
  const [cacheGeneration, setCacheGeneration] = useState(0);
  const currentSteamId = credentials?.steamId ?? null;

  const credentialsRef = useRef(credentials);
  const stateRef = useRef(state);
  const groupStateRef = useRef(groupState);
  const groupProfilesRef = useRef(groupState.groupProfiles);
  const requestedGroupProfiles = useRef(new Set<string>());
  const groupAcksSentAt = useRef(new Map<string, number>());
  const clientRef = useRef<SteamCmClient | null>(null);
  /** Identifies the client allowed to mutate state; blocks late events after switches. */
  const clientTokenRef = useRef<symbol | null>(null);
  const personaFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Friend/app pairs already asked for rich presence in this connection. */
  const richPresenceRequests = useRef(new Set<string>());
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingSentAt = useRef(new Map<string, number>());
  /** Account whose disk cache is trusted for the current state. */
  const cacheAccountRef = useRef<string | null>(null);
  const cacheReadyRef = useRef(false);
  const cacheSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountsRef = useRef(accounts);

  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);

  /**
   * Read inside the cache effect without re-running it whenever an account
   * profile changes. The list tells us whether a previous account was
   * switched away from (still saved) or signed out (removed).
   */
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    groupStateRef.current = groupState;
    groupProfilesRef.current = groupState.groupProfiles;
  }, [groupState]);

  /** Persist the cacheable slices of the current account. */
  const writeCacheSnapshot = useCallback((account: string) => {
    const snapshot: ChatCacheSnapshot = {
      friends: stateRef.current.friends,
      conversations: stateRef.current.conversations,
      groups: groupStateRef.current.groups,
      groupProfiles: groupStateRef.current.groupProfiles,
    };

    if (
      Object.keys(snapshot.friends).length === 0 &&
      Object.keys(snapshot.conversations).length === 0 &&
      Object.keys(snapshot.groups).length === 0
    ) {
      return;
    }

    void writeChatCache(account, buildChatCache(account, snapshot));
  }, []);

  // Load the disk cache as soon as the account is known. The CM connection
  // runs independently, so the lists and opened chats can paint from disk
  // while Steam is still logging on (or offline).
  useEffect(() => {
    const previousAccount = cacheAccountRef.current;

    if (previousAccount && previousAccount !== currentSteamId && cacheReadyRef.current) {
      // Switching between saved accounts keeps each account's cache. A signed
      // out account is no longer in the list; its tokens are gone, so its
      // local history should go with them.
      if (accountsRef.current.some((account) => account.steamId === previousAccount)) {
        writeCacheSnapshot(previousAccount);
      } else {
        void clearChatCaches([previousAccount]);
      }
    }

    cacheAccountRef.current = null;
    cacheReadyRef.current = false;

    if (status !== 'signed-in' || !currentSteamId) {
      return;
    }

    let cancelled = false;

    void readChatCache(currentSteamId)
      .then((cache) => {
        if (cancelled || !cache) {
          return;
        }

        dispatch({
          type: 'hydrate',
          friends: cache.friends,
          conversations: cache.conversations,
        });
        groupDispatch({
          type: 'hydrate',
          groups: cache.groups,
          profiles: cache.groupProfiles,
        });
      })
      .catch(() => {
        // A cache failure only means the normal Steam load is used.
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        cacheAccountRef.current = currentSteamId;
        cacheReadyRef.current = true;
        setCacheGeneration((current) => current + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [currentSteamId, status, authRevision, writeCacheSnapshot]);

  // Debounced writes keep presence and typing from causing a disk write on
  // every CM event. The snapshot is always taken at write time.
  useEffect(() => {
    if (status !== 'signed-in' || !currentSteamId || !cacheReadyRef.current) {
      return;
    }

    if (cacheSaveTimer.current) {
      clearTimeout(cacheSaveTimer.current);
    }

    cacheSaveTimer.current = setTimeout(() => {
      cacheSaveTimer.current = null;

      if (cacheReadyRef.current && cacheAccountRef.current) {
        writeCacheSnapshot(cacheAccountRef.current);
      }
    }, 1_500);

    return () => {
      if (cacheSaveTimer.current) {
        clearTimeout(cacheSaveTimer.current);
        cacheSaveTimer.current = null;
      }
    };
  }, [
    cacheGeneration,
    currentSteamId,
    state.friends,
    state.conversations,
    groupState.groups,
    groupState.groupProfiles,
    status,
    writeCacheSnapshot,
  ]);

  // Flush the newest state when the app is backgrounded instead of waiting
  // for the debounce.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && cacheReadyRef.current && cacheAccountRef.current) {
        writeCacheSnapshot(cacheAccountRef.current);
      }
    });

    return () => subscription.remove();
  }, [writeCacheSnapshot]);

  // Signing out removes the active account, so its cache is dropped by the
  // hydration effect above (the account is no longer in the saved list).

  /**
   * Storage screen action. Cancel the pending debounce first so a snapshot
   * cannot recreate the file right after it is deleted, then remove every
   * saved account's cache.
   */
  const clearCache = useCallback(async () => {
    if (cacheSaveTimer.current) {
      clearTimeout(cacheSaveTimer.current);
      cacheSaveTimer.current = null;
    }

    const steamIds = new Set(accountsRef.current.map((account) => account.steamId));

    if (cacheAccountRef.current) {
      steamIds.add(cacheAccountRef.current);
    }

    await clearChatCaches([...steamIds]);
  }, []);

  /**
   * The CM pushes persona state right after the friends list, but a friend can
   * still be nameless if that update is missed. Ask for those explicitly.
   */
  const schedulePersonaFallback = useCallback((steamIds: string[]) => {
    if (personaFallbackTimer.current) {
      clearTimeout(personaFallbackTimer.current);
      personaFallbackTimer.current = null;
    }

    const clientToken = clientTokenRef.current;

    if (steamIds.length === 0 || !clientToken) {
      return;
    }

    personaFallbackTimer.current = setTimeout(() => {
      personaFallbackTimer.current = null;

      if (clientTokenRef.current !== clientToken) {
        return;
      }

      const missing = steamIds.filter((steamId) => {
        const friend = stateRef.current.friends[steamId];
        return !friend || friend.name === UNKNOWN_FRIEND_NAME;
      });

      if (missing.length > 0) {
        clientRef.current?.requestFriendData(missing);
      }
    }, PERSONA_FALLBACK_DELAY_MS);
  }, []);

  /**
   * Rich presence is opt-in per friend request. Ask once for every friend that
   * is currently in a game, then let normal persona pushes keep it current.
   */
  useEffect(() => {
    if (!state.loggedOn) {
      richPresenceRequests.current.clear();
      return;
    }

    const client = clientRef.current;
    const friends = Object.values(state.friends).filter(
      (friend) =>
        friend.relationship === FRIEND_RELATIONSHIP_FRIEND &&
        friend.status !== 'offline' &&
        Boolean(friend.gameAppId) &&
        !friend.richPresence,
    );

    if (!client?.isLoggedOn || friends.length === 0) {
      return;
    }

    const steamIds: string[] = [];

    for (const friend of friends) {
      const key = `${friend.steamId}:${friend.gameAppId}`;

      if (!richPresenceRequests.current.has(key)) {
        richPresenceRequests.current.add(key);
        steamIds.push(friend.steamId);
      }
    }

    if (steamIds.length > 0) {
      client.requestFriendData(steamIds);
    }
  }, [state.friends, state.loggedOn]);

  const loadConversation = useCallback((steamId: string, force = false) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;
    const conversation = stateRef.current.conversations[steamId];

    if (!client || !clientToken || !client.isLoggedOn) {
      return;
    }

    if (conversation?.loading) {
      return;
    }

    // Cached history is shown immediately. Only ask Steam for more when the
    // page is missing, known to be behind, or old enough to be revalidated.
    if (!force && conversation?.loaded && !conversationNeedsSync(conversation)) {
      return;
    }

    const boundary =
      conversation?.loaded && conversation.messages.length > 0
        ? newestConversationMessage(conversation.messages)
        : undefined;

    dispatch({ type: 'loading', steamId });

    const pending = boundary
      ? fetchNewerConversationMessages(
          client,
          steamId,
          boundary,
          () => clientTokenRef.current === clientToken && client.isLoggedOn,
        ).then((messages) => ({
          messages,
          moreAvailable: false,
          direction: 'newer' as const,
        }))
      : client
          .getRecentMessages(steamId, { count: INITIAL_MESSAGE_COUNT })
          .then((response) => ({
            messages: response.messages,
            moreAvailable: response.moreAvailable,
            direction: 'initial' as const,
          }));

    void pending
      .then((response) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        dispatch({
          type: 'loaded',
          steamId,
          messages: response.messages,
          moreAvailable: response.moreAvailable,
          direction: response.direction,
        });
      })
      .catch((error: unknown) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        dispatch({ type: 'load-error', steamId, error: describeError(error) });
      });
  }, []);

  const loadMore = useCallback((steamId: string) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;
    const conversation = stateRef.current.conversations[steamId];

    if (
      !client ||
      !clientToken ||
      !client.isLoggedOn ||
      !conversation ||
      conversation.loading ||
      !conversation.hasMore
    ) {
      return;
    }

    dispatch({ type: 'loading', steamId });

    void client
      .getRecentMessages(steamId, {
        count: MORE_MESSAGE_COUNT,
        timeLast: conversation.oldestTime || 0x7fffffff,
        ordinalLast: conversation.oldestOrdinal,
      })
      .then((response) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        dispatch({
          type: 'loaded',
          steamId,
          messages: response.messages,
          moreAvailable: response.moreAvailable,
          direction: 'older',
        });
      })
      .catch((error: unknown) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        dispatch({ type: 'load-error', steamId, error: describeError(error) });
      });
  }, []);

  const loadPreviews = useCallback(async (sessions: MessageSession[]) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;

    if (!client || !clientToken) {
      return;
    }

    const recent = [...sessions]
      .sort((a, b) => b.lastMessage - a.lastMessage)
      .slice(0, MAX_PREVIEWS);

    for (const session of recent) {
      if (!client.isLoggedOn || clientTokenRef.current !== clientToken) {
        return;
      }

      const steamId = steamIdFromAccountId(session.accountIdFriend);
      const current = stateRef.current.conversations[steamId];

      if (current?.preview && current.preview.sentAt >= session.lastMessage) {
        continue;
      }

      try {
        const response = await client.getRecentMessages(steamId, { count: 1 });

        if (clientTokenRef.current !== clientToken) {
          return;
        }

        const last = response.messages[response.messages.length - 1];

        if (!last) {
          continue;
        }

        const authorSteamId = steamIdFromAccountId(last.accountId);

        dispatch({
          type: 'preview',
          steamId,
          preview: {
            text: stripBbcode(last.message),
            sentAt: last.timestamp,
            mine: authorSteamId === stateRef.current.selfSteamId,
          },
        });
      } catch {
        // Previews are best effort; the chat still opens normally.
      }
    }
  }, []);

  /**
   * Group members are often not friends, so their persona is not part of the
   * CM friends/persona stream. Resolve names through the public player-link
   * service in batches and cache the result for the session.
   */
  const requestGroupProfiles = useCallback((steamIds: string[]) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;

    if (!client?.isLoggedOn || !clientToken) {
      return;
    }

    const selfSteamId = stateRef.current.selfSteamId;
    const known = groupProfilesRef.current;
    const friends = stateRef.current.friends;
    const unique = [...new Set(steamIds)].filter(
      (steamId) =>
        /^\d{17}$/.test(steamId) &&
        steamId !== selfSteamId &&
        !known[steamId] &&
        !friends[steamId] &&
        !requestedGroupProfiles.current.has(steamId),
    );

    if (unique.length === 0) {
      return;
    }

    for (const steamId of unique) {
      requestedGroupProfiles.current.add(steamId);
    }

    void (async () => {
      const updates: Record<string, GroupAuthorProfile> = {};

      for (let index = 0; index < unique.length; index += GROUP_PROFILE_BATCH_SIZE) {
        const batch = unique.slice(index, index + GROUP_PROFILE_BATCH_SIZE);

        if (clientTokenRef.current !== clientToken || !client.isLoggedOn) {
          return;
        }

        try {
          const profiles = await client.getPlayerProfiles(batch);

          for (const profile of profiles) {
            if (!profile.steamId) {
              continue;
            }

            updates[profile.steamId] = {
              name: profile.personaName || UNKNOWN_FRIEND_NAME,
              avatarUrl: profile.avatarHash ? buildAvatarUrl(profile.avatarHash) : null,
            };
            requestedGroupProfiles.current.add(profile.steamId);
          }
        } catch {
          // Allow another attempt after a transient failure.
          for (const steamId of batch) {
            requestedGroupProfiles.current.delete(steamId);
          }
        }
      }

      if (clientTokenRef.current === clientToken && Object.keys(updates).length > 0) {
        groupDispatch({ type: 'group-profiles', profiles: updates });
      }
    })();
  }, []);

  const activateGroups = useCallback(
    (chatGroupIds: string[], clientToken: symbol) => {
      const client = clientRef.current;

      if (!client?.isLoggedOn || chatGroupIds.length === 0) {
        return;
      }

      void client
        .setActiveChatRoomGroups(chatGroupIds, true)
        .then((states) => {
          if (clientTokenRef.current === clientToken) {
            groupDispatch({ type: 'group-states', states });
          }
        })
        .catch(() => {
          // Messages still work while a group is open; the next group-list
          // refresh or reconnect retries activation.
        });
    },
    [],
  );

  const applyGroups = useCallback(
    (groups: ChatRoomSummaryPair[]) => {
      const clientToken = clientTokenRef.current;

      groupDispatch({ type: 'groups', groups });
      requestedGroupProfiles.current.clear();
      groupAcksSentAt.current.clear();

      const client = clientRef.current;
      if (!client?.isLoggedOn || !clientToken) {
        return;
      }

      const chatGroupIds = groups
        .map((pair) => pair.groupSummary.chatGroupId)
        .filter((chatGroupId): chatGroupId is string => Boolean(chatGroupId));

      activateGroups(chatGroupIds, clientToken);

      const topMembers = groups.flatMap((pair) =>
        pair.groupSummary.topMembers.map((accountId) => steamIdFromAccountId(accountId)),
      );
      requestGroupProfiles(topMembers);
    },
    [activateGroups, requestGroupProfiles],
  );

  const refreshGroups = useCallback(async () => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;

    if (!client?.isLoggedOn || !clientToken) {
      return;
    }

    try {
      const groups = await client.getMyChatRoomGroups();

      if (clientTokenRef.current === clientToken) {
        applyGroups(groups);
      }
    } catch (error) {
      if (clientTokenRef.current === clientToken) {
        groupDispatch({ type: 'groups-error', error: describeError(error) });
      }
    }
  }, [applyGroups]);

  const createGroupChat = useCallback(
    async (invitees: string[], name = '') => {
      const client = clientRef.current;
      const clientToken = clientTokenRef.current;
      const selfSteamId = stateRef.current.selfSteamId;

      if (!client?.isLoggedOn || !clientToken || !selfSteamId) {
        throw new Error('Reconnect to Steam before creating a group chat.');
      }

      const uniqueInvitees = [...new Set(invitees)].filter(
        (steamId) => steamId.length > 0 && steamId !== selfSteamId,
      );

      if (uniqueInvitees.length === 0) {
        throw new Error('Choose at least one friend to invite.');
      }

      try {
        const created = await client.createChatRoomGroup(uniqueInvitees, name);

        if (clientTokenRef.current !== clientToken) {
          throw new SteamCmError(
            EResult.Fail,
            'The account changed before the group chat was created.',
          );
        }

        groupDispatch({
          type: 'group-created',
          created,
          now: Math.floor(Date.now() / 1000),
        });

        requestGroupProfiles(
          created.state.members
            .map((member) => steamIdFromAccountId(member.accountId))
            .filter((steamId) => steamId !== selfSteamId),
        );

        // The creator must join the active set just like every group loaded
        // from GetMyChatRoomGroups, otherwise live messages are not pushed.
        const groupIds = [
          ...new Set([...Object.keys(groupStateRef.current.groups), created.chatGroupId]),
        ];
        activateGroups(groupIds, clientToken);

        return created.chatGroupId;
      } catch (error) {
        throw new Error(describeError(error));
      }
    },
    [activateGroups, requestGroupProfiles],
  );

  const loadGroupHistory = useCallback((chatGroupId: string, chatId: string, force = false) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;
    const group = groupStateRef.current.groups[chatGroupId];
    const room = group?.rooms[chatId];

    if (!client || !clientToken || !client.isLoggedOn || !group) {
      return;
    }

    if (room?.loading) {
      return;
    }

    // Cached room history is rendered immediately. Revalidate it only when
    // the room is missing, behind the group summary, or old enough.
    if (!force && room?.loaded && !groupRoomNeedsSync(room)) {
      return;
    }

    const boundary =
      room?.loaded && room.messages.length > 0
        ? newestConversationMessage(room.messages)
        : undefined;

    groupDispatch({ type: 'group-history-loading', chatGroupId, chatId });

    const pending = boundary
      ? fetchNewerGroupMessages(
          client,
          chatGroupId,
          chatId,
          boundary,
          () => clientTokenRef.current === clientToken && client.isLoggedOn,
        ).then((messages) => ({
          messages,
          moreAvailable: false,
          direction: 'newer' as const,
        }))
      : client
          .getChatRoomHistory({
            chatGroupId,
            chatId,
            lastTime: GROUP_HISTORY_INFINITE,
            lastOrdinal: 0,
            startTime: 0,
            startOrdinal: 0,
            maxCount: INITIAL_GROUP_MESSAGE_COUNT,
          })
          .then((response) => ({
            messages: response.messages,
            moreAvailable: response.moreAvailable,
            direction: 'initial' as const,
          }));

    void pending
      .then((response) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        groupDispatch({
          type: 'group-history',
          chatGroupId,
          chatId,
          messages: response.messages,
          moreAvailable: response.moreAvailable,
          direction: response.direction,
          selfSteamId: stateRef.current.selfSteamId,
        });
        requestGroupProfiles(
          response.messages.map((message) =>
            steamIdFromAccountId(message.senderAccountId),
          ),
        );
      })
      .catch((error: unknown) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        groupDispatch({
          type: 'group-history-error',
          chatGroupId,
          chatId,
          error: describeError(error),
        });
      });
  }, [requestGroupProfiles]);

  const loadMoreGroupHistory = useCallback((chatGroupId: string, chatId: string) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;
    const group = groupStateRef.current.groups[chatGroupId];
    const room = group?.rooms[chatId];

    if (!client || !clientToken || !client.isLoggedOn || !room || room.loading || !room.hasMore) {
      return;
    }

    groupDispatch({ type: 'group-history-loading', chatGroupId, chatId });

    void client
      .getChatRoomHistory({
        chatGroupId,
        chatId,
        lastTime: room.oldestTime || GROUP_HISTORY_INFINITE,
        lastOrdinal: room.oldestOrdinal,
        startTime: 0,
        startOrdinal: 0,
        maxCount: MORE_GROUP_MESSAGE_COUNT,
      })
      .then((response) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        groupDispatch({
          type: 'group-history',
          chatGroupId,
          chatId,
          messages: response.messages,
          moreAvailable: response.moreAvailable,
          direction: 'older',
          selfSteamId: stateRef.current.selfSteamId,
        });
        requestGroupProfiles(
          response.messages.map((message) =>
            steamIdFromAccountId(message.senderAccountId),
          ),
        );
      })
      .catch((error: unknown) => {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        groupDispatch({
          type: 'group-history-error',
          chatGroupId,
          chatId,
          error: describeError(error),
        });
      });
  }, [requestGroupProfiles]);

  const openGroup = useCallback(
    (chatGroupId: string, chatId?: string) => {
      const group = groupStateRef.current.groups[chatGroupId];

      groupDispatch({ type: 'group-open', chatGroupId, chatId });

      if (!group) {
        return;
      }

      const selectedChatId =
        (chatId && group.rooms[chatId] ? chatId : undefined) ||
        group.selectedChatId ||
        group.defaultChatId ||
        group.roomOrder[0];

      if (selectedChatId) {
        loadGroupHistory(chatGroupId, selectedChatId);
      }
    },
    [loadGroupHistory],
  );

  const closeGroup = useCallback((chatGroupId: string) => {
    groupDispatch({ type: 'group-close', chatGroupId });
  }, []);

  const selectGroupRoom = useCallback(
    (chatGroupId: string, chatId: string) => {
      groupDispatch({ type: 'group-select-room', chatGroupId, chatId });
      loadGroupHistory(chatGroupId, chatId);
    },
    [loadGroupHistory],
  );

  const markGroupRead = useCallback((chatGroupId: string, chatId: string, timestamp: number) => {
    if (timestamp <= 0) {
      return;
    }

    groupDispatch({ type: 'group-ack', chatGroupId, chatId, timestamp });

    const key = `${chatGroupId}:${chatId}`;
    const sentAt = groupAcksSentAt.current.get(key) ?? 0;

    if (timestamp <= sentAt) {
      return;
    }

    groupAcksSentAt.current.set(key, timestamp);

    const client = clientRef.current;
    if (client?.isLoggedOn) {
      client.ackChatRoomMessage(chatGroupId, chatId, timestamp);
    }
  }, []);

  const sendGroupMessage = useCallback(
    async (chatGroupId: string, chatId: string, text: string) => {
      const client = clientRef.current;
      const clientToken = clientTokenRef.current;
      const selfSteamId = stateRef.current.selfSteamId;
      const trimmed = text.trim();

      if (!client?.isLoggedOn || !clientToken || !selfSteamId) {
        throw new Error('Reconnect to Steam before sending a message.');
      }

      if (!trimmed) {
        return;
      }

      const id = `group-local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const sentAt = Math.floor(Date.now() / 1000);

      groupDispatch({
        type: 'group-send-pending',
        chatGroupId,
        chatId,
        message: {
          id,
          authorSteamId: selfSteamId,
          text: stripBbcode(trimmed),
          content: trimmed,
          sentAt,
          ordinal: 0,
          mine: true,
          pending: true,
        },
      });

      try {
        const response = await client.sendChatRoomMessage(chatGroupId, chatId, trimmed);

        if (clientTokenRef.current !== clientToken) {
          return;
        }

        groupDispatch({
          type: 'group-send-ok',
          chatGroupId,
          chatId,
          id,
          timestamp: response.serverTimestamp,
          ordinal: response.ordinal,
        });
      } catch (error) {
        if (clientTokenRef.current !== clientToken) {
          return;
        }

        const confirmed = groupStateRef.current.groups[chatGroupId]?.rooms[chatId]?.messages.find(
          (message) =>
            message.id === id &&
            !message.pending &&
            !message.failed,
        );

        if (confirmed) {
          return;
        }

        groupDispatch({ type: 'group-send-failed', chatGroupId, chatId, id });
        throw new Error(describeError(error));
      }
    },
    [],
  );

  const sendGroupImage = useCallback(async (chatGroupId: string, chatId: string, image: ChatImage) => {
    if (Platform.OS === 'web') throw new Error('Image uploads are available in the Android and iOS app.');
    const client = clientRef.current;
    const account = credentialsRef.current?.steamId;
    if (!client?.isLoggedOn || !account) throw new Error('Reconnect to Steam before uploading an image.');
    const isCurrent = () => clientRef.current === client && credentialsRef.current?.steamId === account && client.isLoggedOn;
    if (!isCurrent()) throw new Error('Your Steam session changed. Choose the image again.');
    const accessToken = await getWebAccessToken();
    try {
      await uploadChatRoomImage(
        { steamId: account, accessToken, sessionId: bytesToHex(getRandomBytes(12)) },
        chatGroupId,
        chatId,
        image,
        isCurrent,
      );
    } finally {
      // The commit dispatches the room message; reconcile from history,
      // including when a lost HTTP response leaves delivery uncertain.
      if (isCurrent()) loadGroupHistory(chatGroupId, chatId, true);
    }
  }, [getWebAccessToken, loadGroupHistory]);

  const getEmoticons = useCallback(() => {
    const client = clientRef.current;
    if (!client?.isLoggedOn) return Promise.reject(new Error('Reconnect to Steam to load emoticons.'));
    return client.getEmoticons();
  }, []);

  const sendImage = useCallback(async (steamId: string, image: ChatImage) => {
    if (Platform.OS === 'web') throw new Error('Image uploads are available in the Android and iOS app.');
    const client = clientRef.current;
    const account = credentialsRef.current?.steamId;
    if (!client?.isLoggedOn || !account) throw new Error('Reconnect to Steam before uploading an image.');
    const isCurrent = () => clientRef.current === client && credentialsRef.current?.steamId === account && client.isLoggedOn;
    // Community accepts the same mobile access token the app uses for chat.
    // Mint it through the auth service, which is the documented web-cookie
    // flow, rather than deriving it over the CM session.
    if (!isCurrent()) throw new Error('Your Steam session changed. Choose the image again.');
    const accessToken = await getWebAccessToken();
    try {
      await uploadChatImage({ steamId: account, accessToken, sessionId: bytesToHex(getRandomBytes(12)) }, steamId, image, isCurrent);
    } finally {
      // The commit dispatches the message. Reconcile from the echo/history,
      // including when a lost HTTP response leaves delivery uncertain.
      if (isCurrent()) loadConversation(steamId, true);
    }
  }, [getWebAccessToken, loadConversation]);

  const sendMessage = useCallback(async (steamId: string, text: string) => {
    const client = clientRef.current;
    const clientToken = clientTokenRef.current;
    const trimmed = text.trim();
    const selfSteamId = stateRef.current.selfSteamId;

    if (!client?.isLoggedOn || !clientToken || !selfSteamId) {
      throw new Error('Reconnect to Steam before sending a message.');
    }
    if (!trimmed) return;

    const clientMessageId = generateClientMessageId();
    const id = `local-${clientMessageId}`;

    dispatch({
      type: 'send-pending',
      steamId,
      message: {
        id,
        authorSteamId: selfSteamId,
        text: stripBbcode(trimmed),
        content: trimmed,
        sentAt: Math.floor(Date.now() / 1000),
        ordinal: 0,
        mine: true,
        pending: true,
      },
    });

    try {
      const response = await client.sendMessage(steamId, trimmed, clientMessageId);

      if (clientTokenRef.current !== clientToken) {
        return;
      }

      dispatch({
        type: 'send-ok',
        steamId,
        id,
        timestamp: response.serverTimestamp,
        ordinal: response.ordinal,
      });
    } catch (error) {
      if (clientTokenRef.current !== clientToken) {
        return;
      }

      const confirmed = stateRef.current.conversations[steamId]?.messages.find(
        (message) => message.id === id && !message.pending && !message.failed,
      );

      if (confirmed) return;

      dispatch({ type: 'send-failed', steamId, id });
      throw new Error(describeError(error));
    }
  }, []);

  /** Tells Steam the conversation was read so other devices clear the badge. */
  const acknowledge = useCallback((steamId: string, timestamp: number) => {
    const client = clientRef.current;

    if (!client || !client.isLoggedOn || timestamp <= 0) {
      return;
    }

    void client.ackMessage(steamId, timestamp).catch(() => {
      // Read receipts are best effort.
    });
  }, []);

  /** Tells Steam the user is typing, throttled the same way the app does. */
  const sendTyping = useCallback((steamId: string) => {
    const client = clientRef.current;

    if (!client || !client.isLoggedOn) {
      return;
    }

    const now = Date.now();
    const last = typingSentAt.current.get(steamId) ?? 0;

    if (now - last < TYPING_SEND_INTERVAL_MS) {
      return;
    }

    typingSentAt.current.set(steamId, now);

    void client.sendTyping(steamId).catch(() => {
      // Typing indicators are best effort.
    });
  }, []);

  const openConversation = useCallback(
    (steamId: string) => {
      dispatch({ type: 'open', steamId });
      loadConversation(steamId);
    },
    [loadConversation],
  );

  const closeConversation = useCallback((steamId: string) => {
    dispatch({ type: 'close', steamId });
  }, []);

  const markRead = useCallback(
    (steamId: string, timestamp: number) => {
      dispatch({ type: 'mark-read', steamId });
      acknowledge(steamId, timestamp);
    },
    [acknowledge],
  );

  const handleEvent = useCallback(
    (event: SteamCmEvent) => {
      switch (event.type) {
        case 'connection':
          dispatch({ type: 'connection', state: event.state });
          break;
        case 'logged-on':
          dispatch({ type: 'self', steamId: event.steamId });
          dispatch({ type: 'logged-on' });
          if (stateRef.current.active) {
            loadConversation(stateRef.current.active, true);
          }
          {
            const activeGroupId = groupStateRef.current.activeGroup;
            const activeGroup = activeGroupId
              ? groupStateRef.current.groups[activeGroupId]
              : undefined;
            const activeChatId = activeGroup?.selectedChatId;

            if (activeGroupId && activeChatId) {
              loadGroupHistory(activeGroupId, activeChatId);
            }
          }
          break;
        case 'auth-error':
          dispatch({ type: 'auth-error', eresult: event.eresult });
          break;
        case 'friends':
          dispatch({ type: 'friends', friends: event.friends, incremental: event.incremental });

          // The CM normally pushes persona state right behind the friends
          // list. If it does not, ask for the missing entries explicitly.
          if (!event.incremental) {
            const pendingIds = event.friends
              .filter((entry) => entry.relationship === FRIEND_RELATIONSHIP_FRIEND)
              .map((entry) => entry.steamId);

            schedulePersonaFallback(pendingIds);
          }
          break;
        case 'persona':
          dispatch({ type: 'persona', updates: event.updates });
          break;
        case 'account-info':
          dispatch({ type: 'account-info', personaName: event.info.personaName });
          break;
        case 'message': {
          const message = event.message;

          if (message.chatEntryType === 2) {
            const typingSteamId = message.steamIdFriend;

            dispatch({ type: 'typing', steamId: typingSteamId, typing: true });

            const existing = typingTimers.current.get(typingSteamId);

            if (existing) {
              clearTimeout(existing);
            }

            typingTimers.current.set(
              typingSteamId,
              setTimeout(() => {
                typingTimers.current.delete(typingSteamId);
                dispatch({ type: 'typing', steamId: typingSteamId, typing: false });
              }, TYPING_CLEAR_MS),
            );
            break;
          }

          dispatch({ type: 'message', message });
          break;
        }
        case 'sessions':
          dispatch({ type: 'sessions', sessions: event.sessions });
          void loadPreviews(event.sessions);
          break;
        case 'ack':
          break;
        case 'chat-groups':
          applyGroups(event.groups);
          break;
        case 'chat-groups-error':
          groupDispatch({
            type: 'groups-error',
            error: 'Could not load your group chats. Pull down to try again.',
          });
          break;
        case 'chat-group-message': {
          const message = event.message;
          const text = stripBbcode(message.messageNoBbcode || message.message);
          const content = message.message || message.messageNoBbcode;

          if (message.serverMessage !== 0 || !text) {
            break;
          }

          const mine = message.senderSteamId === stateRef.current.selfSteamId;
          const sentAt = message.timestamp || Math.floor(Date.now() / 1000);
          const knownGroup = groupStateRef.current.groups[message.chatGroupId];

          groupDispatch({
            type: 'group-message',
            chatGroupId: message.chatGroupId,
            chatId: message.chatId,
            mine,
            incoming: message,
            message: {
              id: `gm-${message.chatId}-${message.ordinal}-${sentAt}`,
              authorSteamId: message.senderSteamId,
              text,
              content,
              sentAt,
              ordinal: message.ordinal,
              mine,
            },
          });

          if (!mine) {
            requestGroupProfiles([message.senderSteamId]);
          }

          if (!knownGroup) {
            // A group can be joined or created on another device. Fetch the
            // list so the Groups tab has a summary for this room.
            void refreshGroups();
          }
          break;
        }
        case 'chat-group-ack':
          groupDispatch({
            type: 'group-ack',
            chatGroupId: event.ack.chatGroupId,
            chatId: event.ack.chatId,
            timestamp: event.ack.timestamp,
          });
          break;
        case 'chat-group-user-state': {
          const notification = event.notification;
          groupDispatch({ type: 'group-notification', notification });

          if (notification.userAction === 1) {
            const token = clientTokenRef.current;
            if (token) {
              activateGroups(
                [...Object.keys(groupStateRef.current.groups), notification.chatGroupId],
                token,
              );
            }
            requestGroupProfiles(
              notification.groupSummary.topMembers.map((accountId) =>
                steamIdFromAccountId(accountId),
              ),
            );
          }
          break;
        }
        case 'chat-group-header':
          groupDispatch({ type: 'group-header', header: event.header });
          break;
        case 'chat-group-rooms':
          groupDispatch({ type: 'group-rooms', change: event.change });
          break;
        case 'chat-group-modified':
          groupDispatch({ type: 'group-modified', change: event.change });
          break;
        case 'chat-groups-resync': {
          const token = clientTokenRef.current;
          const chatGroupIds = Object.keys(groupStateRef.current.groups);

          if (token && chatGroupIds.length > 0) {
            activateGroups(chatGroupIds, token);
          }
          break;
        }
      }
    },
    [
      activateGroups,
      applyGroups,
      loadConversation,
      loadGroupHistory,
      loadPreviews,
      refreshGroups,
      requestGroupProfiles,
      schedulePersonaFallback,
    ],
  );

  const steamId = credentials?.steamId ?? null;
  const accountName = credentials?.accountName ?? null;
  const [generation, setGeneration] = useState(0);

  const retryConnection = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  useEffect(() => {
    if (status !== 'signed-in' || !steamId || !accountName) {
      clientTokenRef.current = null;
      clientRef.current?.stop();
      clientRef.current = null;
      dispatch({ type: 'reset' });
      groupDispatch({ type: 'reset' });
      requestedGroupProfiles.current.clear();
      groupAcksSentAt.current.clear();
      return;
    }

    // Captured once: these maps live for the lifetime of the provider.
    const typingTimerMap = typingTimers.current;
    const typingSentMap = typingSentAt.current;
    const clientToken = Symbol('steam-client');

    const handleClientEvent = (event: SteamCmEvent) => {
      if (clientTokenRef.current !== clientToken) {
        return;
      }

      handleEvent(event);

      // Bind the profile to this client's account: a late event from a client
      // that is being replaced must not rename the newly active account.
      if (event.type === 'account-info') {
        updateAccountProfile(steamId, { personaName: event.info.personaName });
      }
    };

    const client = new SteamCmClient({
      steamId,
      accountName,
      getRefreshToken: () => credentialsRef.current?.refreshToken ?? '',
      onEvent: handleClientEvent,
    });

    clientTokenRef.current = clientToken;
    clientRef.current = client;
    dispatch({ type: 'reset' });
    groupDispatch({ type: 'reset' });
    requestedGroupProfiles.current.clear();
    groupAcksSentAt.current.clear();
    client.start();

    return () => {
      if (clientTokenRef.current === clientToken) {
        clientTokenRef.current = null;
      }

      client.stop();

      if (personaFallbackTimer.current) {
        clearTimeout(personaFallbackTimer.current);
        personaFallbackTimer.current = null;
      }

      for (const timer of typingTimerMap.values()) {
        clearTimeout(timer);
      }

      typingTimerMap.clear();
      typingSentMap.clear();

      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [
    status,
    steamId,
    accountName,
    authRevision,
    handleEvent,
    generation,
    updateAccountProfile,
  ]);

  useEffect(() => {
    let backgroundedAt = 0;

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const awayFor = backgroundedAt ? Date.now() - backgroundedAt : 0;
        backgroundedAt = 0;
        // Android can leave the socket looking open after a long sleep, so a
        // long absence gets a hard reconnect instead of a health check.
        clientRef.current?.reconnectNow(awayFor > 30_000);
        return;
      }

      if (next === 'background') {
        backgroundedAt = Date.now();
      }
    });

    return () => subscription.remove();
  }, []);

  const chats = useMemo<ChatListItem[]>(() => {
    return Object.values(state.conversations)
      .filter(
        (conversation) =>
          conversation.lastActivity > 0 || conversation.messages.length > 0,
      )
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .map((conversation) => ({
        conversation,
        friend: state.friends[conversation.steamId] ?? placeholderFriend(conversation.steamId),
      }));
  }, [state.conversations, state.friends]);

  const groupChats = useMemo<GroupChatListItem[]>(() => {
    const selfAccountId = state.selfSteamId
      ? accountIdFromSteamId(state.selfSteamId)
      : 0;

    return Object.values(groupState.groups)
      .map((group) => {
        const latest = latestGroupRoom(group);
        const preview =
          latest && latest.lastMessageAt > 0
            ? {
                text:
                  stripBbcode(latest.lastMessage) ||
                  (latest.lastMessageAt > 0 ? 'New messages' : ''),
                sentAt: latest.lastMessageAt,
                mine: selfAccountId > 0 && latest.lastMessageAccountId === selfAccountId,
              }
            : undefined;

        return {
          group,
          name: groupDisplayName(
            group,
            groupState.groupProfiles,
            state.friends,
            state.selfSteamId,
          ),
          avatarUrl: group.avatarUrl,
          preview,
          unread: group.unread,
          lastActivity: group.lastActivity || latest?.lastMessageAt || 0,
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [
    groupState.groups,
    groupState.groupProfiles,
    state.friends,
    state.selfSteamId,
  ]);

  const value = useMemo<SteamChatContextValue>(
    () => ({
      ...state,
      ...groupState,
      chats,
      groupChats,
      ready: state.connection === 'connected' && state.loggedOn,
      sendMessage,
      getEmoticons,
      sendImage,
      openConversation,
      closeConversation,
      loadConversation,
      loadMore,
      markRead,
      sendTyping,
      retryConnection,
      refreshGroups,
      createGroupChat,
      openGroup,
      closeGroup,
      selectGroupRoom,
      loadGroupHistory,
      loadMoreGroupHistory,
      markGroupRead,
      sendGroupMessage,
      sendGroupImage,
      clearCache,
    }),
    [
      state,
      groupState,
      chats,
      groupChats,
      sendMessage,
      getEmoticons,
      sendImage,
      openConversation,
      closeConversation,
      loadConversation,
      loadMore,
      markRead,
      sendTyping,
      retryConnection,
      refreshGroups,
      createGroupChat,
      openGroup,
      closeGroup,
      selectGroupRoom,
      loadGroupHistory,
      loadMoreGroupHistory,
      markGroupRead,
      sendGroupMessage,
      sendGroupImage,
      clearCache,
    ],
  );

  return <SteamChatContext.Provider value={value}>{children}</SteamChatContext.Provider>;
}

export function useSteamChat(): SteamChatContextValue {
  const context = useContext(SteamChatContext);

  if (!context) {
    throw new Error('useSteamChat must be used inside SteamChatProvider');
  }

  return context;
}
