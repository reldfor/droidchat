import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';

type ChatAvatarProps = {
  background?: string;
  name?: string;
  rounded?: boolean;
  size: number;
  uri?: string | null;
};

const fallbackColors = ['#24404A', '#3B2E4A', '#47352B', '#13243A', '#12312B', '#312216'];

function fallbackColor(name: string | undefined): string {
  if (!name) {
    return SteamColors.canvasRaised;
  }

  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }

  return fallbackColors[hash % fallbackColors.length];
}

export function ChatAvatar({ background, name, rounded = false, size, uri }: ChatAvatarProps) {
  const frameStyle = {
    width: size,
    height: size,
    borderRadius: rounded ? size / 2 : 2,
    backgroundColor: background ?? fallbackColor(name),
  };

  return (
    <View style={[styles.frame, frameStyle]}>
      {uri ? (
        <Image
          accessible={false}
          contentFit="cover"
          importantForAccessibility="no"
          source={{ uri }}
          style={styles.fill}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42, lineHeight: size * 0.52 }]}>
          {name?.trim().charAt(0).toUpperCase() ?? '?'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  initial: {
    color: '#DCE4EA',
    fontWeight: '600',
  },
});
