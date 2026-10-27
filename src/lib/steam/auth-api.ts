/**
 * Steam WebAPI transport for the `IAuthenticationService` methods.
 *
 * The Android app does not talk to the CM websocket while signing in: the
 * login screen builds an "anonymous service transport" that POSTs protobuf to
 * `https://api.steampowered.com/I<Interface>Service/<Method>/v<Version>/`
 * (see `CWebAPIInterface.CreateWebAPIURL` in the bundle).
 *
 * Requests carry the protobuf body as `input_protobuf_encoded`. Responses are
 * raw protobuf bodies; the `EResult` for the call travels in the `x-eresult`
 * HTTP header (and `x-error_message` when the call fails).
 *
 * Signing in is fully anonymous. Token refresh is not: the app sends it over
 * its authenticated CM transport, so over HTTP it needs the current access
 * token as an `access_token` query parameter to be routed at all.
 */

import { bytesToBase64, base64ToBytes } from './bytes';
import {
  AuthSessionGuardType,
  EResult,
  STEAM_WEBAPI_BASE_URL,
  STEAM_WEBSITE_ID,
} from './constants';
import {
  ProtoWriter,
  allOf,
  asBoolean,
  asBytes,
  asFloat,
  asNumber,
  asString,
  asUint64String,
  firstOf,
  readMessage,
} from './protobuf';
import { normalizeAccountName, rsaEncryptPassword } from './rsa';

export class SteamApiError extends Error {
  readonly eresult: number;
  /** Set when Steam wants the account to accept the SSA first. */
  readonly agreementUrl?: string;

  constructor(message: string, eresult: number, agreementUrl?: string) {
    super(message);
    this.name = 'SteamApiError';
    this.eresult = eresult;
    this.agreementUrl = agreementUrl;
  }
}

export type SteamApiResponse = {
  eresult: number;
  errorMessage: string;
  body: Uint8Array;
};

function buildServiceUrl(serviceMethod: string): string {
  // "Authentication.GetPasswordRSAPublicKey#1" ->
  // "IAuthenticationService/GetPasswordRSAPublicKey/v1/"
  const match = /^([^.]+)\.(.+)#(\d+)$/.exec(serviceMethod);

  if (!match) {
    throw new Error(`Unrecognised Steam service method: ${serviceMethod}`);
  }

  const [, iface, method, version] = match;
  return `${STEAM_WEBAPI_BASE_URL}I${iface}Service/${method}/v${version}/`;
}

async function callService(
  serviceMethod: string,
  body: Uint8Array,
  options: { method: 'GET' | 'POST'; accessToken?: string },
): Promise<SteamApiResponse> {
  const base = buildServiceUrl(serviceMethod);
  const encoded = bytesToBase64(body);
  const query: string[] = [];

  if (options.accessToken) {
    // Authenticated calls are routed by the JWT in the query string; without
    // one the WebAPI answers "Missing required routing parameter".
    query.push(`access_token=${encodeURIComponent(options.accessToken)}`);
  }

  if (options.method === 'GET') {
    query.push(`input_protobuf_encoded=${encodeURIComponent(encoded)}`, 'origin=MobileChat');
  }

  // Built by hand instead of with `URL`: React Native's URL polyfill is not
  // guaranteed to implement `searchParams`.
  const url = query.length > 0 ? `${base}?${query.join('&')}` : base;

  let response: Response;

  if (options.method === 'GET') {
    response = await fetch(url, { method: 'GET' });
  } else {
    const form = new FormData();
    form.append('input_protobuf_encoded', encoded);
    response = await fetch(url, { method: 'POST', body: form });
  }

  const eresultHeader = response.headers.get('x-eresult');
  const eresult = eresultHeader ? Number.parseInt(eresultHeader, 10) : EResult.OK;
  const errorMessage = response.headers.get('x-error_message') ?? '';

  if (!response.ok) {
    throw new SteamApiError(
      errorMessage || `Steam WebAPI request failed (HTTP ${response.status}).`,
      Number.isNaN(eresult) ? EResult.Fail : eresult,
    );
  }

  const bodyBytes = new Uint8Array(await response.arrayBuffer());

  return {
    eresult: Number.isNaN(eresult) ? EResult.Fail : eresult,
    errorMessage,
    body: bodyBytes,
  };
}

export type RsaPublicKey = {
  modulusHex: string;
  exponentHex: string;
  timestamp: string;
};

