import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsColors } from '@/constants/settings-theme';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';

type SettingsSheetProps = {
  children: ReactNode;
  onClose: () => void;
  title: string;
  visible: boolean;
};

export function SettingsSheet({ children, onClose, title, visible }: SettingsSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grabber} />

          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>

            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={6}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={19}
                tintColor={SteamColors.iconMuted}
              />
            </Pressable>
          </View>

          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: SteamColors.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    paddingTop: 8,
    paddingHorizontal: 18,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: '#343841',
    backgroundColor: SteamColors.chromeDeep,
  },
  grabber: {
    width: 36,
    height: 4,
    alignSelf: 'center',
    marginBottom: 12,
    borderRadius: 2,
    backgroundColor: '#4A4E57',
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
    color: SteamColors.textStrong,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    marginTop: 14,
  },
  option: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SettingsColors.separator,
  },
  optionActive: {
    backgroundColor: '#2C3037',
  },
  optionPressed: {
    backgroundColor: SettingsColors.rowPressed,
  },
  optionCopy: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    color: SteamColors.text,
    fontSize: 16,
    lineHeight: 21,
  },
  optionLabelActive: {
    color: SteamColors.textStrong,
    fontWeight: '500',
  },
  optionDescription: {
    marginTop: 2,
    color: SteamColors.muted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  note: {
    marginTop: 14,
    color: SteamColors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
});

export type SettingsOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type SettingsOptionSheetProps<T extends string> = {
  note?: string;
  onClose: () => void;
  onSelect: (value: T) => void;
  options: readonly SettingsOption<T>[];
  selected: T;
  title: string;
  visible: boolean;
};

export function SettingsOptionSheet<T extends string>({
  note,
  onClose,
  onSelect,
  options,
  selected,
  title,
  visible,
}: SettingsOptionSheetProps<T>) {
  return (
    <SettingsSheet onClose={onClose} title={title} visible={visible}>
      {options.map((option) => {
        const active = option.value === selected;

        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            key={option.value}
            onPress={() => {
              onSelect(option.value);
              onClose();
            }}
            style={({ pressed }) => [
              styles.option,
              active && styles.optionActive,
              pressed && styles.optionPressed,
            ]}>
            <View style={styles.optionCopy}>
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>
                {option.label}
              </Text>
              {option.description ? (
                <Text style={styles.optionDescription}>{option.description}</Text>
              ) : null}
            </View>

            {active ? (
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={20}
                tintColor={SteamColors.accent}
              />
            ) : null}
          </Pressable>
        );
      })}

      {note ? <Text style={styles.note}>{note}</Text> : null}
    </SettingsSheet>
  );
}
