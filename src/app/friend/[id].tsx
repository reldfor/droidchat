import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { ConversationScreen } from '@/components/chat/conversation-screen';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SteamColors } from '@/constants/steam-theme';
import { useChatStore } from '@/context/chat-store';
import type { OutgoingMessage } from '@/data/messages';
import { getFriendById } from '@/data/friends';

export default function FriendChatScreen() {
  const router = useRouter();
  const { messagesByConversation, sendMessage } = useChatStore();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const friendId = Array.isArray(params.id) ? params.id[0] : params.id;
  const friend = getFriendById(friendId);

  if (!friend) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel="Go back" onBack={() => router.back()} title="Chat" />
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>This friend could not be found.</Text>
        </View>
      </View>
    );
  }

  const subtitle =
    friend.status === 'offline'
      ? `Last online ${friend.lastOnline ?? 'a while ago'}`
      : friend.status === 'away'
        ? 'Away'
        : 'Online';

  const handleSendMessage = (message: OutgoingMessage) => {
    sendMessage(friend.id, message, {
      id: friend.id,
      name: friend.name,
      kind: 'direct',
      preview: '',
      timestamp: '',
      avatar: friend.avatar,
      avatarBackground: friend.avatarBackground,
    });
  };

  return (
    <ConversationScreen
      avatar={
        <ChatAvatar
          background={friend.avatarBackground}
          size={46}
          source={friend.avatar}
        />
      }
      emptyMessage="You have no recent messages with this friend."
      messages={messagesByConversation[friend.id] ?? []}
      onAddPeople={() =>
        router.push({
          pathname: '/new-chat',
          params: { with: friend.id },
        })
      }
      onBack={() => router.back()}
      onSendMessage={handleSendMessage}
      subtitle={subtitle}
      title={friend.name}
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
    paddingHorizontal: 30,
  },
  fallbackText: {
    color: SteamColors.muted,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
});
