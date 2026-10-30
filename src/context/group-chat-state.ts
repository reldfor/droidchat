import type { ChatMessage } from '@/context/steam-chat';
import { buildGroupAvatarUrl } from '@/lib/steam/group-chat';
import {
  accountIdFromSteamId,
  steamIdFromAccountId,
  stripBbcode,
} from '@/lib/steam/chat-utils';
import type {
  ChatRoomGroupHeaderState,
  ChatRoomGroupRoomsChange,
  ChatRoomGroupState,
  ChatRoomGroupSummary,
  ChatRoomGroupUserStateNotification,
  ChatRoomHistoryMessage,
  ChatRoomMessageModified,
  ChatRoomState,
  ChatRoomSummaryPair,
  ChatRoomUserGroupState,
  CreatedChatRoomGroup,
  IncomingChatRoomMessage,
} from '@/lib/steam/cm-proto';

export type GroupRoom = {
  chatId: string;
  name: string;
  sortOrder: number;
  voiceAllowed: boolean;
  messages: ChatMessage[];
  loaded: boolean;
  loading: boolean;
  hasMore: boolean;
  oldestTime: number;
  oldestOrdinal: number;
  lastMessageAt: number;
  lastMessage: string;
  lastMessageAccountId: number;
  unread: boolean;
  error?: string;
  /** Unix milliseconds when this room was last reconciled with Steam. */
  syncedAt: number;
};

export type GroupChat = {
  chatGroupId: string;
  name: string;
  tagline: string;
  avatarSha: string | null;
  avatarUrl: string | null;
  memberCount: number;
  topMemberIds: number[];
  defaultChatId: string;
  roomOrder: string[];
  rooms: Record<string, GroupRoom>;
  selectedChatId: string;
  userState: ChatRoomUserGroupState | null;
  lastActivity: number;
  unread: boolean;
};

export type GroupAuthorProfile = {
  name: string;
  avatarUrl: string | null;
};

export type GroupChatSlice = {
  groups: Record<string, GroupChat>;
  groupProfiles: Record<string, GroupAuthorProfile>;
  groupListLoaded: boolean;
  groupError: string | null;
  activeGroup: string | null;
};

export type GroupAction =
  | { type: 'reset' }
  | {
      type: 'hydrate';
      groups: Record<string, GroupChat>;
      profiles: Record<string, GroupAuthorProfile>;
    }
  | { type: 'groups'; groups: ChatRoomSummaryPair[] }
  | { type: 'groups-error'; error: string }
  | { type: 'group-created'; created: CreatedChatRoomGroup; now?: number }
  | { type: 'group-states'; states: ChatRoomGroupState[] }
  | { type: 'group-notification'; notification: ChatRoomGroupUserStateNotification }
  | { type: 'group-header'; header: ChatRoomGroupHeaderState }
  | { type: 'group-rooms'; change: ChatRoomGroupRoomsChange }
  | { type: 'group-open'; chatGroupId: string; chatId?: string }
  | { type: 'group-close'; chatGroupId: string }
  | { type: 'group-select-room'; chatGroupId: string; chatId: string }
  | { type: 'group-history-loading'; chatGroupId: string; chatId: string }
  | {
      type: 'group-history';
      chatGroupId: string;
      chatId: string;
      messages: ChatRoomHistoryMessage[];
      moreAvailable: boolean;
      selfSteamId: string | null;
      direction?: 'initial' | 'older' | 'newer';
    }
  | { type: 'group-history-error'; chatGroupId: string; chatId: string; error: string }
  | {
      type: 'group-message';
      chatGroupId: string;
      chatId: string;
      message: ChatMessage;
      incoming: IncomingChatRoomMessage;
      mine: boolean;
    }
  | { type: 'group-send-pending'; chatGroupId: string; chatId: string; message: ChatMessage }
  | {
      type: 'group-send-ok';
      chatGroupId: string;
      chatId: string;
      id: string;
      timestamp: number;
      ordinal: number;
    }
  | { type: 'group-send-failed'; chatGroupId: string; chatId: string; id: string }
  | { type: 'group-ack'; chatGroupId: string; chatId: string; timestamp: number }
  | { type: 'group-profiles'; profiles: Record<string, GroupAuthorProfile> }
  | { type: 'group-modified'; change: ChatRoomMessageModified }
  | { type: 'group-removed'; chatGroupId: string };

