import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SteamColors } from '@/constants/steam-theme';
import { useSession } from '@/context/session';
import { SteamMark } from './steam-mark';

type AccountDrawerProps = {
  visible: boolean;
  onClose: () => void;
};

const navItems = [
  {
    href: '/friends' as const,
    label: 'Friends',
    icon: { ios: 'person.fill', android: 'person', web: 'person' } as const,
  },
  {
    href: '/chats' as const,
    label: 'Chats',
    icon: { ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' } as const,
  },
  {
    href: '/groups' as const,
    label: 'Groups',
    icon: { ios: 'person.3.fill', android: 'groups', web: 'groups' } as const,
  },
];

export function AccountDrawer({ visible, onClose }: AccountDrawerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { accountName, signOut } = useSession();

  const panelWidth = Math.min(320, width * 0.84);

  const handleNavigate = (href: '/friends' | '/chats' | '/groups') => {
    onClose();
    router.navigate(href);
  };

  const handleSignOut = () => {
    onClose();
    signOut();
    router.replace('/');
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View
          accessibilityLabel="Main menu"
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 16,
            },
          ]}>
          <View style={styles.brandRow}>
            <View style={styles.brandIdentity}>
              <SteamMark size={34} />
              <Text style={styles.brand}>droiddeck</Text>
            </View>

            <Pressable
              accessibilityLabel="Close menu"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={19}
                tintColor={SteamColors.iconMuted}
              />
            </Pressable>
          </View>

          <View style={styles.accountCard}>
            <Text style={styles.accountLabel}>SIGNED IN AS</Text>
            <Text numberOfLines={1} style={styles.accountName}>
              {accountName ?? 'Steam user'}
            </Text>
            <View style={styles.sessionRow}>
              <View style={styles.sessionDot} />
              <Text style={styles.sessionLabel}>Steam account</Text>
            </View>
          </View>

          <View style={styles.navGroup}>
            {navItems.map((item) => {
              const active = pathname === item.href;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={item.href}
                  onPress={() => handleNavigate(item.href)}
                  style={({ pressed }) => [
                    styles.navItem,
                    active && styles.navItemActive,
                    pressed && styles.pressed,
                  ]}>
                  <SymbolView
                    name={item.icon}
                    size={20}
                    tintColor={active ? SteamColors.textStrong : SteamColors.iconMuted}
                  />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.spacer} />

          <View style={styles.divider} />

          <Pressable
            accessibilityRole="button"
            onPress={handleSignOut}
            style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
            <SymbolView
              name={{
                ios: 'rectangle.portrait.and.arrow.right',
                android: 'logout',
                web: 'logout',
              }}
              size={20}
              tintColor={SteamColors.iconMuted}
            />
            <Text style={styles.signOutLabel}>Sign out</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.footerTitle}>droiddeck</Text>
            <Text style={styles.footerBody}>Steam Chat client</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: SteamColors.overlay,
  },
  panel: {
    height: '100%',
    paddingHorizontal: 18,
    backgroundColor: SteamColors.chrome,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: SteamColors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 5, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 18,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brand: {
    color: SteamColors.text,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  pressed: {
    opacity: 0.64,
  },
  accountCard: {
    marginTop: 26,
    padding: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#30333A',
    backgroundColor: SteamColors.canvas,
  },
  accountLabel: {
    color: SteamColors.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.35,
  },
  accountName: {
    marginTop: 6,
    color: SteamColors.textStrong,
    fontSize: 19,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  sessionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SteamColors.onlineDot,
  },
  sessionLabel: {
    color: SteamColors.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  navGroup: {
    marginTop: 22,
    gap: 2,
  },
  navItem: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 12,
    borderRadius: 3,
  },
  navItemActive: {
    backgroundColor: '#343840',
  },
  navLabel: {
    color: SteamColors.offlineName,
    fontSize: 15,
    lineHeight: 20,
  },
  navLabelActive: {
    color: SteamColors.textStrong,
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#33363D',
    marginBottom: 6,
  },
  signOut: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 12,
    borderRadius: 3,
  },
  signOutLabel: {
    color: SteamColors.offlineName,
    fontSize: 15,
  },
  footer: {
    marginTop: 18,
    paddingHorizontal: 12,
  },
  footerTitle: {
    color: SteamColors.muted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  footerBody: {
    marginTop: 3,
    color: '#6D747D',
    fontSize: 11.5,
    lineHeight: 16,
  },
});
