import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { SteamColors } from '@/constants/steam-theme';
import type { ChatPreview } from '@/context/steam-chat';
import { formatChatListTime } from '@/lib/steam/chat-utils';
import { formatGroupMemberCount } from '@/lib/steam/group-chat';

type GroupRowProps = {
  avatarUrl: string | null;
  memberCount: number;
  name: string;
  preview?: ChatPreview;
  unread: boolean;
  onPress: () => void;
};

export function GroupRow({
  avatarUrl,
  memberCount,
  name,
  preview,
  unread,
  onPress,
}: GroupRowProps) {
  const timestamp = preview ? formatChatListTime(preview.sentAt) : '';
  const previewText = preview
    ? `${preview.mine ? 'You: ' : ''}${preview.text}`
    : 'No messages yet';

  return (
    <Pressable
      accessibilityHint="Opens the group chat"
      accessibilityLabel={`${name}. ${formatGroupMemberCount(memberCount)}. ${previewText}. ${timestamp}${
        unread ? '. Unread messages' : ''
      }`}
      accessibilityRole="button"
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <ChatAvatar name={name} size={48} uri={avatarUrl} />

      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <Text style={styles.timestamp}>{timestamp}</Text>
        </View>

        <Text numberOfLines={1} style={styles.meta}>
          {formatGroupMemberCount(memberCount)}
        </Text>

        <View style={styles.previewRow}>
          <Text numberOfLines={2} style={[styles.preview, unread && styles.previewUnread]}>
            {previewText}
          </Text>
          {unread ? <View style={styles.unreadDot} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 86,
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
  meta: {
    marginTop: 1,
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
