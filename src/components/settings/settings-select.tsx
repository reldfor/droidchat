import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SettingsColors } from '@/constants/settings-theme';
import { SteamColors } from '@/constants/steam-theme';

type SettingsSelectProps = {
  label: string;
  onPress: () => void;
  valueLabel: string;
};

export function SettingsSelect({ label, onPress, valueLabel }: SettingsSelectProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityLabel={`${label}, ${valueLabel}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}>
        <Text numberOfLines={1} style={styles.value}>
          {valueLabel}
        </Text>

        <SymbolView
          name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
          size={20}
          tintColor={SteamColors.iconMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 8,
    color: SteamColors.text,
    fontSize: 15.5,
    lineHeight: 21,
    letterSpacing: 0.05,
  },
  field: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: SettingsColors.fieldBorder,
    backgroundColor: SettingsColors.field,
  },
  fieldPressed: {
    backgroundColor: SettingsColors.fieldPressed,
  },
  value: {
    flex: 1,
    color: SteamColors.text,
    fontSize: 16.5,
    lineHeight: 22,
    letterSpacing: 0.05,
  },
});
