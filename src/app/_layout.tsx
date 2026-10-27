import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ChatStoreProvider } from '@/context/chat-store';
import { SessionProvider } from '@/context/session';

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
      <ChatStoreProvider>
        <ThemeProvider value={appTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: appTheme.colors.background },
            }}
          />
          <StatusBar style="light" />
        </ThemeProvider>
      </ChatStoreProvider>
    </SessionProvider>
  );
}
