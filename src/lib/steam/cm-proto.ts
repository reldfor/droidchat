/**
 * Steam client-messaging (CM) protobuf messages.
 *
 * Field numbers and wire types come from the generated descriptors in the
 * Steam Chat Android app (friendsui). Only the messages this client needs are
 * implemented, using the small wire-format helpers in `protobuf.ts`.
 */

import { bytesToHex } from './bytes';
import {
  ProtoWriter,
  allOf,
  asBoolean,
  asBytes,
  asNumber,
  asString,
  asUint64String,
  firstOf,
  readMessage,
  type ProtoField,
} from './protobuf';

/** `EMsg` values used by the CM transport (SteamKit's `emsg.steamd`). */
export const EMsg = {
  Multi: 1,
  ServiceMethodResponse: 147,
  ServiceMethodCallFromClient: 151,
  ServiceMethodSendToClient: 152,
  ClientChangeStatus: 716,
  ClientHeartBeat: 703,
  ClientLogOnResponse: 751,
  ClientLoggedOff: 757,
  ClientPersonaState: 766,
  ClientFriendsList: 767,
  ClientAccountInfo: 768,
  ClientRequestFriendData: 815,
  ClientLogon: 5514,
} as const;

/** `k_GIDNil` from the app: an unset job id in `CMsgProtoBufHeader`. */
export const GID_NIL = '18446744073709551615';

export type CmHeader = {
  steamId: string;
  clientSessionId: number;
  jobIdSource: string;
  jobIdTarget: string;
  targetJobName: string;
  eresult: number;
  errorMessage: string;
  transportError: number;
};

export type CmHeaderInput = {
  steamId: string;
  clientSessionId: number;
  jobIdSource?: string;
  targetJobName?: string;
};

export function encodeHeader(header: CmHeaderInput): Uint8Array {
  const writer = new ProtoWriter();

  if (header.steamId && header.steamId !== '0') {
    writer.fixed64(1, header.steamId);
  }

  if (header.clientSessionId !== 0) {
    writer.int32(2, header.clientSessionId);
  }

  if (header.jobIdSource) {
    writer.fixed64(10, header.jobIdSource);
  }

  if (header.targetJobName) {
    writer.string(12, header.targetJobName);
  }

  return writer.finish();
}

export function decodeHeader(bytes: Uint8Array): CmHeader {
  const fields = readMessage(bytes);
  const jobIdSource = firstOf(fields, 10);
  const jobIdTarget = firstOf(fields, 11);
  const eresult = firstOf(fields, 13);
  const transportError = firstOf(fields, 17);

  return {
    steamId: asUint64String(firstOf(fields, 1)),
    clientSessionId: asNumber(firstOf(fields, 2)),
    jobIdSource: jobIdSource ? asUint64String(jobIdSource) : GID_NIL,
    jobIdTarget: jobIdTarget ? asUint64String(jobIdTarget) : GID_NIL,
    targetJobName: asString(firstOf(fields, 12)),
    eresult: eresult ? asNumber(eresult) : 2,
    errorMessage: asString(firstOf(fields, 14)),
    transportError: transportError ? asNumber(transportError) : 1,
  };
}

/* -------------------------------------------------------------------------- */
/* Logon                                                                      */
/* -------------------------------------------------------------------------- */

export type LogonInput = {
  accountName: string;
  /** The CM accepts the long-lived refresh token in `access_token`. */
  refreshToken: string;
  clientInstanceId: string;
  lastSessionId: number;
};

/** `CMsgClientLogon` as built by `AuthenticateCMInterface`. */
export function encodeLogon(input: LogonInput): Uint8Array {
  const writer = new ProtoWriter()
    .string(50, input.accountName)
    .uint32(1, 65580)
    .uint32(21, 2)
    .bool(102, true)
    .uint32(7, 4294966596) // EOSType.WebClient, as sent by the mobile app
    .enum(32, 5) // ui_mode
    .enum(33, 2) // chat_mode
    .string(108, input.refreshToken)
    .uint64(100, input.clientInstanceId || '0');

  if (input.lastSessionId) {
    writer.uint32(4, input.lastSessionId >>> 0);
  }

  return writer.finish();
}

