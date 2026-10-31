import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FriendGameIcon } from '@/components/friends/friend-game-icon';
import { SteamColors } from '@/constants/steam-theme';
import type { ChatPreview, SteamFriend } from '@/context/steam-chat';
import { formatChatListTime, inGameName } from '@/lib/steam/chat-utils';
import type { GameAssets } from '@/lib/steam/game-assets';
import { ChatAvatar } from './chat-avatar';

type ChatRowProps = {
  friend: SteamFriend;
  game?: GameAssets;
  preview?: ChatPreview;
  unread: number;
  onPress: () => void;
};

export function ChatRow({ friend, game, preview, unread, onPress }: ChatRowProps) {
  const timestamp = preview ? formatChatListTime(preview.sentAt) : '';
  const previewText = preview
    ? `${preview.mine ? 'You: ' : ''}${preview.text}`
    : 'No messages yet';
  const gameName = inGameName(friend, game?.name);
  const inGame = gameName !== null;
  const gameLabel = inGame
    ? `Playing ${gameName}${friend.richPresence ? `, ${friend.richPresence}` : ''}. `
    : '';

  return (
    <Pressable
      accessibilityHint="Opens the conversation"
      accessibilityLabel={`${friend.name}. ${gameLabel}${previewText}. ${timestamp}${
        unread > 0 ? `. ${unread} unread` : ''
      }`}
      accessibilityRole="button"
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ChatAvatar name={friend.name} rounded size={48} uri={friend.avatarUrl} />

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={[styles.name, inGame && styles.nameInGame]}>
            {friend.name}
          </Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>

        {inGame ? (
          <View style={styles.gameRow}>
            {friend.gameAppId ? (
              <FriendGameIcon appId={friend.gameAppId} game={game} size={16} />
            ) : null}
            <Text numberOfLines={1} style={styles.gameName}>
              {gameName}
              {friend.richPresence ? (
                <Text style={styles.gamePresence}> · {friend.richPresence}</Text>
              ) : null}
            </Text>
          </View>
        ) : null}

        <View style={styles.previewRow}>
          <Text
            numberOfLines={2}
            style={[styles.preview, unread > 0 && styles.previewUnread]}>
            {previewText}
          </Text>
          {unread > 0 ? <View style={styles.unreadDot} /> : null}
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
  nameInGame: {
    color: SteamColors.inGameName,
  },
  timestamp: {
    color: SteamColors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  gameRow: {
    marginTop: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  gameName: {
    flexShrink: 1,
    color: SteamColors.inGameGame,
    fontSize: 13.5,
    lineHeight: 17,
  },
  gamePresence: {
    color: SteamColors.inGamePresence,
    fontSize: 13,
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
  previewUnread: {
    color: SteamColors.text,
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
