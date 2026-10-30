/**
 * Steam client-messaging (CM) WebSocket client.
 *
 * The transport mirrors the Steam Chat Android app:
 *
 *   wss://<cm-host>/cmsocket/
 *   frame = uint32le(eMsg | 0x80000000) | uint32le(headerLength) |
 *           CMsgProtoBufHeader | body
 *
 * Service calls are `ServiceMethodCallFromClient` (151) packets with a
 * `target_job_name`; responses come back as `ServiceMethodResponse` (147)
 * keyed by `jobid_target`. Server-pushed notifications arrive as
 * `ServiceMethodSendToClient` (152) and are dispatched by `target_job_name`.
 */

import { inflate } from 'pako';

import type { GenerateAccessTokenResult } from './auth-api';
import { EResult } from './constants';
import { ProtoWriter, asString, firstOf, readMessage } from './protobuf';
import { decodeEmoticonList, type SteamEmoticon } from './chat-media';
import {
  ChatEntryType,
  EMsg,
  GID_NIL,
  decodeAccountInfo,
  decodeAckEcho,
  decodeChatRoomAckEcho,
  decodeChatRoomGroupRoomsChange,
  decodeChatRoomGroupUserStateNotification,
  decodeCreateChatRoomGroupResponse,
  decodeGetChatRoomGroupStateResponse,
  decodeChatRoomGroupsResponse,
  decodeChatRoomHeaderStateNotification,
  decodeChatRoomHistoryResponse,
  decodeChatRoomMessageModified,
  decodeFriendsList,
  decodeHeader,
  decodeIncomingChatRoomMessage,
  decodeIncomingMessage,
  decodeLoggedOff,
  decodeLogonResponse,
  decodeMessageSessions,
  decodeMulti,
  decodePersonaState,
  decodePlayerLinkDetailsResponse,
  decodeRecentMessagesResponse,
  decodeSendChatRoomMessageResponse,
  decodeSendMessageResponse,
  decodeSetActiveChatRoomGroupsResponse,
  encodeAckChatRoomMessage,
  encodeAckMessage,
  encodeChangeStatus,
  encodeCreateChatRoomGroup,
  encodeGetActiveMessageSessions,
  encodeGetChatRoomGroupState,
  encodeGetChatRoomHistory,
  encodeGetPlayerLinkDetails,
  encodeGetRecentMessages,
  encodeHeader,
  encodeLogon,
  encodeRequestFriendData,
  encodeSendChatRoomMessage,
  encodeSendMessage,
  encodeSetActiveChatRoomGroups,
  type AckEcho,
  type AccountInfo,
  type ChatRoomAckEcho,
  type ChatRoomGroupHeaderState,
  type ChatRoomGroupRoomsChange,
  type ChatRoomGroupState,
  type ChatRoomGroupUserStateNotification,
  type ChatRoomHistoryInput,
  type ChatRoomHistoryResponse,
  type ChatRoomMessageModified,
  type ChatRoomSummaryPair,
  type CmFriend,
  type CmPersona,
  type CreatedChatRoomGroup,
  type IncomingChatRoomMessage,
  type IncomingMessage,
  type MessageSession,
  type PlayerProfile,
  type RecentMessagesResponse,
  type SendChatRoomMessageResponse,
  type SendMessageResponse,
} from './cm-proto';

const CM_LIST_URL =
  'https://api.steampowered.com/ISteamDirectory/GetCMListForConnect/v1/?cellid=0&cmtype=websockets&origin=';

const HEARTBEAT_INTERVAL_MS = 27_000;
const LOGON_TIMEOUT_MS = 20_000;
const RPC_TIMEOUT_MS = 15_000;
const CM_LIST_TIMEOUT_MS = 10_000;

const SOCKET_OPEN = 1;

/**
 * `EClientPersonaStateFlag` mask for a complete friend update: status, name,
 * presence, game name, and rich presence. Steam only sends the rich-presence
 * key/value pairs when the 0x1000 bit is requested.
 */
