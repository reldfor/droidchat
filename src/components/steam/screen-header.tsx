import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeaderHeight, AppMaxWidth, SteamColors } from '@/constants/steam-theme';

type ScreenHeaderProps = {
  backLabel?: string;
  onBack: () => void;
  title: string;
};

export function ScreenHeader({ backLabel = 'Go back', onBack, title }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.shell}>
      <View style={{ height: insets.top }} />

      <View style={styles.row}>
        <Pressable
          accessibilityLabel={backLabel}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back_ios_new', web: 'arrow_back_ios_new' }}
            size={22}
            tintColor={SteamColors.icon}
          />
        </Pressable>

        <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </Text>

        <View style={styles.actionSpacer} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: SteamColors.chrome,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SteamColors.border,
    zIndex: 10,
  },
  row: {
    width: '100%',
    maxWidth: AppMaxWidth,
    height: AppHeaderHeight,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
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
  title: {
    flex: 1,
    color: SteamColors.text,
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 2,
    lineHeight: 24,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  actionSpacer: {
    width: 44,
    height: 44,
  },
});
