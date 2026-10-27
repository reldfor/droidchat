import { SymbolView } from 'expo-symbols';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';

type SteamMarkProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function SteamMark({ size = 36, style }: SteamMarkProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}>
      <SymbolView
        name={{ ios: 'gamecontroller.fill', android: 'sports_esports', web: 'sports_esports' }}
        size={Math.round(size * 0.56)}
        tintColor={SteamColors.text}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SteamColors.chromeDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#3B3F47',
  },
});
