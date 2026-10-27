import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { ChatMessage } from '@/data/messages';

type MessageBubbleProps = {
  message: ChatMessage;
  onOpenImage: (uri: string) => void;
};

const maxImageWidth = 232;
const maxImageHeight = 300;

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

function getImageSize(width: number, height: number, availableWidth: number) {
  const ratio = width > 0 && height > 0 ? width / height : 4 / 3;
  const maxWidth = Math.min(maxImageWidth, availableWidth * 0.64);
  let displayWidth = maxWidth;
  let displayHeight = displayWidth / ratio;

  if (displayHeight > maxImageHeight) {
    displayHeight = maxImageHeight;
    displayWidth = displayHeight * ratio;
  }

  return { width: displayWidth, height: displayHeight };
}

export function MessageBubble({ message, onOpenImage }: MessageBubbleProps) {
  const { width } = useWindowDimensions();
  const imageSize =
    message.kind === 'image' ? getImageSize(message.width, message.height, width) : null;

  return (
    <View style={styles.row}>
      {message.kind === 'image' && imageSize ? (
        <Pressable
          accessibilityHint="Opens the image full screen"
          accessibilityLabel="Sent image"
          accessibilityRole="button"
          onPress={() => onOpenImage(message.uri)}
          style={({ pressed }) => [
            styles.imageBubble,
            imageSize,
            pressed && styles.imagePressed,
          ]}>
          <Image
            accessible={false}
            contentFit="cover"
            source={{ uri: message.uri }}
            style={styles.image}
          />
        </Pressable>
      ) : message.kind === 'text' ? (
        <View style={styles.textBubble}>
          <Text selectable style={styles.text}>
            {message.text}
          </Text>
        </View>
      ) : null}

      <Text style={styles.time}>{formatTime(message.sentAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
    gap: 4,
  },
  textBubble: {
    maxWidth: '78%',
    borderRadius: 9,
    borderBottomRightRadius: 2,
    backgroundColor: SteamColors.accentDeep,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  text: {
    color: '#F2F7FB',
    fontSize: 15.5,
    lineHeight: 21,
  },
  imageBubble: {
    borderRadius: 9,
    borderBottomRightRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3D434C',
    backgroundColor: SteamColors.canvasRaised,
    overflow: 'hidden',
  },
  imagePressed: {
    opacity: 0.86,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  time: {
    marginRight: 3,
    color: SteamColors.muted,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.2,
  },
});
