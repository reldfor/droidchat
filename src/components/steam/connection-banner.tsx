import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';
import type { SteamCmConnectionState } from '@/lib/steam/cm-client';

type ConnectionBannerProps = {
  authError?: number | null;
  connection: SteamCmConnectionState;
  loggedOn: boolean;
  onRetry?: () => void;
};

export function ConnectionBanner({
  authError,
  connection,
  loggedOn,
  onRetry,
}: ConnectionBannerProps) {
  if (authError && !loggedOn) {
    return (
      <View style={[styles.banner, styles.bannerError]}>
        <SymbolView
          name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }}
          size={16}
          tintColor={SteamColors.error}
        />
        <Text style={[styles.text, styles.textError]}>
          Steam refused the chat connection. You are still signed in.
        </Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onRetry}
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (connection === 'connected' && loggedOn) {
    return null;
  }

  const label =
    connection === 'connected'
      ? 'Signing in to Steam…'
      : connection === 'connecting'
        ? 'Connecting to Steam…'
        : 'Reconnecting to Steam…';

  return (
    <View style={styles.banner}>
      <ActivityIndicator color={SteamColors.muted} size="small" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
  text: {
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  textError: {
    flexShrink: 1,
    color: SteamColors.error,
  },
  retry: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 3,
    backgroundColor: SteamColors.accentDeep,
  },
  retryPressed: {
    backgroundColor: SteamColors.accentPressed,
  },
  retryText: {
    color: SteamColors.textStrong,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
