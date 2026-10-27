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
import { AppState } from 'react-native';

import {
  SteamCmClient,
  SteamCmError,
  type SteamCmConnectionState,
  type SteamCmEvent,
} from '@/lib/steam/cm-client';
import {
  FRIEND_RELATIONSHIP_FRIEND,
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
  steamIdFromAccountId,
  stripBbcode,
  type FriendStatus,
} from '@/lib/steam/chat-utils';
import { EResult } from '@/lib/steam/constants';
import { useSession } from '@/context/session';

const INITIAL_MESSAGE_COUNT = 100;
const MORE_MESSAGE_COUNT = 50;
const MAX_PREVIEWS = 12;
const MAX_SESSIONS = 30;
const PERSONA_FALLBACK_DELAY_MS = 2_500;
/** Matches the app: send at most one typing notification per 10s per chat. */
const TYPING_SEND_INTERVAL_MS = 10_000;
/** Matches the app: a friend stops "typing" after 11s without a new notice. */
const TYPING_CLEAR_MS = 11_000;

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
  lastOnline?: number;
  onSteamDeck: boolean;
  relationship: number;
};

export type ChatMessage = {
  id: string;
  authorSteamId: string;
  text: string;
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
};

export type ChatListItem = {
  conversation: Conversation;
  friend: SteamFriend;
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
  };
}