export type LogonResponse = {
  eresult: number;
  eresultExtended: number;
  heartbeatSeconds: number;
  cellId: number;
  clientSuppliedSteamId: string;
  clientInstanceId: string;
  agreementSessionUrl: string;
};

export function decodeLogonResponse(bytes: Uint8Array): LogonResponse {
  const fields = readMessage(bytes);

  return {
    eresult: asNumber(firstOf(fields, 1)),
    eresultExtended: asNumber(firstOf(fields, 10)),
    heartbeatSeconds: asNumber(firstOf(fields, 3)),
    cellId: asNumber(firstOf(fields, 7)),
    clientSuppliedSteamId: asUint64String(firstOf(fields, 20)),
    clientInstanceId: asUint64String(firstOf(fields, 27)),
    agreementSessionUrl: asString(firstOf(fields, 29)),
  };
}

export function encodeChangeStatus(input: {
  personaState: number;
  personaSetByUser: boolean;
  needPersonaResponse: boolean;
  isClientIdle: boolean;
}): Uint8Array {
  return new ProtoWriter()
    .uint32(1, input.personaState)
    .bool(5, input.personaSetByUser)
    .bool(7, input.needPersonaResponse)
    .bool(8, input.isClientIdle)
    .finish();
}

/* -------------------------------------------------------------------------- */
/* Friends and persona                                                        */
/* -------------------------------------------------------------------------- */

/** `EFriendRelationship.Friend` */
export const FRIEND_RELATIONSHIP_FRIEND = 3;

export type CmFriend = {
  steamId: string;
  relationship: number;
};

export type FriendsList = {
  incremental: boolean;
  friends: CmFriend[];
};

export function decodeFriendsList(bytes: Uint8Array): FriendsList {
  const fields = readMessage(bytes);

  return {
    incremental: asBoolean(firstOf(fields, 1)),
    friends: allOf(fields, 2).map((entry) => {
      const friend = readMessage(asBytes(entry));
      return {
        steamId: asUint64String(firstOf(friend, 1)),
        relationship: asNumber(firstOf(friend, 2)),
      };
    }),
  };
}

export type CmPersona = {
  steamId: string;
  personaState: number | null;
  playerName: string | null;
  avatarHash: string | null;
  gamePlayedAppId: number | null;
  gameName: string | null;
  lastLogoff: number | null;
  lastSeenOnline: number | null;
  personaStateFlags: number | null;
  onSteamDeck: boolean | null;
  gamingDeviceType: number | null;
};

function optionalNumber(fields: ProtoField[], field: number): number | null {
  const entry = firstOf(fields, field);
  return entry ? asNumber(entry) : null;
}

function optionalString(fields: ProtoField[], field: number): string | null {
  const entry = firstOf(fields, field);
  if (!entry) {
    return null;
  }

  const value = asString(entry);
  return value.length > 0 ? value : null;
}

function optionalBoolean(fields: ProtoField[], field: number): boolean | null {
  const entry = firstOf(fields, field);
  return entry ? asBoolean(entry) : null;
}

function optionalHash(fields: ProtoField[], field: number): string | null {
  const entry = firstOf(fields, field);
  if (!entry) {
    return null;
  }

  const bytes = asBytes(entry);
  return bytes.length > 0 ? bytesToHex(bytes) : null;
}

export function decodePersonaState(bytes: Uint8Array): CmPersona[] {
  const fields = readMessage(bytes);

  return allOf(fields, 2).map((entry) => {
    const friend = readMessage(asBytes(entry));

    return {
      steamId: asUint64String(firstOf(friend, 1)),
      personaState: optionalNumber(friend, 2),
      playerName: optionalString(friend, 15),
      avatarHash: optionalHash(friend, 31),
      gamePlayedAppId: optionalNumber(friend, 3),
      gameName: optionalString(friend, 55),
      lastLogoff: optionalNumber(friend, 45),
      lastSeenOnline: optionalNumber(friend, 47),
      personaStateFlags: optionalNumber(friend, 6),
      onSteamDeck: optionalBoolean(friend, 81),
      gamingDeviceType: optionalNumber(friend, 83),
    };
  });
}

