import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChatAvatar } from '@/components/chats/chat-avatar';
import { SteamColors } from '@/constants/steam-theme';
import { useSession, type SessionAccount } from '@/context/session';
import { accountDisplayName } from '@/lib/steam/accounts';

type AccountsPanelProps = {
  onAddAccount: () => void;
  onBack: () => void;
  onClose: () => void;
};

function describeLastUsed(timestamp: number): string {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);

  if (minutes < 1) {
    return 'Used just now';
  }

  if (minutes < 60) {
    return `Used ${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `Used ${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `Used ${days}d ago`;
  }

  return `Used ${new Date(timestamp).toLocaleDateString()}`;
}

function describeAccountMeta(account: SessionAccount): string {
  const lastUsed = describeLastUsed(account.lastUsedAt);
  const hasSeparatePersona = Boolean(
    account.personaName && account.personaName !== account.accountName,
  );

  return hasSeparatePersona ? `@${account.accountName} · ${lastUsed}` : lastUsed;
}

export function AccountsPanel({ onAddAccount, onBack, onClose }: AccountsPanelProps) {
  const { accounts, activeAccount, removeAccount, switchAccount } = useSession();
  const [pendingRemoval, setPendingRemoval] = useState<SessionAccount | null>(null);

  const handleBack = () => {
    if (pendingRemoval) {
      setPendingRemoval(null);
      return;
    }

    onBack();
  };

  const handleSwitch = (account: SessionAccount) => {
    if (account.steamId !== activeAccount?.steamId) {
      switchAccount(account.steamId);
    }

    onClose();
  };

  const handleRemove = () => {
    if (!pendingRemoval) {
      return;
    }

    const steamId = pendingRemoval.steamId;
    setPendingRemoval(null);
    removeAccount(steamId);

    if (accounts.length <= 1) {
      onClose();
    }
  };

  const pendingName = pendingRemoval ? accountDisplayName(pendingRemoval) : null;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={pendingRemoval ? 'Back to accounts' : 'Back to menu'}
          accessibilityRole="button"
          hitSlop={6}
          onPress={handleBack}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
            size={20}
            tintColor={SteamColors.iconMuted}
          />
        </Pressable>

        <Text accessibilityRole="header" style={styles.title}>
          {pendingRemoval ? 'REMOVE ACCOUNT' : 'ACCOUNTS'}
        </Text>

        <Pressable
          accessibilityLabel="Close menu"
          accessibilityRole="button"
          hitSlop={6}
          onPress={onClose}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={19}
            tintColor={SteamColors.iconMuted}
          />
        </Pressable>
      </View>

      {pendingRemoval ? (
        <View style={styles.confirm}>
          <View style={styles.identityCard}>
            <ChatAvatar
              name={pendingName ?? undefined}
              seed={pendingRemoval.accountName}
              size={48}
            />
            <View style={styles.identityText}>
              <Text numberOfLines={1} style={styles.identityName}>
                {pendingName}
              </Text>
              {pendingName !== pendingRemoval.accountName ? (
                <Text numberOfLines={1} style={styles.identityHandle}>
                  @{pendingRemoval.accountName}
                </Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.confirmTitle}>Remove this saved account?</Text>
          <Text style={styles.confirmCopy}>
            The sign-in will be deleted from this device. Your Steam account and message history
            are not affected.
          </Text>

          <View style={styles.confirmActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setPendingRemoval(null)}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryLabel}>Keep account</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={handleRemove}
              style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}>
              <Text style={styles.dangerLabel}>Remove account</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.intro}>
            Switch between the Steam accounts saved on this device.
          </Text>

          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            style={styles.list}>
            {accounts.map((account) => {
              const displayName = accountDisplayName(account);
              const active = account.steamId === activeAccount?.steamId;

              return (
                <View
                  key={account.steamId}
                  style={[styles.row, active && styles.rowActive]}>
                  <Pressable
                    accessibilityLabel={
                      active ? `${displayName}, active account` : `Switch to ${displayName}`
                    }
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => handleSwitch(account)}
                    style={({ pressed }) => [
                      styles.rowMain,
                      pressed && !active && styles.pressed,
                    ]}>
                    <ChatAvatar
                      name={displayName}
                      seed={account.accountName}
                      size={42}
                    />

                    <View style={styles.rowText}>
                      <Text
                        numberOfLines={1}
                        style={[styles.name, active && styles.nameActive]}>
                        {displayName}
                      </Text>
                      <Text numberOfLines={1} style={styles.meta}>
                        {active ? 'Active now' : describeAccountMeta(account)}
                      </Text>
                    </View>
                  </Pressable>

                  {active ? (
                    <View style={styles.activeTag}>
                      <View style={styles.activeDot} />
                      <Text style={styles.activeLabel}>ACTIVE</Text>
                    </View>
                  ) : (
                    <Pressable
                      accessibilityLabel={`Remove ${displayName}`}
                      accessibilityRole="button"
                      hitSlop={6}
                      onPress={() => setPendingRemoval(account)}
                      style={({ pressed }) => [
                        styles.removeButton,
                        pressed && styles.pressed,
                      ]}>
                      <SymbolView
                        name={{ ios: 'trash', android: 'delete', web: 'delete' }}
                        size={17}
                        tintColor={SteamColors.iconMuted}
                      />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable
            accessibilityLabel="Add another Steam account"
            accessibilityRole="button"
            onPress={onAddAccount}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
            ]}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={18}
              tintColor={SteamColors.textStrong}
            />
            <Text style={styles.addLabel}>Add another account</Text>
          </Pressable>

          <Text style={styles.note}>
            Only the active account is connected. Your other sign-ins stay saved on this device.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  title: {
    flex: 1,
    color: SteamColors.textStrong,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  intro: {
    marginTop: 20,
    color: SteamColors.muted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  list: {
    flex: 1,
    marginTop: 10,
  },
  listContent: {
    paddingBottom: 8,
  },
  row: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2E3138',
    backgroundColor: 'transparent',
  },
  rowActive: {
    backgroundColor: '#2C3037',
  },
  rowMain: {
    flex: 1,
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 8,
  },
  rowText: {
    flex: 1,
  },
  name: {
    color: SteamColors.offlineName,
    fontSize: 15,
    lineHeight: 20,
  },
  nameActive: {
    color: SteamColors.textStrong,
    fontWeight: '500',
  },
  meta: {
    marginTop: 2,
    color: SteamColors.muted,
    fontSize: 11.5,
    lineHeight: 15,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: SteamColors.onlineDot,
  },
  activeLabel: {
    color: SteamColors.onlineDot,
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1.1,
  },
  removeButton: {
    width: 38,
    height: 38,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
  },
  addButton: {
    height: 46,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 4,
    backgroundColor: SteamColors.accentDeep,
  },
  addButtonPressed: {
    backgroundColor: SteamColors.accentPressed,
  },
  addLabel: {
    color: SteamColors.textStrong,
    fontSize: 14.5,
    fontWeight: '500',
  },
  note: {
    marginTop: 10,
    color: '#6D747D',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  confirm: {
    marginTop: 24,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#30333A',
    backgroundColor: SteamColors.canvas,
  },
  identityText: {
    flex: 1,
  },
  identityName: {
    color: SteamColors.textStrong,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  identityHandle: {
    marginTop: 2,
    color: SteamColors.muted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  confirmTitle: {
    marginTop: 20,
    color: SteamColors.textStrong,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  confirmCopy: {
    marginTop: 8,
    color: SteamColors.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  confirmActions: {
    marginTop: 22,
    gap: 8,
  },
  secondaryButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3A3E45',
  },
  secondaryLabel: {
    color: SteamColors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  dangerButton: {
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#8E4A46',
    backgroundColor: '#4E2A29',
  },
  dangerLabel: {
    color: '#F2C7C4',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
});
