import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SteamColors } from '@/constants/steam-theme';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

type EmptyTabViewProps = {
  icon: SymbolName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  footnote?: string;
};

export function EmptyTabView({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  footnote,
}: EmptyTabViewProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconHalo}>
        <SymbolView name={icon} size={38} tintColor={SteamColors.iconMuted} />
      </View>

      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.description}>{description}</Text>

      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}

      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    paddingBottom: 44,
  },
  iconHalo: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 44,
    borderWidth: 1,
    borderColor: '#32363D',
    backgroundColor: SteamColors.canvasRaised,
  },
  title: {
    marginTop: 22,
    color: SteamColors.textStrong,
    fontSize: 21,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  description: {
    marginTop: 9,
    maxWidth: 360,
    color: SteamColors.muted,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
  },
  button: {
    minHeight: 44,
    marginTop: 24,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: SteamColors.accentDeep,
  },
  buttonPressed: {
    backgroundColor: SteamColors.accentPressed,
  },
  buttonText: {
    color: SteamColors.textStrong,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  footnote: {
    marginTop: 28,
    color: '#6E767F',
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
