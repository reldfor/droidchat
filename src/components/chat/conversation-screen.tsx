import { SymbolView } from 'expo-symbols';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
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
import { FriendGameIcon } from '@/components/friends/friend-game-icon';
import { MessageBubble } from '@/components/chat/message-bubble';
import { EmoticonPicker } from '@/components/chat/emoticon-picker';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import type { ChatMessage, SteamFriend } from '@/context/steam-chat';
import type { SteamCmConnectionState } from '@/lib/steam/cm-client';
import { describeFriendStatus, inGameName } from '@/lib/steam/chat-utils';
import type { GameAssets } from '@/lib/steam/game-assets';
import { pickChatImage, type ChatImage } from '@/lib/steam/image-picker';
import { ImageUploadError } from '@/lib/steam/image-upload';
import type { SteamEmoticon } from '@/lib/steam/chat-media';

type ConversationScreenProps = {
  authError?: number | null;
  connection: SteamCmConnectionState;
  error?: string;
  friend: SteamFriend;
  friendTyping: boolean;
  /** Store metadata for the game this friend is playing, when available. */
  game?: GameAssets;
  hasMore: boolean;
  loading: boolean;
  messages: ChatMessage[];
  onBack: () => void;
  onLoadMore: () => void;
  onRetry?: () => void;
  onRetryHistory?: () => void;
  onSend: (text: string) => Promise<void> | void;
  onSendImage: (image: ChatImage) => Promise<void>;
  getEmoticons: () => Promise<SteamEmoticon[]>;
  onTyping: () => void;
  ready: boolean;
};