const PERSONA_STATE_FLAGS = 0x17ff;

/** Logon results that cannot be fixed by reconnecting with the same token. */
const TERMINAL_LOGON_RESULTS = new Set<number>([
  EResult.InvalidPassword,
  EResult.AccessDenied,
  EResult.AccountNotFound,
  EResult.Revoked,
  EResult.Expired,
  EResult.AccountDisabled,
  EResult.AccountLogonDenied,
  EResult.InvalidLoginAuthCode,
]);

export class SteamCmError extends Error {
  readonly eresult: number;

  constructor(eresult: number, message: string) {
    super(message);
    this.name = 'SteamCmError';
    this.eresult = eresult;
  }
}

export type SteamCmConnectionState = 'connecting' | 'connected' | 'disconnected';

export type SteamCmEvent =
  | { type: 'connection'; state: SteamCmConnectionState }
  | { type: 'logged-on'; steamId: string }
  | { type: 'auth-error'; eresult: number }
  | { type: 'friends'; friends: CmFriend[]; incremental: boolean }
  | { type: 'persona'; updates: CmPersona[] }
  | { type: 'account-info'; info: AccountInfo }
  | { type: 'message'; message: IncomingMessage }
  | { type: 'ack'; ack: AckEcho }
  | { type: 'sessions'; sessions: MessageSession[] }
  | { type: 'chat-groups'; groups: ChatRoomSummaryPair[] }
  | { type: 'chat-groups-error' }
  | { type: 'chat-group-message'; message: IncomingChatRoomMessage }
  | { type: 'chat-group-ack'; ack: ChatRoomAckEcho }
  | { type: 'chat-group-user-state'; notification: ChatRoomGroupUserStateNotification }
  | { type: 'chat-group-header'; header: ChatRoomGroupHeaderState }
  | { type: 'chat-group-rooms'; change: ChatRoomGroupRoomsChange }
  | { type: 'chat-group-modified'; change: ChatRoomMessageModified }
  | { type: 'chat-groups-resync' };

export type SteamCmClientOptions = {
  steamId: string;
  accountName: string;
  /** Read lazily so a rotated refresh token is used on the next reconnect. */
  getRefreshToken: () => string;
  onEvent: (event: SteamCmEvent) => void;
};

