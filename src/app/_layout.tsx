import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/context/session';
import { SteamChatProvider } from '@/context/steam-chat';

const appTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#292C33',
    card: '#292C33',
    border: '#202126',
    primary: '#216CAD',
  },
};

export default function RootLayout() {
  return (
    <SessionProvider>
      <SteamChatProvider>
        <ThemeProvider value={appTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: appTheme.colors.background },
            }}
          />
          <StatusBar style="light" />
        </ThemeProvider>
      </SteamChatProvider>
    </SessionProvider>
  );
}
