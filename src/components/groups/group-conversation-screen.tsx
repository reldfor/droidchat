import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageBubble } from '@/components/chat/message-bubble';
import { EmoticonPicker } from '@/components/chat/emoticon-picker';
import { ChatAvatar } from '@/components/chats/chat-avatar';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import type {
  GroupAuthorProfile,
  GroupChat,
  GroupRoom,
} from '@/context/group-chat-state';
import type { ChatMessage, SteamFriend } from '@/context/steam-chat';
import type { SteamCmConnectionState } from '@/lib/steam/cm-client';
import type { SteamEmoticon } from '@/lib/steam/chat-media';
import { pickChatImage, type ChatImage } from '@/lib/steam/image-picker';
import { ImageUploadError } from '@/lib/steam/image-upload';
import { formatGroupMemberCount } from '@/lib/steam/group-chat';

type GroupConversationScreenProps = {
  authError?: number | null;
  connection: SteamCmConnectionState;
  error?: string;
  friends: Record<string, SteamFriend>;
  getEmoticons: () => Promise<SteamEmoticon[]>;
  group: GroupChat;
  name: string;
  profiles: Record<string, GroupAuthorProfile>;
  ready: boolean;
  room: GroupRoom | null;
  onBack: () => void;
  onLoadMore: () => void;
  onRetry?: () => void;
  onRetryHistory?: () => void;
  onSelectRoom: (chatId: string) => void;
  onSend: (text: string) => Promise<void>;
  onSendImage: (image: ChatImage) => Promise<void>;
};

function roomLabel(room: GroupRoom): string {
  return room.name.trim() || 'Chat';
}

