import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';

type FriendSectionHeaderProps = {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
};

export function FriendSectionHeader({
  title,
  count,
  collapsed,
  onToggle,
}: FriendSectionHeaderProps) {
  return (
    <Pressable
      accessibilityLabel={`${title}, ${count} ${count === 1 ? 'friend' : 'friends'}`}
      accessibilityRole="button"
      accessibilityState={{ expanded: !collapsed }}
      onPress={onToggle}
      style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
      <Text style={styles.title}>
        {title} <Text style={styles.count}>({count})</Text>
      </Text>

      <SymbolView
        name={
          collapsed
            ? { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
            : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
        }
        size={18}
        tintColor={SteamColors.iconMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.62,
  },
  title: {
    color: SteamColors.sectionTitle,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.1,
  },
  count: {
    color: SteamColors.muted,
    fontSize: 17,
    lineHeight: 22,
  },
});
