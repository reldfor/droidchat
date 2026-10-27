import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { Chat } from '@/data/chats';
import { ChatAvatar } from './chat-avatar';

type ChatRowProps = {
  chat: Chat;
  onPress: (chat: Chat) => void;
};

export function ChatRow({ chat, onPress }: ChatRowProps) {
  return (
    <Pressable
      accessibilityHint="Opens the conversation"
      accessibilityLabel={`${chat.name}. ${chat.preview}. ${chat.timestamp}${
        chat.unread ? '. Unread' : ''
      }`}
      accessibilityRole="button"
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={() => onPress(chat)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ChatAvatar
        background={chat.avatarBackground}
        participants={chat.participants}
        rounded
        size={48}
        source={chat.avatar}
      />

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>
            {chat.name}
          </Text>
          <Text style={styles.timestamp}>{chat.timestamp}</Text>
        </View>

        <View style={styles.previewRow}>
          <Text numberOfLines={2} style={styles.preview}>
            {chat.preview}
          </Text>
          {chat.unread ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.divider,
  },
  rowPressed: {
    backgroundColor: SteamColors.rowPressed,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: SteamColors.text,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  timestamp: {
    color: SteamColors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  previewRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  preview: {
    flex: 1,
    minWidth: 0,
    color: SteamColors.muted,
    fontSize: 14.5,
    lineHeight: 19,
  },
  unreadDot: {
    width: 8,
    height: 8,
    marginBottom: 5,
    borderRadius: 4,
    backgroundColor: SteamColors.unreadDot,
    shadowColor: SteamColors.unreadDot,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
});