export const initialGroupChatState: GroupChatSlice = {
  groups: {},
  groupProfiles: {},
  groupListLoaded: false,
  groupError: null,
  activeGroup: null,
};

function emptyRoom(chatId: string): GroupRoom {
  return {
    chatId,
    name: '',
    sortOrder: 0,
    voiceAllowed: false,
    messages: [],
    loaded: false,
    loading: false,
    hasMore: false,
    oldestTime: 0,
    oldestOrdinal: 0,
    lastMessageAt: 0,
    lastMessage: '',
    lastMessageAccountId: 0,
    unread: false,
    syncedAt: 0,
  };
}

function emptyGroup(chatGroupId: string): GroupChat {
  return {
    chatGroupId,
    name: '',
    tagline: '',
    avatarSha: null,
    avatarUrl: null,
    memberCount: 0,
    topMemberIds: [],
    defaultChatId: '',
    roomOrder: [],
    rooms: {},
    selectedChatId: '',
    userState: null,
    lastActivity: 0,
    unread: false,
  };
}

function sortRoomIds(rooms: Record<string, GroupRoom>): string[] {
  return Object.values(rooms)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name) ||
        a.chatId.localeCompare(b.chatId),
    )
    .map((room) => room.chatId);
}

function pickChatId(group: GroupChat, preferred?: string): string {
  if (preferred && group.rooms[preferred]) {
    return preferred;
  }

  if (group.selectedChatId && group.rooms[group.selectedChatId]) {
    return group.selectedChatId;
  }

  if (group.defaultChatId && group.rooms[group.defaultChatId]) {
    return group.defaultChatId;
  }

  return group.roomOrder[0] ?? '';
}

function roomAckTimestamp(userState: ChatRoomUserGroupState | null, chatId: string): number {
  const roomState = userState?.userChatRoomStates.find((entry) => entry.chatId === chatId);

  return roomState?.timeLastAck ?? userState?.timeLastGroupAck ?? 0;
}

function updateUnread(
  group: GroupChat,
  userState: ChatRoomUserGroupState | null,
): { rooms: Record<string, GroupRoom>; unread: boolean } {
  let unread = false;
  const rooms: Record<string, GroupRoom> = {};

  for (const [chatId, room] of Object.entries(group.rooms)) {
    const isUnread = !userState?.unreadIndicatorMuted &&
      room.lastMessageAt > roomAckTimestamp(userState, chatId);
    rooms[chatId] = { ...room, unread: isUnread };
    unread = unread || isUnread;
  }

  return { rooms, unread };
}

function mergeRoomState(
  existing: GroupRoom | undefined,
  state: ChatRoomState,
  userState: ChatRoomUserGroupState | null,
): GroupRoom {
  const room = existing ?? emptyRoom(state.chatId);
  const lastMessageAt = Math.max(room.lastMessageAt, state.timeLastMessage);
  const lastMessage = state.lastMessage || room.lastMessage;
  const lastMessageAccountId = state.accountIdLastMessage || room.lastMessageAccountId;

  return {
    ...room,
    chatId: state.chatId,
    name: state.name || room.name,
    sortOrder: state.sortOrder,
    voiceAllowed: state.voiceAllowed,
    lastMessageAt,
    lastMessage,
    lastMessageAccountId,
    unread: !userState?.unreadIndicatorMuted &&
      lastMessageAt > roomAckTimestamp(userState, state.chatId),
  };
}

