import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/steam/screen-header';
import { SettingsColors } from '@/constants/settings-theme';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { useSession } from '@/context/session';
import { useSteamChat } from '@/context/steam-chat';
import { readChatCache } from '@/lib/steam/chat-cache-storage';
import {
  combineChatCacheUsage,
  EMPTY_CHAT_CACHE_USAGE,
  formatChatCacheSize,
  measureChatCache,
  type ChatCacheUsage,
} from '@/lib/steam/chat-cache-usage';

type LoadState = 'loading' | 'ready' | 'clearing';

function plural(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

async function readUsage(steamIds: readonly string[]): Promise<ChatCacheUsage> {
  const caches = await Promise.all(steamIds.map((steamId) => readChatCache(steamId)));
  const measured: ChatCacheUsage[] = [];

  for (const cache of caches) {
    if (cache) {
      measured.push(measureChatCache(cache));
    }
  }

  return combineChatCacheUsage(measured);
}

type UsageRowProps = {
  label: string;
  meta: string;
  value: string;
};

function UsageRow({ label, meta, value }: UsageRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}. ${meta}`}
      style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>

      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function StorageUsageScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { accounts } = useSession();
  const { clearCache } = useSteamChat();
  const [usage, setUsage] = useState<ChatCacheUsage>(EMPTY_CHAT_CACHE_USAGE);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [cleared, setCleared] = useState(false);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/settings');
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoadState('loading');
      setCleared(false);

      void readUsage(accounts.map((account) => account.steamId))
        .then((next) => {
          if (!active) {
            return;
          }

          setUsage(next);
          setLoadState('ready');
        })
        .catch(() => {
          if (!active) {
            return;
          }

          setUsage(EMPTY_CHAT_CACHE_USAGE);
          setLoadState('ready');
        });

      return () => {
        active = false;
      };
    }, [accounts]),
  );

  const handleClear = () => {
    if (loadState !== 'ready' || usage.totalBytes === 0) {
      return;
    }

    setLoadState('clearing');
    setCleared(false);

    void clearCache()
      // Read again so the screen reflects a failed delete or a write that was
      // queued at the same moment.
      .then(() => readUsage(accounts.map((account) => account.steamId)))
      .then((next) => {
        setUsage(next);
        setCleared(true);
      })
      .catch(() => {
        setCleared(true);
      })
      .finally(() => {
        setLoadState('ready');
      });
  };

  const clearDisabled = loadState !== 'ready' || usage.totalBytes === 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader
        backLabel="Go back"
        onBack={handleBack}
        title="Storage Usage"
        tone="canvas"
      />

      {loadState === 'loading' ? (
        <View style={styles.loading}>
          <ActivityIndicator color={SteamColors.muted} size="small" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Cached data</Text>
            <Text style={styles.summaryValue}>{formatChatCacheSize(usage.totalBytes)}</Text>
            <Text style={styles.summaryHint}>
              {accounts.length > 1
                ? `Across ${plural(accounts.length, 'saved account')} on this device`
                : 'Stored on this device'}
            </Text>
          </View>

          <View>
            <UsageRow
              label="Friends list"
              meta={
                usage.friendCount === 0
                  ? 'No friends cached'
                  : plural(usage.friendCount, 'friend')
              }
              value={formatChatCacheSize(usage.friendsBytes)}
            />
            <UsageRow
              label="Chat history"
              meta={
                usage.conversationCount === 0
                  ? 'No chats cached'
                  : `${plural(usage.conversationCount, 'chat')} · ${plural(usage.chatMessageCount, 'message')}`
              }
              value={formatChatCacheSize(usage.chatBytes)}
            />
            <UsageRow
              label="Groups"
              meta={
                usage.groupCount === 0
                  ? 'No groups cached'
                  : `${plural(usage.groupCount, 'group')} · ${plural(usage.groupMessageCount, 'message')}`
              }
              value={formatChatCacheSize(usage.groupsBytes)}
            />
          </View>

          <Text style={styles.note}>
            Cached data lets droiddeck show your friends and recent messages before Steam
            connects. Clearing it does not delete anything from Steam.
          </Text>

          <Pressable
            accessibilityLabel="Clear cache"
            accessibilityRole="button"
            accessibilityState={{ busy: loadState === 'clearing', disabled: clearDisabled }}
            android_ripple={{ color: 'rgba(226, 128, 125, 0.16)' }}
            disabled={clearDisabled}
            onPress={handleClear}
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.clearButtonPressed,
              clearDisabled && styles.clearButtonDisabled,
            ]}>
            {loadState === 'clearing' ? (
              <ActivityIndicator color={SteamColors.error} size="small" />
            ) : (
              <Text style={styles.clearLabel}>Clear cache</Text>
            )}
          </Pressable>

          {cleared ? (
            <Text accessibilityLiveRegion="polite" style={styles.cleared}>
              Cache cleared. droiddeck will cache new data as you use it.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SettingsColors.body,
  },
  scroll: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SettingsColors.separator,
  },
  summaryLabel: {
    color: SteamColors.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  summaryValue: {
    marginTop: 6,
    color: SteamColors.textStrong,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '600',
    letterSpacing: 0.2,
    fontVariant: ['tabular-nums'],
  },
  summaryHint: {
    marginTop: 4,
    color: SteamColors.muted,
    fontSize: 13.5,
    lineHeight: 18,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SettingsColors.separator,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    color: SteamColors.text,
    fontSize: 16.5,
    lineHeight: 22,
    letterSpacing: 0.05,
  },
  rowMeta: {
    marginTop: 2,
    color: SteamColors.muted,
    fontSize: 13.5,
    lineHeight: 18,
  },
  rowValue: {
    color: SteamColors.text,
    fontSize: 15.5,
    lineHeight: 21,
    fontVariant: ['tabular-nums'],
  },
  note: {
    marginTop: 18,
    paddingHorizontal: 18,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  clearButton: {
    height: 48,
    marginTop: 22,
    marginHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(226, 128, 125, 0.38)',
    backgroundColor: 'rgba(226, 128, 125, 0.08)',
  },
  clearButtonPressed: {
    backgroundColor: 'rgba(226, 128, 125, 0.16)',
  },
  clearButtonDisabled: {
    opacity: 0.45,
  },
  clearLabel: {
    color: SteamColors.error,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  cleared: {
    marginTop: 12,
    paddingHorizontal: 18,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
