import type { Friend } from './friends';

export type ChatKind = 'direct' | 'group';

export type Chat = {
  id: string;
  name: string;
  kind: ChatKind;
  preview: string;
  timestamp: string;
  unread?: boolean;
  avatar?: number;
  avatarBackground?: string;
  participants?: Friend[];
};

// Placeholder conversations only. No messages are fetched or sent.
export const chats: Chat[] = [
  {
    id: 'skinswap-community',
    name: 'SkinSwap Community',
    kind: 'group',
    preview: 'Schemer230: new trade offers are live in the community',
    timestamp: '3:38 AM',
    unread: true,
    avatar: require('@/assets/images/groups/skinswap.png'),
    avatarBackground: '#190D2A',
  },
  {
    id: 'juniper-fox',
    name: 'JuniperFox',
    kind: 'direct',
    preview: 'that clutch was unreal — clip incoming',
    timestamp: '12:14 AM',
    avatar: require('@/assets/images/avatars/juniper-fox.png'),
    avatarBackground: '#24404A',
  },
  {
    id: 'echo-vandal',
    name: 'echo_vandal',
    kind: 'direct',
    preview: "I'll be on after 8, save me a slot",
    timestamp: 'Yesterday',
    avatar: require('@/assets/images/avatars/echo-vandal.png'),
    avatarBackground: '#3B2E4A',
  },
  {
    id: 'kite-runner',
    name: 'KiteRunner_88',
    kind: 'direct',
    preview: 'ggs, same time tomorrow?',
    timestamp: 'Yesterday',
    avatar: require('@/assets/images/avatars/kite-runner.png'),
    avatarBackground: '#47352B',
  },
  {
    id: 'dust-2-regulars',
    name: 'Dust II Regulars',
    kind: 'group',
    preview: 'baitmaster: lobby is up, 2 slots left',
    timestamp: 'Monday',
    avatar: require('@/assets/images/groups/dust2.png'),
    avatarBackground: '#312216',
  },
];
