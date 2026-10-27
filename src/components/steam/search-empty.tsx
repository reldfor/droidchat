import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type SearchEmptyProps = {
  icon: SymbolName;
  title: string;
  message: string;
};

export function SearchEmpty({ icon, title, message }: SearchEmptyProps) {
  return (
    <View style={styles.container}>
      <SymbolView name={icon} size={32} tintColor="#5F6670" />
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    paddingTop: 80,
    paddingBottom: 80,
  },
  title: {
    marginTop: 14,
    color: SteamColors.text,
    fontSize: 18,
    fontWeight: '500',
  },
  message: {
    marginTop: 7,
    maxWidth: 320,
    color: SteamColors.muted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
