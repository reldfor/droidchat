import { Image } from 'expo-image';
import { StyleSheet, View, type ImageStyle } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { Friend } from '@/data/friends';

type ChatAvatarProps = {
  background?: string;
  participants?: Friend[];
  rounded?: boolean;
  size: number;
  source?: number;
};

function tileStyle(index: number, count: number, size: number): ImageStyle {
  if (count === 1) {
    return { width: size, height: size };
  }

  if (count === 2) {
    return { width: size / 2, height: size, left: (size / 2) * index };
  }

  if (count === 3) {
    return { width: size / 3, height: size, left: (size / 3) * index };
  }

  return {
    width: size / 2,
    height: size / 2,
    left: (index % 2) * (size / 2),
    top: Math.floor(index / 2) * (size / 2),
  };
}

export function ChatAvatar({
  background,
  participants,
  rounded = false,
  size,
  source,
}: ChatAvatarProps) {
  const frameStyle = [
    styles.frame,
    {
      width: size,
      height: size,
      borderRadius: rounded ? size / 2 : 2,
      backgroundColor: background ?? SteamColors.canvasRaised,
    },
  ];

  if (participants && participants.length > 0) {
    const visibleParticipants = participants.slice(0, 4);

    return (
      <View style={frameStyle}>
        {visibleParticipants.map((participant, index) => (
          <Image
            accessible={false}
            contentFit="cover"
            importantForAccessibility="no"
            key={participant.id}
            source={participant.avatar}
            style={[
              styles.tile,
              tileStyle(index, visibleParticipants.length, size),
              { backgroundColor: participant.avatarBackground },
            ]}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={frameStyle}>
      {source != null ? (
        <Image
          accessible={false}
          contentFit="cover"
          importantForAccessibility="no"
          source={source}
          style={styles.fill}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  tile: {
    position: 'absolute',
    top: 0,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
