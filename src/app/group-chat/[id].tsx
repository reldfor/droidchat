import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { ConversationScreen } from '@/components/chat/conversation-screen';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SteamColors } from '@/constants/steam-theme';
import { useChatStore } from '@/context/chat-store';

export default function GroupChatScreen() {
  const router = useRouter();
  const { chats, messagesByConversation, sendMessage } = useChatStore();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const chatId = Array.isArray(params.id) ? params.id[0] : params.id;
  const chat = chats.find((item) => item.id === chatId);

  if (!chat || chat.kind !== 'group' || !chat.participants?.length) {
    return (
      <View style={styles.screen}>
        <ScreenHeader backLabel="Go back" onBack={() => router.back()} title="Group chat" />
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>This group chat could not be found.</Text>
        </View>
      </View>
    );
  }

  const memberCount = chat.participants.length + 1;

  return (
    <ConversationScreen
      avatar={
        <ChatAvatar
          background={SteamColors.canvasRaised}
          participants={chat.participants}
          size={46}
        />
      }
      emptyMessage="You have no recent messages in this group."
      messages={messagesByConversation[chat.id] ?? []}
      onBack={() => router.back()}
      onSendMessage={(message) => sendMessage(chat.id, message)}
      subtitle={`${memberCount} ${memberCount === 1 ? 'member' : 'members'}`}
      title={chat.name}
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