function applySummary(group: GroupChat, summary: ChatRoomGroupSummary): GroupChat {
  const rooms = summary.chatRooms.length > 0 ? { ...group.rooms } : group.rooms;

  if (summary.chatRooms.length > 0) {
    const seen = new Set<string>();

    for (const state of summary.chatRooms) {
      seen.add(state.chatId);
      rooms[state.chatId] = mergeRoomState(rooms[state.chatId], state, group.userState);
    }

    for (const chatId of Object.keys(rooms)) {
      if (!seen.has(chatId)) {
        delete rooms[chatId];
      }
    }
  }

  const next: GroupChat = {
    ...group,
    name: summary.name || group.name,
    tagline: summary.tagline || group.tagline,
    avatarSha: summary.avatarSha ?? group.avatarSha,
    avatarUrl:
      buildGroupAvatarUrl(summary.avatarSha, 64, summary.avatarUgcUrl) ??
      group.avatarUrl,
    memberCount: summary.activeMemberCount || group.memberCount,
    topMemberIds: summary.topMembers.length > 0 ? summary.topMembers : group.topMemberIds,
    defaultChatId: summary.defaultChatId || group.defaultChatId,
    rooms,
    roomOrder: sortRoomIds(rooms),
  };

  next.selectedChatId = pickChatId(next);
  return next;
}

function applyUserState(
  group: GroupChat,
  userState: ChatRoomUserGroupState,
): GroupChat {
  const unread = updateUnread(group, userState);

  return {
    ...group,
    userState,
    rooms: unread.rooms,
    unread: unread.unread,
  };
}

function applyGroupState(group: GroupChat, state: ChatRoomGroupState): GroupChat {
  const header = state.headerState;
  const rooms = state.chatRooms.length > 0 ? { ...group.rooms } : group.rooms;

  if (state.chatRooms.length > 0) {
    const seen = new Set<string>();

    for (const roomState of state.chatRooms) {
      seen.add(roomState.chatId);
      rooms[roomState.chatId] = mergeRoomState(
        rooms[roomState.chatId],
        roomState,
        group.userState,
      );
    }

    for (const chatId of Object.keys(rooms)) {
      if (!seen.has(chatId)) {
        delete rooms[chatId];
      }
    }
  }

  const next: GroupChat = {
    ...group,
    name: header.name || group.name,
    tagline: header.tagline || group.tagline,
    avatarSha: header.avatarSha ?? group.avatarSha,
    avatarUrl:
      buildGroupAvatarUrl(header.avatarSha, 64, header.avatarUgcUrl) ?? group.avatarUrl,
    memberCount: group.memberCount || state.members.length,
    defaultChatId: state.defaultChatId || group.defaultChatId,
    rooms,
    roomOrder: sortRoomIds(rooms),
  };

  next.selectedChatId = pickChatId(next);
  return next;
}

function applyRoomsChange(group: GroupChat, change: ChatRoomGroupRoomsChange): GroupChat {
  const rooms = { ...group.rooms };

  if (change.chatRooms.length > 0) {
    const seen = new Set<string>();

    for (const roomState of change.chatRooms) {
      seen.add(roomState.chatId);
      rooms[roomState.chatId] = mergeRoomState(
        rooms[roomState.chatId],
        roomState,
        group.userState,
      );
    }

    for (const chatId of Object.keys(rooms)) {
      if (!seen.has(chatId)) {
        delete rooms[chatId];
      }
    }
  }

  const next: GroupChat = {
    ...group,
    defaultChatId: change.defaultChatId || group.defaultChatId,
    rooms,
    roomOrder: sortRoomIds(rooms),
  };

  next.selectedChatId = pickChatId(next);
  return next;
}

