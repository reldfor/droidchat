import * as Device from 'expo-device';
import { Platform } from 'react-native';

import type { DeviceDetails } from './auth-api';
import {
  AuthTokenAppType,
  AuthTokenPlatformType,
  EOSType,
  GAMING_DEVICE_TYPE_MOBILE,
  SteamLanguage,
} from './constants';

/**
 * `CAuthentication_DeviceDetails` as built by the app's login screen:
 *
 *   os_type             <- GetEOSType()
 *   device_friendly_name<- GetDeviceModel()
 *   gaming_device_type  <- EGamingDeviceType_7
 *   platform_type       <- EAuthTokenPlatformType_3
 *   app_type            <- EAuthTokenAppType_2
 */
export function buildDeviceDetails(): DeviceDetails {
  const fallbackName = Platform.OS === 'ios' ? 'iPhone' : 'Android Device';

  return {
    deviceFriendlyName: Device.deviceName ?? Device.modelName ?? fallbackName,
    platformType: AuthTokenPlatformType.MobileApp,
    osType: Platform.OS === 'ios' ? EOSType.IOSUnknown : EOSType.AndroidUnknown,
    gamingDeviceType: GAMING_DEVICE_TYPE_MOBILE,
    appType: AuthTokenAppType.MobileChatApp,
  };
}

const LANGUAGE_BY_TAG: Record<string, number> = {
  en: SteamLanguage.english,
  de: SteamLanguage.german,
  fr: SteamLanguage.french,
  it: SteamLanguage.italian,
  ko: SteamLanguage.koreana,
  es: SteamLanguage.spanish,
  zh: SteamLanguage.schinese,
  ru: SteamLanguage.russian,
  th: SteamLanguage.thai,
  ja: SteamLanguage.japanese,
  pt: SteamLanguage.portuguese,
  pl: SteamLanguage.polish,
  da: SteamLanguage.danish,
  nl: SteamLanguage.dutch,
  fi: SteamLanguage.finnish,
  no: SteamLanguage.norwegian,
  sv: SteamLanguage.swedish,
  hu: SteamLanguage.hungarian,
  cs: SteamLanguage.czech,
  ro: SteamLanguage.romanian,
  tr: SteamLanguage.turkish,
  bg: SteamLanguage.bulgarian,
  el: SteamLanguage.greek,
  ar: SteamLanguage.arabic,
  uk: SteamLanguage.ukrainian,
  vi: SteamLanguage.vietnamese,
  id: SteamLanguage.indonesian,
};

/** Best-effort `ELanguage` for the current device locale. */
export function detectLanguage(): number {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const [language, region] = locale.toLowerCase().split(/[-_]/);

    if (language === 'pt' && region === 'br') {
      return SteamLanguage.brazilian;
    }

    if (language === 'zh') {
      return region === 'tw' || region === 'hk' ? SteamLanguage.tchinese : SteamLanguage.schinese;
    }

    if (language === 'es' && region && region !== 'es') {
      return SteamLanguage.spanishlatam;
    }

    return LANGUAGE_BY_TAG[language] ?? SteamLanguage.english;
  } catch {
    return SteamLanguage.english;
  }
}
