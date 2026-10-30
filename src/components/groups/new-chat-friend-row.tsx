import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { SteamColors } from '@/constants/steam-theme';
import type { SteamFriend } from '@/context/steam-chat';
import { describeFriendStatus } from '@/lib/steam/chat-utils';

type NewChatFriendRowProps = {
  friend: SteamFriend;
  selected: boolean;
  onToggle: (friend: SteamFriend) => void;
};

export function NewChatFriendRow({
  friend,
  selected,
  onToggle,
}: NewChatFriendRowProps) {
  const online = friend.status === 'online';
  const away = friend.status === 'away';
  const status = describeFriendStatus(friend);
  const nameStyle = online
    ? styles.nameOnline
    : away
      ? styles.nameAway
      : styles.nameOffline;
  const statusStyle = online
    ? styles.statusOnline
    : away
      ? styles.statusAway
      : styles.statusOffline;

  return (
    <Pressable
      accessibilityHint={
        selected
          ? 'Removes this friend from the new group chat'
          : 'Adds this friend to the new group chat'
      }
      accessibilityLabel={`${friend.name}, ${status}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={() => onToggle(friend)}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && styles.rowPressed,
      ]}>
      <ChatAvatar name={friend.name} size={38} uri={friend.avatarUrl} />

      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, nameStyle]}>
          {friend.name}
        </Text>
        <Text numberOfLines={1} style={[styles.status, statusStyle]}>
          {status}
        </Text>
      </View>

      <View
        accessible={false}
        importantForAccessibility="no"
        style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={15}
            tintColor={SteamColors.textStrong}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  rowSelected: {
    backgroundColor: 'rgba(33, 108, 173, 0.18)',
  },
  rowPressed: {
    backgroundColor: SteamColors.rowPressed,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16.5,
    lineHeight: 21,
    letterSpacing: 0.1,
  },
  nameOnline: {
    color: SteamColors.onlineName,
  },
  nameAway: {
    color: SteamColors.awayName,
  },
  nameOffline: {
    color: SteamColors.offlineName,
  },
  status: {
    marginTop: 1,
    fontSize: 13.5,
    lineHeight: 18,
  },
  statusOnline: {
    color: SteamColors.onlineStatus,
  },
  statusAway: {
    color: SteamColors.awayStatus,
  },
  statusOffline: {
    color: SteamColors.offlineStatus,
  },
  checkbox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#3A3E46',
    borderRadius: 4,
    backgroundColor: SteamColors.canvasRaised,
  },
  checkboxSelected: {
    borderColor: SteamColors.accent,
    backgroundColor: SteamColors.accentDeep,
  },
});
