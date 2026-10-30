import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NewChatFriendRow } from '@/components/groups/new-chat-friend-row';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useSteamChat, type SteamFriend } from '@/context/steam-chat';
import { FRIEND_RELATIONSHIP_FRIEND } from '@/lib/steam/cm-proto';

export default function NewChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    friends,
    createGroupChat,
    ready,
    loggedOn,
    authError,
  } = useSteamChat();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const creatingRef = useRef(false);

  const allFriends = useMemo(
    () =>
      Object.values(friends)
        .filter((friend) => friend.relationship === FRIEND_RELATIONSHIP_FRIEND)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [friends],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visibleFriends = normalizedQuery
    ? allFriends.filter((friend) => friend.name.toLowerCase().includes(normalizedQuery))
    : allFriends;
  const noResults = normalizedQuery.length > 0 && visibleFriends.length === 0;
  const canStart = ready && selected.length > 0 && !creating;

  const toggleFriend = useCallback((friend: SteamFriend) => {
    setError('');
    setSelected((current) =>
      current.includes(friend.steamId)
        ? current.filter((steamId) => steamId !== friend.steamId)
        : [...current, friend.steamId],
    );
  }, []);

  const handleStart = async () => {
    if (!canStart || creatingRef.current) {
      return;
    }

    creatingRef.current = true;
    setCreating(true);
    setError('');

    try {
      const chatGroupId = await createGroupChat(selected);
      router.replace({ pathname: '/group/[id]', params: { id: chatGroupId } });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'Could not create the group chat. Try again.',
      );
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const empty = noResults ? (
    <SearchEmpty
      icon={{ ios: 'magnifyingglass', android: 'search_off', web: 'search_off' }}
      message={`No friends match "${query.trim()}". Try a different name.`}
      title="No friends found"
    />
  ) : (
    <View style={styles.empty}>
      {!loggedOn && !authError ? (
        <ActivityIndicator color={SteamColors.muted} size="small" />
      ) : null}
      <Text style={styles.emptyTitle}>
        {authError
          ? 'Friends unavailable'
          : loggedOn
            ? 'No friends to invite'
            : 'Loading your friends'}
      </Text>
      <Text style={styles.emptyBody}>
        {authError
          ? 'Retry the connection from the Friends tab, then come back to start a group.'
          : loggedOn
            ? 'Add friends on Steam and they will appear here.'
            : 'Steam is sending your friends list.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel="Go back" onBack={() => router.back()} title="New Chat" />

      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
        style={styles.body}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={visibleFriends}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(friend) => friend.steamId}
          ListEmptyComponent={empty}
          ListHeaderComponent={
            <View style={styles.intro}>
              <Text style={styles.prompt}>
                Invite friends to chat with <Text style={styles.promptAccent}>you</Text>.
              </Text>

              <View style={styles.sectionRow}>
                <Text style={styles.sectionLabel}>Invite to group chat</Text>
                {selected.length > 0 ? (
                  <Text style={styles.selectedCount}>
                    {selected.length} selected
                  </Text>
                ) : null}
              </View>

              <View style={styles.searchField}>
                <SymbolView
                  name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                  size={17}
                  tintColor={SteamColors.iconMuted}
                />
                <TextInput
                  accessibilityLabel="Search friends to invite"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setQuery}
                  placeholder="Start typing a name..."
                  placeholderTextColor={SteamColors.muted}
                  returnKeyType="search"
                  selectionColor={SteamColors.accent}
                  style={styles.searchInput}
                  textAlignVertical="center"
                  underlineColorAndroid="transparent"
                  value={query}
                />
                {query.length > 0 ? (
                  <Pressable
                    accessibilityLabel="Clear search"
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setQuery('')}
                    style={({ pressed }) => pressed && styles.pressed}>
                    <SymbolView
                      name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                      size={17}
                      tintColor={SteamColors.iconMuted}
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <NewChatFriendRow
              friend={item}
              onToggle={toggleFriend}
              selected={selected.includes(item.steamId)}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {authError ? (
            <Text style={styles.connectionHint}>
              Steam refused the chat connection. Go back to Friends and retry.
            </Text>
          ) : !ready ? (
            <Text style={styles.connectionHint}>Connecting to Steam…</Text>
          ) : null}

          <Pressable
            accessibilityLabel="Start chatting"
            accessibilityRole="button"
            disabled={!canStart}
            onPress={() => {
              void handleStart();
            }}
            style={({ pressed }) => [
              styles.startButton,
              pressed && canStart && styles.startButtonPressed,
              !canStart && styles.startButtonDisabled,
            ]}>
            {creating ? (
              <ActivityIndicator color={SteamColors.textStrong} size="small" />
            ) : null}
            <Text style={styles.startLabel}>{creating ? 'Creating…' : 'Start chatting'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SteamColors.canvas,
  },
  body: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    width: '100%',
    maxWidth: AppMaxWidth,
    flexGrow: 1,
    alignSelf: 'center',
    paddingBottom: 12,
  },
  intro: {
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  prompt: {
    color: SteamColors.muted,
    fontSize: 16,
    lineHeight: 22,
  },
  promptAccent: {
    color: SteamColors.accent,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionLabel: {
    color: SteamColors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    lineHeight: 18,
    textTransform: 'uppercase',
  },
  selectedCount: {
    color: SteamColors.accent,
    fontSize: 13,
    lineHeight: 18,
  },
  searchField: {
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3A3E46',
    backgroundColor: SteamColors.canvasRaised,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: SteamColors.text,
    fontSize: 14.5,
    outlineWidth: 0,
    paddingVertical: 0,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 30,
    paddingTop: 64,
    paddingBottom: 64,
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
  footer: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SteamColors.border,
    backgroundColor: SteamColors.canvas,
  },
  error: {
    color: SteamColors.error,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  connectionHint: {
    color: SteamColors.muted,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: 'center',
  },
  startButton: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  startButtonPressed: {
    backgroundColor: SteamColors.accentPressed,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startLabel: {
    color: SteamColors.textStrong,
    fontSize: 16.5,
    lineHeight: 22,
  },
  pressed: {
    opacity: 0.6,
  },
});
