import { SteamColors } from './steam-theme';

/**
 * The settings screens use the inverse tonal relationship of the chat screens:
 * a canvas-colored header over the chrome-colored list surface. These tones are
 * sampled from the supplied settings mockups.
 */
export const SettingsColors = {
  body: SteamColors.chrome,
  header: SteamColors.canvas,
  iconTile: '#3D4049',
  separator: '#2F323A',
  rowPressed: '#30333B',
  field: '#2B2F37',
  fieldPressed: '#30343C',
  fieldBorder: '#3A3E46',
  switchOff: '#3B4048',
  switchOn: '#2C8C86',
  link: '#3B9EDB',
  version: SteamColors.muted,
  chevron: '#7F8790',
} as const;
