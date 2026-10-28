import { SymbolView } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { SteamColors } from '@/constants/steam-theme';
import { useSession } from '@/context/session';
import { useSteamChat } from '@/context/steam-chat';
import { accountDisplayName } from '@/lib/steam/accounts';
import { AccountsPanel } from './accounts-panel';
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
];

export function AccountDrawer({ visible, onClose }: AccountDrawerProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const { accountName, accounts, activeAccount, signOut } = useSession();
  const { personaName, connection, loggedOn } = useSteamChat();
  const [view, setView] = useState<'menu' | 'accounts'>('menu');

  const handleClose = () => {
    setView('menu');
    onClose();
  };

  const panelWidth = Math.min(320, width * 0.84);
  const connected = connection === 'connected' && loggedOn;
  const connectionLabel = connected
    ? 'Connected to Steam'
    : connection === 'connected'
      ? 'Signing in…'
      : connection === 'connecting'
        ? 'Connecting…'
        : 'Reconnecting…';
  const displayName = activeAccount
    ? accountDisplayName(activeAccount)
    : (personaName ?? accountName ?? 'Steam user');
  const accountHandle =
    activeAccount && displayName !== activeAccount.accountName
      ? activeAccount.accountName
      : null;
  const accountActionLabel = accounts.length > 1 ? 'SWITCH' : 'ADD ACCOUNT';

  const handleNavigate = (href: '/friends' | '/chats') => {
    handleClose();
    router.navigate(href);
  };

  const handleSignOut = () => {
    handleClose();
    signOut();

    if (accounts.length > 1) {
      router.navigate('/friends');
      return;
    }

    router.replace('/');
  };

  const handleAddAccount = () => {
    handleClose();
    router.push('/add-account');
  };

  const handleAccountPress = () => {
    if (accounts.length > 1) {
      setView('accounts');
      return;
    }

    // With a single saved account there is nothing to switch between, so the
    // card's "ADD ACCOUNT" action goes straight to the sign-in flow.
    handleAddAccount();
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          onPress={handleClose}
          style={StyleSheet.absoluteFill}
        />

        <View
          accessibilityLabel={view === 'accounts' ? 'Steam accounts' : 'Main menu'}
          accessibilityViewIsModal
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + 14,
              paddingBottom: insets.bottom + 16,
            },
          ]}>
          {view === 'accounts' ? (
            <AccountsPanel
              onAddAccount={handleAddAccount}
              onBack={() => setView('menu')}
              onClose={handleClose}
            />
          ) : (
            <>
              <View style={styles.brandRow}>
                <View style={styles.brandIdentity}>
                  <SteamMark size={34} />
                  <Text style={styles.brand}>droiddeck</Text>
                </View>

                <Pressable
                  accessibilityLabel="Close menu"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={handleClose}
                  style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                  <SymbolView
                    name={{ ios: 'xmark', android: 'close', web: 'close' }}
                    size={19}
                    tintColor={SteamColors.iconMuted}
                  />
                </Pressable>
              </View>

              <Pressable
                accessibilityHint="Switch between saved Steam accounts or add another one"
                accessibilityLabel={`${displayName}. ${connectionLabel}. ${
                  accounts.length > 1 ? 'Switch Steam account' : 'Add a Steam account'
                }`}
                accessibilityRole="button"
                onPress={handleAccountPress}
                style={({ pressed }) => [
                  styles.accountCard,
                  pressed && styles.accountCardPressed,
                ]}>
                <View style={styles.accountCardHeader}>
                  <Text style={styles.accountLabel}>SIGNED IN AS</Text>
                  <View style={styles.manageHint}>
                    <Text style={styles.manageLabel}>{accountActionLabel}</Text>
                    <SymbolView
                      name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                      size={13}
                      tintColor={SteamColors.muted}
                    />
                  </View>
                </View>

                <View style={styles.accountIdentity}>
                  <ChatAvatar
                    name={displayName}
                    seed={activeAccount?.accountName ?? accountName ?? displayName}
                    size={44}
                  />

                  <View style={styles.accountText}>
                    <Text numberOfLines={1} style={styles.accountName}>
                      {displayName}
                    </Text>
                    {accountHandle ? (
                      <Text numberOfLines={1} style={styles.accountHandle}>
                        @{accountHandle}
                      </Text>
                    ) : null}
                    <View style={styles.sessionRow}>
                      <View style={[styles.sessionDot, !connected && styles.sessionDotPending]} />
                      <Text style={styles.sessionLabel}>{connectionLabel}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>

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
                <View style={styles.signOutText}>
                  <Text style={styles.signOutLabel}>
                    {accounts.length > 1 ? 'Sign out of this account' : 'Sign out'}
                  </Text>
                  {accounts.length > 1 ? (
                    <Text style={styles.signOutHint}>Another saved account will open.</Text>
                  ) : null}
                </View>
              </Pressable>

              <View style={styles.footer}>
                <Text style={styles.footerTitle}>droiddeck</Text>
                <Text style={styles.footerBody}>Steam Chat client</Text>
              </View>
            </>
          )}
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
  accountCardPressed: {
    backgroundColor: '#23252B',
  },
  accountCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountLabel: {
    color: SteamColors.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.35,
  },
  manageHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  manageLabel: {
    color: SteamColors.muted,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1.1,
  },
  accountIdentity: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountText: {
    flex: 1,
  },
  accountName: {
    color: SteamColors.textStrong,
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 0.1,
  },
  accountHandle: {
    marginTop: 1,
    color: SteamColors.muted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  sessionRow: {
    marginTop: 6,
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
  sessionDotPending: {
    backgroundColor: SteamColors.unreadDot,
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
  signOutText: {
    flex: 1,
  },
  signOutLabel: {
    color: SteamColors.offlineName,
    fontSize: 15,
  },
  signOutHint: {
    marginTop: 2,
    color: '#6D747D',
    fontSize: 11,
    lineHeight: 15,
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