export async function getPasswordRsaPublicKey(accountName: string): Promise<RsaPublicKey> {
  const request = new ProtoWriter().string(1, normalizeAccountName(accountName));
  const response = await callService('Authentication.GetPasswordRSAPublicKey#1', request.finish(), {
    method: 'GET',
  });

  if (response.eresult !== EResult.OK) {
    throw new SteamApiError(
      response.errorMessage || 'Steam refused to hand out an RSA key.',
      response.eresult,
    );
  }

  const fields = readMessage(response.body);
  const key: RsaPublicKey = {
    modulusHex: asString(firstOf(fields, 1)),
    exponentHex: asString(firstOf(fields, 2)),
    timestamp: asUint64String(firstOf(fields, 3)),
  };

  if (!key.modulusHex || !key.exponentHex) {
    throw new SteamApiError('Steam returned an incomplete RSA key.', EResult.Fail);
  }

  return key;
}

export type DeviceDetails = {
  deviceFriendlyName: string;
  platformType: number;
  osType: number;
  gamingDeviceType: number;
  appType: number;
};

export type BeginAuthSessionParams = {
  accountName: string;
  password: string;
  persistLogin: boolean;
  deviceDetails: DeviceDetails;
  language: number;
  guardData?: string;
};

export type AllowedConfirmation = {
  confirmationType: number;
  associatedMessage: string;
};

export type BeginAuthSessionResult = {
  clientId: string;
  requestId: string;
  intervalMs: number;
  steamId: string;
  weakToken: string;
  allowedConfirmations: AllowedConfirmation[];
  agreementSessionUrl: string;
  extendedErrorMessage: string;
};

export async function beginAuthSessionViaCredentials({
  accountName,
  password,
  persistLogin,
  deviceDetails,
  language,
  guardData,
}: BeginAuthSessionParams): Promise<BeginAuthSessionResult> {
  const normalizedAccountName = normalizeAccountName(accountName);
  const rsaKey = await getPasswordRsaPublicKey(normalizedAccountName);
  const encryptedPassword = rsaEncryptPassword(
    password,
    rsaKey.modulusHex,
    rsaKey.exponentHex,
  );

  const deviceDetailsWriter = new ProtoWriter()
    .string(1, deviceDetails.deviceFriendlyName)
    .enum(2, deviceDetails.platformType)
    .int32(3, deviceDetails.osType)
    .uint32(4, deviceDetails.gamingDeviceType)
    .enum(7, deviceDetails.appType);

  // Field layout of CAuthentication_BeginAuthSessionViaCredentials_Request:
  // 1 device_friendly_name, 2 account_name, 3 encrypted_password,
  // 4 encryption_timestamp, 5 remember_login, 6 platform_type,
  // 7 persistence, 8 website_id, 9 device_details, 10 guard_data,
  // 11 language, 12 qos_level. The app leaves platform_type and qos_level
  // unset (the server applies qos_level's default of 2).
  const request = new ProtoWriter()
    .string(1, deviceDetails.deviceFriendlyName)
    .string(2, normalizedAccountName)
    .string(3, encryptedPassword)
    .uint64(4, rsaKey.timestamp)
    .bool(5, persistLogin)
    .enum(7, persistLogin ? 1 : 0)
    .string(8, STEAM_WEBSITE_ID)
    .message(9, deviceDetailsWriter)
    .uint32(11, language);

  if (guardData) {
    request.string(10, guardData);
  }

  const response = await callService(
    'Authentication.BeginAuthSessionViaCredentials#1',
    request.finish(),
    { method: 'POST' },
  );

  if (response.eresult !== EResult.OK) {
    const fields = readMessage(response.body);

    throw new SteamApiError(
      response.errorMessage || 'Steam rejected the sign-in attempt.',
      response.eresult,
      asString(firstOf(fields, 7)) || undefined,
    );
  }

  const fields = readMessage(response.body);
  const allowedConfirmations = allOf(fields, 4).map((entry) => {
    const confirmationFields = readMessage(asBytes(entry));
    return {
      confirmationType: asNumber(firstOf(confirmationFields, 1)),
      associatedMessage: asString(firstOf(confirmationFields, 2)),
    };
  });

  return {
    clientId: asUint64String(firstOf(fields, 1)),
    requestId: bytesToBase64(asBytes(firstOf(fields, 2))),
    intervalMs: Math.max(1, asFloat(firstOf(fields, 3))) * 1000,
    steamId: asUint64String(firstOf(fields, 5)),
    weakToken: asString(firstOf(fields, 6)),
    allowedConfirmations,
    agreementSessionUrl: asString(firstOf(fields, 7)),
    extendedErrorMessage: asString(firstOf(fields, 8)),
  };
}

