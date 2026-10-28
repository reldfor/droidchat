import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ChatRow } from '@/components/chats/chat-row';
import { AppHeader } from '@/components/steam/app-header';
import { ConnectionBanner } from '@/components/steam/connection-banner';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useSteamChat, type ChatListItem } from '@/context/steam-chat';

export default function ChatsScreen() {
  const router = useRouter();
  const { chats, connection, loggedOn, authError, retryConnection } = useSteamChat();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

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
  const visibleChats = normalizedQuery
    ? chats.filter(
        (chat) =>
          chat.friend.name.toLowerCase().includes(normalizedQuery) ||
          chat.conversation.preview?.text.toLowerCase().includes(normalizedQuery),
      )
    : chats;
  const noResults = normalizedQuery.length > 0 && visibleChats.length === 0;

  const handleCancelSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const handleChatPress = (chat: ChatListItem) => {
    router.push({ pathname: '/friend/[id]', params: { id: chat.friend.steamId } });
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        onSearchPress={() => setSearchOpen(true)}
        searchPlaceholder="Search chats"
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
              message={`No chats match "${query.trim()}". Try a different name.`}
              title="No chats found"
            />
          ) : chats.length === 0 ? (
            <View style={styles.empty}>
              {!loggedOn && !authError ? (
                <ActivityIndicator color={SteamColors.muted} size="small" />
              ) : null}
              <Text style={styles.emptyTitle}>
                {loggedOn || authError ? 'No chats yet' : 'Loading your chats'}
              </Text>
              <Text style={styles.emptyBody}>
                {loggedOn || authError
                  ? 'Open a friend from your friends list to start a conversation.'
                  : 'Steam is sending your recent conversations.'}
              </Text>
              {loggedOn || authError ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.navigate('/friends')}
                  style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                  <Text style={styles.emptyButtonText}>Find friends</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            visibleChats.map((chat) => (
              <ChatRow
                friend={chat.friend}
                key={chat.friend.steamId}
                onPress={() => handleChatPress(chat)}
                preview={chat.conversation.preview}
                unread={chat.conversation.unread}
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
