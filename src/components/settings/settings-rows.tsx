import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsColors } from '@/constants/settings-theme';
import { SteamColors } from '@/constants/steam-theme';

const chevronIcon = {
  ios: 'chevron.right',
  android: 'chevron_right',
  web: 'chevron_right',
} as const;

type SettingsRowProps = {
  icon: SymbolViewProps['name'];
  label: string;
  onPress: () => void;
  showChevron?: boolean;
};

export function SettingsRow({
  icon,
  label,
  onPress,
  showChevron = true,
}: SettingsRowProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: SettingsColors.rowPressed }}
      onPress={onPress}
      style={({ pressed }) => [styles.navRow, pressed && styles.rowPressed]}>
      <View style={styles.iconTile}>
        <SymbolView name={icon} size={20} tintColor={SteamColors.textStrong} />
      </View>

      <Text numberOfLines={1} style={styles.navLabel}>
        {label}
      </Text>

      {showChevron ? (
        <SymbolView name={chevronIcon} size={20} tintColor={SettingsColors.chevron} />
      ) : null}
    </Pressable>
  );
}

type SettingsToggleRowProps = {
  description?: string;
  label: string;
  onChange: (value: boolean) => void;
  value: boolean;
};

export function SettingsToggleRow({
  description,
  label,
  onChange,
  value,
}: SettingsToggleRowProps) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      android_ripple={{ color: SettingsColors.rowPressed }}
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.rowPressed]}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? <Text style={styles.toggleDescription}>{description}</Text> : null}
      </View>

      <View
        accessible={false}
        pointerEvents="none"
        style={[styles.switchTrack, value && styles.switchTrackOn]}>
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </View>
    </Pressable>
  );
}

type SettingsLinkRowProps = {
  description: string;
  onPress: () => void;
  title: string;
};

export function SettingsLinkRow({ description, onPress, title }: SettingsLinkRowProps) {
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={title}
      accessibilityRole="button"
      android_ripple={{ color: SettingsColors.rowPressed }}
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]}>
      <Text style={styles.linkTitle}>{title}</Text>
      <Text style={styles.linkDescription}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navRow: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SettingsColors.separator,
  },
  rowPressed: {
    backgroundColor: SettingsColors.rowPressed,
  },
  iconTile: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: SettingsColors.iconTile,
  },
  navLabel: {
    flex: 1,
    color: SteamColors.text,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  toggleRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SettingsColors.separator,
  },
  toggleCopy: {
    flex: 1,
    minWidth: 0,
  },
  toggleLabel: {
    color: SteamColors.text,
    fontSize: 16.5,
    lineHeight: 22,
    letterSpacing: 0.05,
  },
  toggleDescription: {
    marginTop: 2,
    color: SteamColors.muted,
    fontSize: 13.5,
    lineHeight: 18,
  },
  switchTrack: {
    width: 46,
    height: 26,
    justifyContent: 'center',
    padding: 3,
    borderRadius: 13,
    backgroundColor: SettingsColors.switchOff,
  },
  switchTrackOn: {
    backgroundColor: SettingsColors.switchOn,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: SteamColors.textStrong,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.28,
    shadowRadius: 2,
    elevation: 2,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  linkRow: {
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SettingsColors.separator,
  },
  linkTitle: {
    color: SettingsColors.link,
    fontSize: 16.5,
    lineHeight: 22,
    letterSpacing: 0.05,
  },
  linkDescription: {
    marginTop: 2,
    color: SteamColors.muted,
    fontSize: 13.5,
    lineHeight: 18,
  },
});