export async function updateAuthSessionWithSteamGuardCode(params: {
  clientId: string;
  steamId: string;
  code: string;
  codeType: number;
}): Promise<number> {
  const request = new ProtoWriter()
    .uint64(1, params.clientId)
    .fixed64(2, params.steamId)
    .string(3, params.code)
    .enum(4, params.codeType);

  const response = await callService(
    'Authentication.UpdateAuthSessionWithSteamGuardCode#1',
    request.finish(),
    { method: 'POST' },
  );

  return response.eresult;
}

export type PollAuthSessionResult = {
  refreshToken: string;
  accessToken: string;
  accountName: string;
  newGuardData: string;
  newClientId: string;
  newChallengeUrl: string;
  hadRemoteInteraction: boolean;
  agreementSessionUrl: string;
};

export async function pollAuthSessionStatus(params: {
  clientId: string;
  requestId: string;
  tokenToRevoke?: string;
}): Promise<{ eresult: number; result: PollAuthSessionResult }> {
  const request = new ProtoWriter()
    .uint64(1, params.clientId)
    .bytes(2, base64ToBytes(params.requestId));

  if (params.tokenToRevoke) {
    request.string(3, params.tokenToRevoke);
  }

  const response = await callService(
    'Authentication.PollAuthSessionStatus#1',
    request.finish(),
    { method: 'POST' },
  );

  const fields = readMessage(response.body);

  return {
    eresult: response.eresult,
    result: {
      refreshToken: asString(firstOf(fields, 3)),
      accessToken: asString(firstOf(fields, 4)),
      accountName: asString(firstOf(fields, 6)),
      newGuardData: asString(firstOf(fields, 7)),
      newClientId: asUint64String(firstOf(fields, 1)),
      newChallengeUrl: asString(firstOf(fields, 2)),
      hadRemoteInteraction: asBoolean(firstOf(fields, 5)),
      agreementSessionUrl: asString(firstOf(fields, 8)),
    },
  };
}

export type GenerateAccessTokenResult = {
  accessToken: string;
  refreshToken: string;
};

/**
 * `Authentication.GenerateAccessTokenForApp#1`.
 *
 * Request: refresh_token=1, steamid=2 (fixed64), renewal_type=3.
 * Response: access_token=1, refresh_token=2.
 *
 * The app sends this over its authenticated CM transport. Over the WebAPI the
 * call is routed by the current access token, which has to travel in the query
 * string; without it Steam answers "Missing required routing parameter".
 */
export async function generateAccessTokenForApp(params: {
  refreshToken: string;
  steamId: string;
  accessToken: string;
  renewalType?: number;
}): Promise<GenerateAccessTokenResult> {
  const request = new ProtoWriter()
    .string(1, params.refreshToken)
    .fixed64(2, params.steamId)
    .enum(3, params.renewalType ?? 1);

  const response = await callService(
    'Authentication.GenerateAccessTokenForApp#1',
    request.finish(),
    { method: 'POST', accessToken: params.accessToken },
  );

  if (response.eresult !== EResult.OK) {
    throw new SteamApiError(
      response.errorMessage || 'Steam could not refresh this session.',
      response.eresult,
    );
  }

  const fields = readMessage(response.body);

  return {
    accessToken: asString(firstOf(fields, 1)),
    refreshToken: asString(firstOf(fields, 2)),
  };
}

/**
 * Picks the confirmation to satisfy, matching `GetPriorityGuardType` in the
 * Android app. Its preference map is:
 *   DeviceConfirmation(4) -> DeviceCode(3) -> EmailCode(2) -> None(1)
 *   -> Unknown(0) -> EmailConfirmation(5)
 * MachineToken(6) is deliberately ignored: the app only handles it through a
 * separate `jwt/checkdevice` call, and waiting on it can never complete.
 */
export function pickConfirmation(
  confirmations: AllowedConfirmation[],
): AllowedConfirmation | undefined {
  const priority = [
    AuthSessionGuardType.DeviceConfirmation,
    AuthSessionGuardType.DeviceCode,
    AuthSessionGuardType.EmailCode,
    AuthSessionGuardType.None,
    AuthSessionGuardType.Unknown,
    AuthSessionGuardType.EmailConfirmation,
  ];

  for (const type of priority) {
    const match = confirmations.find((entry) => entry.confirmationType === type);
    if (match) {
      return match;
    }
  }

  return undefined;
}
