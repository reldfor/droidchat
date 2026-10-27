import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { Friend } from '@/data/friends';

type InviteFriendRowProps = {
  friend: Friend;
  onToggle: (friendId: string) => void;
  selected: boolean;
};

export function InviteFriendRow({ friend, onToggle, selected }: InviteFriendRowProps) {
  const secondaryText =
    friend.status === 'offline'
      ? `Last online ${friend.lastOnline ?? 'a while ago'}`
      : friend.status === 'away'
        ? 'Away'
        : 'Online';

  return (
    <Pressable
      accessibilityHint="Adds this friend to the group chat"
      accessibilityLabel={`${friend.name}, ${secondaryText}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={() => onToggle(friend.id)}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}>
      <View style={[styles.avatar, { backgroundColor: friend.avatarBackground }]}>
        <Image
          accessible={false}
          contentFit="cover"
          importantForAccessibility="no"
          source={friend.avatar}
          style={styles.avatarImage}
        />
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, selected && styles.nameSelected]}>
          {friend.name}
        </Text>
        <Text numberOfLines={1} style={styles.status}>
          {secondaryText}
        </Text>
      </View>

      {selected ? (
        <SymbolView
          name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
          size={22}
          tintColor={SteamColors.accent}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.divider,
  },
  rowSelected: {
    backgroundColor: '#2A323B',
  },
  rowPressed: {
    backgroundColor: SteamColors.rowPressed,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SteamColors.avatarBorder,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: SteamColors.text,
    fontSize: 16.5,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  nameSelected: {
    color: SteamColors.textStrong,
  },
  status: {
    marginTop: 1,
    color: SteamColors.muted,
    fontSize: 12.5,
    lineHeight: 16,
  },
});
