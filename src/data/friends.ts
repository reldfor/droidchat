export type FriendStatus = 'online' | 'away' | 'offline';
export type FriendPlatform = 'deck' | 'mobile';

export type Friend = {
  id: string;
  name: string;
  status: FriendStatus;
  lastOnline?: string;
  platforms?: FriendPlatform[];
  avatar: number;
  avatarBackground: string;
};

// Placeholder avatars are local assets generated with DiceBear's CC0 pixel-art style.
// Nothing is fetched at runtime.

export const onlineFriends: Friend[] = [
  {
    id: 'juniper-fox',
    name: 'JuniperFox',
    status: 'online',
    avatar: require('@/assets/images/avatars/juniper-fox.png'),
    avatarBackground: '#24404A',
  },
  {
    id: 'echo-vandal',
    name: 'echo_vandal',
    status: 'away',
    platforms: ['deck'],
    avatar: require('@/assets/images/avatars/echo-vandal.png'),
    avatarBackground: '#3B2E4A',
  },
  {
    id: 'kite-runner',
    name: 'KiteRunner_88',
    status: 'away',
    avatar: require('@/assets/images/avatars/kite-runner.png'),
    avatarBackground: '#47352B',
  },
];

export const offlineFriends = ([
  {
    id: 'aster-bloom',
    name: 'AsterBloom',
    status: 'offline',
    lastOnline: '12 minutes ago',
    platforms: ['deck', 'mobile'],
    avatar: require('@/assets/images/avatars/aster-bloom.png'),
    avatarBackground: '#2C3B31',
  },
  {
    id: 'rook-roll',
    name: 'Rook & Roll',
    status: 'offline',
    lastOnline: '34 minutes ago',
    avatar: require('@/assets/images/avatars/rook-roll.png'),
    avatarBackground: '#3E3A2A',
  },
  {
    id: 'mossy-circuit',
    name: 'mossy_circuit',
    status: 'offline',
    lastOnline: '1 hour ago',
    avatar: require('@/assets/images/avatars/mossy-circuit.png'),
    avatarBackground: '#263D37',
  },
  {
    id: 'velvet-crow',
    name: 'VelvetCrow',
    status: 'offline',
    lastOnline: '2 hours ago',
    avatar: require('@/assets/images/avatars/velvet-crow.png'),
    avatarBackground: '#3D2B34',
  },
  {
    id: 'driftwood-dan',
    name: 'driftwood_dan',
    status: 'offline',
    lastOnline: '4 hours ago',
    avatar: require('@/assets/images/avatars/driftwood-dan.png'),
    avatarBackground: '#3B3428',
  },
  {
    id: 'lumen-wren',
    name: 'Lumen_Wren',
    status: 'offline',
    lastOnline: '7 hours ago',
    avatar: require('@/assets/images/avatars/lumen-wren.png'),
    avatarBackground: '#263A45',
  },
  {
    id: 'tango-mango',
    name: 'TangoMango',
    status: 'offline',
    lastOnline: '11 hours ago',
    avatar: require('@/assets/images/avatars/tango-mango.png'),
    avatarBackground: '#473329',
  },
  {
    id: 'glass-harbor',
    name: 'GlassHarbor',
    status: 'offline',
    lastOnline: '18 hours ago',
    avatar: require('@/assets/images/avatars/glass-harbor.png'),
    avatarBackground: '#2C3943',
  },
  {
    id: 'orbital-otter',
    name: 'orbital.otter',
    status: 'offline',
    lastOnline: '1 day ago',
    avatar: require('@/assets/images/avatars/orbital-otter.png'),
    avatarBackground: '#30394C',
  },
  {
    id: 'cinder-path',
    name: 'CinderPath',
    status: 'offline',
    lastOnline: '2 days ago',
    avatar: require('@/assets/images/avatars/cinder-path.png'),
    avatarBackground: '#46302D',
  },
  {
    id: 'neon-fable',
    name: 'NeonFable',
    status: 'offline',
    lastOnline: '3 days ago',
    avatar: require('@/assets/images/avatars/neon-fable.png'),
    avatarBackground: '#382D4A',
  },
  {
    id: 'quiet-pilot',
    name: 'QuietPilot',
    status: 'offline',
    lastOnline: '6 days ago',
    avatar: require('@/assets/images/avatars/quiet-pilot.png'),
    avatarBackground: '#2B3A3B',
  },
  {
    id: 'marble-moth',
    name: 'MarbleMoth',
    status: 'offline',
    lastOnline: '1 week ago',
    avatar: require('@/assets/images/avatars/marble-moth.png'),
    avatarBackground: '#3A3540',
  },
  {
    id: 'static-garden',
    name: 'static.garden',
    status: 'offline',
    lastOnline: '2 weeks ago',
    avatar: require('@/assets/images/avatars/static-garden.png'),
    avatarBackground: '#2F3C2B',
  },
  {
    id: 'hollow-pine',
    name: 'HollowPine',
    status: 'offline',
    lastOnline: '3 weeks ago',
    avatar: require('@/assets/images/avatars/hollow-pine.png'),
    avatarBackground: '#2F3A2E',
  },
  {
    id: 'copper-lark',
    name: 'CopperLark',
    status: 'offline',
    lastOnline: '1 month ago',
    avatar: require('@/assets/images/avatars/copper-lark.png'),
    avatarBackground: '#453124',
  },
  {
    id: 'fable-junction',
    name: 'fable_junction',
    status: 'offline',
    lastOnline: '2 months ago',
    avatar: require('@/assets/images/avatars/fable-junction.png'),
    avatarBackground: '#343047',
  },
  {
    id: 'sable-finch',
    name: 'SableFinch',
    status: 'offline',
    lastOnline: '4 months ago',
    avatar: require('@/assets/images/avatars/sable-finch.png'),
    avatarBackground: '#3A3230',
  },
  {
    id: 'ned-after-dark',
    name: 'Ned_AfterDark',
    status: 'offline',
    lastOnline: '9 months ago',
    avatar: require('@/assets/images/avatars/ned-after-dark.png'),
    avatarBackground: '#2B3440',
  },
] satisfies Friend[]).sort((a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
);

export const allFriends: Friend[] = [...onlineFriends, ...offlineFriends].sort((a, b) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
);

export function getFriendById(id: string | undefined) {
  return id ? allFriends.find((friend) => friend.id === id) : undefined;
}
