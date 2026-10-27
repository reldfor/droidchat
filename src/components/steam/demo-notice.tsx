import { StyleSheet, Text, View } from 'react-native';

import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';

type DemoNoticeProps = {
  bottom?: number;
  message: string | null;
};

export function DemoNotice({ bottom = 14, message }: DemoNoticeProps) {
  if (!message) {
    return null;
  }

  return (
    <View pointerEvents="none" style={[styles.positioner, { bottom }]}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={styles.toast}>
        <View style={styles.accent} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  toast: {
    width: '100%',
    maxWidth: AppMaxWidth,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: SteamColors.toastBorder,
    backgroundColor: SteamColors.toast,
    overflow: 'hidden',
  },
  accent: {
    alignSelf: 'stretch',
    width: 2,
    backgroundColor: SteamColors.accent,
  },
  text: {
    flex: 1,
    color: SteamColors.text,
    fontSize: 13.5,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
});
