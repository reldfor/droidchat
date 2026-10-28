import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { emoticonUrl, type SteamEmoticon } from '@/lib/steam/chat-media';

type Props = {
  load: () => Promise<SteamEmoticon[]>;
  onPick: (name: string) => void;
  onClose: () => void;
  ready: boolean;
};

export function EmoticonPicker({ load, onPick, onClose, ready }: Props) {
  const [query, setQuery] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ items: SteamEmoticon[]; attempt: number; error: string }>({ items: [], attempt: -1, error: '' });
  const loading = ready && result.attempt !== attempt;
  const error = ready ? result.error : 'Reconnect to Steam to load emoticons.';
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void load().then((items) => {
      if (!cancelled) setResult({ items, attempt, error: '' });
    }).catch(() => {
      if (!cancelled) setResult({ items: [], attempt, error: 'Could not load your Steam emoticons. Try again.' });
    });
    return () => { cancelled = true; };
  }, [load, ready, attempt]);
  const filtered = useMemo(() => result.items.filter((entry) => entry.name.toLowerCase().includes(query.trim().toLowerCase())), [result.items, query]);
  return (
    <View style={styles.panel}>
      <View style={styles.heading}>
        <Text style={styles.title}>Steam emoticons</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close emoticons" onPress={onClose} style={styles.close}>
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={SteamColors.icon} />
        </Pressable>
      </View>
      <TextInput accessibilityLabel="Search Steam emoticons" placeholder="Search emoticons" placeholderTextColor={SteamColors.muted} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} style={styles.search} />
      {loading ? <View style={styles.status}><ActivityIndicator color={SteamColors.accent} /><Text style={styles.muted}>Loading your emoticons…</Text></View>
        : error ? <View style={styles.status}><Text accessibilityRole="alert" style={styles.muted}>{error}</Text><Pressable accessibilityRole="button" disabled={!ready} onPress={() => setAttempt((value) => value + 1)} style={styles.retry}><Text style={styles.retryText}>Retry</Text></Pressable></View>
          : <FlatList
              data={filtered}
              numColumns={6}
              keyExtractor={(item) => item.name}
              keyboardShouldPersistTaps="handled"
              style={styles.grid}
              ListEmptyComponent={<Text style={styles.empty}>{query ? 'No emoticons match your search.' : 'Your Steam emoticon collection is empty.'}</Text>}
              renderItem={({ item }) => (
                <Pressable accessibilityRole="button" accessibilityLabel={`Insert :${item.name}:`} onPress={() => onPick(item.name)} style={({ pressed }) => [styles.cell, pressed && styles.pressed]}>
                  <EmoticonImage name={item.name} />
                </Pressable>
              )}
            />}
    </View>
  );
}

function EmoticonImage({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <Text numberOfLines={2} style={styles.fallback}>:{name}:</Text>
    : <Image source={{ uri: emoticonUrl(name) }} contentFit="contain" onError={() => setFailed(true)} style={styles.emoticon} accessible={false} />;
}

const styles = StyleSheet.create({
  panel: { width: '100%', maxWidth: AppMaxWidth, alignSelf: 'center', backgroundColor: SteamColors.chromeDeep, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SteamColors.border, paddingHorizontal: 12, paddingBottom: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: SteamColors.textStrong, fontSize: 15, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { height: 42, paddingHorizontal: 12, borderRadius: 4, color: SteamColors.text, backgroundColor: SteamColors.canvasRaised, fontSize: 14, marginBottom: 8 },
  grid: { height: 200 },
  cell: { flex: 1 / 6, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  emoticon: { width: 32, height: 32 },
  fallback: { color: SteamColors.text, fontSize: 10, textAlign: 'center', paddingHorizontal: 2 },
  pressed: { backgroundColor: SteamColors.chromePressed },
  status: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: SteamColors.text, fontSize: 14, textAlign: 'center' },
  empty: { color: SteamColors.text, padding: 20, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 20, justifyContent: 'center' },
  retryText: { color: SteamColors.accent, fontSize: 14 },
});