export type AccountInfo = {
  personaName: string;
  ipCountry: string;
};

export function decodeAccountInfo(bytes: Uint8Array): AccountInfo {
  const fields = readMessage(bytes);

  return {
    personaName: asString(firstOf(fields, 1)),
    ipCountry: asString(firstOf(fields, 2)),
  };
}

/**
 * `CMsgClientRequestFriendData`. Used as a fallback when the server has not
 * pushed persona state for a friend yet, so their name and avatar stay blank.
 */
export function encodeRequestFriendData(
  personaStateRequested: number,
  steamIds: string[],
): Uint8Array {
  const writer = new ProtoWriter().uint32(1, personaStateRequested);

  for (const steamId of steamIds) {
    writer.fixed64(2, steamId);
  }

  return writer.finish();
}

/* -------------------------------------------------------------------------- */
/* Direct messages                                                            */
/* -------------------------------------------------------------------------- */

/** `EChatEntryType` values used by `CFriendMessages_SendMessage_Request`. */
export const ChatEntryType = {
  ChatMsg: 1,
  Typing: 2,
} as const;

export type SendMessageInput = {
  steamId: string;
  chatEntryType: number;
  message: string;
  containsBbcode: boolean;
  clientMessageId?: string;
};

/** `CFriendMessages_SendMessage_Request` */
export function encodeSendMessage(input: SendMessageInput): Uint8Array {
  const writer = new ProtoWriter()
    .fixed64(1, input.steamId)
    .int32(2, input.chatEntryType)
    .string(3, input.message)
    .bool(4, input.containsBbcode);

  if (input.clientMessageId) {
    writer.string(8, input.clientMessageId);
  }

  return writer.finish();
}

export type SendMessageResponse = {
  modifiedMessage: string;
  serverTimestamp: number;
  ordinal: number;
  messageWithoutBbCode: string;
};

export function decodeSendMessageResponse(bytes: Uint8Array): SendMessageResponse {
  const fields = readMessage(bytes);

  return {
    modifiedMessage: asString(firstOf(fields, 1)),
    serverTimestamp: asNumber(firstOf(fields, 2)),
    ordinal: asNumber(firstOf(fields, 3)),
    messageWithoutBbCode: asString(firstOf(fields, 4)),
  };
}

export type IncomingMessage = {
  steamIdFriend: string;
  chatEntryType: number;
  fromLimitedAccount: boolean;
  message: string;
  timestamp: number;
  ordinal: number;
  localEcho: boolean;
  messageNoBbcode: string;
  lowPriority: boolean;
};

function asFixed32(entry: ProtoField | undefined): number {
  if (!entry || !(entry.value instanceof Uint8Array) || entry.value.length < 4) {
    return 0;
  }

  const view = new DataView(
    entry.value.buffer,
    entry.value.byteOffset,
    entry.value.byteLength,
  );
  return view.getUint32(0, true);
}

/** `CFriendMessages_IncomingMessage_Notification` */
export function decodeIncomingMessage(bytes: Uint8Array): IncomingMessage {
  const fields = readMessage(bytes);

  return {
    steamIdFriend: asUint64String(firstOf(fields, 1)),
    chatEntryType: asNumber(firstOf(fields, 2)),
    fromLimitedAccount: asBoolean(firstOf(fields, 3)),
    message: asString(firstOf(fields, 4)),
    timestamp: asFixed32(firstOf(fields, 5)),
    ordinal: asNumber(firstOf(fields, 6)),
    localEcho: asBoolean(firstOf(fields, 7)),
    messageNoBbcode: asString(firstOf(fields, 8)),
    lowPriority: asBoolean(firstOf(fields, 9)),
  };
}

export type AckEcho = {
  steamIdPartner: string;
  timestamp: number;
};

