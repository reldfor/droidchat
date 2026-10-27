import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
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

import { InviteFriendRow } from '@/components/friends/invite-friend-row';
import { ScreenHeader } from '@/components/steam/screen-header';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useChatStore } from '@/context/chat-store';
import { allFriends, getFriendById, type Friend } from '@/data/friends';

export default function NewChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { createGroupChat } = useChatStore();
  const params = useLocalSearchParams<{ with?: string | string[] }>();

  const withId = Array.isArray(params.with) ? params.with[0] : params.with;
  const preselected = getFriendById(withId);

  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const inviteCandidates = useMemo(
    () => allFriends.filter((friend) => friend.id !== preselected?.id),
    [preselected?.id],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const visibleFriends = normalizedQuery
    ? inviteCandidates.filter((friend) => friend.name.toLowerCase().includes(normalizedQuery))
    : inviteCandidates;

  const participants = useMemo<Friend[]>(() => {
    const selectedFriends = allFriends.filter((friend) => selectedIds.has(friend.id));
    return preselected ? [preselected, ...selectedFriends] : selectedFriends;
  }, [preselected, selectedIds]);

  const canStart = participants.length > 0;

  const handleToggleFriend = (friendId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(friendId)) {
        next.delete(friendId);
      } else {
        next.add(friendId);
      }

      return next;
    });
  };

  const handleStartChat = () => {
    if (!canStart) {
      return;
    }

    createGroupChat(participants);
    router.dismissAll();
    router.navigate('/chats');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader backLabel="Close new chat" onBack={() => router.back()} title="New chat" />

      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
        style={styles.body}>
        <View style={styles.content}>
          <View style={styles.intro}>
            <Text style={styles.inviteCopy}>
              Invite friends to chat with <Text style={styles.inviteName}>you</Text>
              {preselected ? (
                <>
                  {' and '}
                  <Text style={styles.inviteName}>{preselected.name}</Text>
                </>
              ) : null}
            </Text>

            <Text style={styles.sectionLabel}>Invite to group chat</Text>

            <TextInput
              accessibilityLabel="Search friends to invite"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Start typing a name..."
              placeholderTextColor={SteamColors.muted}
              selectionColor={SteamColors.accent}
              style={styles.searchInput}
              underlineColorAndroid="transparent"
              value={query}
            />
          </View>

          <FlatList
            contentContainerStyle={styles.listContent}
            data={visibleFriends}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            keyExtractor={(friend) => friend.id}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>
                  {normalizedQuery
                    ? `No friends match "${query.trim()}".`
                    : 'No friends available to invite.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <InviteFriendRow
                friend={item}
                onToggle={handleToggleFriend}
                selected={selectedIds.has(item.id)}
              />
            )}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              accessibilityLabel="Start chatting"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canStart }}
              disabled={!canStart}
              onPress={handleStartChat}
              style={({ pressed }) => [
                styles.startButton,
                !canStart && styles.startButtonDisabled,
                pressed && canStart && styles.startButtonPressed,
              ]}>
              <Text style={styles.startButtonText}>Start chatting</Text>
            </Pressable>
          </View>
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
  content: {
    flex: 1,
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
  },
  intro: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  inviteCopy: {
    color: '#B8BDC4',
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  inviteName: {
    color: SteamColors.accent,
  },
  sectionLabel: {
    marginTop: 28,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 17,
    letterSpacing: 1.15,
    textTransform: 'uppercase',
  },
  searchInput: {
    height: 44,
    marginTop: 12,
    borderRadius: 4,
    backgroundColor: SteamColors.canvasRaised,
    color: SteamColors.text,
    fontSize: 15,
    lineHeight: 20,
    outlineWidth: 0,
    paddingHorizontal: 13,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  list: {
    flex: 1,
    marginTop: 14,
  },
  listContent: {
    paddingBottom: 8,
  },
  emptyList: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  emptyListText: {
    color: SteamColors.muted,
    fontSize: 14.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: SteamColors.canvas,
  },
  startButton: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  startButtonPressed: {
    backgroundColor: SteamColors.accentPressed,
  },
  startButtonDisabled: {
    opacity: 0.42,
  },
  startButtonText: {
    color: SteamColors.textStrong,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
});
