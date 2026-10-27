import { StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { ChatMessage } from '@/context/steam-chat';
import { formatMessageTime } from '@/lib/steam/chat-utils';

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <View style={[styles.row, message.mine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          message.mine ? styles.bubbleMine : styles.bubbleTheirs,
          message.pending && styles.pending,
          message.failed && styles.failed,
        ]}>
        <Text selectable style={styles.text}>
          {message.text}
        </Text>
      </View>

      <View style={[styles.meta, message.mine && styles.metaMine]}>
        {message.failed ? (
          <Text style={styles.failedLabel}>Not sent</Text>
        ) : message.pending ? (
          <Text style={styles.pendingLabel}>Sending…</Text>
        ) : null}
        <Text style={styles.time}>{formatMessageTime(message.sentAt)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
    gap: 4,
  },
  rowMine: {
    alignItems: 'flex-end',
  },
  rowTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleMine: {
    borderBottomRightRadius: 2,
    backgroundColor: SteamColors.accentDeep,
  },
  bubbleTheirs: {
    borderBottomLeftRadius: 2,
    backgroundColor: SteamColors.canvasRaised,
  },
  pending: {
    opacity: 0.6,
  },
  failed: {
    borderWidth: 1,
    borderColor: SteamColors.error,
  },
  text: {
    color: '#F2F7FB',
    fontSize: 15.5,
    lineHeight: 21,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 3,
  },
  metaMine: {
    marginLeft: 0,
    marginRight: 3,
  },
  time: {
    color: SteamColors.muted,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
  pendingLabel: {
    color: SteamColors.muted,
    fontSize: 10.5,
    lineHeight: 14,
  },
  failedLabel: {
    color: SteamColors.error,
    fontSize: 10.5,
    lineHeight: 14,
  },
});
