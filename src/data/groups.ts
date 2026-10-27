export type Group = {
  id: string;
  name: string;
  members: number;
  avatar: number;
  avatarBackground: string;
};

// Placeholder group logos are local assets generated for this demo.
// Nothing is fetched at runtime.
export const groups: Group[] = [
  {
    id: 'skinswap-community',
    name: 'SkinSwap Community',
    members: 2399,
    avatar: require('@/assets/images/groups/skinswap.png'),
    avatarBackground: '#190D2A',
  },
  {
    id: 'dust-2-regulars',
    name: 'Dust II Regulars',
    members: 812,
    avatar: require('@/assets/images/groups/dust2.png'),
    avatarBackground: '#312216',
  },
  {
    id: 'steam-deck-hq',
    name: 'Steam Deck HQ',
    members: 5204,
    avatar: require('@/assets/images/groups/deck-hq.png'),
    avatarBackground: '#13243A',
  },
  {
    id: 'indie-game-night',
    name: 'Indie Game Night',
    members: 174,
    avatar: require('@/assets/images/groups/indie-night.png'),
    avatarBackground: '#12312B',
  },
];
