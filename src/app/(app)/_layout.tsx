import { Redirect, Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SteamColors } from '@/constants/steam-theme';
import { useSession } from '@/context/session';

export default function AppTabsLayout() {
  const insets = useSafeAreaInsets();
  const { status } = useSession();

  if (status === 'loading') {
    return <View style={styles.loading} />;
  }

  if (status === 'signed-out') {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: false,
        sceneStyle: { backgroundColor: SteamColors.canvas },
        tabBarActiveTintColor: SteamColors.tabActive,
        tabBarInactiveTintColor: SteamColors.tabInactive,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 64 + insets.bottom,
          paddingTop: 4,
          paddingBottom: insets.bottom + 4,
          backgroundColor: SteamColors.chrome,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: SteamColors.border,
          elevation: 0,
        },
        tabBarLabelStyle: {
          marginTop: 2,
          fontSize: 13,
          fontWeight: '600',
          letterSpacing: 1.3,
          textTransform: 'uppercase',
        },
      }}>
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{ ios: 'person.fill', android: 'person', web: 'person' }}
              size={focused ? 25 : 24}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{ ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }}
              size={focused ? 25 : 24}
              tintColor={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groups"
        options={{
          title: 'Groups',
          tabBarIcon: ({ color, focused }) => (
            <SymbolView
              name={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
              size={focused ? 25 : 24}
              tintColor={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: SteamColors.canvas,
  },
});