export function ConversationScreen({
  authError,
  connection,
  error,
  friend,
  friendTyping,
  game,
  hasMore,
  loading,
  messages,
  onBack,
  onLoadMore,
  onRetry,
  onRetryHistory,
  onSend,
  onSendImage,
  getEmoticons,
  onTyping,
  ready,
}: ConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [showEmoticons, setShowEmoticons] = useState(false);
  const [image, setImage] = useState<ChatImage | null>(null);
  const imageRef = useRef<ChatImage | null>(null);
  const [operation, setOperation] = useState<'picking' | 'uploading' | 'sending' | null>(null);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const [composerError, setComposerError] = useState('');
  const [imageUncertain, setImageUncertain] = useState(false);
  const busy = operation !== null;
  const canSend = ready && !busy && !imageUncertain && (draft.trim().length > 0 || image !== null);
  const lastMessageId = messages[messages.length - 1]?.id ?? null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; imageRef.current?.dispose(); };
  }, []);

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

  const chooseImage = async () => {
    if (!ready || busyRef.current) return;
    if (Platform.OS === 'web') { setComposerError('Image uploads are available in the Android and iOS app.'); return; }
    busyRef.current = true;
    setOperation('picking');
    setComposerError('');
    setShowEmoticons(false);
    try {
      const picked = await pickChatImage();
      if (!mounted.current) { picked?.dispose(); return; }
      if (picked) {
        imageRef.current?.dispose();
        imageRef.current = picked;
        setImage(picked);
        setImageUncertain(false);
      }
    } catch (error) {
      if (mounted.current) setComposerError(error instanceof Error ? error.message : 'Could not open this photo. Try a different image.');
    } finally {
      busyRef.current = false;
      if (mounted.current) setOperation(null);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if ((!text && !image) || !ready || busyRef.current || imageUncertain) return;
    busyRef.current = true;
    setComposerError('');
    setShowEmoticons(false);
    try {
      if (image) {
        setOperation('uploading');
        await onSendImage(image);
        if (!mounted.current) return;
        image.dispose();
        imageRef.current = null;
        setImage(null);
      }
      if (text) {
        setOperation('sending');
        await onSend(text);
        if (mounted.current) { setDraft(''); setSelection({ start: 0, end: 0 }); }
      }
    } catch (error) {
      if (mounted.current) {
        setComposerError(error instanceof Error ? error.message : 'Could not send this message. Try again.');
        if (error instanceof ImageUploadError && error.uncertain) setImageUncertain(true);
      }
    } finally {
      busyRef.current = false;
      if (mounted.current) setOperation(null);
    }
  };

  const status = describeFriendStatus(friend);
  const connectionLabel =
    connection === 'connected' ? 'Signing in to Steam…' : 'Reconnecting to Steam…';
  const gameName = inGameName(friend, game?.name);
  const inGame = gameName !== null;
  const subtitle = friendTyping ? 'typing…' : status;
  const retry = authError ? onRetry : error && ready ? onRetryHistory : undefined;

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
              <Text numberOfLines={1} style={[styles.title, inGame && styles.titleInGame]}>
                {friend.name}
              </Text>

              {inGame ? (
                <>
                  <View style={styles.gameLine}>
                    {friend.gameAppId ? (
                      <FriendGameIcon appId={friend.gameAppId} game={game} size={20} />
                    ) : null}
                    <Text numberOfLines={1} style={styles.gameName}>
                      {gameName}
                    </Text>
                  </View>
                  {friendTyping ? (
                    <Text numberOfLines={1} style={[styles.subtitle, styles.presenceLine]}>
                      {subtitle}
                    </Text>
                  ) : friend.richPresence ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.subtitle, styles.presenceLine, styles.gamePresence]}>
                      {friend.richPresence}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {subtitle}
                </Text>
              )}
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
        {messages.length === 0 && !loading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>
              {error
                ? 'Could not load this conversation. Tap Retry to try again.'
                : `No messages yet. Say hi to ${friend.name}.`}
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
              messages.length > 0 && (hasMore || loading) ? (
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
          {showEmoticons ? <EmoticonPicker load={getEmoticons} ready={ready} onClose={() => setShowEmoticons(false)} onPick={(name) => {
            const start = Math.min(selection.start, draft.length);
            const end = Math.min(selection.end, draft.length);
            const token = `:${name}:`;
            setDraft(draft.slice(0, start) + token + draft.slice(end));
            setSelection({ start: start + token.length, end: start + token.length });
            setShowEmoticons(false);
            requestAnimationFrame(() => inputRef.current?.focus());
          }} /> : null}
          {image ? <View style={styles.attachment}>
            <Image source={{ uri: image.uri }} contentFit="cover" accessibilityLabel="Image ready to send" style={styles.attachmentImage} />
            <View style={styles.attachmentCopy}>
              <Text numberOfLines={1} style={styles.attachmentTitle}>{operation === 'uploading' ? 'Sending image…' : imageUncertain ? 'Check delivery in this chat' : 'Image ready to send'}</Text>
              <Text style={styles.attachmentHint}>{(image.bytes.length / 1024 / 1024).toFixed(1)} MB · {image.width} × {image.height}</Text>
            </View>
            {operation === 'uploading' ? <ActivityIndicator color={SteamColors.accent} /> : <Pressable accessibilityRole="button" accessibilityLabel="Remove image" disabled={busy} onPress={() => {
              image.dispose(); imageRef.current = null; setImage(null); setImageUncertain(false); setComposerError('');
            }} style={styles.mediaButton}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={SteamColors.icon} /></Pressable>}
          </View> : null}
          {composerError ? <Text accessibilityRole="alert" style={styles.composerError}>{composerError}</Text> : null}
          <View style={[styles.composerRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Attach image" accessibilityState={{ disabled: !ready || busy }} disabled={!ready || busy} onPress={() => { void chooseImage(); }} style={({ pressed }) => [styles.mediaButton, (!ready || busy) && styles.sendButtonDisabled, pressed && styles.pressed]}>
              {operation === 'picking' ? <ActivityIndicator size="small" color={SteamColors.muted} /> : <SymbolView name={{ ios: 'photo', android: 'photo_library', web: 'photo_library' }} size={23} tintColor={SteamColors.icon} />}
            </Pressable>
            <View style={styles.inputShell}>
              <TextInput
                ref={inputRef}
                accessibilityLabel="Message"
                autoCapitalize="sentences"
                editable={ready && !busy}
                selection={selection}
                onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
                onFocus={() => setShowEmoticons(false)}
                onChangeText={(value) => {
                  setDraft(value);
                  setComposerError('');

                  if (value.trim().length > 0) {
                    onTyping();
                  }
                }}
                onSubmitEditing={() => { void handleSend(); }}
                placeholder={ready ? image ? 'Add a message' : 'Message' : 'Connecting to Steam…'}
                placeholderTextColor={SteamColors.muted}
                returnKeyType="send"
                selectionColor={SteamColors.accent}
                style={styles.input}
                underlineColorAndroid="transparent"
                value={draft}
              />
            </View>

            <Pressable accessibilityRole="button" accessibilityLabel="Steam emoticons" accessibilityState={{ disabled: !ready || busy, expanded: showEmoticons }} disabled={!ready || busy} onPress={() => {
              Keyboard.dismiss(); setShowEmoticons((value) => !value);
            }} style={({ pressed }) => [styles.mediaButton, (!ready || busy) && styles.sendButtonDisabled, pressed && styles.pressed]}>
              <SymbolView name={{ ios: 'face.smiling', android: 'sentiment_satisfied', web: 'sentiment_satisfied' }} size={23} tintColor={showEmoticons ? SteamColors.accent : SteamColors.icon} />
            </Pressable>

            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => { void handleSend(); }}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend && styles.sendButtonDisabled,
                pressed && styles.sendButtonPressed,
              ]}>
              {busy && operation !== 'picking' ? <ActivityIndicator color={SteamColors.textStrong} size="small" /> : <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                size={22}
                tintColor="#EFF6FC"
              />}
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
  titleInGame: {
    color: SteamColors.inGameName,
  },
  subtitle: {
    marginTop: 1,
    color: SteamColors.muted,
    fontSize: 14,
    lineHeight: 18,
  },
  gameLine: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  gameName: {
    flexShrink: 1,
    color: SteamColors.inGameGame,
    fontSize: 14,
    lineHeight: 18,
  },
  presenceLine: {
    fontSize: 13.5,
    lineHeight: 17,
  },
  gamePresence: {
    color: SteamColors.inGamePresence,
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
  sendButton: {
    width: 44,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  mediaButton: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  attachment: { width: '100%', maxWidth: AppMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, gap: 12 },
  attachmentImage: { width: 64, height: 64, borderRadius: 4, backgroundColor: SteamColors.canvasRaised },
  attachmentCopy: { flex: 1, minWidth: 0, gap: 4 },
  attachmentTitle: { color: SteamColors.text, fontSize: 14 },
  attachmentHint: { color: SteamColors.muted, fontSize: 12 },
  composerError: { width: '100%', maxWidth: AppMaxWidth, alignSelf: 'center', color: SteamColors.error, paddingHorizontal: 16, paddingTop: 10, fontSize: 13, lineHeight: 18 },
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
