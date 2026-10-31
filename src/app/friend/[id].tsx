import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConversationScreen } from '@/components/chat/conversation-screen';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SteamColors } from '@/constants/steam-theme';
import { useSteamChat } from '@/context/steam-chat';
import { useGameAssets } from '@/hooks/use-game-assets';

export default function FriendChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const steamId = Array.isArray(params.id) ? params.id[0] : params.id;

  const {
    friends,
    conversations,
    authError,
    connection,
    loggedOn,
    ready,
    openConversation,
    closeConversation,
    loadMore,
    loadConversation,
    markRead,
    retryConnection,
    sendMessage,
    sendImage,
    getEmoticons,
    sendTyping,
    typing,
  } = useSteamChat();

  useEffect(() => {
    if (!steamId) {
      return;
    }

    openConversation(steamId);

    return () => closeConversation(steamId);
  }, [steamId, openConversation, closeConversation]);

  const friend = steamId ? friends[steamId] : undefined;
  const gameAppId = friend?.gameAppId ?? null;
  const games = useGameAssets(gameAppId ? [gameAppId] : []);
  const conversation = steamId ? conversations[steamId] : undefined;
  const friendTyping = steamId ? Boolean(typing[steamId]) : false;
  const lastMessageAt = conversation?.messages[conversation.messages.length - 1]?.sentAt ?? 0;
  const lastActivity = conversation?.lastActivity ?? 0;

  // Revalidate cached history when opening the chat or when Steam reports
  // newer activity (for example a session loaded after a reconnect).
  useEffect(() => {
    if (!steamId) {
      return;
    }

    loadConversation(steamId);
  }, [steamId, lastActivity, loadConversation]);

  // Read receipts: ack once history is on screen and whenever a new message
  // arrives while the conversation is open.
  useEffect(() => {
    if (!steamId || lastMessageAt <= 0) {
      return;
    }

    markRead(steamId, lastMessageAt);
  }, [steamId, lastMessageAt, markRead]);

  if (!steamId || !friend) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel="Go back" onBack={() => router.back()} title="Chat" />
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
          ) : (
            <Text style={styles.fallbackText}>This friend could not be found.</Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <ConversationScreen
      key={steamId}
      authError={authError}
      connection={connection}
      error={conversation?.error}
      friend={friend}
      friendTyping={friendTyping}
      game={gameAppId ? games[gameAppId] : undefined}
      hasMore={conversation?.hasMore ?? false}
      loading={conversation?.loading ?? false}
      messages={conversation?.messages ?? []}
      onBack={() => router.back()}
      onLoadMore={() => loadMore(steamId)}
      onRetry={retryConnection}
      onRetryHistory={() => loadConversation(steamId, true)}
      onSend={(text) => sendMessage(steamId, text)}
      onSendImage={(image) => sendImage(steamId, image)}
      getEmoticons={getEmoticons}
      onTyping={() => sendTyping(steamId)}
      ready={ready}
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
