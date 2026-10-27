import { useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';

import { GroupRow } from '@/components/groups/group-row';
import { AppHeader } from '@/components/steam/app-header';
import { DemoNotice } from '@/components/steam/demo-notice';
import { SearchEmpty } from '@/components/steam/search-empty';
import { AppMaxWidth, SteamColors } from '@/constants/steam-theme';
import { groups, type Group } from '@/data/groups';
import { useDemoNotice } from '@/hooks/use-demo-notice';

export default function GroupsScreen() {
  const { message, showNotice } = useDemoNotice();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSearchOpen(false);
      setQuery('');
      return true;
    });

    return () => subscription.remove();
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = normalizedQuery
    ? groups.filter((group) => group.name.toLowerCase().includes(normalizedQuery))
    : groups;
  const noResults = normalizedQuery.length > 0 && visibleGroups.length === 0;

  const handleCancelSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  const handleGroupPress = (group: Group) => {
    showNotice(`Opening ${group.name} is not available in this demo.`);
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        addLabel="Create group"
        onAddPress={() => showNotice('Creating groups is not connected in this demo.')}
        onSearchPress={() => setSearchOpen(true)}
        search={
          searchOpen
            ? { value: query, onChangeText: setQuery, onCancel: handleCancelSearch }
            : undefined
        }
        searchPlaceholder="Search groups"
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}>
        <View style={styles.content}>
          {noResults ? (
            <SearchEmpty
              icon={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
              message={`No groups match "${query.trim()}". Try a different name.`}
              title="No groups found"
            />
          ) : (
            visibleGroups.map((group) => (
              <GroupRow group={group} key={group.id} onPress={handleGroupPress} />
            ))
          )}
        </View>
      </ScrollView>

      <DemoNotice message={message} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: SteamColors.canvas,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 4,
    paddingBottom: 18,
  },
  content: {
    width: '100%',
    maxWidth: AppMaxWidth,
    alignSelf: 'center',
    flexGrow: 1,
  },
});
