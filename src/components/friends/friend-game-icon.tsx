import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameIconSize, SteamColors } from '@/constants/steam-theme';
import { gameLogoUrl, type GameAssets } from '@/lib/steam/game-assets';

type FriendGameIconProps = {
  appId: number;
  game?: GameAssets;
};

/**
 * The small game tile that leads an in-game friend row. The community icon is
 * the same asset Steam uses; its store wordmark keeps the row from flashing an
 * empty square while that metadata is being fetched.
 */
export function FriendGameIcon({ appId, game }: FriendGameIconProps) {
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const logoUrl = gameLogoUrl(appId);
  const candidates = [game?.iconUrl, logoUrl].filter(
    (url): url is string => typeof url === 'string' && url.length > 0,
  );
  const uri = candidates.find((url) => !failedUrls.includes(url)) ?? null;
  const wordmark = uri === logoUrl;

  const handleError = (url: string) => {
    setFailedUrls((current) => (current.includes(url) ? current : [...current, url]));
  };

  return (
    <View accessible={false} importantForAccessibility="no" pointerEvents="none" style={styles.tile}>
      {uri ? (
        <Image
          accessible={false}
          cachePolicy="disk"
          contentFit={wordmark ? 'contain' : 'cover'}
          onError={() => handleError(uri)}
          source={{ uri }}
          style={wordmark ? styles.wordmark : styles.icon}
          transition={120}
        />
      ) : (
        <SymbolView
          name={{ ios: 'gamecontroller.fill', android: 'sports_esports', web: 'sports_esports' }}
          size={17}
          tintColor={SteamColors.iconMuted}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: GameIconSize,
    height: GameIconSize,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: SteamColors.gameIconBackground,
    overflow: 'hidden',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  wordmark: {
    width: '78%',
    height: '78%',
  },
});
