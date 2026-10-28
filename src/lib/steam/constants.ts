/**
 * Constants observed in the Steam Chat (friendsui) Android app.
 *
 * Source: com.valvesoftware.android.steam.friendsui 1.1 (build 10167321),
 * Hermes bundle `assets/index.android.bundle`.
 */

export const STEAM_WEBAPI_BASE_URL = 'https://api.steampowered.com/';
export const STEAM_LOGIN_BASE_URL = 'https://login.steampowered.com/';

/**
 * `Config.WEBSITE_ID` is never overwritten by the mobile build, so the app
 * sends the default value of the base `Config` object.
 */
export const STEAM_WEBSITE_ID = 'Unknown';

/** `qos_level` default in `CAuthentication_BeginAuthSessionViaCredentials_Request`. */
export const STEAM_QOS_LEVEL = 2;

/** `ESessionPersistence` */
export const SessionPersistence = {
  Ephemeral: 0,
  Persistent: 1,
} as const;

/** `EAuthSessionGuardType` */
export const AuthSessionGuardType = {
  Unknown: 0,
  None: 1,
  EmailCode: 2,
  DeviceCode: 3,
  DeviceConfirmation: 4,
  EmailConfirmation: 5,
  MachineToken: 6,
} as const;

/** `EAuthTokenPlatformType` */
export const AuthTokenPlatformType = {
  Unknown: 0,
  SteamClient: 1,
  WebBrowser: 2,
  MobileApp: 3,
} as const;

/** `EAuthTokenAppType` */
export const AuthTokenAppType = {
  Unknown: 0,
  MobileSteamApp: 1,
  MobileChatApp: 2,
} as const;

/**
 * `EGamingDeviceType_7` = 528, the value the mobile login screen passes as
 * `gaming_device_type`.
 */
export const GAMING_DEVICE_TYPE_MOBILE = 528;

/** `EOSType` values, stored as unsigned 32-bit numbers. */
export const EOSType = {
  AndroidUnknown: 4294966796,
  IOSUnknown: 4294966696,
  WebClient: 4294966596,
} as const;

/** `ELanguage` — only the codes we can map from a BCP-47 tag. */
export const SteamLanguage = {
  english: 0,
  german: 1,
  french: 2,
  italian: 3,
  koreana: 4,
  spanish: 5,
  schinese: 6,
  tchinese: 7,
  russian: 8,
  thai: 9,
  japanese: 10,
  portuguese: 11,
  polish: 12,
  danish: 13,
  dutch: 14,
  finnish: 15,
  norwegian: 16,
  swedish: 17,
  hungarian: 18,
  czech: 19,
  romanian: 20,
  turkish: 21,
  brazilian: 22,
  bulgarian: 23,
  greek: 24,
  arabic: 25,
  ukrainian: 26,
  spanishlatam: 27,
  vietnamese: 28,
  sc_schinese: 29,
  indonesian: 30,
} as const;

/** `EResult` values referenced by the login state machine. */
export const EResult = {
  OK: 1,
  Fail: 2,
  NoConnection: 3,
  InvalidPassword: 5,
  InvalidParam: 8,
  FileNotFound: 9,
  AccessDenied: 15,
  Timeout: 16,
  AccountNotFound: 18,
  ServiceUnavailable: 20,
  Revoked: 26,
  Expired: 27,
  DuplicateRequest: 29,
  AccountDisabled: 43,
  IllegalPassword: 61,
  AccountLogonDenied: 63,
  InvalidLoginAuthCode: 65,
  ExpiredLoginAuthCode: 71,
  RateLimitExceeded: 84,
  AccountLoginDeniedNeedTwoFactor: 85,
  TwoFactorCodeMismatch: 88,
  NeedCaptcha: 101,
  MustAgreeToSSA: 118,
} as const;
