import * as Network from 'expo-network';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import {
  DEFAULT_INTERFACE_SETTINGS,
  type InterfaceSettings,
} from '@/lib/settings';
import { readInterfaceSettings, writeInterfaceSettings } from '@/lib/settings-storage';

export type MediaHiddenReason = 'disabled' | 'wifi' | null;

type SettingsContextValue = {
  settings: InterfaceSettings;
  /** True once the persisted values have been read, successfully or not. */
  hydrated: boolean;
  isWifi: boolean;
  /** Null when media may render inline; otherwise why it is suppressed. */
  mediaHiddenReason: MediaHiddenReason;
  updateSettings: (patch: Partial<InterfaceSettings>) => void;
};

const defaultContextValue: SettingsContextValue = {
  settings: DEFAULT_INTERFACE_SETTINGS,
  hydrated: true,
  isWifi: true,
  mediaHiddenReason: null,
  updateSettings: () => {},
};

const SettingsContext = createContext<SettingsContextValue>(defaultContextValue);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<InterfaceSettings>(DEFAULT_INTERFACE_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const dirtyRef = useRef(false);
  const network = Network.useNetworkState();

  // Web has no meaningful Wi-Fi distinction, so inline media stays available.
  const isWifi =
    Platform.OS === 'web' || network.type === Network.NetworkStateType.WIFI;

  const mediaHiddenReason: MediaHiddenReason = settings.disableMediaEmbedding
    ? 'disabled'
    : settings.mediaOnWifiOnly && !isWifi
      ? 'wifi'
      : null;

  useEffect(() => {
    let active = true;

    void readInterfaceSettings()
      .then((stored) => {
        if (!active) {
          return;
        }

        // A toggle before hydration wins over the older stored document.
        if (stored && !dirtyRef.current) {
          setSettings(stored);
        }
      })
      .finally(() => {
        if (active) {
          setHydrated(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    void writeInterfaceSettings(settings);
  }, [hydrated, settings]);

  const updateSettings = useCallback((patch: Partial<InterfaceSettings>) => {
    dirtyRef.current = true;
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      hydrated,
      isWifi,
      mediaHiddenReason,
      updateSettings,
    }),
    [settings, hydrated, isWifi, mediaHiddenReason, updateSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
