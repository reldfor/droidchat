import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { ChatRow } from '@/components/chats/chat-row';
import { AppHeader } from '@/components/steam/app-header';
import { DemoNotice } from '@/components/steam/demo-notice';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useChatStore } from '@/context/chat-store';
import type { Chat } from '@/data/chats';
import { getFriendById } from '@/data/friends';
import { useDemoNotice } from '@/hooks/use-demo-notice';

export default function ChatsScreen() {
  const router = useRouter();
  const { chats } = useChatStore();
  const { message, showNotice } = useDemoNotice();

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
          chat.name.toLowerCase().includes(normalizedQuery) ||
          chat.preview.toLowerCase().includes(normalizedQuery),
      )
    : chats;
  const noResults = normalizedQuery.length > 0 && visibleChats.length === 0;

  const handleCancelSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const handleChatPress = (chat: Chat) => {
    const friend = chat.kind === 'direct' ? getFriendById(chat.id) : undefined;

    if (friend) {
      router.push({ pathname: '/friend/[id]', params: { id: friend.id } });
      return;
    }

    if (chat.kind === 'group' && chat.participants?.length) {
      router.push({ pathname: '/group-chat/[id]', params: { id: chat.id } });
      return;
    }

    showNotice(`Opening ${chat.name} is not available in this demo.`);
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        addLabel="New chat"
        onAddPress={() => router.push('/new-chat')}
        onSearchPress={() => setSearchOpen(true)}
        search={
          searchOpen
            ? { value: query, onChangeText: setQuery, onCancel: handleCancelSearch }
            : undefined
        }
        searchPlaceholder="Search chats"
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
          ) : (
            visibleChats.map((chat) => (
              <ChatRow chat={chat} key={chat.id} onPress={handleChatPress} />
            ))
          )}
        </View>
      </ScrollView>

      <DemoNotice message={message} />
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
});
