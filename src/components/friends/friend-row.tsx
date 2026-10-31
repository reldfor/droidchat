import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FriendGameIcon } from '@/components/friends/friend-game-icon';
import { FriendAvatarSize, SteamColors } from '@/constants/steam-theme';
import type { SteamFriend } from '@/context/steam-chat';
import { describeFriendStatus, inGameName, type FriendStatus } from '@/lib/steam/chat-utils';
import type { GameAssets } from '@/lib/steam/game-assets';

type FriendRowProps = {
  friend: SteamFriend;
  game?: GameAssets;
  onPress: (friend: SteamFriend) => void;
};

function StatusRail({ status, inGame }: { status: FriendStatus; inGame: boolean }) {
  if (status === 'online') {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.statusRail,
          inGame ? styles.statusRailInGame : styles.statusRailOnline,
        ]}
      />
    );
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

export function FriendRow({ friend, game, onPress }: FriendRowProps) {
  const online = friend.status === 'online';
  const away = friend.status === 'away';
  const gameName = inGameName(friend, game?.name);
  const inGame = gameName !== null;

  const nameStyle = inGame
    ? styles.nameInGame
    : online
      ? styles.nameOnline
      : away
        ? styles.nameAway
        : styles.nameOffline;

  const statusStyle = online
    ? styles.statusOnline
    : away
      ? styles.statusAway
      : styles.statusOffline;

  const secondaryText = describeFriendStatus(friend);
  const accessibilityStatus = inGame
    ? [`Playing ${gameName}`, friend.richPresence].filter(Boolean).join(', ')
    : secondaryText;

  return (
    <Pressable
      accessibilityHint="Opens a chat with this friend"
      accessibilityLabel={`${friend.name}, ${accessibilityStatus}`}
      accessibilityRole="button"
      android_ripple={{ color: SteamColors.rowPressed }}
      onPress={() => onPress(friend)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      {inGame && friend.gameAppId ? (
        <FriendGameIcon appId={friend.gameAppId} game={game} />
      ) : null}

      <View
        style={[styles.avatar, friend.status === 'offline' && styles.avatarOffline]}>
        <Image
          accessible={false}
          contentFit="cover"
          importantForAccessibility="no"
          source={{ uri: friend.avatarUrl }}
          style={styles.avatarImage}
        />
        <StatusRail inGame={inGame} status={friend.status} />
      </View>

      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={[styles.name, nameStyle]}>
            {friend.name}
          </Text>
          {friend.onSteamDeck ? (
            <View accessible={false} style={styles.platformBadge}>
              <SymbolView
                name={{ ios: 'gamecontroller.fill', android: 'sports_esports', web: 'sports_esports' }}
                size={10}
                tintColor="#DDEBFA"
              />
            </View>
          ) : null}
          {away ? <Text style={styles.zzz}>zZ</Text> : null}
        </View>

        {inGame ? (
          <>
            <Text numberOfLines={1} style={styles.gameName}>
              {gameName}
            </Text>
            {friend.richPresence ? (
              <Text numberOfLines={1} style={styles.gamePresence}>
                {friend.richPresence}
              </Text>
            ) : null}
          </>
        ) : (
          <Text numberOfLines={1} style={[styles.status, statusStyle]}>
            {secondaryText}
          </Text>
        )}
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
  statusRailInGame: {
    backgroundColor: SteamColors.inGameRail,
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
  nameInGame: {
    color: SteamColors.inGameName,
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
  gameName: {
    marginTop: 1,
    color: SteamColors.inGameGame,
    fontSize: 15,
    lineHeight: 19,
  },
  gamePresence: {
    marginTop: 1,
    color: SteamColors.inGamePresence,
    fontSize: 14,
    lineHeight: 17,
  },
});