function mergePersona(friend: SteamFriend, update: CmPersona): SteamFriend {
  const status =
    update.personaState === null ? friend.status : personaStatus(update.personaState);
  const gameAppId = update.gamePlayedAppId ?? friend.gameAppId;
  const gameName =
    update.personaState === 0
      ? undefined
      : (update.gameName ?? (update.gamePlayedAppId === null ? friend.gameName : undefined));

  return {
    ...friend,
    name: update.playerName ?? friend.name,
    avatarUrl: update.avatarHash ? buildAvatarUrl(update.avatarHash) : friend.avatarUrl,
    status,
    gameAppId,
    gameName,
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

function reduce(state: SteamChatState, action: Action): SteamChatState {
  switch (action.type) {
    case 'reset':
      return initialState;

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
          unread:
            state.active === steamId
              ? 0
              : Math.max(conversation.unread, session.unreadMessageCount),
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
          [action.steamId]: { ...conversation, unread: 0 },
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
            hasMore: action.moreAvailable,
            oldestTime: oldest?.sentAt ?? 0,
            oldestOrdinal: oldest?.ordinal ?? 0,
            lastActivity: Math.max(conversation.lastActivity, newest?.sentAt ?? 0),
            preview: lastMessagePreview(messages) ?? conversation.preview,
            error: undefined,
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
              message.id === action.id
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
      case EResult.RateLimitExceeded:
        return 'Steam is rate limiting requests. Wait a moment and try again.';
      default:
        return error.message;
    }
  }

  return 'Something went wrong. Try again.';
}

type SteamChatContextValue = SteamChatState & {
  chats: ChatListItem[];
  ready: boolean;
  sendMessage: (steamId: string, text: string) => void;
  openConversation: (steamId: string) => void;
  closeConversation: (steamId: string) => void;
  loadConversation: (steamId: string, force?: boolean) => void;
  loadMore: (steamId: string) => void;
  markRead: (steamId: string, timestamp: number) => void;
  sendTyping: (steamId: string) => void;
  retryConnection: () => void;
};

const SteamChatContext = createContext<SteamChatContextValue | null>(null);

export function SteamChatProvider({ children }: { children: ReactNode }) {
  const { status, credentials } = useSession();
  const [state, dispatch] = useReducer(reduce, initialState);

  const credentialsRef = useRef(credentials);
  const stateRef = useRef(state);
  const clientRef = useRef<SteamCmClient | null>(null);
  const personaFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingSentAt = useRef(new Map<string, number>());

  useEffect(() => {
    credentialsRef.current = credentials;
  }, [credentials]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * The CM pushes persona state right after the friends list, but a friend can
   * still be nameless if that update is missed. Ask for those explicitly.
   */
  const schedulePersonaFallback = useCallback((steamIds: string[]) => {
    if (personaFallbackTimer.current) {
      clearTimeout(personaFallbackTimer.current);
      personaFallbackTimer.current = null;
    }

    if (steamIds.length === 0) {
      return;
    }

    personaFallbackTimer.current = setTimeout(() => {
      personaFallbackTimer.current = null;

      const missing = steamIds.filter((steamId) => {
        const friend = stateRef.current.friends[steamId];
        return !friend || friend.name === UNKNOWN_FRIEND_NAME;
      });

      if (missing.length > 0) {
        clientRef.current?.requestFriendData(missing);
      }
    }, PERSONA_FALLBACK_DELAY_MS);
  }, []);

  const loadConversation = useCallback((steamId: string, force = false) => {
    const client = clientRef.current;
    const conversation = stateRef.current.conversations[steamId];

    if (!client || !client.isLoggedOn) {
      return;
    }

    if (!force && (conversation?.loading || conversation?.loaded)) {
      return;
    }

    dispatch({ type: 'loading', steamId });

    void client
      .getRecentMessages(steamId, { count: INITIAL_MESSAGE_COUNT })
      .then((response) => {
        dispatch({
          type: 'loaded',
          steamId,
          messages: response.messages,
          moreAvailable: response.moreAvailable,
        });
      })
      .catch((error: unknown) => {
        dispatch({ type: 'load-error', steamId, error: describeError(error) });
      });
  }, []);

  const loadMore = useCallback((steamId: string) => {
    const client = clientRef.current;
    const conversation = stateRef.current.conversations[steamId];

    if (!client || !client.isLoggedOn || !conversation || conversation.loading || !conversation.hasMore) {
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
        dispatch({
          type: 'loaded',
          steamId,
          messages: response.messages,
          moreAvailable: response.moreAvailable,
        });
      })
      .catch((error: unknown) => {
        dispatch({ type: 'load-error', steamId, error: describeError(error) });
      });
  }, []);

  const loadPreviews = useCallback(async (sessions: MessageSession[]) => {
    const client = clientRef.current;

    if (!client) {
      return;
    }

    const recent = [...sessions]
      .sort((a, b) => b.lastMessage - a.lastMessage)
      .slice(0, MAX_PREVIEWS);

    for (const session of recent) {
      if (!client.isLoggedOn) {
        return;
      }

      const steamId = steamIdFromAccountId(session.accountIdFriend);
      const current = stateRef.current.conversations[steamId];

      if (current?.preview && current.preview.sentAt >= session.lastMessage) {
        continue;
      }

      try {
        const response = await client.getRecentMessages(steamId, { count: 1 });
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

  const sendMessage = useCallback((steamId: string, text: string) => {
    const client = clientRef.current;
    const trimmed = text.trim();
    const selfSteamId = stateRef.current.selfSteamId;

    if (!client || !selfSteamId || !trimmed) {
      return;
    }

    const clientMessageId = generateClientMessageId();
    const id = `local-${clientMessageId}`;

    dispatch({
      type: 'send-pending',
      steamId,
      message: {
        id,
        authorSteamId: selfSteamId,
        text: trimmed,
        sentAt: Math.floor(Date.now() / 1000),
        ordinal: 0,
        mine: true,
        pending: true,
      },
    });

    void client
      .sendMessage(steamId, trimmed, clientMessageId)
      .then((response) => {
        dispatch({
          type: 'send-ok',
          steamId,
          id,
          timestamp: response.serverTimestamp,
          ordinal: response.ordinal,
        });
      })
      .catch(() => {
        dispatch({ type: 'send-failed', steamId, id });
      });
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
      }
    },
    [loadConversation, loadPreviews, schedulePersonaFallback],
  );

  const steamId = credentials?.steamId ?? null;
  const accountName = credentials?.accountName ?? null;
  const [generation, setGeneration] = useState(0);

  const retryConnection = useCallback(() => {
    setGeneration((current) => current + 1);
  }, []);

  useEffect(() => {
    if (status !== 'signed-in' || !steamId || !accountName) {
      clientRef.current?.stop();
      clientRef.current = null;
      dispatch({ type: 'reset' });
      return;
    }

    // Captured once: these maps live for the lifetime of the provider.
    const typingTimerMap = typingTimers.current;
    const typingSentMap = typingSentAt.current;

    const client = new SteamCmClient({
      steamId,
      accountName,
      getRefreshToken: () => credentialsRef.current?.refreshToken ?? '',
      onEvent: handleEvent,
    });

    clientRef.current = client;
    dispatch({ type: 'reset' });
    client.start();

    return () => {
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
  }, [status, steamId, accountName, handleEvent, generation]);

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

  const value = useMemo<SteamChatContextValue>(
    () => ({
      ...state,
      chats,
      ready: state.connection === 'connected' && state.loggedOn,
      sendMessage,
      openConversation,
      closeConversation,
      loadConversation,
      loadMore,
      markRead,
      sendTyping,
      retryConnection,
    }),
    [
      state,
      chats,
      sendMessage,
      openConversation,
      closeConversation,
      loadConversation,
      loadMore,
      markRead,
      sendTyping,
      retryConnection,
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
