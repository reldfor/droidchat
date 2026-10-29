import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GroupRow } from '@/components/groups/group-row';
import { AppHeader } from '@/components/steam/app-header';
import { ConnectionBanner } from '@/components/steam/connection-banner';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useSteamChat, type GroupChatListItem } from '@/context/steam-chat';

export default function GroupsScreen() {
  const router = useRouter();
  const {
    groupChats,
    groupError,
    groupListLoaded,
    connection,
    loggedOn,
    authError,
    retryConnection,
    refreshGroups,
  } = useSteamChat();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
  const visibleGroups = normalizedQuery
    ? groupChats.filter(
        (group) =>
          group.name.toLowerCase().includes(normalizedQuery) ||
          group.preview?.text.toLowerCase().includes(normalizedQuery),
      )
    : groupChats;
  const noResults = normalizedQuery.length > 0 && visibleGroups.length === 0;

  const handleCancelSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const handleRefresh = async () => {
    setRefreshing(true);

    try {
      await refreshGroups();
    } finally {
      setRefreshing(false);
    }
  };

  const handleGroupPress = (group: GroupChatListItem) => {
    router.push({
      pathname: '/group/[id]',
      params: { id: group.group.chatGroupId },
    });
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        onSearchPress={() => setSearchOpen(true)}
        searchPlaceholder="Search group chats"
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
        refreshControl={
          <RefreshControl
            colors={[SteamColors.accent]}
            onRefresh={() => {
              void handleRefresh();
            }}
            progressBackgroundColor={SteamColors.canvasRaised}
            refreshing={refreshing}
            tintColor={SteamColors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <View style={styles.content}>
          {noResults ? (
            <SearchEmpty
              icon={{ ios: 'magnifyingglass', android: 'search_off', web: 'search_off' }}
              message={`No group chats match "${query.trim()}". Try a different name.`}
              title="No groups found"
            />
          ) : groupChats.length === 0 ? (
            <View style={styles.empty}>
              {!loggedOn && !authError ? (
                <ActivityIndicator color={SteamColors.muted} size="small" />
              ) : null}
              <Text style={styles.emptyTitle}>
                {groupError
                  ? 'Group chats unavailable'
                  : groupListLoaded
                    ? 'No group chats yet'
                    : loggedOn || authError
                      ? 'Loading your group chats'
                      : 'Connecting to Steam'}
              </Text>
              <Text style={styles.emptyBody}>
                {groupError
                  ? groupError
                  : groupListLoaded
                    ? 'Join a Steam group chat or clan chat and it will appear here.'
                    : loggedOn || authError
                      ? 'Steam is sending your group chat list.'
                      : 'Group chats will load after the connection is ready.'}
              </Text>
              {groupError ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void handleRefresh();
                  }}
                  style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                  <Text style={styles.emptyButtonText}>Try again</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            visibleGroups.map((group) => (
              <GroupRow
                avatarUrl={group.avatarUrl}
                key={group.group.chatGroupId}
                memberCount={group.group.memberCount}
                name={group.name}
                onPress={() => handleGroupPress(group)}
                preview={group.preview}
                unread={group.unread}
              />
            ))
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
    paddingTop: 4,
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
    maxWidth: 320,
    color: SteamColors.muted,
    fontSize: 14.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyButton: {
    marginTop: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  emptyButtonText: {
    color: SteamColors.textStrong,
    fontSize: 15,
    lineHeight: 20,
  },
  pressed: {
    opacity: 0.7,
  },
});
