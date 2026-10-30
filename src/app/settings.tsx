import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsRow } from '@/components/settings/settings-rows';
import { SettingsSheet } from '@/components/settings/settings-sheet';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SettingsColors } from '@/constants/settings-theme';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';

type OpenSheet = 'information' | 'notifications' | null;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openSheet, setOpenSheet] = useState<OpenSheet>(null);
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/friends');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        backLabel="Go back"
        onBack={handleBack}
        title="Settings"
        tone="canvas"
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <View style={styles.list}>
          <SettingsRow
            icon={{ ios: 'list.bullet.rectangle', android: 'view_list', web: 'view_list' }}
            label="Interface"
            onPress={() => router.push('/settings/interface')}
          />
          <SettingsRow
            icon={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
            label="Push Notifications"
            onPress={() => setOpenSheet('notifications')}
          />
          <SettingsRow
            icon={{ ios: 'internaldrive.fill', android: 'storage', web: 'storage' }}
            label="Storage"
            onPress={() => router.push('/settings/storage')}
          />
          <SettingsRow
            icon={{ ios: 'info.circle.fill', android: 'info', web: 'info' }}
            label="Information"
            onPress={() => setOpenSheet('information')}
          />
        </View>

        <Text accessibilityLabel={`Version ${appVersion}`} style={styles.version}>
          {appVersion}
        </Text>
      </ScrollView>

      <SettingsSheet
        onClose={() => setOpenSheet(null)}
        title="Push Notifications"
        visible={openSheet === 'notifications'}>
        <Text style={styles.sheetBody}>
          Push notifications are not connected in this build. New messages appear while droiddeck
          is open and connected to Steam.
        </Text>
        <Text style={styles.sheetNote}>
          Delivery in the background needs a signed release build with Firebase configured.
        </Text>
      </SettingsSheet>

      <SettingsSheet
        onClose={() => setOpenSheet(null)}
        title="Information"
        visible={openSheet === 'information'}>
        <Text style={styles.sheetTitle}>droiddeck</Text>
        <Text style={styles.sheetVersion}>Version {appVersion}</Text>
        <Text style={styles.sheetBody}>
          An alternative Steam Chat client. Messages are sent directly to Steam, and your sign-in
          stays in this device&apos;s secure storage.
        </Text>
      </SettingsSheet>
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
  list: {
    width: '100%',
  },
  version: {
    marginTop: 22,
    color: SettingsColors.version,
    fontSize: 14,
    lineHeight: 19,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  sheetTitle: {
    color: SteamColors.textStrong,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '500',
  },
  sheetVersion: {
    marginTop: 3,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  sheetBody: {
    marginTop: 14,
    color: SteamColors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  sheetNote: {
    marginTop: 10,
    color: SteamColors.muted,
    fontSize: 12.5,
    lineHeight: 18,
  },
});
