/**
 * Group-chat helpers.
 *
 * Steam group avatars are SHA-1 hashes served from the community image CDN.
 * The path layout and sizes mirror `BuildGroupIconURLFromHash` in friendsui.
 */

const GROUP_ICON_BASE_URL = 'https://community.fastly.steamstatic.com/images/chaticons/';

export function buildGroupAvatarUrl(
  hash: string | null | undefined,
  size: 32 | 64 | 256 = 64,
  ugcUrl?: string | null,
): string | null {
  if (ugcUrl && ugcUrl.startsWith('https://')) {
    return ugcUrl;
  }

  if (!hash || !/^[a-f0-9]{40}$/i.test(hash)) {
    return null;
  }

  const clean = hash.toLowerCase();
  return `${GROUP_ICON_BASE_URL}${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(
    4,
    6,
  )}/${clean}_${size}.jpg`;
}

export function formatGroupMemberCount(count: number): string {
  if (count <= 0) {
    return 'Group chat';
  }

  return count === 1 ? '1 member' : `${count} members`;
}
