import { Image } from 'expo-image';
import { useState } from 'react';
import { Image as InlineImage, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { ChatMessage } from '@/context/steam-chat';
import { formatMessageTime } from '@/lib/steam/chat-utils';
import { parseMessageContent, type MessagePart } from '@/lib/steam/chat-media';

type MessageBubbleProps = {
  message: ChatMessage;
};

export function MessageBubble({ message }: MessageBubbleProps) {
  const { width } = useWindowDimensions();
  const parts = parseMessageContent(message.content ?? message.text);
  const blocks: MessagePart[][] = [];
  for (const part of parts) {
    if (part.type === 'image' || !blocks.length || blocks[blocks.length - 1][0].type === 'image') blocks.push([part]);
    else blocks[blocks.length - 1].push(part);
  }
  return (
    <View style={[styles.row, message.mine ? styles.rowMine : styles.rowTheirs]}>
      <View
        style={[
          styles.bubble,
          message.mine ? styles.bubbleMine : styles.bubbleTheirs,
          message.pending && styles.pending,
          message.failed && styles.failed,
        ]}>
        {blocks.map((block, index) => block[0].type === 'image' ? (
          <ChatImage key={index} part={block[0]} width={Math.min(260, Math.max(120, width * 0.78 - 48))} />
        ) : (
          <Text key={index} selectable style={styles.text}>
            {block.map((part, partIndex) => part.type === 'text' ? part.text : part.type === 'emoticon' ? <InlineEmoticon key={partIndex} name={part.name} url={part.url} /> : null)}
          </Text>
        ))}
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

function InlineEmoticon({ name, url }: { name: string; url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <Text>:{name}:</Text> : <InlineImage accessibilityLabel={`:${name}:`} source={{ uri: url }} onError={() => setFailed(true)} resizeMode="contain" style={styles.emoticon} />;
}

function ChatImage({ part, width }: { part: Extract<MessagePart, { type: 'image' }>; width: number }) {
  const [failed, setFailed] = useState(false);
  const ratio = part.width && part.height ? Math.max(0.4, Math.min(3, part.width / part.height)) : 4 / 3;
  return <Pressable accessibilityRole="link" accessibilityLabel="Open shared image" onPress={() => { void Linking.openURL(part.url).catch(() => setFailed(true)); }}>
    {failed ? <View style={[styles.imageFallback, { width }]}><Text style={styles.text}>Image unavailable. Tap to open.</Text></View> : <Image accessibilityLabel="Shared image" source={{ uri: part.thumbnailUrl ?? part.url }} contentFit="contain" onError={() => setFailed(true)} style={[styles.image, { width, aspectRatio: ratio }]} />}
  </Pressable>;
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
    gap: 6,
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
  emoticon: { width: 22, height: 22 },
  image: { borderRadius: 4, backgroundColor: SteamColors.chromeDeep },
  imageFallback: { minHeight: 100, justifyContent: 'center', padding: 12, backgroundColor: SteamColors.chromeDeep },
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
