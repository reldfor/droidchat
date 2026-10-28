import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FriendRow } from '@/components/friends/friend-row';
import { FriendSectionHeader } from '@/components/friends/friend-section-header';
import { AppHeader } from '@/components/steam/app-header';
import { ConnectionBanner } from '@/components/steam/connection-banner';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useSteamChat, type SteamFriend } from '@/context/steam-chat';
import { FRIEND_RELATIONSHIP_FRIEND } from '@/lib/steam/cm-proto';

export default function FriendsScreen() {
  const router = useRouter();
  const { friends, connection, loggedOn, authError, retryConnection } = useSteamChat();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [onlineCollapsed, setOnlineCollapsed] = useState(false);
  const [offlineCollapsed, setOfflineCollapsed] = useState(false);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSearchOpen(false);
      setQuery('');
      return true;
    });

    return () => subscription.remove();
  }, [searchOpen]);

  const allFriends = useMemo(
    () =>
      Object.values(friends).filter(
        (friend) => friend.relationship === FRIEND_RELATIONSHIP_FRIEND,
      ),
    [friends],
  );

  const onlineFriends = useMemo(
    () =>
      allFriends
        .filter((friend) => friend.status !== 'offline')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allFriends],
  );

  const offlineFriends = useMemo(
    () =>
      allFriends
        .filter((friend) => friend.status === 'offline')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allFriends],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (friend: SteamFriend) =>
    friend.name.toLowerCase().includes(normalizedQuery);

  const visibleOnline = normalizedQuery ? onlineFriends.filter(matchesQuery) : onlineFriends;
  const visibleOffline = normalizedQuery ? offlineFriends.filter(matchesQuery) : offlineFriends;
  const noResults =
    normalizedQuery.length > 0 && visibleOnline.length === 0 && visibleOffline.length === 0;

  const handleOpenSearch = () => {
    setOnlineCollapsed(false);
    setOfflineCollapsed(false);
    setSearchOpen(true);
  };

  const handleCancelSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const handleFriendPress = (friend: SteamFriend) => {
    router.push({ pathname: '/friend/[id]', params: { id: friend.steamId } });
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        onSearchPress={handleOpenSearch}
        searchPlaceholder="Search friends"
        search={
          searchOpen
            ? { value: query, onChangeText: setQuery, onCancel: handleCancelSearch }
            : undefined
        }
      />

      <ConnectionBanner
        authError={authError}
        connection={connection}
        loggedOn={loggedOn}
        onRetry={retryConnection}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <View style={styles.content}>
          {noResults ? (
            <SearchEmpty
              icon={{ ios: 'magnifyingglass', android: 'search_off', web: 'search_off' }}
              message={`No friends match "${query.trim()}". Try a different name.`}
              title="No friends found"
            />
          ) : allFriends.length === 0 ? (
            <View style={styles.empty}>
              {loggedOn || authError ? null : (
                <ActivityIndicator color={SteamColors.muted} size="small" />
              )}
              <Text style={styles.emptyTitle}>
                {loggedOn
                  ? 'No friends yet'
                  : authError
                    ? 'Friends unavailable'
                    : 'Loading your friends'}
              </Text>
              <Text style={styles.emptyBody}>
                {loggedOn
                  ? 'Friends you add on Steam will appear here.'
                  : authError
                    ? 'Retry the connection above to load your friends.'
                    : 'Steam is sending your friends list.'}
              </Text>
            </View>
          ) : (
            <>
              {!normalizedQuery || visibleOnline.length > 0 ? (
                <>
                  <FriendSectionHeader
                    collapsed={onlineCollapsed}
                    count={visibleOnline.length}
                    onToggle={() => setOnlineCollapsed((current) => !current)}
                    title="Online Friends"
                  />
                  {!onlineCollapsed
                    ? visibleOnline.map((friend) => (
                        <FriendRow friend={friend} key={friend.steamId} onPress={handleFriendPress} />
                      ))
                    : null}
                </>
              ) : null}

              {!normalizedQuery || visibleOffline.length > 0 ? (
                <>
                  <FriendSectionHeader
                    collapsed={offlineCollapsed}
                    count={visibleOffline.length}
                    onToggle={() => setOfflineCollapsed((current) => !current)}
                    title="Offline"
                  />
                  {!offlineCollapsed
                    ? visibleOffline.map((friend) => (
                        <FriendRow friend={friend} key={friend.steamId} onPress={handleFriendPress} />
                      ))
                    : null}
                </>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SteamColors.canvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 2,
    paddingBottom: 18,
  },
  content: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 30,
    paddingVertical: 60,
  },
  emptyTitle: {
    color: SteamColors.text,
    fontSize: 17,
    lineHeight: 22,
  },
  emptyBody: {
    color: SteamColors.muted,
    fontSize: 14.5,
    lineHeight: 20,
    textAlign: 'center',
  },
});
