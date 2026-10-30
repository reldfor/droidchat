import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeaderHeight, AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { AccountDrawer } from './account-drawer';
import { SteamMark } from './steam-mark';

type HeaderSearch = {
  value: string;
  onChangeText: (value: string) => void;
  onCancel: () => void;
};

type AppHeaderProps = {
  search?: HeaderSearch;
  searchPlaceholder?: string;
  onSearchPress?: () => void;
  onNewChatPress?: () => void;
  onAddPress?: () => void;
  addLabel?: string;
};

export function AppHeader({
  search,
  searchPlaceholder = 'Search friends',
  onSearchPress,
  onNewChatPress,
  onAddPress,
  addLabel = 'Add friend',
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const handleCancelSearch = () => {
    setSearchFocused(false);
    Keyboard.dismiss();
    search?.onCancel();
  };

  return (
    <>
      <View style={styles.shell}>
        <View style={{ height: insets.top }} />

        {search ? (
          <View style={styles.row}>
            <View style={[styles.searchField, searchFocused && styles.searchFieldFocused]}>
              <SymbolView
                name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                size={18}
                tintColor={SteamColors.iconMuted}
              />
              <TextInput
                accessibilityLabel={searchPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onBlur={() => setSearchFocused(false)}
                onChangeText={search.onChangeText}
                onFocus={() => setSearchFocused(true)}
                placeholder={searchPlaceholder}
                placeholderTextColor={SteamColors.muted}
                returnKeyType="search"
                selectionColor={SteamColors.accent}
                style={styles.searchInput}
                textAlignVertical="center"
                underlineColorAndroid="transparent"
                value={search.value}
              />
              {search.value.length > 0 ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => search.onChangeText('')}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <SymbolView
                    name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                    size={18}
                    tintColor={SteamColors.iconMuted}
                  />
                </Pressable>
              ) : null}
            </View>

            <Pressable
              accessibilityLabel="Cancel search"
              accessibilityRole="button"
              hitSlop={6}
              onPress={handleCancelSearch}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.row}>
            <Pressable
              accessibilityLabel="Open menu"
              accessibilityRole="button"
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}>
              <SymbolView
                name={{ ios: 'line.3.horizontal', android: 'menu', web: 'menu' }}
                size={24}
                tintColor={SteamColors.icon}
              />
            </Pressable>

            <View pointerEvents="none" style={styles.brandCenter}>
              <SteamMark size={36} />
            </View>

            <View style={styles.actions}>
              {onSearchPress ? (
                <Pressable
                  accessibilityLabel="Search"
                  accessibilityRole="button"
                  onPress={onSearchPress}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.iconButtonPressed,
                  ]}>
                  <SymbolView
                    name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                    size={23}
                    tintColor={SteamColors.icon}
                  />
                </Pressable>
              ) : null}

              {onNewChatPress ? (
                <Pressable
                  accessibilityLabel="New chat"
                  accessibilityRole="button"
                  onPress={onNewChatPress}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.iconButtonPressed,
                  ]}>
                  <SymbolView
                    name={{ ios: 'plus.bubble', android: 'add_comment', web: 'add_comment' }}
                    size={24}
                    tintColor={SteamColors.icon}
                  />
                </Pressable>
              ) : null}

              {onAddPress ? (
                <Pressable
                  accessibilityLabel={addLabel}
                  accessibilityRole="button"
                  onPress={onAddPress}
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.iconButtonPressed,
                  ]}>
                  <SymbolView
                    name={{ ios: 'plus.circle', android: 'add_circle', web: 'add_circle' }}
                    size={24}
                    tintColor={SteamColors.icon}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
      </View>

      <AccountDrawer onClose={() => setMenuOpen(false)} visible={menuOpen} />
    </>
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
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
  },
  iconButtonPressed: {
    backgroundColor: SteamColors.chromePressed,
  },
  brandCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  searchField: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3A3E46',
    backgroundColor: SteamColors.canvas,
  },
  searchFieldFocused: {
    borderColor: '#4A8EC2',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: SteamColors.text,
    fontSize: 14.5,
    outlineWidth: 0,
    paddingVertical: 0,
  },
  cancel: {
    color: SteamColors.text,
    fontSize: 14.5,
    lineHeight: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pressed: {
    opacity: 0.6,
  },
});
