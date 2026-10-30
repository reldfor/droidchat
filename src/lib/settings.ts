export const DEFAULT_TAB_VALUES = ['friends', 'chats', 'groups'] as const;
export type DefaultTab = (typeof DEFAULT_TAB_VALUES)[number];

export const CHAT_FILTER_VALUES = ['friends', 'everyone', 'nobody'] as const;
export type ChatFilterPreference = (typeof CHAT_FILTER_VALUES)[number];

export const LANGUAGE_VALUES = ['en'] as const;
export type LanguagePreference = (typeof LANGUAGE_VALUES)[number];

export type InterfaceSettings = {
  appendNicknames: boolean;
  hideOfflineCustomCategories: boolean;
  hideCategorizedFriends: boolean;
  ignoreAwayStatus: boolean;
  disableMediaEmbedding: boolean;
  disableRoomEffects: boolean;
  mediaOnWifiOnly: boolean;
  saveImageCaptures: boolean;
  chatFilter: ChatFilterPreference;
  language: LanguagePreference;
  defaultTab: DefaultTab;
};

export const DEFAULT_INTERFACE_SETTINGS: InterfaceSettings = {
  appendNicknames: false,
  hideOfflineCustomCategories: false,
  hideCategorizedFriends: false,
  ignoreAwayStatus: false,
  disableMediaEmbedding: false,
  disableRoomEffects: false,
  mediaOnWifiOnly: false,
  // Matches the mockup: image captures are saved by default.
  saveImageCaptures: true,
  chatFilter: 'friends',
  language: 'en',
  defaultTab: 'chats',
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * Settings are local UI preferences, not protocol state. Unknown or malformed
 * fields fall back to their defaults so a stale storage blob cannot break the
 * screens.
 */
export function normalizeInterfaceSettings(value: unknown): InterfaceSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_INTERFACE_SETTINGS };
  }

  const candidate = value as Partial<Record<keyof InterfaceSettings, unknown>>;

  return {
    appendNicknames: asBoolean(
      candidate.appendNicknames,
      DEFAULT_INTERFACE_SETTINGS.appendNicknames,
    ),
    hideOfflineCustomCategories: asBoolean(
      candidate.hideOfflineCustomCategories,
      DEFAULT_INTERFACE_SETTINGS.hideOfflineCustomCategories,
    ),
    hideCategorizedFriends: asBoolean(
      candidate.hideCategorizedFriends,
      DEFAULT_INTERFACE_SETTINGS.hideCategorizedFriends,
    ),
    ignoreAwayStatus: asBoolean(
      candidate.ignoreAwayStatus,
      DEFAULT_INTERFACE_SETTINGS.ignoreAwayStatus,
    ),
    disableMediaEmbedding: asBoolean(
      candidate.disableMediaEmbedding,
      DEFAULT_INTERFACE_SETTINGS.disableMediaEmbedding,
    ),
    disableRoomEffects: asBoolean(
      candidate.disableRoomEffects,
      DEFAULT_INTERFACE_SETTINGS.disableRoomEffects,
    ),
    mediaOnWifiOnly: asBoolean(
      candidate.mediaOnWifiOnly,
      DEFAULT_INTERFACE_SETTINGS.mediaOnWifiOnly,
    ),
    saveImageCaptures: asBoolean(
      candidate.saveImageCaptures,
      DEFAULT_INTERFACE_SETTINGS.saveImageCaptures,
    ),
    chatFilter: isOneOf(CHAT_FILTER_VALUES, candidate.chatFilter)
      ? candidate.chatFilter
      : DEFAULT_INTERFACE_SETTINGS.chatFilter,
    language: isOneOf(LANGUAGE_VALUES, candidate.language)
      ? candidate.language
      : DEFAULT_INTERFACE_SETTINGS.language,
    defaultTab: isOneOf(DEFAULT_TAB_VALUES, candidate.defaultTab)
      ? candidate.defaultTab
      : DEFAULT_INTERFACE_SETTINGS.defaultTab,
  };
}
