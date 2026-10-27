import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FriendAvatarSize, SteamColors } from '@/constants/steam-theme';
import type { Friend, FriendPlatform, FriendStatus } from '@/data/friends';

type FriendRowProps = {
  friend: Friend;
  onPress: (friend: Friend) => void;
};

const statusCopy = {
  online: 'Online',
  away: 'Away',
} as const;

const platformIcons = {
  deck: {
    ios: 'gamecontroller.fill',
    android: 'sports_esports',
    web: 'sports_esports',
  },
  mobile: {
    ios: 'iphone',
    android: 'smartphone',
    web: 'smartphone',
  },
} as const;

function StatusRail({ status }: { status: FriendStatus }) {
  if (status === 'online') {
    return <View pointerEvents="none" style={[styles.statusRail, styles.statusRailOnline]} />;
  }

  const segmentStyle = status === 'away' ? styles.statusRailAway : styles.statusRailOffline;

  return (
    <View pointerEvents="none" style={styles.statusRailTrack}>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={[styles.statusRailSegment, segmentStyle]} />
      ))}
    </View>
  );
}

function PlatformBadge({ platform }: { platform: FriendPlatform }) {
  return (
    <View accessible={false} style={styles.platformBadge}>
      <SymbolView
        name={platformIcons[platform]}
        size={10}
        tintColor="#DDEBFA"
      />
    </View>
  );
}

export function FriendRow({ friend, onPress }: FriendRowProps) {
  const online = friend.status === 'online';
  const away = friend.status === 'away';

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

  const secondaryText =
    friend.status === 'offline'
      ? `Last online ${friend.lastOnline ?? 'a while ago'}`
      : statusCopy[friend.status];

  const accessibilityLabel = `${friend.name}, ${secondaryText}`;

  return (
    <Pressable
      accessibilityHint="Opens a chat with this friend"
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={() => onPress(friend)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View
        style={[
          styles.avatar,
          { backgroundColor: friend.avatarBackground },
          friend.status === 'offline' && styles.avatarOffline,
        ]}>
        <Image
          accessible={false}
          contentFit="cover"
          importantForAccessibility="no"
          source={friend.avatar}
          style={styles.avatarImage}
        />
        <StatusRail status={friend.status} />
      </View>

      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={[styles.name, nameStyle]}>
            {friend.name}
          </Text>
          {friend.platforms?.map((platform) => (
            <PlatformBadge key={platform} platform={platform} />
          ))}
          {away ? <Text style={styles.zzz}>zZ</Text> : null}
        </View>

        <Text numberOfLines={1} style={[styles.status, statusStyle]}>
          {secondaryText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  rowPressed: {
    backgroundColor: SteamColors.rowPressed,
  },
  avatar: {
    width: FriendAvatarSize,
    height: FriendAvatarSize,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SteamColors.avatarBorder,
    overflow: 'hidden',
  },
  avatarOffline: {
    opacity: 0.82,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  statusRail: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 4,
  },
  statusRailOnline: {
    backgroundColor: SteamColors.statusRailOnline,
  },
  statusRailTrack: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 4,
    justifyContent: 'space-between',
  },
  statusRailSegment: {
    width: 4,
    height: 5,
  },
  statusRailAway: {
    backgroundColor: SteamColors.statusRailAway,
  },
  statusRailOffline: {
    backgroundColor: SteamColors.statusRailOffline,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    flexShrink: 1,
    fontSize: 17,
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
  platformBadge: {
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 2,
    backgroundColor: SteamColors.platformBadge,
  },
  zzz: {
    marginLeft: 1,
    color: SteamColors.awayStatus,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: -0.3,
  },
  status: {
    marginTop: 2,
    fontSize: 14,
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
});