/** `CFriendMessages_AckMessage_Notification` */
export function decodeAckEcho(bytes: Uint8Array): AckEcho {
  const fields = readMessage(bytes);

  return {
    steamIdPartner: asUint64String(firstOf(fields, 1)),
    timestamp: asNumber(firstOf(fields, 2)),
  };
}

/**
 * The same message doubles as the `FriendMessages.AckMessage#1` request, which
 * tells Steam the conversation has been read up to `timestamp`.
 */
export function encodeAckMessage(steamIdPartner: string, timestamp: number): Uint8Array {
  return new ProtoWriter()
    .fixed64(1, steamIdPartner)
    .uint32(2, timestamp >>> 0)
    .finish();
}

export type RecentMessagesInput = {
  steamId1: string;
  steamId2: string;
  count: number;
  bbcodeFormat: boolean;
  rtime32StartTime: number;
  startOrdinal: number;
  timeLast: number;
  ordinalLast: number;
};

/** `CFriendMessages_GetRecentMessages_Request` */
export function encodeGetRecentMessages(input: RecentMessagesInput): Uint8Array {
  return new ProtoWriter()
    .fixed64(1, input.steamId1)
    .fixed64(2, input.steamId2)
    .uint32(3, input.count)
    .bool(6, input.bbcodeFormat)
    .fixed32(5, input.rtime32StartTime)
    .uint32(7, input.startOrdinal)
    .uint32(8, input.timeLast >>> 0)
    .uint32(9, input.ordinalLast)
    .finish();
}

export type RecentMessage = {
  accountId: number;
  timestamp: number;
  message: string;
  ordinal: number;
};

export type RecentMessagesResponse = {
  messages: RecentMessage[];
  moreAvailable: boolean;
};

export function decodeRecentMessagesResponse(bytes: Uint8Array): RecentMessagesResponse {
  const fields = readMessage(bytes);

  return {
    messages: allOf(fields, 1).map((entry) => {
      const message = readMessage(asBytes(entry));

      return {
        accountId: asNumber(firstOf(message, 1)),
        timestamp: asNumber(firstOf(message, 2)),
        message: asString(firstOf(message, 3)),
        ordinal: asNumber(firstOf(message, 4)),
      };
    }),
    moreAvailable: asBoolean(firstOf(fields, 4)),
  };
}

export type MessageSession = {
  accountIdFriend: number;
  lastMessage: number;
  lastView: number;
  unreadMessageCount: number;
};

export type MessageSessionsResponse = {
  sessions: MessageSession[];
};

export function encodeGetActiveMessageSessions(input: {
  lastMessageSince: number;
  onlySessionsWithMessages: boolean;
}): Uint8Array {
  return new ProtoWriter()
    .uint32(1, input.lastMessageSince >>> 0)
    .bool(2, input.onlySessionsWithMessages)
    .finish();
}

export function decodeMessageSessions(bytes: Uint8Array): MessageSessionsResponse {
  const fields = readMessage(bytes);

  return {
    sessions: allOf(fields, 1).map((entry) => {
      const session = readMessage(asBytes(entry));

      return {
        accountIdFriend: asNumber(firstOf(session, 1)),
        lastMessage: asNumber(firstOf(session, 2)),
        lastView: asNumber(firstOf(session, 3)),
        unreadMessageCount: asNumber(firstOf(session, 4)),
      };
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Multi-message envelopes                                                    */
/* -------------------------------------------------------------------------- */

export type MultiMessage = {
  sizeUnzipped: number;
  messageBody: Uint8Array;
};

/** `CMsgMulti` */
export function decodeMulti(bytes: Uint8Array): MultiMessage {
  const fields = readMessage(bytes);

  return {
    sizeUnzipped: asNumber(firstOf(fields, 1)),
    messageBody: asBytes(firstOf(fields, 2)),
  };
}

/** `CMsgClientLoggedOff` */
export function decodeLoggedOff(bytes: Uint8Array): number {
  return asNumber(firstOf(readMessage(bytes), 1));
}
