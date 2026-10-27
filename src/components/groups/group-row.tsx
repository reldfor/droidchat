import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { Group } from '@/data/groups';

type GroupRowProps = {
  group: Group;
  onPress: (group: Group) => void;
};

export function GroupRow({ group, onPress }: GroupRowProps) {
  const memberLabel = `${group.members} ${group.members === 1 ? 'member' : 'members'}`;

  return (
    <Pressable
      accessibilityHint="Opens the group"
      accessibilityLabel={`${group.name}, ${memberLabel}`}
      accessibilityRole="button"
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={() => onPress(group)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={[styles.avatar, { backgroundColor: group.avatarBackground }]}>
        <Image
          accessible={false}
          contentFit="cover"
          importantForAccessibility="no"
          source={group.avatar}
          style={styles.avatarImage}
        />
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>
          {group.name}
        </Text>
        <Text style={styles.members}>{memberLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.divider,
  },
  rowPressed: {
    backgroundColor: SteamColors.rowPressed,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  name: {
    color: SteamColors.text,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  members: {
    marginTop: 3,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
});
