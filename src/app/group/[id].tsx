import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { GroupConversationScreen } from '@/components/groups/group-conversation-screen';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SteamColors } from '@/constants/steam-theme';
import { groupDisplayName } from '@/context/group-chat-state';
import { useSteamChat } from '@/context/steam-chat';

export default function GroupChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; chat?: string | string[] }>();
  const chatGroupId = Array.isArray(params.id) ? params.id[0] : params.id;
  const requestedChatId = Array.isArray(params.chat) ? params.chat[0] : params.chat;

  const {
    friends,
    groupProfiles,
    groups,
    groupListLoaded,
    groupError,
    selfSteamId,
    authError,
    connection,
    loggedOn,
    ready,
    openGroup,
    closeGroup,
    selectGroupRoom,
    loadMoreGroupHistory,
    loadGroupHistory,
    markGroupRead,
    retryConnection,
    sendGroupMessage,
    sendGroupImage,
    getEmoticons,
  } = useSteamChat();

  useEffect(() => {
    if (!chatGroupId) {
      return;
    }

    openGroup(chatGroupId, requestedChatId);

    return () => closeGroup(chatGroupId);
  }, [chatGroupId, requestedChatId, openGroup, closeGroup]);

  const group = chatGroupId ? groups[chatGroupId] : undefined;
  const room = group ? group.rooms[group.selectedChatId] : undefined;
  const lastMessageAt = room?.messages[room.messages.length - 1]?.sentAt ?? 0;
  const openChatGroupId = group?.chatGroupId;
  const openRoomId = room?.chatId;
  const roomLoaded = room?.loaded ?? false;
  const roomLoading = room?.loading ?? false;
  const roomLastMessageAt = room?.lastMessageAt ?? 0;

  useEffect(() => {
    if (!openChatGroupId || !openRoomId || lastMessageAt <= 0) {
      return;
    }

    markGroupRead(openChatGroupId, openRoomId, lastMessageAt);
  }, [openChatGroupId, openRoomId, lastMessageAt, markGroupRead]);

  // Cached room history paints immediately. Refresh it when the group summary
  // reports a newer message (desktop activity) or when the cache is old.
  useEffect(() => {
    if (!openChatGroupId || !openRoomId) {
      return;
    }

    loadGroupHistory(openChatGroupId, openRoomId);
  }, [openChatGroupId, openRoomId, roomLastMessageAt, loadGroupHistory]);

  // A direct link can open the route before the group list has arrived.
  useEffect(() => {
    if (!openChatGroupId || !openRoomId || roomLoaded || roomLoading) {
      return;
    }

    loadGroupHistory(openChatGroupId, openRoomId);
  }, [openChatGroupId, openRoomId, roomLoaded, roomLoading, loadGroupHistory]);

  if (!chatGroupId || !group) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel="Go back" onBack={() => router.back()} title="Group chat" />
        <View style={styles.fallback}>
          {authError ? (
            <>
              <Text style={styles.fallbackText}>
                Steam refused the chat connection. You are still signed in.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={retryConnection}
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : !loggedOn ? (
            <>
              <ActivityIndicator color={SteamColors.muted} size="small" />
              <Text style={styles.fallbackText}>Connecting to Steam…</Text>
            </>
          ) : !groupListLoaded && !groupError ? (
            <>
              <ActivityIndicator color={SteamColors.muted} size="small" />
              <Text style={styles.fallbackText}>Loading group chats…</Text>
            </>
          ) : (
            <Text style={styles.fallbackText}>
              {groupError ?? 'This group chat could not be found.'}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <GroupConversationScreen
      key={group.chatGroupId}
      authError={authError}
      connection={connection}
      error={room?.error}
      friends={friends}
      getEmoticons={getEmoticons}
      group={group}
      name={groupDisplayName(group, groupProfiles, friends, selfSteamId)}
      onBack={() => router.back()}
      onLoadMore={() => {
        if (room) {
          loadMoreGroupHistory(group.chatGroupId, room.chatId);
        }
      }}
      onRetry={retryConnection}
      onRetryHistory={() => {
        if (room) {
          loadGroupHistory(group.chatGroupId, room.chatId, true);
        }
      }}
      onSelectRoom={(chatId) => selectGroupRoom(group.chatGroupId, chatId)}
      onSend={(text) => {
        if (!room) {
          return Promise.reject(new Error('Choose a room before sending a message.'));
        }

        return sendGroupMessage(group.chatGroupId, room.chatId, text);
      }}
      onSendImage={(image) => {
        if (!room) {
          return Promise.reject(new Error('Choose a room before sending an image.'));
        }

        return sendGroupImage(group.chatGroupId, room.chatId, image);
      }}
      profiles={groupProfiles}
      ready={ready}
      room={room ?? null}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SteamColors.canvas,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 30,
  },
  fallbackText: {
    color: SteamColors.muted,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  retry: {
    marginTop: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  retryText: {
    color: SteamColors.textStrong,
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