type PendingRpc = {
  resolve: (value: CmServiceResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type CmServiceResponse = {
  eresult: number;
  errorMessage: string;
  body: Uint8Array;
};

export type RecentMessagesOptions = {
  count: number;
  startTime?: number;
  startOrdinal?: number;
  timeLast?: number;
  ordinalLast?: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function writeUint32LE(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function toUint8Array(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return null;
}

export class SteamCmClient {
  private readonly accountName: string;
  private readonly getRefreshToken: () => string;
  private readonly onEvent: (event: SteamCmEvent) => void;

  private steamId: string;
  private sessionId = 0;
  private clientInstanceId = '0';
  private callSeq = 1;
  private loggedOn = false;
  private stopped = true;
  private authFailed = false;
  private running = false;

  private socket: WebSocket | null = null;
  private closeSocket: (() => void) | null = null;
  private logonTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private endpoints: string[] = [];
  private endpointIndex = 0;
  private reconnectDelay = 1_000;

  private readonly pending = new Map<string, PendingRpc>();
  /** Groups this session has activated; replayed after every reconnect. */
  private readonly activeChatGroupIds = new Set<string>();

  constructor(options: SteamCmClientOptions) {
    this.steamId = options.steamId;
    this.accountName = options.accountName;
    this.getRefreshToken = options.getRefreshToken;
    this.onEvent = options.onEvent;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.stopped = false;
    this.authFailed = false;
    void this.run();
  }

  stop(): void {
    this.stopped = true;
    this.loggedOn = false;
    this.clearLogonTimer();
    this.stopHeartbeat();
    this.rejectPending(new SteamCmError(EResult.NoConnection, 'Disconnected from Steam'));
    this.closeSocket?.();
    this.closeSocket = null;
    this.socket = null;
  }

  /**
   * Reconnects immediately. Without `force`, an established session is left
   * alone; with it, the socket is dropped and a fresh logon is performed (used
   * after the app has been in the background long enough for the CM to time us
   * out without the socket noticing).
   */
  reconnectNow(force = false): void {
    if (this.stopped || this.authFailed) {
      return;
    }

    if (!force && this.loggedOn && this.socket?.readyState === SOCKET_OPEN) {
      return;
    }

    this.reconnectDelay = 1_000;
    this.closeSocket?.();
  }

  get isLoggedOn(): boolean {
    return this.loggedOn;
  }

  /** Refresh the web cookie token over the authenticated CM, as the APK does. */
  async generateAccessTokenForApp(refreshToken = this.getRefreshToken()): Promise<GenerateAccessTokenResult> {
    const response = await this.sendServiceRequest(
      'Authentication.GenerateAccessTokenForApp#1',
      new ProtoWriter()
        .string(1, refreshToken)
        .fixed64(2, this.steamId)
        .enum(3, 1)
        .finish(),
    );
    const fields = readMessage(response.body);
    const accessToken = asString(firstOf(fields, 1));
    if (!accessToken) {
      throw new SteamCmError(EResult.Fail, 'Steam did not return a refreshed access token.');
    }
    return { accessToken, refreshToken: asString(firstOf(fields, 2)) };
  }

  async sendMessage(
    steamId: string,
    message: string,
    clientMessageId: string,
  ): Promise<SendMessageResponse> {
    const response = await this.sendServiceRequest(
      'FriendMessages.SendMessage#1',
      encodeSendMessage({
        steamId,
        chatEntryType: ChatEntryType.ChatMsg,
        message,
        containsBbcode: true,
        clientMessageId,
      }),
    );

    return decodeSendMessageResponse(response.body);
  }

  /** Typing notifications are throttled by the caller, not by the transport. */
  async sendTyping(steamId: string): Promise<void> {
    await this.sendServiceRequest(
      'FriendMessages.SendMessage#1',
      encodeSendMessage({
        steamId,
        chatEntryType: ChatEntryType.Typing,
        message: '',
        containsBbcode: false,
      }),
    );
  }

  async getRecentMessages(
    steamId: string,
    options: RecentMessagesOptions,
  ): Promise<RecentMessagesResponse> {
    const response = await this.sendServiceRequest(
      'FriendMessages.GetRecentMessages#1',
      encodeGetRecentMessages({
        steamId1: this.steamId,
        steamId2: steamId,
        count: options.count,
        bbcodeFormat: true,
        rtime32StartTime: options.startTime ?? 0,
        startOrdinal: options.startOrdinal ?? 0,
        timeLast: options.timeLast ?? 0x7fffffff,
        ordinalLast: options.ordinalLast ?? 0,
      }),
    );

    return decodeRecentMessagesResponse(response.body);
  }

  async getActiveMessageSessions(): Promise<MessageSession[]> {
    const response = await this.sendServiceRequest(
      'FriendMessages.GetActiveMessageSessions#1',
      encodeGetActiveMessageSessions({
        lastMessageSince: 0,
        onlySessionsWithMessages: true,
      }),
    );

    return decodeMessageSessions(response.body).sessions;
  }

  async getEmoticons(): Promise<SteamEmoticon[]> {
    const response = await this.sendServiceRequest('Player.GetEmoticonList#1', new Uint8Array());
    return decodeEmoticonList(response.body);
  }

  async requestFriendPersonaStates(): Promise<void> {
    await this.sendServiceRequest('Chat.RequestFriendPersonaStates#1', new Uint8Array(0));
  }

  /**
   * Asks the CM for persona data on specific friends. `personaStateRequested`
   * is an `EClientPersonaStateFlag` mask. The mask includes rich presence so
   * an in-game row can show the same short status line as Steam's own client.
   */
  requestFriendData(steamIds: string[]): void {
    if (steamIds.length === 0 || !this.loggedOn) {
      return;
    }

    this.sendPacket(
      EMsg.ClientRequestFriendData,
      encodeHeader({ steamId: this.steamId, clientSessionId: this.sessionId }),
      encodeRequestFriendData(PERSONA_STATE_FLAGS, steamIds),
    );
  }

  /** Marks a conversation as read up to `timestamp` (unix seconds). */
  async ackMessage(steamId: string, timestamp: number): Promise<void> {
    if (timestamp <= 0) {
      return;
    }

    await this.sendServiceRequest(
      'FriendMessages.AckMessage#1',
      encodeAckMessage(steamId, timestamp),
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Group chat                                                               */
  /* ------------------------------------------------------------------------ */

  async getMyChatRoomGroups(): Promise<ChatRoomSummaryPair[]> {
    const response = await this.sendServiceRequest(
      'ChatRoom.GetMyChatRoomGroups#1',
      new Uint8Array(0),
    );

    return decodeChatRoomGroupsResponse(response.body);
  }

  /**
   * Creates a group chat and invites `invitees` in the same service call.
   * Steam returns the full group state plus the creator's user state, so the
   * caller can show the new group before any follow-up list refresh arrives.
   */
  async createChatRoomGroup(
    invitees: string[],
    name = '',
  ): Promise<CreatedChatRoomGroup> {
    if (invitees.length === 0) {
      throw new SteamCmError(EResult.InvalidParam, 'Choose at least one friend');
    }

    const response = await this.sendServiceRequest(
      'ChatRoom.CreateChatRoomGroup#1',
      encodeCreateChatRoomGroup({ name, invitees }),
    );
    const created = decodeCreateChatRoomGroupResponse(response.body);

    if (!created.chatGroupId || created.chatGroupId === '0') {
      throw new SteamCmError(EResult.Fail, 'Steam did not return the new group chat');
    }

    this.activeChatGroupIds.add(created.chatGroupId);
    return created;
  }

  /**
   * Activates group chats for this CM session. Steam only pushes live
   * messages for active groups, so the app keeps every listed group active
   * while it is running (the desktop client activates groups per open window).
   */
  async setActiveChatRoomGroups(
    chatGroupIds: string[],
    requestGroupData = false,
  ): Promise<ChatRoomGroupState[]> {
    this.activeChatGroupIds.clear();

    for (const chatGroupId of chatGroupIds) {
      this.activeChatGroupIds.add(chatGroupId);
    }

    if (chatGroupIds.length === 0) {
      return [];
    }

    const response = await this.sendServiceRequest(
      'ChatRoom.SetSessionActiveChatRoomGroups#1',
      encodeSetActiveChatRoomGroups({
        chatGroupIds,
        requestGroupData: requestGroupData ? chatGroupIds : undefined,
      }),
    );

    return decodeSetActiveChatRoomGroupsResponse(response.body);
  }

  async getChatRoomGroupState(chatGroupId: string): Promise<ChatRoomGroupState> {
    const response = await this.sendServiceRequest(
      'ChatRoom.GetChatRoomGroupState#1',
      encodeGetChatRoomGroupState(chatGroupId),
    );

    return decodeGetChatRoomGroupStateResponse(response.body);
  }

  async getChatRoomHistory(input: ChatRoomHistoryInput): Promise<ChatRoomHistoryResponse> {
    const response = await this.sendServiceRequest(
      'ChatRoom.GetMessageHistory#1',
      encodeGetChatRoomHistory(input),
    );

    return decodeChatRoomHistoryResponse(response.body);
  }

  async sendChatRoomMessage(
    chatGroupId: string,
    chatId: string,
    message: string,
  ): Promise<SendChatRoomMessageResponse> {
    const response = await this.sendServiceRequest(
      'ChatRoom.SendChatMessage#1',
      encodeSendChatRoomMessage({
        chatGroupId,
        chatId,
        message,
        echoToSender: false,
      }),
    );

    return decodeSendChatRoomMessageResponse(response.body);
  }

  /** Read receipts for group rooms use a client notification, not a request. */
  ackChatRoomMessage(chatGroupId: string, chatId: string, timestamp: number): void {
    if (timestamp <= 0) {
      return;
    }

    this.sendServiceNotification(
      'ChatRoom.AckChatMessage#1',
      encodeAckChatRoomMessage({ chatGroupId, chatId, timestamp }),
    );
  }

  async getPlayerProfiles(steamIds: string[]): Promise<PlayerProfile[]> {
    if (steamIds.length === 0) {
      return [];
    }

    const response = await this.sendServiceRequest(
      'Player.GetPlayerLinkDetails#1',
      encodeGetPlayerLinkDetails(steamIds),
    );

    return decodePlayerLinkDetailsResponse(response.body);
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      try {
        if (this.endpoints.length === 0) {
          this.endpoints = await this.fetchCmList();
          this.endpointIndex = 0;
        }

        if (this.endpoints.length === 0) {
          throw new Error('Steam returned no CM endpoints');
        }

        if (this.stopped) {
          break;
        }

        const endpoint = this.endpoints[this.endpointIndex % this.endpoints.length];
        this.endpointIndex += 1;

        if (this.endpointIndex % this.endpoints.length === 0) {
          // Full cycle: fetch a fresh list before trying these hosts again.
          this.endpoints = [];
        }

        await this.openSocket(endpoint);
      } catch {
        // Any failure is retried with backoff below.
      }

      if (this.stopped || this.authFailed) {
        break;
      }

      this.emit({ type: 'connection', state: 'disconnected' });
      await delay(this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    }

    this.running = false;
  }

  private async fetchCmList(): Promise<string[]> {
    const url = `${CM_LIST_URL}${encodeURIComponent('https://steamcommunity.com')}`;

    const response = await Promise.race([
      fetch(url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('CM list request timed out')), CM_LIST_TIMEOUT_MS),
      ),
    ]);

    if (!response.ok) {
      throw new Error(`CM list request failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      response?: { serverlist?: { endpoint?: unknown }[] };
    };

    return (payload.response?.serverlist ?? [])
      .map((entry) => entry.endpoint)
      .filter((endpoint): endpoint is string => typeof endpoint === 'string' && endpoint.length > 0);
  }

  private openSocket(endpoint: string): Promise<void> {
    this.emit({ type: 'connection', state: 'connecting' });

    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        this.clearLogonTimer();
        this.stopHeartbeat();
        this.loggedOn = false;
        this.socket = null;
        this.closeSocket = null;
        this.rejectPending(new SteamCmError(EResult.NoConnection, 'Connection to Steam closed'));
        resolve();
      };

      let socket: WebSocket;

      try {
        socket = new WebSocket(`wss://${endpoint}/cmsocket/`);
      } catch {
        finish();
        return;
      }

      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      this.closeSocket = () => {
        try {
          socket.close();
        } catch {
          // The socket may already be closed.
        }
        finish();
      };

      socket.onopen = () => {
        this.emit({ type: 'connection', state: 'connected' });
        this.sendLogon();
      };

      socket.onmessage = (event: MessageEvent) => {
        void this.handleSocketData(event.data as unknown);
      };

      socket.onerror = () => {
        // `onclose` always follows; nothing to do here.
      };

      socket.onclose = () => {
        finish();
      };
    });
  }

  private sendLogon(): void {
    this.clearLogonTimer();

    const header = encodeHeader({
      steamId: this.steamId,
      clientSessionId: 0,
    });

    const body = encodeLogon({
      accountName: this.accountName,
      refreshToken: this.getRefreshToken(),
      clientInstanceId: this.clientInstanceId,
      lastSessionId: this.sessionId,
    });

    this.sendPacket(EMsg.ClientLogon, header, body);

    this.logonTimer = setTimeout(() => {
      if (!this.loggedOn) {
        this.closeSocket?.();
      }
    }, LOGON_TIMEOUT_MS);
  }

  private async handleSocketData(data: unknown): Promise<void> {
    let bytes = toUint8Array(data);

    if (!bytes && typeof Blob !== 'undefined' && data instanceof Blob) {
      bytes = new Uint8Array(await data.arrayBuffer());
    }

    if (!bytes || bytes.length < 8) {
      return;
    }

    const eMsg = readUint32LE(bytes, 0) & 0x7fffffff;
    const headerLength = readUint32LE(bytes, 4);

    if (8 + headerLength > bytes.length) {
      return;
    }

    const header = decodeHeader(bytes.subarray(8, 8 + headerLength));
    const body = bytes.subarray(8 + headerLength);

    if (eMsg === EMsg.Multi) {
      this.handleMulti(body);
      return;
    }

    this.handlePacket(eMsg, header, body);
  }

  private handleMulti(body: Uint8Array): void {
    let payload: Uint8Array;

    try {
      const multi = decodeMulti(body);
      payload = multi.sizeUnzipped > 0 ? inflate(multi.messageBody) : multi.messageBody;
    } catch {
      return;
    }

    let offset = 0;

    while (offset + 4 <= payload.length) {
      const length = readUint32LE(payload, offset);
      offset += 4;

      if (length < 8 || offset + length > payload.length) {
        break;
      }

      const packet = payload.subarray(offset, offset + length);
      offset += length;

      const eMsg = readUint32LE(packet, 0) & 0x7fffffff;
      const headerLength = readUint32LE(packet, 4);

      if (8 + headerLength > packet.length) {
        continue;
      }

      const header = decodeHeader(packet.subarray(8, 8 + headerLength));
      this.handlePacket(eMsg, header, packet.subarray(8 + headerLength));
    }
  }

  private handlePacket(eMsg: number, header: ReturnType<typeof decodeHeader>, body: Uint8Array): void {
    switch (eMsg) {
      case EMsg.ClientLogOnResponse:
        this.handleLogonResponse(header, body);
        return;
      case EMsg.ClientFriendsList:
        this.handleFriendsList(body);
        return;
      case EMsg.ClientPersonaState:
        this.emit({ type: 'persona', updates: decodePersonaState(body) });
        return;
      case EMsg.ClientAccountInfo:
        this.emit({ type: 'account-info', info: decodeAccountInfo(body) });
        return;
      case EMsg.ClientLoggedOff:
        this.handleLoggedOff(body);
        return;
      case EMsg.ServiceMethodSendToClient:
        if (header.targetJobName) {
          this.handleNotification(header.targetJobName, body);
        }
        return;
      case EMsg.ServiceMethodResponse:
        if (
          header.jobIdTarget &&
          header.jobIdTarget !== '0' &&
          header.jobIdTarget !== GID_NIL
        ) {
          this.resolveRpc(header, body);
        } else if (header.targetJobName) {
          this.handleNotification(header.targetJobName, body);
        }
        return;
      default:
        return;
    }
  }

  private handleLogonResponse(
    header: ReturnType<typeof decodeHeader>,
    body: Uint8Array,
  ): void {
    this.clearLogonTimer();

    const response = decodeLogonResponse(body);

    if (response.eresult !== EResult.OK) {
      this.loggedOn = false;

      if (TERMINAL_LOGON_RESULTS.has(response.eresult)) {
        this.authFailed = true;
        this.emit({ type: 'auth-error', eresult: response.eresult });
      }

      this.closeSocket?.();
      return;
    }

    this.steamId = response.clientSuppliedSteamId || this.steamId;
    this.sessionId = header.clientSessionId;
    this.clientInstanceId = response.clientInstanceId || this.clientInstanceId;
    this.loggedOn = true;
    this.reconnectDelay = 1_000;

    this.startHeartbeat();
    this.emit({ type: 'logged-on', steamId: this.steamId });
    this.sendChangeStatus(1);
    void this.loadSessions();
    void this.loadChatGroups();

    // A reconnect starts a new CM session, so previously active groups must
    // be activated again before Steam will push their messages.
    if (this.activeChatGroupIds.size > 0) {
      void this.setActiveChatRoomGroups([...this.activeChatGroupIds]).catch(() => {
        // The provider retries after it receives the fresh group list.
      });
    }
  }

  private handleLoggedOff(body: Uint8Array): void {
    const eresult = decodeLoggedOff(body);
    this.loggedOn = false;

    if (TERMINAL_LOGON_RESULTS.has(eresult)) {
      this.authFailed = true;
      this.emit({ type: 'auth-error', eresult });
    }

    this.closeSocket?.();
  }

  private handleFriendsList(body: Uint8Array): void {
    const list = decodeFriendsList(body);
    this.emit({ type: 'friends', friends: list.friends, incremental: list.incremental });

    if (!list.incremental) {
      void this.requestFriendPersonaStates().catch(() => {
        // Persona states are also pushed by the server; this is a best-effort
        // catch-up request for the full friends list.
      });
    }
  }

  private handleNotification(name: string, body: Uint8Array): void {
    switch (name) {
      case 'FriendMessagesClient.IncomingMessage#1':
        this.emit({ type: 'message', message: decodeIncomingMessage(body) });
        return;
      case 'FriendMessagesClient.NotifyAckMessageEcho#1':
        this.emit({ type: 'ack', ack: decodeAckEcho(body) });
        return;
      case 'ChatRoomClient.NotifyIncomingChatMessage#1':
        this.emit({ type: 'chat-group-message', message: decodeIncomingChatRoomMessage(body) });
        return;
      case 'ChatRoomClient.NotifyAckChatMessageEcho#1':
        this.emit({ type: 'chat-group-ack', ack: decodeChatRoomAckEcho(body) });
        return;
      case 'ChatRoomClient.NotifyChatGroupUserStateChanged#1':
        this.emit({
          type: 'chat-group-user-state',
          notification: decodeChatRoomGroupUserStateNotification(body),
        });
        return;
      case 'ChatRoomClient.NotifyChatRoomHeaderStateChange#1':
        this.emit({
          type: 'chat-group-header',
          header: decodeChatRoomHeaderStateNotification(body),
        });
        return;
      case 'ChatRoomClient.NotifyChatRoomGroupRoomsChange#1':
        this.emit({
          type: 'chat-group-rooms',
          change: decodeChatRoomGroupRoomsChange(body),
        });
        return;
      case 'ChatRoomClient.NotifyChatMessageModified#1':
        this.emit({
          type: 'chat-group-modified',
          change: decodeChatRoomMessageModified(body),
        });
        return;
      case 'ChatRoomClient.NotifyChatRoomDisconnect#1':
        // Steam asks the session to re-activate its groups after a chat
        // backend reconnect. The provider re-sends its active set.
        this.emit({ type: 'chat-groups-resync' });
        return;
      default:
        return;
    }
  }

  private resolveRpc(header: ReturnType<typeof decodeHeader>, body: Uint8Array): void {
    const pending = this.pending.get(header.jobIdTarget);

    if (!pending) {
      return;
    }

    this.pending.delete(header.jobIdTarget);
    clearTimeout(pending.timer);

    if (header.eresult !== EResult.OK) {
      pending.reject(
        new SteamCmError(
          header.eresult,
          header.errorMessage || `Steam request failed with EResult ${header.eresult}`,
        ),
      );
      return;
    }

    pending.resolve({
      eresult: header.eresult,
      errorMessage: header.errorMessage,
      body,
    });
  }

  private sendChangeStatus(personaState: number): void {
    this.sendPacket(
      EMsg.ClientChangeStatus,
      encodeHeader({ steamId: this.steamId, clientSessionId: this.sessionId }),
      encodeChangeStatus({
        personaState,
        personaSetByUser: true,
        needPersonaResponse: true,
        isClientIdle: false,
      }),
    );
  }

  private async loadSessions(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const sessions = await this.getActiveMessageSessions();
        this.emit({ type: 'sessions', sessions });
        return;
      } catch {
        if (attempt === 0) {
          await delay(1_500);
        }
      }
    }
  }

  private async loadChatGroups(): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const groups = await this.getMyChatRoomGroups();
        this.emit({ type: 'chat-groups', groups });
        return;
      } catch {
        if (attempt === 0) {
          await delay(1_500);
        }
      }
    }

    this.emit({ type: 'chat-groups-error' });
  }

  private sendServiceRequest(
    name: string,
    body: Uint8Array,
    timeoutMs = RPC_TIMEOUT_MS,
  ): Promise<CmServiceResponse> {
    if (!this.loggedOn || !this.socket) {
      return Promise.reject(new SteamCmError(EResult.NoConnection, 'Not connected to Steam'));
    }

    const seq = String(this.callSeq);
    this.callSeq += 1;

    const header = encodeHeader({
      steamId: this.steamId,
      clientSessionId: this.sessionId,
      jobIdSource: seq,
      targetJobName: name,
    });

    return new Promise<CmServiceResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new SteamCmError(EResult.Timeout, `${name} timed out`));
      }, timeoutMs);

      // Register before writing so even an immediate reply can find its job.
      this.pending.set(seq, { resolve, reject, timer });

      if (!this.sendPacket(EMsg.ServiceMethodCallFromClient, header, body)) {
        this.pending.delete(seq);
        clearTimeout(timer);
        reject(new SteamCmError(EResult.NoConnection, 'WebSocket is not connected'));
      }
    });
  }

  /**
   * Sends a unified service notification: a `ServiceMethodCallFromClient`
   * frame with a target method but no job id. Steam does not reply.
   */
  private sendServiceNotification(name: string, body: Uint8Array): void {
    if (!this.loggedOn || !this.socket) {
      return;
    }

    this.sendPacket(
      EMsg.ServiceMethodCallFromClient,
      encodeHeader({
        steamId: this.steamId,
        clientSessionId: this.sessionId,
        targetJobName: name,
      }),
      body,
    );
  }

  private sendPacket(eMsg: number, header: Uint8Array, body: Uint8Array): boolean {
    const socket = this.socket;

    if (!socket || socket.readyState !== SOCKET_OPEN) {
      return false;
    }

    const frame = new Uint8Array(8 + header.length + body.length);
    writeUint32LE(frame, 0, (eMsg | 0x80000000) >>> 0);
    writeUint32LE(frame, 4, header.length);
    frame.set(header, 8);
    frame.set(body, 8 + header.length);

    try {
      socket.send(frame);
      return true;
    } catch {
      return false;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!this.loggedOn) {
        return;
      }

      this.sendPacket(
        EMsg.ClientHeartBeat,
        encodeHeader({ steamId: this.steamId, clientSessionId: this.sessionId }),
        new Uint8Array(0),
      );
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearLogonTimer(): void {
    if (this.logonTimer) {
      clearTimeout(this.logonTimer);
      this.logonTimer = null;
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }

    this.pending.clear();
  }

  private emit(event: SteamCmEvent): void {
    try {
      this.onEvent(event);
    } catch {
      // A listener failure must not tear down the transport.
    }
  }
}