export function GroupConversationScreen({
  authError,
  connection,
  error,
  friends,
  getEmoticons,
  group,
  name,
  profiles,
  ready,
  room,
  onBack,
  onLoadMore,
  onRetry,
  onRetryHistory,
  onSelectRoom,
  onSend,
  onSendImage,
}: GroupConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [draft, setDraft] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [showEmoticons, setShowEmoticons] = useState(false);
  const [image, setImage] = useState<ChatImage | null>(null);
  const imageRef = useRef<ChatImage | null>(null);
  const [operation, setOperation] = useState<'picking' | 'uploading' | 'sending' | null>(null);
  const [imageUncertain, setImageUncertain] = useState(false);
  const busy = operation !== null;
  const [composerError, setComposerError] = useState('');
  const mounted = useRef(true);
  const busyRef = useRef(false);

  const messages = room?.messages ?? [];
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  const composerReady = ready && Boolean(room);
  const canSend =
    composerReady && !busy && !imageUncertain && (draft.trim().length > 0 || image !== null);
  const connectionLabel =
    connection === 'connected' ? 'Signing in to Steam…' : 'Reconnecting to Steam…';
  const subtitle = group.tagline.trim()
    ? group.tagline
    : formatGroupMemberCount(group.memberCount);
  const retry = authError ? onRetry : error && ready ? onRetryHistory : undefined;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      imageRef.current?.dispose();
    };
  }, []);

  // Keyed on the newest message rather than the array length so loading older
  // history does not yank the reader back to the bottom.
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

  const authorFor = useMemo(
    () => (message: ChatMessage) => {
      if (message.mine) {
        return { name: 'You', avatarUrl: null };
      }

      const profile = profiles[message.authorSteamId];
      const friend = friends[message.authorSteamId];

      return {
        name: profile?.name || friend?.name || 'Steam user',
        avatarUrl: profile?.avatarUrl ?? friend?.avatarUrl ?? null,
      };
    },
    [friends, profiles],
  );

  const chooseImage = async () => {
    if (!ready || busyRef.current) {
      return;
    }

    if (Platform.OS === 'web') {
      setComposerError('Image uploads are available in the Android and iOS app.');
      return;
    }

    busyRef.current = true;
    setOperation('picking');
    setComposerError('');
    setShowEmoticons(false);

    try {
      const picked = await pickChatImage();
      if (!mounted.current) {
        picked?.dispose();
        return;
      }

      if (picked) {
        imageRef.current?.dispose();
        imageRef.current = picked;
        setImage(picked);
        setImageUncertain(false);
      }
    } catch (pickError) {
      if (mounted.current) {
        setComposerError(
          pickError instanceof Error
            ? pickError.message
            : 'Could not open this photo. Try a different image.',
        );
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setOperation(null);
      }
    }
  };

  const handleSend = async () => {
    const text = draft.trim();

    if ((!text && !image) || !ready || busyRef.current || imageUncertain) {
      return;
    }

    busyRef.current = true;
    setComposerError('');
    setShowEmoticons(false);

    try {
      if (image) {
        setOperation('uploading');
        await onSendImage(image);
        if (!mounted.current) {
          return;
        }
        image.dispose();
        imageRef.current = null;
        setImage(null);
      }

      if (text) {
        setOperation('sending');
        await onSend(text);
        if (mounted.current) {
          setDraft('');
          setSelection({ start: 0, end: 0 });
        }
      }
    } catch (sendError) {
      if (mounted.current) {
        setComposerError(
          sendError instanceof Error
            ? sendError.message
            : 'Could not send this message. Try again.',
        );
        if (sendError instanceof ImageUploadError && sendError.uncertain) {
          setImageUncertain(true);
        }
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        setOperation(null);
      }
    }
  };

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
            <ChatAvatar name={name} size={46} uri={group.avatarUrl} />

            <View style={styles.titleCopy}>
              <Text numberOfLines={1} style={styles.title}>
                {name}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            </View>
          </View>

          <View style={styles.actionSpacer} />
        </View>
      </View>

      {group.roomOrder.length > 1 ? (
        <View style={styles.roomBar}>
          <ScrollView
            contentContainerStyle={styles.roomBarContent}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}>
            {group.roomOrder.map((chatId) => {
              const roomState = group.rooms[chatId];
              if (!roomState) {
                return null;
              }

              const selected = chatId === room?.chatId;

              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={chatId}
                  onPress={() => {
                    setDraft('');
                    setComposerError('');
                    setShowEmoticons(false);
                    imageRef.current?.dispose();
                    imageRef.current = null;
                    setImage(null);
                    setImageUncertain(false);
                    onSelectRoom(chatId);
                  }}
                  style={({ pressed }) => [
                    styles.roomChip,
                    selected && styles.roomChipSelected,
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    numberOfLines={1}
                    style={[styles.roomChipText, selected && styles.roomChipTextSelected]}>
                    {roomLabel(roomState)}
                  </Text>
                  {roomState.unread && !selected ? <View style={styles.roomUnreadDot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {!ready || error ? (
        <View style={[styles.banner, Boolean(error || authError) && styles.bannerError]}>
          {!ready && !authError ? (
            <ActivityIndicator color={SteamColors.muted} size="small" />
          ) : null}
          <Text
            style={[
              styles.bannerText,
              Boolean(error || authError) && styles.bannerTextError,
            ]}>
            {error ??
              (authError
                ? 'Steam refused the chat connection. You are still signed in.'
                : connectionLabel)}
          </Text>
          {retry ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={retry}
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
        {messages.length === 0 && !room?.loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {room?.error
                ? 'Could not load this room. Tap Retry to try again.'
                : `No messages yet. Start the conversation in ${room ? roomLabel(room) : name}.`}
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
              messages.length > 0 && (room?.hasMore || room?.loading) ? (
                <View style={styles.historyHeader}>
                  {room.loading ? (
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
            renderItem={({ item, index }) => {
              const previous = index > 0 ? messages[index - 1] : null;
              const author = authorFor(item);
              const showAuthor =
                !item.mine &&
                (!previous ||
                  previous.authorSteamId !== item.authorSteamId ||
                  item.sentAt - previous.sentAt > 300);

              return (
                <MessageBubble
                  authorAvatarUrl={author.avatarUrl}
                  authorName={author.name}
                  message={item}
                  showAuthor={showAuthor}
                />
              );
            }}
            showsVerticalScrollIndicator={false}
            style={styles.messagesList}
          />
        )}

        <View style={styles.composer}>
          {showEmoticons ? (
            <EmoticonPicker
              load={getEmoticons}
              ready={ready}
              onClose={() => setShowEmoticons(false)}
              onPick={(emoticonName) => {
                const start = Math.min(selection.start, draft.length);
                const end = Math.min(selection.end, draft.length);
                const token = `:${emoticonName}:`;
                setDraft(draft.slice(0, start) + token + draft.slice(end));
                setSelection({ start: start + token.length, end: start + token.length });
                setShowEmoticons(false);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            />
          ) : null}

          {image ? (
            <View style={styles.attachment}>
              <Image
                accessibilityLabel="Image ready to send"
                contentFit="cover"
                source={{ uri: image.uri }}
                style={styles.attachmentImage}
              />
              <View style={styles.attachmentCopy}>
                <Text numberOfLines={1} style={styles.attachmentTitle}>
                  {operation === 'uploading'
                    ? 'Sending image…'
                    : imageUncertain
                      ? 'Check delivery in this chat'
                      : 'Image ready to send'}
                </Text>
                <Text style={styles.attachmentHint}>
                  {(image.bytes.length / 1024 / 1024).toFixed(1)} MB · {image.width} ×{' '}
                  {image.height}
                </Text>
              </View>
              {operation === 'uploading' ? (
                <ActivityIndicator color={SteamColors.accent} />
              ) : (
                <Pressable
                  accessibilityLabel="Remove image"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    image.dispose();
                    imageRef.current = null;
                    setImage(null);
                    setImageUncertain(false);
                    setComposerError('');
                  }}
                  style={styles.mediaButton}>
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={20}
                    tintColor={SteamColors.icon}
                  />
                </Pressable>
              )}
            </View>
          ) : null}

          {composerError ? (
            <Text accessibilityRole="alert" style={styles.composerError}>
              {composerError}
            </Text>
          ) : null}

          <View style={[styles.composerRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Pressable
              accessibilityLabel="Attach image"
              accessibilityRole="button"
              accessibilityState={{ disabled: !composerReady || busy }}
              disabled={!composerReady || busy}
              onPress={() => {
                void chooseImage();
              }}
              style={({ pressed }) => [
                styles.mediaButton,
                (!composerReady || busy) && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}>
              {operation === 'picking' ? (
                <ActivityIndicator color={SteamColors.muted} size="small" />
              ) : (
                <SymbolView
                  name={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }}
                  size={23}
                  tintColor={SteamColors.icon}
                />
              )}
            </Pressable>

            <View style={styles.inputShell}>
              <TextInput
                ref={inputRef}
                accessibilityLabel="Message"
                autoCapitalize="sentences"
                editable={composerReady && !busy}
                onChangeText={(value) => {
                  setDraft(value);
                  setComposerError('');
                }}
                onFocus={() => setShowEmoticons(false)}
                onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                onSubmitEditing={() => {
                  void handleSend();
                }}
                placeholder={
                  composerReady
                    ? image
                      ? 'Add a message'
                      : `Message ${room ? roomLabel(room) : ''}`.trim()
                    : 'Connecting to Steam…'
                }
                placeholderTextColor={SteamColors.muted}
                returnKeyType="send"
                selection={selection}
                selectionColor={SteamColors.accent}
                style={styles.input}
                underlineColorAndroid="transparent"
                value={draft}
              />
            </View>

            <Pressable
              accessibilityLabel="Steam emoticons"
              accessibilityRole="button"
              accessibilityState={{ disabled: !composerReady || busy, expanded: showEmoticons }}
              disabled={!composerReady || busy}
              onPress={() => {
                Keyboard.dismiss();
                setShowEmoticons((value) => !value);
              }}
              style={({ pressed }) => [
                styles.mediaButton,
                (!composerReady || busy) && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'face.smiling', android: 'sentiment_satisfied', web: 'sentiment_satisfied' }}
                size={23}
                tintColor={showEmoticons ? SteamColors.accent : SteamColors.icon}
              />
            </Pressable>

            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => {
                void handleSend();
              }}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}>
              {busy && operation !== 'picking' ? (
                <ActivityIndicator color={SteamColors.textStrong} size="small" />
              ) : (
                <SymbolView
                  name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                  size={22}
                  tintColor="#EFF6FC"
                />
              )}
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
  roomBar: {
    backgroundColor: SteamColors.chromeDeep,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.border,
  },
  roomBarContent: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  roomChip: {
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: SteamColors.canvasRaised,
  },
  roomChipSelected: {
    backgroundColor: SteamColors.accentDeep,
  },
  roomChipText: {
    flexShrink: 1,
    color: SteamColors.muted,
    fontSize: 13.5,
    lineHeight: 18,
  },
  roomChipTextSelected: {
    color: SteamColors.textStrong,
  },
  roomUnreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SteamColors.unreadDot,
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
    gap: 4,
    paddingHorizontal: 8,
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
    paddingHorizontal: 10,
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
  mediaButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  attachment: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 12,
  },
  attachmentImage: {
    width: 64,
    height: 64,
    borderRadius: 4,
    backgroundColor: SteamColors.canvasRaised,
  },
  attachmentCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  attachmentTitle: {
    color: SteamColors.text,
    fontSize: 14,
  },
  attachmentHint: {
    color: SteamColors.muted,
    fontSize: 12,
  },
  sendButton: {
    width: 44,
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
  composerError: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    color: SteamColors.error,
    paddingHorizontal: 16,
    paddingTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.6,
  },
});
