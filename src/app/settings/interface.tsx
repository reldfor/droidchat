import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SettingsLinkRow,
  SettingsToggleRow,
} from '@/components/settings/settings-rows';
import { SettingsSelect } from '@/components/settings/settings-select';
import {
  SettingsOptionSheet,
  type SettingsOption,
} from '@/components/settings/settings-sheet';
import { ScreenHeader } from '@/components/steam/screen-header';
import { SettingsColors } from '@/constants/settings-theme';
import { AppMaxWidth } from '@/constants/steam-theme';
import { useSettings } from '@/context/settings';
import type {
  ChatFilterPreference,
  DefaultTab,
  LanguagePreference,
} from '@/lib/settings';

type OpenPicker = 'chatFilter' | 'defaultTab' | 'language' | null;

const LANGUAGE_OPTIONS: readonly SettingsOption<LanguagePreference>[] = [
  { value: 'en', label: 'English (English)' },
];

const LANGUAGE_LABELS: Record<LanguagePreference, string> = {
  en: 'English (English)',
};

const DEFAULT_TAB_OPTIONS: readonly SettingsOption<DefaultTab>[] = [
  { value: 'chats', label: 'Chats' },
  { value: 'friends', label: 'Friends' },
  { value: 'groups', label: 'Groups' },
];

const DEFAULT_TAB_LABELS: Record<DefaultTab, string> = {
  chats: 'Chats',
  friends: 'Friends',
  groups: 'Groups',
};

const CHAT_FILTER_OPTIONS: readonly SettingsOption<ChatFilterPreference>[] = [
  {
    value: 'friends',
    label: 'Everyone except friends',
    description: 'Filter strong profanity and slurs from everyone except friends.',
  },
  {
    value: 'everyone',
    label: 'Everyone',
    description: 'Filter strong profanity and slurs from everyone, including friends.',
  },
  {
    value: 'nobody',
    label: 'Nobody',
    description: 'Do not filter strong profanity and slurs.',
  },
];

const CHAT_FILTER_SUMMARIES: Record<ChatFilterPreference, string> = {
  friends:
    'Currently set to filter strong profanity and slurs from everyone except friends',
  everyone: 'Currently set to filter strong profanity and slurs from everyone',
  nobody: 'Currently set to not filter strong profanity and slurs',
};

export default function InterfaceSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useSettings();
  const [openPicker, setOpenPicker] = useState<OpenPicker>(null);
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/settings');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        backLabel="Go back"
        onBack={handleBack}
        title="Interface"
        tone="canvas"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <View style={styles.content}>
          <SettingsToggleRow
            description="Display nicknames after friends' names instead of replacing them completely"
            label="Append nicknames to friends' names"
            onChange={(value) => updateSettings({ appendNicknames: value })}
            value={settings.appendNicknames}
          />

          <SettingsToggleRow
            label="Hide offline friends in custom categories"
            onChange={(value) => updateSettings({ hideOfflineCustomCategories: value })}
            value={settings.hideOfflineCustomCategories}
          />

          <SettingsToggleRow
            label="Hide categorized friends in Online/Offline Friends"
            onChange={(value) => updateSettings({ hideCategorizedFriends: value })}
            value={settings.hideCategorizedFriends}
          />

          <SettingsToggleRow
            label="Ignore 'Away' status when sorting friends"
            onChange={(value) => updateSettings({ ignoreAwayStatus: value })}
            value={settings.ignoreAwayStatus}
          />

          <SettingsToggleRow
            label="Don't embed images and other media in-line"
            onChange={(value) => updateSettings({ disableMediaEmbedding: value })}
            value={settings.disableMediaEmbedding}
          />

          <SettingsToggleRow
            label="Disable animated room effects"
            onChange={(value) => updateSettings({ disableRoomEffects: value })}
            value={settings.disableRoomEffects}
          />

          <SettingsToggleRow
            label="Only embed images and other media when on wifi"
            onChange={(value) => updateSettings({ mediaOnWifiOnly: value })}
            value={settings.mediaOnWifiOnly}
          />

          <SettingsToggleRow
            description="Images you capture within the app will be saved to your device's camera roll."
            label="Save image captures"
            onChange={(value) => updateSettings({ saveImageCaptures: value })}
            value={settings.saveImageCaptures}
          />

          <SettingsLinkRow
            description={CHAT_FILTER_SUMMARIES[settings.chatFilter]}
            onPress={() => setOpenPicker('chatFilter')}
            title="Change chat filtering preferences"
          />

          <View style={[styles.selectSection, { paddingBottom: insets.bottom + 28 }]}>
            <SettingsSelect
              label="Language"
              onPress={() => setOpenPicker('language')}
              valueLabel={LANGUAGE_LABELS[settings.language]}
            />

            <SettingsSelect
              label="Default Tab"
              onPress={() => setOpenPicker('defaultTab')}
              valueLabel={DEFAULT_TAB_LABELS[settings.defaultTab]}
            />
          </View>
        </View>
      </ScrollView>

      <SettingsOptionSheet
        note="English is the only language available in this build."
        onClose={() => setOpenPicker(null)}
        onSelect={(value) => updateSettings({ language: value })}
        options={LANGUAGE_OPTIONS}
        selected={settings.language}
        title="Language"
        visible={openPicker === 'language'}
      />

      <SettingsOptionSheet
        note="Applied the next time droiddeck opens."
        onClose={() => setOpenPicker(null)}
        onSelect={(value) => updateSettings({ defaultTab: value })}
        options={DEFAULT_TAB_OPTIONS}
        selected={settings.defaultTab}
        title="Default Tab"
        visible={openPicker === 'defaultTab'}
      />

      <SettingsOptionSheet
        note="Chat filtering is stored on this device. Message text is not filtered in this build."
        onClose={() => setOpenPicker(null)}
        onSelect={(value) => updateSettings({ chatFilter: value })}
        options={CHAT_FILTER_OPTIONS}
        selected={settings.chatFilter}
        title="Chat Filtering"
        visible={openPicker === 'chatFilter'}
      />
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
  scrollContent: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
  },
  content: {
    width: '100%',
  },
  selectSection: {
    gap: 18,
    paddingTop: 18,
    paddingHorizontal: 18,
  },
});