function withGroup(
  state: GroupChatSlice,
  chatGroupId: string,
  update: (group: GroupChat) => GroupChat,
): GroupChatSlice {
  const group = state.groups[chatGroupId];

  if (!group) {
    return state;
  }

  const next = update(group);

  return {
    ...state,
    groups: {
      ...state.groups,
      [chatGroupId]: {
        ...next,
        lastActivity: Math.max(
          next.lastActivity,
          ...Object.values(next.rooms).map((room) => room.lastMessageAt),
        ),
        unread: Object.values(next.rooms).some((room) => room.unread),
      },
    },
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

function messageFromHistory(
  message: ChatRoomHistoryMessage,
  selfSteamId: string | null,
): ChatMessage | null {
  if (message.deleted || message.serverMessage !== 0) {
    return null;
  }

  const text = stripBbcode(message.message);
  if (!text) {
    return null;
  }

  const authorSteamId = steamIdFromAccountId(message.senderAccountId);

  return {
    id: `gh-${message.ordinal}-${message.timestamp}-${message.senderAccountId}`,
    authorSteamId,
    text,
    content: message.message,
    sentAt: message.timestamp,
    ordinal: message.ordinal,
    mine: selfSteamId !== null && authorSteamId === selfSteamId,
  };
}

function mergeHistory(
  existing: ChatMessage[],
  history: ChatRoomHistoryMessage[],
  selfSteamId: string | null,
): ChatMessage[] {
  const byKey = new Map<string, ChatMessage>();

  for (const entry of history) {
    const message = messageFromHistory(entry, selfSteamId);
    if (message) {
      byKey.set(messageKey(message), message);
    }
  }

  for (const message of existing) {
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

function appendMessage(messages: ChatMessage[], message: ChatMessage, mine: boolean): ChatMessage[] {
  if (message.ordinal > 0) {
    const existingIndex = messages.findIndex((entry) => entry.ordinal === message.ordinal);

    if (existingIndex >= 0) {
      return messages.map((entry, index) =>
        index === existingIndex
          ? {
              ...entry,
              text: message.text,
              content: message.content,
              sentAt: message.sentAt || entry.sentAt,
              pending: false,
              failed: false,
            }
          : entry,
      );
    }
  }

  if (mine) {
    const pendingIndex = messages.findIndex(
      (entry) =>
        entry.mine &&
        (entry.pending || entry.failed) &&
        entry.text === message.text,
    );

    if (pendingIndex >= 0) {
      return messages.map((entry, index) =>
        index === pendingIndex
          ? {
              ...entry,
              text: message.text,
              content: message.content,
              sentAt: message.sentAt || entry.sentAt,
              ordinal: message.ordinal,
              pending: false,
              failed: false,
            }
          : entry,
      );
    }

    const recentIndex = messages.findIndex(
      (entry) =>
        entry.mine &&
        entry.text === message.text &&
        message.sentAt > 0 &&
        Math.abs(entry.sentAt - message.sentAt) <= 60,
    );

    if (recentIndex >= 0) {
      return messages.map((entry, index) =>
        index === recentIndex
          ? {
              ...entry,
              text: message.text,
              content: message.content,
              sentAt: message.sentAt || entry.sentAt,
              ordinal: message.ordinal,
              pending: false,
              failed: false,
            }
          : entry,
      );
    }
  }

  return sortMessages([...messages, message]);
}

function ensureRoom(group: GroupChat, chatId: string): GroupRoom {
  return group.rooms[chatId] ?? emptyRoom(chatId);
}

function resolveRoomHasMore(
  room: GroupRoom,
  direction: 'initial' | 'older' | 'newer' | undefined,
  incoming: ChatRoomHistoryMessage[],
  moreAvailable: boolean,
): boolean {
  if (direction === 'newer') {
    return room.hasMore;
  }

  if (direction === 'older' || !room.loaded || room.messages.length === 0) {
    return moreAvailable;
  }

  const incomingOldest = incoming.reduce(
    (oldest, message) =>
      message.timestamp > 0 && message.timestamp < oldest ? message.timestamp : oldest,
    Number.POSITIVE_INFINITY,
  );

  if (Number.isFinite(incomingOldest) && room.oldestTime > 0 && incomingOldest > room.oldestTime) {
    return room.hasMore;
  }

  return moreAvailable;
}

function mergeCachedRoom(existing: GroupRoom | undefined, cached: GroupRoom): GroupRoom {
  if (!existing) {
    return cached;
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

  return {
    ...cached,
    ...existing,
    chatId: existing.chatId,
    name: existing.name || cached.name,
    messages,
    loaded: existing.loaded || cached.loaded,
    loading: existing.loading,
    hasMore: existing.loaded ? existing.hasMore : cached.hasMore,
    oldestTime: oldest?.sentAt ?? 0,
    oldestOrdinal: oldest?.ordinal ?? 0,
    lastMessageAt: Math.max(existing.lastMessageAt, cached.lastMessageAt, newest?.sentAt ?? 0),
    lastMessage: existing.lastMessage || cached.lastMessage,
    lastMessageAccountId: existing.lastMessageAccountId || cached.lastMessageAccountId,
    unread: existing.unread,
    syncedAt: Math.max(existing.syncedAt, cached.syncedAt),
  };
}

function mergeCachedGroup(existing: GroupChat | undefined, cached: GroupChat): GroupChat {
  if (!existing) {
    return cached;
  }

  const rooms: Record<string, GroupRoom> = { ...existing.rooms };

  for (const [chatId, cachedRoom] of Object.entries(cached.rooms)) {
    rooms[chatId] = mergeCachedRoom(rooms[chatId], cachedRoom);
  }

  const roomOrder = [...existing.roomOrder];

  for (const chatId of cached.roomOrder) {
    if (rooms[chatId] && !roomOrder.includes(chatId)) {
      roomOrder.push(chatId);
    }
  }

  for (const chatId of Object.keys(rooms)) {
    if (!roomOrder.includes(chatId)) {
      roomOrder.push(chatId);
    }
  }

  const defaultChatId = rooms[existing.defaultChatId]
    ? existing.defaultChatId
    : cached.defaultChatId;
  const selectedChatId = rooms[existing.selectedChatId]
    ? existing.selectedChatId
    : cached.selectedChatId;

  return {
    ...cached,
    ...existing,
    name: existing.name || cached.name,
    tagline: existing.tagline || cached.tagline,
    avatarSha: existing.avatarSha ?? cached.avatarSha,
    avatarUrl: existing.avatarUrl ?? cached.avatarUrl,
    memberCount: existing.memberCount || cached.memberCount,
    topMemberIds: existing.topMemberIds.length > 0 ? existing.topMemberIds : cached.topMemberIds,
    defaultChatId,
    roomOrder,
    rooms,
    selectedChatId: rooms[selectedChatId] ? selectedChatId : (roomOrder[0] ?? ''),
    userState: existing.userState ?? cached.userState,
    lastActivity: Math.max(
      existing.lastActivity,
      cached.lastActivity,
      ...Object.values(rooms).map((room) => room.lastMessageAt),
      0,
    ),
    unread: existing.unread,
  };
}

export function groupReducer(state: GroupChatSlice, action: GroupAction): GroupChatSlice {
  switch (action.type) {
    case 'reset':
      return initialGroupChatState;

    case 'hydrate': {
      if (Object.keys(action.groups).length === 0 && Object.keys(action.profiles).length === 0) {
        return state;
      }

      const groups = { ...state.groups };

      for (const [chatGroupId, cached] of Object.entries(action.groups)) {
        groups[chatGroupId] = mergeCachedGroup(groups[chatGroupId], cached);
      }

      return {
        ...state,
        groups,
        groupProfiles: { ...action.profiles, ...state.groupProfiles },
        groupListLoaded: state.groupListLoaded || Object.keys(action.groups).length > 0,
      };
    }

    case 'groups': {
      const groups: Record<string, GroupChat> = {};

      for (const pair of action.groups) {
        const summary = pair.groupSummary;
        const chatGroupId = summary.chatGroupId;

        if (!chatGroupId) {
          continue;
        }

        const base = state.groups[chatGroupId] ?? emptyGroup(chatGroupId);
        groups[chatGroupId] = applyUserState(
          applySummary(base, summary),
          pair.userChatGroupState,
        );
      }

      const activeGroup =
        state.activeGroup && groups[state.activeGroup] ? state.activeGroup : null;

      return {
        ...state,
        groups,
        groupListLoaded: true,
        groupError: null,
        activeGroup,
      };
    }

    case 'groups-error':
      return { ...state, groupError: action.error };

    case 'group-created': {
      const created = action.created;
      const chatGroupId = created.chatGroupId;

      if (!chatGroupId) {
        return state;
      }

      const base = state.groups[chatGroupId] ?? emptyGroup(chatGroupId);
      let group = applyGroupState(base, created.state);

      // CreateGroup returns members rather than a summary. Seed the display
      // name list with those members so an unnamed group is not "Group chat".
      if (group.topMemberIds.length === 0) {
        const memberIds = created.state.members
          .map((member) => member.accountId)
          .filter((accountId) => accountId > 0);

        if (memberIds.length > 0) {
          group = { ...group, topMemberIds: memberIds };
        }
      }

      if (created.userChatGroupState.chatGroupId) {
        group = applyUserState(group, created.userChatGroupState);
      }

      // A new group has no messages yet, but it should sort near the top of the
      // list so the person who just created it can find it again immediately.
      const joinedAt = created.userChatGroupState.timeJoined || action.now || 0;

      return {
        ...state,
        groupError: null,
        groups: {
          ...state.groups,
          [chatGroupId]: {
            ...group,
            lastActivity: Math.max(group.lastActivity, joinedAt),
          },
        },
      };
    }

    case 'group-states': {
      let groups = state.groups;

      for (const groupState of action.states) {
        const chatGroupId = groupState.headerState.chatGroupId;
        if (!chatGroupId) {
          continue;
        }

        const base = groups[chatGroupId] ?? emptyGroup(chatGroupId);
        groups = {
          ...groups,
          [chatGroupId]: applyGroupState(base, groupState),
        };
      }

      return { ...state, groups };
    }

    case 'group-notification': {
      const notification = action.notification;
      const chatGroupId = notification.chatGroupId;
      if (!chatGroupId) {
        return state;
      }

      // 4 = invite state only. 1 = joined, 2 = left, 3 = kicked,
      // 10 = banned; 0/7 update an existing group's user state.
      if (notification.userAction === 4) {
        return state;
      }

      if (notification.userAction === 2 ||
          notification.userAction === 3 ||
          notification.userAction === 10) {
        if (!state.groups[chatGroupId]) {
          return state;
        }

        const groups = { ...state.groups };
        delete groups[chatGroupId];

        return {
          ...state,
          groups,
          activeGroup: state.activeGroup === chatGroupId ? null : state.activeGroup,
        };
      }

      const base = state.groups[chatGroupId] ?? emptyGroup(chatGroupId);
      let group = base;

      if (notification.groupSummary.chatGroupId) {
        group = applySummary(group, notification.groupSummary);
      }

      if (notification.userChatGroupState.chatGroupId) {
        group = applyUserState(group, notification.userChatGroupState);
      }

      return withGroup({ ...state, groups: { ...state.groups, [chatGroupId]: group } }, chatGroupId, (entry) => entry);
    }

    case 'group-header': {
      const chatGroupId = action.header.chatGroupId;

      return withGroup(state, chatGroupId, (group) => ({
        ...group,
        name: action.header.name || group.name,
        tagline: action.header.tagline || group.tagline,
        avatarSha: action.header.avatarSha ?? group.avatarSha,
        avatarUrl:
          buildGroupAvatarUrl(action.header.avatarSha, 64, action.header.avatarUgcUrl) ??
          group.avatarUrl,
      }));
    }

    case 'group-rooms':
      return withGroup(state, action.change.chatGroupId, (group) =>
        applyRoomsChange(group, action.change),
      );

    case 'group-open': {
      const group = state.groups[action.chatGroupId];

      if (!group) {
        return state;
      }

      const selectedChatId = pickChatId(group, action.chatId);
      const unread = updateUnread(
        { ...group, selectedChatId },
        group.userState,
      );

      return {
        ...state,
        activeGroup: action.chatGroupId,
        groups: {
          ...state.groups,
          [action.chatGroupId]: {
            ...group,
            selectedChatId,
            rooms: selectedChatId
              ? {
                  ...unread.rooms,
                  [selectedChatId]: {
                    ...unread.rooms[selectedChatId],
                    unread: false,
                  },
                }
              : unread.rooms,
            unread: Object.entries(unread.rooms).some(
              ([chatId, room]) => chatId !== selectedChatId && room.unread,
            ),
          },
        },
      };
    }

    case 'group-close':
      return state.activeGroup === action.chatGroupId
        ? { ...state, activeGroup: null }
        : state;

    case 'group-select-room': {
      const group = state.groups[action.chatGroupId];
      if (!group || !group.rooms[action.chatId]) {
        return state;
      }

      return withGroup(state, action.chatGroupId, (entry) => {
        const unread = updateUnread({ ...entry, selectedChatId: action.chatId }, entry.userState);

        return {
          ...entry,
          selectedChatId: action.chatId,
          rooms: {
            ...unread.rooms,
            [action.chatId]: { ...unread.rooms[action.chatId], unread: false },
          },
          unread: Object.entries(unread.rooms).some(
            ([chatId, room]) => chatId !== action.chatId && room.unread,
          ),
        };
      });
    }

    case 'group-history-loading':
      return withGroup(state, action.chatGroupId, (group) => {
        const room = ensureRoom(group, action.chatId);

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [action.chatId]: { ...room, loading: true, error: undefined },
          },
        };
      });

    case 'group-history': {
      return withGroup(state, action.chatGroupId, (group) => {
        const room = ensureRoom(group, action.chatId);
        const messages = mergeHistory(room.messages, action.messages, action.selfSteamId);
        const oldest = messages[0];
        const newest = messages[messages.length - 1];
        const newestAt = newest?.sentAt ?? 0;
        // Loading an older page must not replace the room's latest preview.
        const updatesPreview = newestAt >= room.lastMessageAt;

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [action.chatId]: {
              ...room,
              messages,
              loaded: true,
              loading: false,
              hasMore: resolveRoomHasMore(
                room,
                action.direction,
                action.messages,
                action.moreAvailable,
              ),
              oldestTime: oldest?.sentAt ?? 0,
              oldestOrdinal: oldest?.ordinal ?? 0,
              lastMessageAt: Math.max(room.lastMessageAt, newestAt),
              lastMessage: updatesPreview
                ? newest?.content ?? newest?.text ?? room.lastMessage
                : room.lastMessage,
              lastMessageAccountId: updatesPreview && newest
                ? accountIdFromSteamId(newest.authorSteamId)
                : room.lastMessageAccountId,
              error: undefined,
              syncedAt: Date.now(),
            },
          },
        };
      });
    }

    case 'group-history-error':
      return withGroup(state, action.chatGroupId, (group) => {
        const room = ensureRoom(group, action.chatId);

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [action.chatId]: {
              ...room,
              loading: false,
              error: action.error,
            },
          },
        };
      });

    case 'group-message': {
      const { incoming, message, mine } = action;
      const base = state.groups[action.chatGroupId] ?? emptyGroup(action.chatGroupId);
      const group: GroupChat = {
        ...base,
        name: base.name || incoming.chatName,
      };
      const room = ensureRoom(group, action.chatId);
      const messages = appendMessage(room.messages, message, mine);
      const isVisible =
        state.activeGroup === action.chatGroupId &&
        group.selectedChatId === action.chatId;
      const rooms = {
        ...group.rooms,
        [action.chatId]: {
          ...room,
          messages,
          lastMessageAt: Math.max(room.lastMessageAt, message.sentAt),
          lastMessage: message.content ?? message.text,
          lastMessageAccountId: accountIdFromSteamId(message.authorSteamId),
          unread: !isVisible && !mine,
        },
      };

      return {
        ...state,
        groups: {
          ...state.groups,
          [action.chatGroupId]: {
            ...group,
            rooms,
            roomOrder: group.roomOrder.includes(action.chatId)
              ? group.roomOrder
              : [...group.roomOrder, action.chatId],
            selectedChatId:
              group.selectedChatId || group.defaultChatId || action.chatId,
            lastActivity: Math.max(group.lastActivity, message.sentAt),
            unread: Object.values(rooms).some((entry) => entry.unread),
          },
        },
      };
    }

    case 'group-send-pending':
      return withGroup(state, action.chatGroupId, (group) => {
        const room = ensureRoom(group, action.chatId);

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [action.chatId]: {
              ...room,
              messages: sortMessages([...room.messages, action.message]),
              lastMessageAt: Math.max(room.lastMessageAt, action.message.sentAt),
              lastMessage: action.message.content ?? action.message.text,
              lastMessageAccountId: accountIdFromSteamId(action.message.authorSteamId),
              unread: false,
            },
          },
        };
      });

    case 'group-send-ok':
      return withGroup(state, action.chatGroupId, (group) => {
        const room = ensureRoom(group, action.chatId);

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [action.chatId]: {
              ...room,
              messages: sortMessages(
                room.messages.map((message) =>
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
              ),
            },
          },
        };
      });

    case 'group-send-failed':
      return withGroup(state, action.chatGroupId, (group) => {
        const room = ensureRoom(group, action.chatId);

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [action.chatId]: {
              ...room,
              messages: room.messages.map((message) =>
                message.id === action.id && message.pending
                  ? { ...message, pending: false, failed: true }
                  : message,
              ),
            },
          },
        };
      });

    case 'group-ack': {
      const group = state.groups[action.chatGroupId];
      if (!group) {
        return state;
      }

      if (!group.userState) {
        return withGroup(state, action.chatGroupId, (entry) => {
          const room = entry.rooms[action.chatId];
          if (!room) {
            return entry;
          }

          const rooms = {
            ...entry.rooms,
            [action.chatId]: {
              ...room,
              unread: room.lastMessageAt > action.timestamp,
            },
          };

          return {
            ...entry,
            rooms,
            unread: Object.values(rooms).some((nextRoom) => nextRoom.unread),
          };
        });
      }

      const source = group.userState;
      const existing = source.userChatRoomStates.find(
        (entry) => entry.chatId === action.chatId,
      );
      const nextRoomState = {
        chatId: action.chatId,
        timeJoined: existing?.timeJoined ?? 0,
        timeLastAck: Math.max(existing?.timeLastAck ?? 0, action.timestamp),
        desktopNotificationLevel: existing?.desktopNotificationLevel ?? 0,
        mobileNotificationLevel: existing?.mobileNotificationLevel ?? 0,
        timeLastMention: existing?.timeLastMention ?? 0,
        unreadIndicatorMuted: existing?.unreadIndicatorMuted ?? false,
        timeFirstUnread: 0,
      };
      const userState: ChatRoomUserGroupState = {
        ...source,
        // A room read receipt must not mark other rooms read. The group-level
        // ack only advances when Steam sends a new user state.
        timeLastGroupAck: source.timeLastGroupAck,
        userChatRoomStates: existing
          ? source.userChatRoomStates.map((entry) =>
              entry.chatId === action.chatId ? nextRoomState : entry,
            )
          : [...source.userChatRoomStates, nextRoomState],
      };

      return withGroup(state, action.chatGroupId, (entry) =>
        applyUserState(entry, userState),
      );
    }

    case 'group-profiles':
      return {
        ...state,
        groupProfiles: { ...state.groupProfiles, ...action.profiles },
      };

    case 'group-modified': {
      const { chatGroupId, chatId, deleted } = action.change;
      if (!chatGroupId || !chatId) {
        return state;
      }

      const ordinals = new Set(deleted.filter((entry) => entry.deleted).map((entry) => entry.ordinal));

      return withGroup(state, chatGroupId, (group) => {
        const room = group.rooms[chatId];
        if (!room || ordinals.size === 0) {
          return group;
        }

        return {
          ...group,
          rooms: {
            ...group.rooms,
            [chatId]: {
              ...room,
              messages: room.messages.filter((message) => !ordinals.has(message.ordinal)),
            },
          },
        };
      });
    }

    case 'group-removed': {
      if (!state.groups[action.chatGroupId]) {
        return state;
      }

      const groups = { ...state.groups };
      delete groups[action.chatGroupId];

      return {
        ...state,
        groups,
        activeGroup: state.activeGroup === action.chatGroupId ? null : state.activeGroup,
      };
    }

    default:
      return state;
  }
}

export function groupDisplayName(
  group: GroupChat,
  profiles: Record<string, GroupAuthorProfile>,
  friends: Record<string, { name: string }>,
  selfSteamId: string | null,
): string {
  if (group.name.trim()) {
    return group.name;
  }

  const names = group.topMemberIds
    .map((accountId) => steamIdFromAccountId(accountId))
    .filter((steamId) => steamId !== selfSteamId)
    .map((steamId) => profiles[steamId]?.name || friends[steamId]?.name)
    .filter((name): name is string => Boolean(name && name.trim()));

  if (names.length === 0) {
    return 'Group chat';
  }

  if (names.length <= 3) {
    return names.join(', ');
  }

  return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
}

export function latestGroupRoom(group: GroupChat): GroupRoom | null {
  return (
    Object.values(group.rooms).sort(
      (a, b) => b.lastMessageAt - a.lastMessageAt,
    )[0] ?? null
  );
}
