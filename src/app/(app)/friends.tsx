import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { FriendRow } from '@/components/friends/friend-row';
import { FriendSectionHeader } from '@/components/friends/friend-section-header';
import { AppHeader } from '@/components/steam/app-header';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { offlineFriends, onlineFriends, type Friend } from '@/data/friends';

export default function FriendsScreen() {
  const router = useRouter();

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

  const normalizedQuery = query.trim().toLowerCase();
  const matchesQuery = (friend: Friend) =>
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

  const handleFriendPress = (friend: Friend) => {
    router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
  };

  const handleOpenNewChat = () => {
    router.push('/new-chat');
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        addLabel="New chat"
        onAddPress={handleOpenNewChat}
        onSearchPress={handleOpenSearch}
        searchPlaceholder="Search friends"
        search={
          searchOpen
            ? { value: query, onChangeText: setQuery, onCancel: handleCancelSearch }
            : undefined
        }
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
                        <FriendRow friend={friend} key={friend.id} onPress={handleFriendPress} />
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
                        <FriendRow friend={friend} key={friend.id} onPress={handleFriendPress} />
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
});
