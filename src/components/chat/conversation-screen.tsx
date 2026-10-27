import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { MessageBubble } from '@/components/chat/message-bubble';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import type { ChatMessage, SteamFriend } from '@/context/steam-chat';
import type { SteamCmConnectionState } from '@/lib/steam/cm-client';
import { describeFriendStatus } from '@/lib/steam/chat-utils';

type ConversationScreenProps = {
  authError?: number | null;
  connection: SteamCmConnectionState;
  error?: string;
  friend: SteamFriend;
  friendTyping: boolean;
  hasMore: boolean;
  loading: boolean;
  messages: ChatMessage[];
  onBack: () => void;
  onLoadMore: () => void;
  onRetry?: () => void;
  onSend: (text: string) => void;
  onTyping: () => void;
  ready: boolean;
};

export function ConversationScreen({
  authError,
  connection,
  error,
  friend,
  friendTyping,
  hasMore,
  loading,
  messages,
  onBack,
  onLoadMore,
  onRetry,
  onSend,
  onTyping,
  ready,
}: ConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState('');
  const lastMessageId = messages[messages.length - 1]?.id ?? null;

  // Keyed on the newest message rather than the array length so that loading
  // older history does not yank the list back to the bottom.
  useEffect(() => {
    if (!lastMessageId) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [lastMessageId]);

  useEffect(() => {
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    });

    return () => subscription.remove();
  }, []);

  const handleSend = () => {
    const text = draft.trim();

    if (!text || !ready) {
      return;
    }

    onSend(text);
    setDraft('');
  };

  const status = describeFriendStatus(friend);
  const connectionLabel =
    connection === 'connected' ? 'Signing in to Steam…' : 'Reconnecting to Steam…';
  const subtitle = friendTyping ? 'typing…' : status;

  return (
    <View style={styles.screen}>
      <View style={styles.headerShell}>
        <View style={{ height: insets.top }} />

        <View style={styles.headerRow}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={6}
            onPress={onBack}
            style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
            <SymbolView
              name={{
                ios: 'chevron.left',
                android: 'arrow_back_ios_new',
                web: 'arrow_back_ios_new',
              }}
              size={22}
              tintColor={SteamColors.icon}
            />
          </Pressable>

          <View style={styles.identity}>
            <ChatAvatar name={friend.name} size={46} uri={friend.avatarUrl} />

            <View style={styles.titleCopy}>
              <Text numberOfLines={1} style={styles.title}>
                {friend.name}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            </View>
          </View>

          <View style={styles.actionSpacer} />
        </View>
      </View>

      {!ready || error ? (
        <View style={[styles.banner, error || authError ? styles.bannerError : undefined]}>
          {!ready && !authError ? (
            <ActivityIndicator color={SteamColors.muted} size="small" />
          ) : null}
          <Text style={[styles.bannerText, error || authError ? styles.bannerTextError : undefined]}>
            {error ??
              (authError
                ? 'Steam refused the chat connection. You are still signed in.'
                : connectionLabel)}
          </Text>
          {authError && onRetry ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onRetry}
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
        style={styles.body}>
        {messages.length === 0 && !loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              No messages yet. Say hi to {friend.name}.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            contentContainerStyle={styles.messagesContent}
            data={messages}
            keyExtractor={(item) => item.id}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={SteamColors.muted} size="small" />
              </View>
            }
            ListHeaderComponent={
              hasMore || loading ? (
                <View style={styles.historyHeader}>
                  {loading ? (
                    <ActivityIndicator color={SteamColors.muted} size="small" />
                  ) : (
                    <Pressable
                      accessibilityLabel="Load earlier messages"
                      accessibilityRole="button"
                      onPress={onLoadMore}
                      style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]}>
                      <Text style={styles.loadMoreText}>Load earlier messages</Text>
                    </Pressable>
                  )}
                </View>
              ) : undefined
            }
            renderItem={({ item }) => <MessageBubble message={item} />}
            showsVerticalScrollIndicator={false}
            style={styles.messagesList}
          />
        )}

        <View style={styles.composer}>
          <View style={[styles.composerRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.inputShell}>
              <TextInput
                accessibilityLabel="Message"
                autoCapitalize="sentences"
                editable={ready}
                onChangeText={(value) => {
                  setDraft(value);

                  if (value.trim().length > 0) {
                    onTyping();
                  }
                }}
                onSubmitEditing={handleSend}
                placeholder={ready ? 'Message' : 'Connecting to Steam…'}
                placeholderTextColor={SteamColors.muted}
                returnKeyType="send"
                selectionColor={SteamColors.accent}
                style={styles.input}
                underlineColorAndroid="transparent"
                value={draft}
              />
            </View>

            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready || draft.trim().length === 0 }}
              disabled={!ready || draft.trim().length === 0}
              onPress={handleSend}
              style={({ pressed }) => [
                styles.sendButton,
                (!ready || draft.trim().length === 0) && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}>
              <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                size={22}
                tintColor="#EFF6FC"
              />
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
  headerShell: {
    backgroundColor: SteamColors.chrome,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.border,
    zIndex: 10,
  },
  headerRow: {
    width: '100%',
    maxWidth: AppMaxWidth,
    minHeight: 64,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    gap: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  iconButtonPressed: {
    backgroundColor: SteamColors.chromePressed,
  },
  actionSpacer: {
    width: 44,
    height: 44,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: SteamColors.text,
    fontSize: 19,
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  subtitle: {
    marginTop: 1,
    color: SteamColors.muted,
    fontSize: 14,
    lineHeight: 18,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: SteamColors.chromeDeep,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.border,
  },
  bannerError: {
    backgroundColor: '#3A2426',
  },
  bannerText: {
    flexShrink: 1,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  bannerTextError: {
    color: SteamColors.error,
  },
  retry: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
    backgroundColor: SteamColors.accentDeep,
  },
  retryText: {
    color: SteamColors.textStrong,
    fontSize: 12.5,
    lineHeight: 17,
  },
  body: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 10,
  },
  historyHeader: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  loadMore: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  loadMoreText: {
    color: SteamColors.accent,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  emptyText: {
    maxWidth: 420,
    color: SteamColors.muted,
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  composer: {
    backgroundColor: SteamColors.canvas,
  },
  composerRow: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  inputShell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: SteamColors.canvasRaised,
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: '100%',
    color: SteamColors.text,
    fontSize: 15.5,
    lineHeight: 20,
    outlineWidth: 0,
    paddingVertical: 0,
  },
  sendButton: {
    width: 52,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  sendButtonPressed: {
    backgroundColor: SteamColors.accentPressed,
  },
  sendButtonDisabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.6,
  },
});
