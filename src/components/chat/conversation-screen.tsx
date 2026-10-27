import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
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

import { ImageViewer } from '@/components/chat/image-viewer';
import { MessageBubble } from '@/components/chat/message-bubble';
import { DemoNotice } from '@/components/steam/demo-notice';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import type { ChatMessage, OutgoingMessage } from '@/data/messages';
import { useDemoNotice } from '@/hooks/use-demo-notice';

type ConversationScreenProps = {
  avatar: ReactNode;
  emptyMessage: string;
  messages: ChatMessage[];
  onAddPeople?: () => void;
  onBack: () => void;
  onSendMessage: (message: OutgoingMessage) => void;
  subtitle: string;
  title: string;
};

export function ConversationScreen({
  avatar,
  emptyMessage,
  messages,
  onAddPeople,
  onBack,
  onSendMessage,
  subtitle,
  title,
}: ConversationScreenProps) {
  const insets = useSafeAreaInsets();
  const { message, showNotice } = useDemoNotice();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState('');
  const [pickingImage, setPickingImage] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [messages.length]);

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

    if (!text) {
      return;
    }

    onSendMessage({ kind: 'text', text });
    setDraft('');
  };

  const handleOpenImage = (uri: string) => {
    Keyboard.dismiss();
    setViewerImage(uri);
  };

  const handlePickImage = async () => {
    if (pickingImage) {
      return;
    }

    setPickingImage(true);
    Keyboard.dismiss();

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.85,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      onSendMessage({
        kind: 'image',
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
    } catch {
      showNotice('Could not open your photo library. Please try again.');
    } finally {
      setPickingImage(false);
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
            {avatar}

            <View style={styles.titleCopy}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.title}>
                  {title}
                </Text>
                <SymbolView
                  name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                  size={13}
                  tintColor={SteamColors.iconMuted}
                />
              </View>
              <Text numberOfLines={1} style={styles.subtitle}>
                {subtitle}
              </Text>
            </View>
          </View>

          {onAddPeople ? (
            <Pressable
              accessibilityLabel="Add people to chat"
              accessibilityRole="button"
              hitSlop={6}
              onPress={onAddPeople}
              style={({ pressed }) => [
                styles.iconButton,
                styles.addButton,
                pressed && styles.iconButtonPressed,
              ]}>
              <SymbolView
                name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
                size={23}
                tintColor={SteamColors.icon}
              />
            </Pressable>
          ) : (
            <View style={styles.actionSpacer} />
          )}
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={
          Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
        }
        style={styles.body}>
        {messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>{emptyMessage}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            contentContainerStyle={styles.messagesContent}
            data={messages}
            keyExtractor={(item) => item.id}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => (
              <MessageBubble message={item} onOpenImage={handleOpenImage} />
            )}
            showsVerticalScrollIndicator={false}
            style={styles.messagesList}
          />
        )}

        <View style={styles.composer}>
          <View style={[styles.composerRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <Pressable
              accessibilityLabel="Send a photo"
              accessibilityRole="button"
              accessibilityState={{ disabled: pickingImage }}
              disabled={pickingImage}
              hitSlop={4}
              onPress={handlePickImage}
              style={({ pressed }) => [
                styles.photoButton,
                pickingImage && styles.pressed,
                pressed && styles.pressed,
              ]}>
              <SymbolView
                name={{ ios: 'photo', android: 'image', web: 'image' }}
                size={23}
                tintColor={SteamColors.icon}
              />
            </Pressable>

            <View style={styles.inputShell}>
              <TextInput
                accessibilityLabel="Message"
                autoCapitalize="sentences"
                onChangeText={setDraft}
                onSubmitEditing={handleSend}
                placeholder="Message"
                placeholderTextColor={SteamColors.muted}
                returnKeyType="send"
                selectionColor={SteamColors.accent}
                style={styles.input}
                underlineColorAndroid="transparent"
                value={draft}
              />
              <Pressable
                accessibilityLabel="Open emoji picker"
                accessibilityRole="button"
                hitSlop={4}
                onPress={() => showNotice('Emoji picking is not connected in this demo.')}
                style={({ pressed }) => [styles.emojiButton, pressed && styles.pressed]}>
                <SymbolView
                  name={{ ios: 'face.smiling', android: 'mood', web: 'mood' }}
                  size={23}
                  tintColor={SteamColors.iconMuted}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityLabel="Send message"
              accessibilityRole="button"
              onPress={handleSend}
              style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
              <SymbolView
                name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                size={22}
                tintColor="#EFF6FC"
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <DemoNotice bottom={insets.bottom + 70} message={message} />

      <ImageViewer imageUri={viewerImage} onClose={() => setViewerImage(null)} />
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
  addButton: {
    marginLeft: 2,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  title: {
    flexShrink: 1,
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
  photoButton: {
    width: 38,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputShell: {
    flex: 1,
    minWidth: 0,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 4,
    backgroundColor: SteamColors.canvasRaised,
    paddingLeft: 14,
    paddingRight: 2,
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
  emojiButton: {
    width: 42,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  pressed: {
    opacity: 0.6,
  },
});
