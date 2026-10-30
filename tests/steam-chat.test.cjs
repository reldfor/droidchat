const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { gzip } = require('pako');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const crypto = require('node:crypto');

const container = ({ children }) => React.createElement('div', null, children);
const nativeComponents = {
  StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
  Platform: { OS: 'android' },
  View: container,
  KeyboardAvoidingView: container,
  Text: ({ children }) => React.createElement('span', null, children),
  Pressable: ({ children, accessibilityLabel, disabled }) => React.createElement('button', { 'aria-label': accessibilityLabel, disabled }, children),
  TextInput: ({ placeholder }) => React.createElement('input', { placeholder }),
  ActivityIndicator: () => React.createElement('span', { role: 'progressbar' }),
  Image: ({ source, accessibilityLabel }) => React.createElement('img', { src: source.uri, alt: accessibilityLabel }),
  useWindowDimensions: () => ({ width: 360, height: 800 }),
  FlatList: ({ data, ListHeaderComponent, ListEmptyComponent, renderItem }) =>
    React.createElement(React.Fragment, null, ListHeaderComponent,
      data.length ? data.map((item) => React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))) : ListEmptyComponent),
};

// Load the actual TypeScript without Metro or a device. Only native modules
// unused by these protocol/reducer tests are stubbed; no Steam traffic is sent.
const root = path.resolve(__dirname, '..');
const modules = new Map();
function loadSource(relativePath, overrides = {}, cache = Object.keys(overrides).length ? new Map() : modules) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  let source = fs.readFileSync(filename, 'utf8');
  if (relativePath.endsWith('steam-chat.tsx')) {
    source += '\nexport { reduce, initialState, describeError };';
  }
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  cache.set(filename, module);
  const nativeRequire = createRequire(filename);
  const localRequire = (specifier) => {
    if (Object.hasOwn(overrides, specifier)) return overrides[specifier];
    if (specifier === 'react-native') return nativeComponents;
    if (specifier === '@/context/session') return {};
    if (specifier === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
    if (specifier === 'expo-symbols') return { SymbolView: () => null };
    if (specifier === 'expo-image') return { Image: nativeComponents.Image };
    if (specifier === 'expo-crypto') return { getRandomBytes: crypto.randomBytes, digest: async (_algorithm, bytes) => Uint8Array.from(crypto.createHash('sha1').update(bytes).digest()).buffer, CryptoDigestAlgorithm: { SHA1: 'SHA-1' } };
    if (specifier === 'expo-image-picker') return { launchImageLibraryAsync: async () => ({ canceled: true, assets: null }) };
    if (specifier === 'expo-image-manipulator') return { ImageManipulator: {}, SaveFormat: { PNG: 'png', JPEG: 'jpeg' } };
    if (specifier === 'expo-file-system') return { File: class {} };
    if (specifier === 'expo-network') return { useNetworkState: () => ({}), NetworkStateType: { WIFI: 'WIFI' } };
    if (specifier === 'expo-secure-store') return { getItemAsync: async () => null, setItemAsync: async () => {}, deleteItemAsync: async () => {} };
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return nativeRequire(specifier);
    const base = specifier.startsWith('@/')
      ? path.join(root, 'src', specifier.slice(2))
      : path.resolve(path.dirname(filename), specifier);
    const dependency = ['.ts', '.tsx'].map((extension) => base + extension).find(fs.existsSync);
    assert.ok(dependency, `Cannot resolve ${specifier} from ${filename}`);
    return loadSource(path.relative(root, dependency), overrides, cache);
  };
  vm.runInThisContext(`(function(require, module, exports) {\n${compiled}\n})`, { filename })(localRequire, module, module.exports);
  return module.exports;
}

const { SteamCmClient, SteamCmError } = loadSource('src/lib/steam/cm-client.ts');
const { ProtoWriter, readMessage, firstOf, asString, asUint64String } = loadSource('src/lib/steam/protobuf.ts');
const { decodeHeader, decodePersonaState, encodeGetRecentMessages, GID_NIL } = loadSource('src/lib/steam/cm-proto.ts');
const { richPresenceText } = loadSource('src/lib/steam/chat-utils.ts');
const { loadGameAssets, parseStoreItems, communityIconUrl, gameLogoUrl } = loadSource('src/lib/steam/game-assets.ts');
const { reduce, initialState, describeError } = loadSource('src/context/steam-chat.tsx');
const { ConversationScreen } = loadSource('src/components/chat/conversation-screen.tsx');
const { FriendRow } = loadSource('src/components/friends/friend-row.tsx');
const self = '76561197960265729';
const friend = '76561197960265730';

// Packet IDs and field types here are independent wire fixtures from SteamKit's
// emsg.steamd and SteamTracking's steammessages_{base,friendmessages}.proto.
function frame(emsg, header, body = new Uint8Array()) {
  const bytes = new Uint8Array(8 + header.length + body.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, (emsg | 0x80000000) >>> 0, true);
  view.setUint32(4, header.length, true);
  bytes.set(header, 8);
  bytes.set(body, 8 + header.length);
  return bytes;
}

function setup(t, onSend) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const sent = [];
  const events = [];
  const client = new SteamCmClient({ steamId: self, accountName: 'test', getRefreshToken: () => '', onEvent: (event) => events.push(event) });
  client.loggedOn = true;
  client.socket = {
    readyState: 1,
    send(bytes) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      assert.equal(view.getUint32(0, true) & 0x7fffffff, 151);
      const headerLength = view.getUint32(4, true);
      const header = decodeHeader(bytes.subarray(8, 8 + headerLength));
      sent.push({ header, body: bytes.subarray(8 + headerLength) });
      onSend?.(client, header);
    },
  };
  t.after(() => client.stop());
  return { client, sent, events };
}

function reply(client, request, body = new Uint8Array(), result = 1) {
  return client.handleSocketData(frame(147, new ProtoWriter().fixed64(11, request.header.jobIdSource).int32(13, result).finish(), body));
}

function historyLoading() {
  return reduce({ ...initialState, selfSteamId: self }, { type: 'loading', steamId: friend });
}

function pendingMessage() {
  return reduce({ ...initialState, selfSteamId: self }, {
    type: 'send-pending', steamId: friend,
    message: { id: 'local-test', authorSteamId: self, text: 'hello', sentAt: 1700000000, ordinal: 0, mine: true, pending: true },
  });
}

test('an empty Steam history reply stops loading and completes the conversation', async (t) => {
  const { client, sent } = setup(t);
  let state = historyLoading();
  const result = client.getRecentMessages(friend, { count: 100 }).then((response) => {
    state = reduce(state, { type: 'loaded', steamId: friend, ...response });
  });
  const completed = assert.doesNotReject(result);
  await reply(client, sent[0]);
  t.mock.timers.tick(15001);
  await completed;
  assert.equal(state.conversations[friend].loaded, true);
  assert.equal(state.conversations[friend].loading, false);
  assert.equal(state.conversations[friend].hasMore, false);
  assert.deepEqual(state.conversations[friend].messages, []);
  assert.equal(client.pending.size, 0);
});

test('history and send replies inside a compressed Multi resolve by job ID out of order', async (t) => {
  const { client, sent } = setup(t);
  const history = client.getRecentMessages(friend, { count: 100 });
  const sending = client.sendMessage(friend, 'hello', 'test-id');
  const completed = assert.doesNotReject(Promise.all([history, sending]));
  const sendBody = new ProtoWriter().uint32(2, 1700000001).uint32(3, 7).finish();
  const historyBody = new ProtoWriter().message(1, new ProtoWriter().uint32(1, 2).uint32(2, 1700000000).string(3, 'older').uint32(4, 6)).bool(4, true).finish();
  const packets = [frame(147, new ProtoWriter().fixed64(11, sent[1].header.jobIdSource).int32(13, 1).finish(), sendBody), frame(147, new ProtoWriter().fixed64(11, sent[0].header.jobIdSource).int32(13, 1).finish(), historyBody)];
  const payload = Buffer.concat(packets.map((packet) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(packet.length);
    return Buffer.concat([size, packet]);
  }));
  await client.handleSocketData(frame(1, new Uint8Array(), new ProtoWriter().uint32(1, payload.length).bytes(2, gzip(payload)).finish()));
  t.mock.timers.tick(15001);
  await completed;
  assert.deepEqual(await history, { messages: [{ accountId: 2, timestamp: 1700000000, message: 'older', ordinal: 6 }], moreAvailable: true });
  assert.equal((await sending).ordinal, 7);
});

test('a successful send is confirmed instead of timing out after delivery', async (t) => {
  const { client, sent } = setup(t);
  let state = pendingMessage();
  const sending = client.sendMessage(friend, 'hello', 'test-id').then((response) => {
    state = reduce(state, { type: 'send-ok', steamId: friend, id: 'local-test', timestamp: response.serverTimestamp, ordinal: response.ordinal });
  });
  const completed = assert.doesNotReject(sending);
  await reply(client, sent[0], new ProtoWriter().uint32(2, 1700000001).uint32(3, 7).finish());
  t.mock.timers.tick(15001);
  await completed;
  const message = state.conversations[friend].messages[0];
  assert.equal(message.pending, false);
  assert.equal(message.failed, false);
  assert.equal(message.sentAt, 1700000001);
  assert.equal(message.ordinal, 7);
});

test('incoming messages, typing and read acknowledgements use notification packet 152', async (t) => {
  const { client, events } = setup(t);
  for (const entryType of [1, 2]) {
    const header = new ProtoWriter().string(12, 'FriendMessagesClient.IncomingMessage#1').finish();
    const body = new ProtoWriter().fixed64(1, friend).int32(2, entryType).string(4, 'hello').finish();
    await client.handleSocketData(frame(152, header, body));
  }
  await client.handleSocketData(frame(152, new ProtoWriter().string(12, 'FriendMessagesClient.NotifyAckMessageEcho#1').finish(), new ProtoWriter().fixed64(1, friend).uint32(2, 1700000000).finish()));
  assert.deepEqual(events.map((event) => event.type), ['message', 'message', 'ack']);
  assert.equal(events[0].message.steamIdFriend, friend);
  assert.equal(events[1].message.chatEntryType, 2);
  assert.equal(events[2].ack.timestamp, 1700000000);
});

test('Steam rejection is returned immediately with its real result code', async (t) => {
  const { client, sent } = setup(t);
  const rejected = assert.rejects(client.sendMessage(friend, 'hello', 'test-id'), (error) => error instanceof SteamCmError && error.eresult === 15);
  await reply(client, sent[0], new Uint8Array(), 15);
  t.mock.timers.tick(15001);
  await rejected;
  assert.equal(client.pending.size, 0);
});

test('a genuine history timeout stops loading and does not claim the connection is down', async (t) => {
  const { client } = setup(t);
  let state = historyLoading();
  const completed = client.getRecentMessages(friend, { count: 100 }).catch((error) => {
    assert.equal(error.eresult, 16);
    state = reduce(state, { type: 'load-error', steamId: friend, error: describeError(error) });
  });
  t.mock.timers.tick(15001);
  await completed;
  assert.equal(state.conversations[friend].loading, false);
  assert.match(state.conversations[friend].error, /respond|response/i);
  assert.doesNotMatch(state.conversations[friend].error, /connection|not reachable/i);
});

test('registers a request before sending so an immediate reply cannot be lost', async (t) => {
  const { client } = setup(t, (current, header) => {
    void reply(current, { header });
  });
  const completed = assert.doesNotReject(client.getActiveMessageSessions());
  t.mock.timers.tick(15001);
  await completed;
  assert.equal(client.pending.size, 0);
});

test('a closed socket rejects the request without retaining a job or timeout', async (t) => {
  const { client } = setup(t);
  client.socket.readyState = 3;
  await assert.rejects(client.getRecentMessages(friend, { count: 100 }), (error) => error.eresult === 3);
  assert.equal(client.pending.size, 0);
  t.mock.timers.tick(15001);
});

test('a server echo remains confirmed if the corresponding send later times out', () => {
  let state = pendingMessage();
  state = reduce(state, { type: 'message', message: { steamIdFriend: friend, chatEntryType: 1, message: 'hello', messageNoBbcode: 'hello', timestamp: 1700000001, ordinal: 7, localEcho: true } });
  state = reduce(state, { type: 'send-failed', steamId: friend, id: 'local-test' });
  assert.equal(state.conversations[friend].messages.length, 1);
  assert.equal(state.conversations[friend].messages[0].pending, false);
  assert.equal(state.conversations[friend].messages[0].failed, false);
});

test('an unconfirmed send still reports failure', () => {
  const state = reduce(pendingMessage(), { type: 'send-failed', steamId: friend, id: 'local-test' });
  assert.equal(state.conversations[friend].messages[0].pending, false);
  assert.equal(state.conversations[friend].messages[0].failed, true);
});

test('CM headers honor protobuf defaults and keep 64-bit job IDs exact', () => {
  const empty = decodeHeader(new Uint8Array());
  assert.equal(empty.jobIdTarget, GID_NIL);
  assert.equal(empty.jobIdSource, GID_NIL);
  assert.equal(empty.eresult, 2);
  assert.equal(empty.transportError, 1);
  const largeJob = '18446744073709551614';
  assert.equal(decodeHeader(new ProtoWriter().fixed64(11, largeJob).finish()).jobIdTarget, largeJob);
});

test('history start time uses the fixed32 wire type required by Steam', () => {
  const encoded = encodeGetRecentMessages({ steamId1: self, steamId2: friend, count: 100, bbcodeFormat: true, rtime32StartTime: 1700000000, startOrdinal: 0, timeLast: 0x7fffffff, ordinalLast: 0 });
  const field = firstOf(readMessage(encoded), 5);
  assert.equal(field.wire, 5);
  assert.equal(new DataView(field.value.buffer, field.value.byteOffset, 4).getUint32(0, true), 1700000000);
  assert.equal(asUint64String(firstOf(readMessage(encoded), 1)), self);
});

test('persona updates decode the game rich presence Steam sends with flag 0x1000', () => {
  const kv = (key, value) => new ProtoWriter().string(1, key).string(2, value);
  const body = new ProtoWriter()
    .message(2, new ProtoWriter()
      .fixed64(1, friend)
      .uint32(2, 1)
      .uint32(3, 2507950)
      .string(15, 'Player')
      .string(55, 'Delta Force')
      .message(71, kv('Status', 'Online'))
      .message(71, kv('steam_display', '#Status_Online')))
    .finish();
  const [persona] = decodePersonaState(body);
  assert.equal(persona.gamePlayedAppId, 2507950);
  assert.equal(persona.gameName, 'Delta Force');
  assert.deepEqual(persona.richPresence, { status: 'Online', steam_display: '#Status_Online' });
  assert.equal(richPresenceText(persona.richPresence), 'Online');
  assert.equal(richPresenceText({ steam_display: '#Status_In_Match' }), 'In Match');
  assert.equal(richPresenceText({ status: '#Status_In_Lobby' }), 'In Lobby');
  assert.equal(richPresenceText(null), undefined);
});

test('a friend stops showing the previous game presence when the game changes', () => {
  let state = reduce(initialState, {
    type: 'friends',
    friends: [{ steamId: friend, relationship: 3 }],
    incremental: false,
  });
  const persona = {
    steamId: friend,
    personaState: 1,
    playerName: 'Player',
    avatarHash: null,
    gamePlayedAppId: 2507950,
    gameName: 'Delta Force',
    richPresence: { status: 'Online' },
    lastLogoff: null,
    lastSeenOnline: null,
    personaStateFlags: null,
    onSteamDeck: null,
    gamingDeviceType: null,
  };
  state = reduce(state, { type: 'persona', updates: [persona] });
  assert.equal(state.friends[friend].richPresence, 'Online');
  state = reduce(state, {
    type: 'persona',
    updates: [{ ...persona, gamePlayedAppId: 1938090, gameName: 'Call of Duty®', richPresence: null }],
  });
  assert.equal(state.friends[friend].gameName, 'Call of Duty®');
  assert.equal(state.friends[friend].richPresence, undefined);
});

test('store items resolve to stable community icon and wordmark URLs', () => {
  const items = parseStoreItems({
    response: {
      store_items: [
        { appid: 2507950, name: 'Delta Force', assets: { community_icon: 'abc123' } },
        { appid: 1938090, name: 'Call of Duty®', assets: {} },
        { appid: 'invalid', assets: { community_icon: 'nope' } },
      ],
    },
  });
  assert.deepEqual(items, [
    { appId: 2507950, name: 'Delta Force', iconUrl: communityIconUrl(2507950, 'abc123') },
    { appId: 1938090, name: 'Call of Duty®', iconUrl: null },
  ]);
  assert.equal(communityIconUrl(2507950, 'abc123'), 'https://shared.steamstatic.com/community_assets/images/apps/2507950/abc123.jpg');
  assert.equal(gameLogoUrl(2507950), 'https://shared.steamstatic.com/store_item_assets/steam/apps/2507950/logo.png');
  assert.deepEqual(parseStoreItems(null), []);
});

test('game assets load in one batched request and reuse the session cache', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        response: {
          store_items: [
            { appid: 9999991, name: 'Test Game', assets: { community_icon: 'abc123' } },
          ],
        },
      }),
    };
  };

  try {
    const first = await loadGameAssets([9999991, 9999992]);
    assert.equal(calls.length, 1);
    assert.deepEqual(first[9999991], {
      appId: 9999991,
      name: 'Test Game',
      iconUrl: communityIconUrl(9999991, 'abc123'),
    });
    assert.equal(first[9999992], undefined);

    const second = await loadGameAssets([9999991]);
    assert.equal(calls.length, 1);
    assert.equal(second[9999991].name, 'Test Game');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a failed store request leaves the friends list on its fallback path', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    throw new Error('offline');
  };

  try {
    assert.deepEqual(await loadGameAssets([9999993]), {});
  } finally {
    global.fetch = originalFetch;
  }
});

function renderConversation(props) {
  const noop = () => {};
  return renderToStaticMarkup(React.createElement(ConversationScreen, {
    connection: 'connected', ready: true, friend: { name: 'Test friend', status: 'online' },
    friendTyping: false, hasMore: false, loading: false, messages: [],
    onBack: noop, onLoadMore: noop, onSend: noop, onTyping: noop, onRetryHistory: noop,
    ...props,
  }));
}

test('an empty conversation shows one spinner only while its request is pending', () => {
  const loading = renderConversation({ loading: true });
  assert.equal((loading.match(/role="progressbar"/g) ?? []).length, 1);
  const empty = renderConversation({ loading: false });
  assert.doesNotMatch(empty, /progressbar/);
  assert.match(empty, /No messages yet/);
});

test('a failed history load offers Retry without claiming the conversation is empty', () => {
  const failed = renderConversation({ error: 'Steam did not respond in time. Try again.' });
  assert.doesNotMatch(failed, /progressbar|No messages yet/);
  assert.match(failed, /Could not load this conversation/);
  assert.match(failed, /<button><span>Retry<\/span><\/button>/);
});

test('an in-game friend row shows the game icon, game name and rich presence', () => {
  const html = renderToStaticMarkup(React.createElement(FriendRow, {
    friend: {
      steamId: friend,
      accountId: 1,
      name: 'Player',
      avatarUrl: 'https://example.com/avatar.jpg',
      status: 'online',
      gameAppId: 2507950,
      gameName: 'Delta Force',
      richPresence: 'Online',
      onSteamDeck: false,
      relationship: 3,
    },
    game: {
      appId: 2507950,
      name: 'Delta Force',
      iconUrl: communityIconUrl(2507950, 'abc123'),
    },
    onPress: () => {},
  }));
  assert.match(html, /aria-label="Player, Playing Delta Force, Online"/);
  assert.match(html, /Delta Force/);
  assert.match(html, />Online</);
  assert.match(html, /community_assets\/images\/apps\/2507950\/abc123\.jpg/);
});

const { decodeEmoticonList, parseMessageContent } = loadSource('src/lib/steam/chat-media.ts');
const { uploadChatImage, uploadChatRoomImage, ImageUploadError } = loadSource('src/lib/steam/image-upload.ts');
const { MessageBubble } = loadSource('src/components/chat/message-bubble.tsx');
const { DEFAULT_INTERFACE_SETTINGS, normalizeInterfaceSettings } = loadSource('src/lib/settings.ts');
const steamImageUrl = 'https://images.steamusercontent.com/ugc/123/ABC/';

test('loads the current account emoticons over the authenticated CM service', async (t) => {
  const { client, sent } = setup(t);
  const result = client.getEmoticons();
  assert.equal(sent[0].header.targetJobName, 'Player.GetEmoticonList#1');
  await reply(client, sent[0], new ProtoWriter().message(1, new ProtoWriter().string(1, ':steamhappy:').uint32(3, 123).uint32(4, 5)).finish());
  assert.deepEqual(await result, [{ name: 'steamhappy', lastUsed: 123, useCount: 5 }]);
});

test('normalizes, deduplicates and orders the account emoticon collection', () => {
  const body = new ProtoWriter()
    .message(1, new ProtoWriter().string(1, ':steamhappy:').uint32(3, 10))
    .message(1, new ProtoWriter().string(1, 'steamhappy').uint32(3, 20))
    .message(1, new ProtoWriter().string(1, ':wave:').uint32(3, 30))
    .message(1, new ProtoWriter().string(1, '../invalid')).finish();
  assert.deepEqual(decodeEmoticonList(body).map((item) => item.name), ['wave', 'steamhappy']);
});

test('renders all Steam emoticon formats without removing surrounding whitespace', () => {
  const parts = parseMessageContent('Hello :steamhappy: and [emoticon]wave[/emoticon] ːheartː!');
  assert.deepEqual(parts.filter((part) => part.type === 'emoticon').map((part) => part.name), ['steamhappy', 'wave', 'heart']);
  assert.equal(parts[0].text, 'Hello ');
  assert.equal(parts[2].text, ' and ');
});

test('renders Steam image attributes, thumbnails and legacy image bodies', () => {
  const thumbnail = `${steamImageUrl}?imw=320`;
  const parts = parseMessageContent(`[img src="${steamImageUrl}" thumbnail_src="${thumbnail}" width=800 height=600]${steamImageUrl}[/img] caption`);
  assert.deepEqual(parts[0], { type: 'image', url: steamImageUrl, thumbnailUrl: thumbnail, width: 800, height: 600 });
  assert.equal(parts[1].text, ' caption');
  assert.equal(parseMessageContent(`[img]${steamImageUrl}[/img]`)[0].type, 'image');
  const unclosed = `[img src="${steamImageUrl}" thumbnail_src="${thumbnail}" width=800 height=600]${steamImageUrl}`;
  assert.equal(parseMessageContent(unclosed).length, 1);
  assert.equal(parseMessageContent(unclosed)[0].type, 'image');
  for (const url of ['file:///secret', 'javascript:alert(1)', 'https://localhost/private', 'https://images.steamusercontent.com.evil.test/x']) {
    assert.equal(parseMessageContent(`[img]${url}[/img]`)[0].type, 'text');
  }
});

test('history and live events preserve media markup while chat previews stay readable', () => {
  const content = `[img src="${steamImageUrl}" width=800 height=600][/img]`;
  let state = reduce({ ...initialState, selfSteamId: self }, { type: 'loaded', steamId: friend, messages: [{ accountId: 2, timestamp: 1700000000, message: content, ordinal: 6 }], moreAvailable: false });
  assert.equal(state.conversations[friend].messages[0].content, content);
  assert.equal(state.conversations[friend].preview.text, '[image]');
  state = reduce(state, { type: 'message', message: { steamIdFriend: friend, chatEntryType: 1, message: '[emoticon]steamhappy[/emoticon]', messageNoBbcode: ':steamhappy:', timestamp: 1700000001, ordinal: 7, localEcho: false } });
  assert.equal(state.conversations[friend].messages[1].content, '[emoticon]steamhappy[/emoticon]');
  const html = renderToStaticMarkup(React.createElement(MessageBubble, { message: state.conversations[friend].messages[0] }));
  assert.match(html, /alt="Shared image"/);
  assert.match(html, /steamusercontent/);
});

const uploadCredentials = { steamId: self, accessToken: 'test-access-token', sessionId: '0123456789abcdef01234567' };
const testImage = { uri: 'file:///cache/test.png', bytes: new Uint8Array([137, 80, 78, 71]), filename: 'test.png', mimeType: 'image/png', width: 800, height: 600, sha1: 'a'.repeat(40), dispose() {} };
const beginUpload = { result: { ugcid: '18446744073709551614', use_https: true, url_host: 'storage.steamusercontent.com', url_path: '/signed-upload', request_headers: [{ name: 'Host', value: 'storage.steamusercontent.com' }, { name: 'Content-Length', value: '4' }, { name: 'Content-Type', value: 'image/png' }, { name: 'Authorization', value: 'AWS signed-storage-credential' }] }, hmac: 'signed-hmac', timestamp: 1700000000 };

test('uploads binary bytes and commits directly to the friend without leaking login cookies', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return Response.json(beginUpload);
    if (calls.length === 2) return new Response('', { status: 200 });
    return Response.json({ success: 1, result: { details: { url: steamImageUrl } } });
  });
  assert.equal(await uploadChatImage(uploadCredentials, friend, testImage), steamImageUrl);
  assert.equal(calls.length, 3);
  // Steam's web chat uses the Community origin for CHAT_BASE_URL.
  assert.equal(calls[0].url, 'https://steamcommunity.com/chat/beginfileupload/?l=english');
  const begin = calls[0].options;
  assert.match(begin.headers.Cookie, /steamLoginSecure=76561197960265729%7C%7Ctest-access-token/);
  assert.equal(begin.headers.Origin, 'https://steamcommunity.com');
  assert.equal(begin.headers.Referer, 'https://steamcommunity.com/chat/');
  assert.equal(begin.credentials, 'omit');
  assert.equal(begin.redirect, 'error');
  assert.equal(begin.body.get('sessionid'), uploadCredentials.sessionId);
  assert.match(begin.body.get('file_name'), /^\d+_test\.png$/);
  assert.equal(begin.body.get('file_sha'), testImage.sha1);
  assert.equal(begin.body.get('file_size'), '4');
  assert.equal(calls[1].options.method, 'PUT');
  assert.deepEqual(calls[1].options.body, testImage.bytes);
  assert.deepEqual(calls[1].options.headers, { 'Content-Type': 'image/png', Authorization: 'AWS signed-storage-credential' });
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[1].options.redirect, 'error');
  const commit = calls[2].options;
  assert.equal(calls[2].url, 'https://steamcommunity.com/chat/commitfileupload/');
  assert.equal(commit.headers.Cookie, begin.headers.Cookie);
  assert.equal(commit.body.get('friend_steamid'), friend);
  assert.equal(commit.body.get('ugcid'), '18446744073709551614');
  assert.equal(commit.body.get('hmac'), beginUpload.hmac);
  assert.equal(commit.body.get('file_sha'), begin.body.get('file_sha'));
  assert.equal(commit.body.get('success'), '1');
});

test('group image commits target the room instead of a friend', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return Response.json(beginUpload);
    if (calls.length === 2) return new Response('', { status: 200 });
    return Response.json({ success: 1, result: { details: { url: steamImageUrl } } });
  });
  assert.equal(
    await uploadChatRoomImage(uploadCredentials, '900719925474099', '12', testImage),
    steamImageUrl,
  );
  assert.equal(calls.length, 3);
  const commit = calls[2].options;
  assert.equal(commit.body.get('chat_group_id'), '900719925474099');
  assert.equal(commit.body.get('chat_id'), '12');
  assert.equal(commit.body.get('friend_steamid'), null);
  assert.equal(commit.body.get('spoiler'), '0');
  assert.equal(commit.body.get('success'), '1');
});

test('group image uploads reject malformed room ids before contacting Steam', async (t) => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => {
    requests += 1;
    throw new Error('Unexpected request');
  });
  await assert.rejects(
    uploadChatRoomImage(uploadCredentials, 'not-a-group', '12', testImage),
    /group chat could not be found/,
  );
  await assert.rejects(
    uploadChatRoomImage(uploadCredentials, '900719925474099', '', testImage),
    /group chat could not be found/,
  );
  assert.equal(requests, 0);
});

test('begin failures preserve HTTP/authentication/invalid-response diagnostics and never upload', async (t) => {
  for (const [status, expected] of [
    [401, /upload session \(HTTP 401\)/],
    [403, /upload session \(HTTP 403\)/],
    [404, /HTTP 404/],
    [503, /HTTP 503/],
    [200, /invalid image upload response/],
  ]) {
    await t.test(`HTTP ${status}`, async (t) => {
      let requests = 0;
      t.mock.method(global, 'fetch', async () => {
        requests += 1;
        return new Response('<html>Sign in</html>', { status, headers: { 'Content-Type': 'text/html' } });
      });
      await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage), (error) => {
        assert.ok(error instanceof ImageUploadError);
        assert.equal(error.uncertain, false);
        assert.match(error.message, expected);
        assert.ok(!error.message.includes(uploadCredentials.accessToken));
        return true;
      });
      assert.equal(requests, 1);
    });
  }
});

test('a rejected session surfaces Steam\'s reason without echoing the cookie token', async (t) => {
  t.mock.method(global, 'fetch', async () => Response.json(
    { success: 21, message: 'Not Logged on.' },
    { status: 401 },
  ));
  await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage), (error) => {
    assert.match(error.message, /HTTP 401\): Not Logged on\./);
    assert.ok(!error.message.includes(uploadCredentials.accessToken));
    return true;
  });
});

test('a failed begin connection is retryable and does not attempt PUT or commit', async (t) => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => { requests += 1; throw new TypeError('Network request failed'); });
  await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage), /Could not reach Steam's image upload service/);
  assert.equal(requests, 1);
});

test('a failed binary upload discards its provisional file and never sends it', async (t) => {
  const calls = [];
  t.mock.method(global, 'fetch', async (_url, options) => {
    calls.push(options);
    if (calls.length === 1) return Response.json(beginUpload);
    if (calls.length === 2) return new Response('', { status: 500 });
    return Response.json({ success: 1 });
  });
  await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage), /could not be uploaded/);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].body.get('success'), '0');
});

test('an ambiguous commit is reported without retrying a potentially delivered image', async (t) => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => {
    requests += 1;
    if (requests === 1) return Response.json(beginUpload);
    if (requests === 2) return new Response('', { status: 200 });
    throw new Error('Lost commit response');
  });
  await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage), (error) => error instanceof ImageUploadError && error.uncertain);
  assert.equal(requests, 3);
});

test('expired/replaced sessions and oversized files cannot start uploads', async (t) => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => { requests += 1; throw new Error('Unexpected request'); });
  await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage, () => false), /session changed/);
  await assert.rejects(uploadChatImage(uploadCredentials, friend, { ...testImage, bytes: { length: 30 * 1024 * 1024 + 1 } }), /smaller than 30 MB/);
  assert.equal(requests, 0);
});

function accountStorageMock(persisted) {
  return {
    readStoredAccounts: async () => ({ accounts: [], activeSteamId: null }),
    persistStoredAccounts: async (state) => {
      const active = state.accounts.find((account) => account.steamId === state.activeSteamId);
      persisted.push(active ? active.credentials : null);
    },
  };
}

test('an upload waits for an already-running access-token refresh', async () => {
  let finishRefresh;
  let refreshes = 0;
  const pendingRefresh = new Promise((resolve) => { finishRefresh = resolve; });
  const hooks = {
    ...React,
    createContext: () => ({ Provider: 'session-provider' }),
    useState: (initial) => [initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useEffect: () => {},
  };
  const { SessionProvider } = loadSource('src/context/session.tsx', {
    react: hooks,
    '@/lib/steam/auth-api': { SteamApiError: class extends Error {}, generateAccessTokenForApp: () => { refreshes += 1; return pendingRefresh; } },
    '@/lib/steam/account-storage': accountStorageMock([]),
    '@/lib/steam/jwt': { shouldRefreshAccessToken: (token) => token === 'expired' },
  });
  const session = SessionProvider({ children: null }).props.value;
  session.signIn({ steamId: self, accountName: 'test', accessToken: 'expired', refreshToken: 'refresh', guardData: '' });
  const foregroundRefresh = session.refreshSession();
  let tokenReturned = false;
  const uploadToken = session.getAccessToken().then((token) => { tokenReturned = true; return token; });
  await Promise.resolve();
  assert.equal(tokenReturned, false);
  assert.equal(refreshes, 1);
  finishRefresh({ accessToken: 'fresh-token' });
  await foregroundRefresh;
  assert.equal(await uploadToken, 'fresh-token');
});

function accessJwt(expired = false, marker = 'fixture') {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: self, aud: ['web', 'mobile'], iat: now - 3600, exp: now + (expired ? -1 : 3600) };
  return `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${marker}`;
}

function sessionFixture(httpRefresh = async () => { throw new Error('HTTP refresh unavailable'); }) {
  const persisted = [];
  const hooks = {
    ...React,
    createContext: () => ({ Provider: 'session-provider' }),
    useState: (initial) => [initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useEffect: () => {},
  };
  const { SessionProvider } = loadSource('src/context/session.tsx', {
    react: hooks,
    '@/lib/steam/auth-api': { SteamApiError: class extends Error {}, generateAccessTokenForApp: httpRefresh },
    '@/lib/steam/account-storage': accountStorageMock(persisted),
  });
  const session = SessionProvider({ children: null }).props.value;
  session.signIn({ steamId: self, accountName: 'test', accessToken: accessJwt(true), refreshToken: 'mobile-chat-refresh', guardData: '' });
  return { session, persisted };
}

test('media tokens always come from the auth service, even when the cached token is fresh', async () => {
  const fresh = accessJwt(false, 'web-fresh');
  const { session, persisted } = sessionFixture(async () => ({ accessToken: fresh, refreshToken: 'rotated-refresh' }));
  const cached = accessJwt(false, 'client-scoped');
  session.signIn({ steamId: self, accountName: 'test', accessToken: cached, refreshToken: 'mobile-chat-refresh', guardData: '' });
  assert.equal(await session.getWebAccessToken(), fresh);
  assert.equal(persisted.at(-1).accessToken, fresh);
  assert.equal(persisted.at(-1).refreshToken, 'rotated-refresh');
});

test('CM token generation uses the authenticated service and fixed64 SteamID', async (t) => {
  const { client, sent } = setup(t);
  const pending = client.generateAccessTokenForApp('mobile-chat-refresh');
  assert.equal(sent[0].header.targetJobName, 'Authentication.GenerateAccessTokenForApp#1');
  const fields = readMessage(sent[0].body);
  assert.equal(Buffer.from(firstOf(fields, 1).value).toString(), 'mobile-chat-refresh');
  assert.equal(firstOf(fields, 2).wire, 1);
  assert.equal(asUint64String(firstOf(fields, 2)), self);
  assert.equal(Number(firstOf(fields, 3).value), 1);
  const token = accessJwt();
  await reply(client, sent[0], new ProtoWriter().string(1, token).string(2, 'rotated-refresh').finish());
  assert.deepEqual(await pending, { accessToken: token, refreshToken: 'rotated-refresh' });
});

test('HTTP token refresh is authenticated by the refresh token, not the cached access token', async (t) => {
  const { generateAccessTokenForApp } = loadSource('src/lib/steam/auth-api.ts', {}, new Map());
  const calls = [];
  const fresh = accessJwt(false, 'http-fresh');
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      new ProtoWriter().string(1, fresh).string(2, 'rotated-refresh').finish(),
      { status: 200, headers: { 'x-eresult': '1' } },
    );
  });
  const result = await generateAccessTokenForApp({ refreshToken: 'mobile-refresh', steamId: self });
  assert.deepEqual(result, { accessToken: fresh, refreshToken: 'rotated-refresh' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.steampowered.com/IAuthenticationService/GenerateAccessTokenForApp/v1/');
  const fields = readMessage(new Uint8Array(Buffer.from(calls[0].options.body.get('input_protobuf_encoded'), 'base64')));
  assert.equal(Buffer.from(firstOf(fields, 1).value).toString(), 'mobile-refresh');
  assert.equal(asUint64String(firstOf(fields, 2)), self);
  assert.equal(Number(firstOf(fields, 3).value), 1);
});

test('CM token rejection and a missing access token never fall back to cached cookies', async (t) => {
  const { client, sent } = setup(t);
  const denied = assert.rejects(client.generateAccessTokenForApp('refresh'), (error) => error instanceof SteamCmError && error.eresult === 15);
  await reply(client, sent[0], new Uint8Array(), 15);
  await denied;
  const empty = assert.rejects(client.generateAccessTokenForApp('refresh'), /did not return a refreshed access token/);
  await reply(client, sent[1]);
  await empty;
});

test('a failed access-token refresh cannot return the expired cookie token', async () => {
  const { session, persisted } = sessionFixture();
  const expired = persisted[0].accessToken;
  await assert.rejects(session.getAccessToken(), /HTTP refresh unavailable/);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].accessToken, expired);
});

test('an explicit refresher is used and persisted even when the cached token has not expired', async (t) => {
  const { client, sent } = setup(t);
  const { session, persisted } = sessionFixture();
  const cached = { steamId: self, accountName: 'test', accessToken: accessJwt(), refreshToken: 'current-refresh', guardData: '' };
  session.signIn(cached);
  const fresh = accessJwt(false, 'fresh');
  const calls = [];
  t.mock.method(global, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (options.method !== 'PUT') {
      // The old cached cookie is rejected despite its future local expiry.
      if (!options.headers.Cookie.includes(encodeURIComponent(fresh))) return new Response('', { status: 401 });
      return Response.json(url.includes('beginfileupload') ? beginUpload : { success: 1 });
    }
    return new Response('', { status: 200 });
  });
  const tokenPromise = session.getAccessToken(({ refreshToken }) => client.generateAccessTokenForApp(refreshToken));
  assert.equal(sent.length, 1);
  assert.equal(Buffer.from(firstOf(readMessage(sent[0].body), 1).value).toString(), 'current-refresh');
  await reply(client, sent[0], new ProtoWriter().string(1, fresh).string(2, 'rotated-refresh').finish());
  const token = await tokenPromise;
  assert.equal(token, fresh);
  assert.equal(persisted.at(-1).refreshToken, 'rotated-refresh');
  await uploadChatImage({ ...uploadCredentials, accessToken: token }, friend, testImage);
  assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(calls[1].options.headers).includes(fresh));
  assert.equal(await session.getAccessToken(), fresh);
});

test('CM refresh recovers after an in-flight HTTP refresh fails', async () => {
  let rejectHttp;
  const http = new Promise((_, reject) => { rejectHttp = reject; });
  const { session } = sessionFixture(() => http);
  const background = session.refreshSession();
  let cmRequests = 0;
  const fresh = accessJwt();
  const uploadToken = session.getAccessToken(async ({ refreshToken }) => {
    cmRequests += 1;
    assert.equal(refreshToken, 'mobile-chat-refresh');
    return { accessToken: fresh, refreshToken: '' };
  });
  assert.equal(cmRequests, 0);
  rejectHttp(new Error('Expired HTTP routing token'));
  await background;
  assert.equal(await uploadToken, fresh);
  assert.equal(cmRequests, 1);
});

test('a replaced account cannot receive an old CM refresh result', async () => {
  const { session, persisted } = sessionFixture();
  let complete;
  const result = new Promise((resolve) => { complete = resolve; });
  const rejected = assert.rejects(session.getAccessToken(() => result), /session changed/);
  session.signIn({ steamId: friend, accountName: 'new-account', accessToken: accessJwt(), refreshToken: 'new-refresh', guardData: '' });
  complete({ accessToken: accessJwt(), refreshToken: 'old-rotated-refresh' });
  await rejected;
  assert.equal(persisted.at(-1).steamId, friend);
  assert.equal(persisted.at(-1).refreshToken, 'new-refresh');
});

test('a queued CM refresh cannot borrow credentials from a replacement sign-in', async () => {
  let finishHttp;
  const http = new Promise((resolve) => { finishHttp = resolve; });
  const { session, persisted } = sessionFixture(() => http);
  const background = session.refreshSession();
  let cmRequests = 0;
  const rejected = assert.rejects(session.getAccessToken(async () => {
    cmRequests += 1;
    return { accessToken: accessJwt(), refreshToken: '' };
  }), /session changed/);
  session.signOut();
  // Re-signing into the same account must also invalidate the queued callback.
  session.signIn({ steamId: self, accountName: 'test', accessToken: accessJwt(), refreshToken: 'replacement-refresh', guardData: '' });
  finishHttp({ accessToken: accessJwt(), refreshToken: 'old-http-refresh' });
  await background;
  await rejected;
  assert.equal(cmRequests, 0);
  assert.equal(persisted.at(-1).refreshToken, 'replacement-refresh');
});

test('terminal CM token errors clear the revoked session', async () => {
  const { session, persisted } = sessionFixture();
  await assert.rejects(session.getAccessToken(async () => { throw new SteamCmError(27, 'Token expired'); }), /Token expired/);
  assert.equal(persisted.at(-1), null);
  await assert.rejects(session.getAccessToken(), /Sign in to Steam/);
});

test('a failed CM refresh is surfaced and an expired result is never persisted', async () => {
  const { session, persisted } = sessionFixture();
  await assert.rejects(session.getAccessToken(async () => { throw new Error('CM token denied'); }), /CM token denied/);
  await assert.rejects(session.getAccessToken(async () => ({ accessToken: accessJwt(true), refreshToken: 'bad-refresh' })), /could not refresh/);
  assert.equal(persisted.length, 1);
});

test('switching accounts persists every saved sign-in and the MRU fallback', () => {
  const states = [];
  const storage = {
    readStoredAccounts: async () => ({ accounts: [], activeSteamId: null }),
    persistStoredAccounts: async (state) => { states.push(state); },
  };
  const hooks = {
    ...React,
    createContext: () => ({ Provider: 'session-provider' }),
    useState: (initial) => [initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    useEffect: () => {},
  };
  const { SessionProvider } = loadSource('src/context/session.tsx', {
    react: hooks,
    '@/lib/steam/auth-api': { SteamApiError: class extends Error {}, generateAccessTokenForApp: async () => ({ accessToken: 'unused', refreshToken: '' }) },
    '@/lib/steam/account-storage': storage,
    '@/lib/steam/jwt': { shouldRefreshAccessToken: () => false },
  });
  const session = SessionProvider({ children: null }).props.value;

  session.signIn({ steamId: self, accountName: 'first', accessToken: 'one', refreshToken: 'first-refresh', guardData: '' });
  session.signIn({ steamId: friend, accountName: 'second', accessToken: 'two', refreshToken: 'second-refresh', guardData: '' });
  assert.equal(states.at(-1).accounts.length, 2);
  assert.equal(states.at(-1).activeSteamId, friend);

  session.updateAccountProfile(friend, { personaName: 'Second Persona' });
  assert.equal(states.at(-1).accounts.find((account) => account.steamId === friend).personaName, 'Second Persona');

  session.switchAccount(self);
  assert.equal(states.at(-1).activeSteamId, self);
  assert.equal(states.at(-1).accounts.find((account) => account.steamId === self).lastUsedAt >= states[0].accounts.find((account) => account.steamId === self).lastUsedAt, true);

  // Signing out removes only the active account; the other one opens instead.
  session.signOut();
  assert.equal(states.at(-1).activeSteamId, friend);
  assert.equal(states.at(-1).accounts.length, 1);
  assert.equal(states.at(-1).accounts[0].credentials.refreshToken, 'second-refresh');
});

test('a rejected commit is uncertain and is never automatically sent a second time', async (t) => {
  let requests = 0;
  t.mock.method(global, 'fetch', async () => {
    requests += 1;
    if (requests === 1) return Response.json(beginUpload);
    return new Response('', { status: requests === 2 ? 200 : 401 });
  });
  await assert.rejects(uploadChatImage(uploadCredentials, friend, testImage), (error) => error instanceof ImageUploadError && error.uncertain);
  assert.equal(requests, 3);
});

/* -------------------------------------------------------------------------- */
/* Group chat                                                                */
/* -------------------------------------------------------------------------- */

const groupProto = loadSource('src/lib/steam/cm-proto.ts');
const groupStateModule = loadSource('src/context/group-chat-state.ts');

function groupFixture() {
  const groupId = '900719925474099';
  const generalId = '900719925474100';
  const voiceId = '900719925474101';

  const general = new ProtoWriter()
    .uint64(1, generalId)
    .string(2, 'General')
    .uint32(3, 1)
    .bytes(4, Uint8Array.from([42, 43]))
    .uint32(5, 1_700_000_100)
    .uint32(6, 0)
    .string(7, '[b]hello[/b]')
    .uint32(8, 42)
    .finish();
  const voice = new ProtoWriter()
    .uint64(1, voiceId)
    .string(2, 'Voice lounge')
    .bool(3, true)
    .uint32(5, 1_700_000_200)
    .uint32(6, 1)
    .string(7, 'anyone here?')
    .uint32(8, 44)
    .finish();

  const summary = new ProtoWriter()
    .uint64(1, groupId)
    .string(2, 'Test Group')
    .uint32(3, 5)
    .uint32(4, 2)
    .uint64(5, generalId)
    .bytes(6, general)
    .bytes(6, voice)
    .uint32(7, 1234)
    .string(8, 'Weekend hangout')
    .uint32(9, 42)
    // Packed repeated uint32 exercises the packed decoder.
    .bytes(10, Uint8Array.from([42, 43, 44, 45]))
    .bytes(11, Uint8Array.from({ length: 20 }, (_, index) => index + 1))
    .uint32(17, 730)
    .bool(22, false)
    .finish();

  const userState = new ProtoWriter()
    .uint64(1, groupId)
    .uint32(2, 1_690_000_000)
    .bytes(
      3,
      new ProtoWriter()
        .uint64(1, generalId)
        .uint32(2, 1_690_000_000)
        .uint32(3, 1_700_000_150)
        .uint32(6, 1_700_000_100)
        .finish(),
    )
    .bytes(
      3,
      new ProtoWriter()
        .uint64(1, voiceId)
        .uint32(2, 1_690_000_000)
        .uint32(3, 1_700_000_000)
        .finish(),
    )
    .uint32(6, 1_700_000_150)
    .bool(7, false)
    .bool(8, true)
    .finish();

  const pair = new ProtoWriter()
    .bytes(1, userState)
    .bytes(2, summary)
    .finish();

  const response = new ProtoWriter().bytes(1, pair).finish();

  return { groupId, generalId, voiceId, summary, userState, pair, response };
}

function createdGroupFixture(name = '') {
  const groupId = '900719925474099';
  const generalId = '900719925474100';

  const header = new ProtoWriter()
    .uint64(1, groupId)
    .string(2, name)
    .uint32(13, 0)
    .uint32(14, 42)
    .string(15, '')
    .uint32(21, 0)
    .bool(26, false)
    .finish();
  const owner = new ProtoWriter()
    .uint32(1, 42)
    .uint32(3, 1)
    .uint32(4, 0)
    .finish();
  const invitee = new ProtoWriter()
    .uint32(1, 43)
    .uint32(3, 1)
    .uint32(4, 0)
    .finish();
  const general = new ProtoWriter()
    .uint64(1, generalId)
    .string(2, 'General')
    .uint32(6, 0)
    .finish();
  const state = new ProtoWriter()
    .bytes(1, header)
    .bytes(2, owner)
    .bytes(2, invitee)
    .uint64(4, generalId)
    .bytes(5, general)
    .finish();
  const userState = new ProtoWriter()
    .uint64(1, groupId)
    .uint32(2, 1_700_000_000)
    .uint32(6, 1_700_000_000)
    .bool(7, false)
    .finish();
  const response = new ProtoWriter()
    .uint64(1, groupId)
    .bytes(2, state)
    .bytes(3, userState)
    .finish();

  return { groupId, generalId, response, state, userState };
}

test('group summaries and user state decode including packed member fields', () => {
  const fixture = groupFixture();
  const groups = groupProto.decodeChatRoomGroupsResponse(fixture.response);

  assert.equal(groups.length, 1);
  const group = groups[0];
  assert.equal(group.groupSummary.chatGroupId, fixture.groupId);
  assert.equal(group.groupSummary.name, 'Test Group');
  assert.equal(group.groupSummary.activeMemberCount, 5);
  assert.equal(group.groupSummary.tagline, 'Weekend hangout');
  assert.deepEqual(group.groupSummary.topMembers, [42, 43, 44, 45]);
  assert.equal(
    group.groupSummary.avatarSha,
    '0102030405060708090a0b0c0d0e0f1011121314',
  );
  assert.equal(group.groupSummary.chatRooms.length, 2);
  assert.equal(group.groupSummary.chatRooms[0].name, 'General');
  assert.deepEqual(group.groupSummary.chatRooms[0].membersInVoice, [42, 43]);
  assert.equal(group.groupSummary.chatRooms[1].voiceAllowed, true);
  assert.equal(group.userChatGroupState.userChatRoomStates.length, 2);
  assert.equal(group.userChatGroupState.userChatRoomStates[0].timeLastAck, 1_700_000_150);
  assert.equal(group.userChatGroupState.timeLastGroupAck, 1_700_000_150);
  assert.equal(group.userChatGroupState.directMessagesAllowed, true);
});

test('group history decodes server messages, deletions and reactions', () => {
  const reaction = new ProtoWriter()
    .uint32(1, 1)
    .string(2, ':steamhappy:')
    .uint32(3, 4)
    .bool(4, true)
    .finish();
  const message = new ProtoWriter()
    .uint32(1, 42)
    .uint32(2, 1_700_000_300)
    .string(3, '[b]hi[/b]')
    .uint32(4, 7)
    .uint32(6, 1)
    .bytes(7, reaction)
    .finish();
  const response = new ProtoWriter().bytes(1, message).bool(4, true).finish();

  const history = groupProto.decodeChatRoomHistoryResponse(response);

  assert.equal(history.moreAvailable, true);
  assert.equal(history.messages.length, 1);
  assert.equal(history.messages[0].senderAccountId, 42);
  assert.equal(history.messages[0].message, '[b]hi[/b]');
  assert.equal(history.messages[0].ordinal, 7);
  assert.equal(history.messages[0].deleted, true);
  assert.equal(history.messages[0].reactions[0].reaction, ':steamhappy:');
  assert.equal(history.messages[0].reactions[0].numReactors, 4);
  assert.equal(history.messages[0].reactions[0].hasUserReacted, true);
});

test('group history request uses the wire field numbers from the app descriptor', () => {
  const body = groupProto.encodeGetChatRoomHistory({
    chatGroupId: '900719925474099',
    chatId: '900719925474100',
    lastTime: 1_700_000_000,
    lastOrdinal: 4,
    startTime: 0,
    startOrdinal: 0,
    maxCount: 100,
  });
  const fields = readMessage(body);

  assert.equal(asUint64String(firstOf(fields, 1)), '900719925474099');
  assert.equal(asUint64String(firstOf(fields, 2)), '900719925474100');
  assert.equal(Number(firstOf(fields, 3).value), 1_700_000_000);
  assert.equal(Number(firstOf(fields, 4).value), 4);
  assert.equal(Number(firstOf(fields, 7).value), 100);
});

test('group creation request matches the shipped ChatRoom descriptor', () => {
  const other = '76561197960265731';
  const body = groupProto.encodeCreateChatRoomGroup({
    name: 'Friday Night',
    invitees: [friend, other],
  });
  const fields = readMessage(body);
  const invitees = fields.filter((entry) => entry.field === 4);

  assert.equal(asString(firstOf(fields, 3)), 'Friday Night');
  assert.equal(invitees.length, 2);
  // Repeated fixed64 (wire type 1) is what the APK request descriptor uses.
  assert.equal(invitees[0].wire, 1);
  assert.equal(asUint64String(invitees[0]), friend);
  assert.equal(asUint64String(invitees[1]), other);

  const unnamed = readMessage(groupProto.encodeCreateChatRoomGroup({ invitees: [friend] }));
  assert.equal(firstOf(unnamed, 3), undefined);
});

test('created group response decodes group state and creator user state', () => {
  const fixture = createdGroupFixture('Friday Night');
  const created = groupProto.decodeCreateChatRoomGroupResponse(fixture.response);

  assert.equal(created.chatGroupId, fixture.groupId);
  assert.equal(created.state.headerState.chatGroupId, fixture.groupId);
  assert.equal(created.state.headerState.name, 'Friday Night');
  assert.equal(created.state.defaultChatId, fixture.generalId);
  assert.equal(created.state.members.length, 2);
  assert.equal(created.state.members[0].accountId, 42);
  assert.equal(created.state.chatRooms[0].name, 'General');
  assert.equal(created.userChatGroupState.chatGroupId, fixture.groupId);
  assert.equal(created.userChatGroupState.timeLastGroupAck, 1_700_000_000);
});

test('creating a group adds it immediately with member-derived display names', () => {
  const fixture = createdGroupFixture();
  const created = groupProto.decodeCreateChatRoomGroupResponse(fixture.response);
  const { groupReducer, initialGroupChatState, groupDisplayName } = groupStateModule;

  const state = groupReducer(initialGroupChatState, {
    type: 'group-created',
    created,
  });
  const group = state.groups[fixture.groupId];

  assert.ok(group);
  assert.equal(group.roomOrder[0], fixture.generalId);
  assert.equal(group.selectedChatId, fixture.generalId);
  assert.equal(group.memberCount, 2);
  assert.deepEqual(group.topMemberIds, [42, 43]);
  assert.equal(group.userState.timeLastGroupAck, 1_700_000_000);
  assert.equal(group.lastActivity, 1_700_000_000);
  assert.equal(group.unread, false);

  const display = groupDisplayName(
    group,
    {},
    {
      '76561197960265770': { name: 'Alpha' },
      '76561197960265771': { name: 'Bravo' },
    },
    null,
  );
  assert.equal(display, 'Alpha, Bravo');
});

test('CM group creation sends the service name and decodes the new group', async (t) => {
  const { client, sent } = setup(t);
  const fixture = createdGroupFixture('Friday Night');
  const creating = client.createChatRoomGroup([friend]);

  await reply(client, sent[0], fixture.response);
  const created = await creating;

  assert.equal(sent[0].header.targetJobName, 'ChatRoom.CreateChatRoomGroup#1');
  assert.equal(asUint64String(firstOf(readMessage(sent[0].body), 4)), friend);
  assert.equal(created.chatGroupId, fixture.groupId);
  assert.equal(created.state.chatRooms[0].name, 'General');

  await assert.rejects(client.createChatRoomGroup([]), /Choose at least one friend/);
});

test('group reducer merges summaries, room messages and per-room read receipts', () => {
  const fixture = groupFixture();
  const groups = groupProto.decodeChatRoomGroupsResponse(fixture.response);
  const { groupReducer, initialGroupChatState, groupDisplayName } = groupStateModule;

  let state = groupReducer(initialGroupChatState, {
    type: 'groups',
    groups,
  });

  assert.equal(state.groupListLoaded, true);
  assert.equal(state.groups[fixture.groupId].roomOrder.length, 2);
  assert.equal(state.groups[fixture.groupId].rooms[fixture.generalId].unread, false);
  assert.equal(state.groups[fixture.groupId].rooms[fixture.voiceId].unread, true);
  assert.equal(state.groups[fixture.groupId].unread, true);

  state = groupReducer(state, {
    type: 'group-open',
    chatGroupId: fixture.groupId,
    chatId: fixture.generalId,
  });
  assert.equal(state.groups[fixture.groupId].selectedChatId, fixture.generalId);
  assert.equal(state.groups[fixture.groupId].rooms[fixture.generalId].unread, false);
  assert.equal(state.groups[fixture.groupId].unread, true);

  state = groupReducer(state, {
    type: 'group-message',
    chatGroupId: fixture.groupId,
    chatId: fixture.generalId,
    mine: false,
    incoming: { chatName: 'Test Group' },
    message: {
      id: 'gm-1',
      authorSteamId: friend,
      text: 'fresh message',
      content: 'fresh message',
      sentAt: 1_700_000_400,
      ordinal: 8,
      mine: false,
    },
  });
  assert.equal(state.groups[fixture.groupId].rooms[fixture.generalId].messages.length, 1);
  assert.equal(state.groups[fixture.groupId].rooms[fixture.generalId].unread, false);
  assert.equal(state.groups[fixture.groupId].rooms[fixture.generalId].lastMessage, 'fresh message');

  state = groupReducer(state, {
    type: 'group-ack',
    chatGroupId: fixture.groupId,
    chatId: fixture.generalId,
    timestamp: 1_700_000_400,
  });
  assert.equal(state.groups[fixture.groupId].rooms[fixture.generalId].unread, false);
  // Reading General must not mark the other room read.
  assert.equal(state.groups[fixture.groupId].rooms[fixture.voiceId].unread, true);

  const display = groupDisplayName(
    { ...state.groups[fixture.groupId], name: '' },
    {
      '76561197960265770': { name: 'Alpha', avatarUrl: null },
      '76561197960265771': { name: 'Bravo', avatarUrl: null },
      '76561197960265772': { name: 'Charlie', avatarUrl: null },
      '76561197960265773': { name: 'Delta', avatarUrl: null },
    },
    {},
    null,
  );
  assert.equal(display, 'Alpha, Bravo, Charlie +1');
});

test('interface settings normalize unknown storage without losing valid preferences', () => {
  assert.deepEqual(normalizeInterfaceSettings(null), DEFAULT_INTERFACE_SETTINGS);
  assert.equal(DEFAULT_INTERFACE_SETTINGS.saveImageCaptures, true);
  assert.equal(DEFAULT_INTERFACE_SETTINGS.defaultTab, 'chats');
  assert.equal(DEFAULT_INTERFACE_SETTINGS.chatFilter, 'friends');

  const normalized = normalizeInterfaceSettings({
    appendNicknames: true,
    hideOfflineCustomCategories: 'yes',
    disableMediaEmbedding: true,
    saveImageCaptures: false,
    chatFilter: 'everyone',
    language: 'en',
    defaultTab: 'groups',
  });

  assert.equal(normalized.appendNicknames, true);
  assert.equal(normalized.hideOfflineCustomCategories, false);
  assert.equal(normalized.disableMediaEmbedding, true);
  assert.equal(normalized.saveImageCaptures, false);
  assert.equal(normalized.chatFilter, 'everyone');
  assert.equal(normalized.language, 'en');
  assert.equal(normalized.defaultTab, 'groups');
});

test('interface settings reject unknown enum values', () => {
  const normalized = normalizeInterfaceSettings({
    chatFilter: 'everyone-i-know',
    language: 'xx',
    defaultTab: 'settings',
  });

  assert.equal(normalized.chatFilter, 'friends');
  assert.equal(normalized.language, 'en');
  assert.equal(normalized.defaultTab, 'chats');
});

/* -------------------------------------------------------------------------- */
/* Local chat cache                                                           */
/* -------------------------------------------------------------------------- */

const chatCache = loadSource('src/lib/steam/chat-cache.ts');
const chatCacheUsage = loadSource('src/lib/steam/chat-cache-usage.ts');

function cachedMessage(overrides = {}) {
  return {
    id: 'h-6-1700000000-2',
    authorSteamId: friend,
    text: 'older',
    content: 'older',
    sentAt: 1700000000,
    ordinal: 6,
    mine: false,
    ...overrides,
  };
}

function cachedConversation(overrides = {}) {
  return {
    steamId: friend,
    messages: [cachedMessage()],
    loaded: true,
    loading: false,
    hasMore: false,
    oldestTime: 1700000000,
    oldestOrdinal: 6,
    lastActivity: 1700000000,
    unread: 0,
    syncedAt: 1700000000000,
    ...overrides,
  };
}

function cachedFriend(overrides = {}) {
  return {
    steamId: friend,
    accountId: 2,
    name: 'Cached friend',
    avatarUrl: 'https://example.test/avatar.jpg',
    status: 'offline',
    onSteamDeck: false,
    relationship: 3,
    ...overrides,
  };
}

test('chat cache drops unconfirmed messages and restores loaded history', () => {
  const cache = chatCache.buildChatCache(self, {
    friends: { [friend]: cachedFriend() },
    conversations: {
      [friend]: cachedConversation({
        messages: [
          cachedMessage(),
          cachedMessage({ id: 'local-pending', ordinal: 0, pending: true, text: 'not yet sent' }),
        ],
        unread: 2,
        preview: { text: 'older', sentAt: 1700000000, mine: false },
      }),
    },
    groups: {},
    groupProfiles: {},
  }, 1700000100000);

  assert.equal(cache.version, 1);
  assert.equal(cache.steamId, self);
  assert.equal(cache.conversations[friend].messages.length, 1);
  assert.equal(cache.conversations[friend].messages[0].text, 'older');

  const restored = chatCache.parseChatCache(JSON.parse(JSON.stringify(cache)));
  assert.ok(restored);
  assert.equal(restored.friends[0].status, 'offline');
  assert.equal(restored.conversations[friend].loaded, true);
  assert.equal(restored.conversations[friend].fromCache, true);
  assert.equal(restored.conversations[friend].unread, 2);
  assert.equal(restored.conversations[friend].syncedAt, 1700000000000);
});

test('chat cache rejects stale versions and malformed documents', () => {
  assert.equal(chatCache.parseChatCache(null), null);
  assert.equal(chatCache.parseChatCache({ ...chatCache.buildChatCache(self, {
    friends: {},
    conversations: {},
    groups: {},
    groupProfiles: {},
  }), version: 0 }), null);
  assert.equal(chatCache.parseChatCache({ version: 1, steamId: 'not-a-steam-id' }), null);
});

test('cached conversations are revalidated only when behind or old', () => {
  const now = 1700000000000 + 60_000;
  const fresh = {
    loaded: true,
    messages: [cachedMessage()],
    lastActivity: 1700000000,
    syncedAt: 1700000000000,
  };

  assert.equal(chatCache.conversationNeedsSync(fresh, now), false);
  assert.equal(
    chatCache.conversationNeedsSync({ ...fresh, lastActivity: 1700000100 }, now),
    true,
  );
  assert.equal(chatCache.conversationNeedsSync({ ...fresh, loaded: false }, now), true);
  assert.equal(chatCache.conversationNeedsSync({ ...fresh, syncedAt: 0 }, now), true);
  assert.equal(
    chatCache.conversationNeedsSync(
      fresh,
      1700000000000 + chatCache.CACHE_REFRESH_AFTER_MS + 1,
    ),
    true,
  );

  const room = {
    loaded: true,
    messages: [cachedMessage()],
    lastMessageAt: 1700000000,
    syncedAt: 1700000000000,
  };

  assert.equal(chatCache.groupRoomNeedsSync(room, now), false);
  assert.equal(chatCache.groupRoomNeedsSync({ ...room, lastMessageAt: 1700000100 }, now), true);
});

test('hydrating cached messages never replaces newer live state', () => {
  let state = reduce(
    { ...initialState, selfSteamId: self, friends: { [friend]: cachedFriend({ name: 'Live friend', status: 'online' }) } },
    {
      type: 'hydrate',
      friends: [cachedFriend({ name: 'Cached friend' }), cachedFriend({ steamId: '76561197960265731', name: 'Only cached' })],
      conversations: {
        [friend]: cachedConversation({
          messages: [cachedMessage(), cachedMessage({ id: 'live', text: 'live message', ordinal: 7, sentAt: 1700000020 })],
        }),
      },
    },
  );

  assert.equal(state.friends[friend].name, 'Live friend');
  assert.equal(state.friends[friend].status, 'online');
  assert.equal(state.friends['76561197960265731'].name, 'Only cached');
  assert.equal(state.conversations[friend].messages.length, 2);
  assert.equal(state.conversations[friend].messages[1].text, 'live message');

  state = reduce(state, {
    type: 'sessions',
    sessions: [{ accountIdFriend: 2, lastMessage: 1700000020, lastView: 0, unreadMessageCount: 1 }],
  });
  assert.equal(state.conversations[friend].unread, 1);
  assert.equal(state.conversations[friend].fromCache, false);

  // A cached unread count is replaced by the server's authoritative count.
  state = reduce(
    { ...initialState, selfSteamId: self },
    { type: 'hydrate', conversations: { [friend]: cachedConversation({ unread: 5 }) }, friends: [] },
  );
  assert.equal(state.conversations[friend].unread, 5);
  state = reduce(state, {
    type: 'sessions',
    sessions: [{ accountIdFriend: 2, lastMessage: 1700000000, lastView: 0, unreadMessageCount: 0 }],
  });
  assert.equal(state.conversations[friend].unread, 0);
});

test('group cache hydration merges cached history into a live room', () => {
  const groupId = '900719925474099';
  const chatId = '900719925474100';
  const cachedRoom = {
    chatId,
    name: 'General',
    sortOrder: 0,
    voiceAllowed: false,
    messages: [cachedMessage()],
    loaded: true,
    loading: false,
    hasMore: false,
    oldestTime: 1700000000,
    oldestOrdinal: 6,
    lastMessageAt: 1700000000,
    lastMessage: 'older',
    lastMessageAccountId: 2,
    unread: false,
    syncedAt: 1700000000000,
  };
  const cachedGroup = {
    chatGroupId: groupId,
    name: 'Cached group',
    tagline: '',
    avatarSha: null,
    avatarUrl: null,
    memberCount: 2,
    topMemberIds: [2],
    defaultChatId: chatId,
    roomOrder: [chatId],
    rooms: { [chatId]: cachedRoom },
    selectedChatId: chatId,
    userState: null,
    lastActivity: 1700000000,
    unread: false,
  };

  let state = groupStateModule.groupReducer(groupStateModule.initialGroupChatState, {
    type: 'hydrate',
    groups: { [groupId]: cachedGroup },
    profiles: { [friend]: { name: 'Cached author', avatarUrl: null } },
  });

  assert.equal(state.groupListLoaded, true);
  assert.equal(state.groups[groupId].rooms[chatId].messages.length, 1);
  assert.equal(state.groupProfiles[friend].name, 'Cached author');

  state = groupStateModule.groupReducer(state, {
    type: 'group-message',
    chatGroupId: groupId,
    chatId,
    mine: false,
    incoming: { chatName: 'Cached group' },
    message: cachedMessage({ id: 'live-group', text: 'live group', ordinal: 7, sentAt: 1700000020 }),
  });

  assert.equal(state.groups[groupId].rooms[chatId].messages.length, 2);
  assert.equal(state.groups[groupId].rooms[chatId].messages[1].text, 'live group');
  assert.equal(state.groups[groupId].rooms[chatId].loaded, true);
});

test('storage usage measures friends, chats and groups separately', () => {
  const groupId = '900719925474099';
  const chatId = '900719925474100';

  const cache = chatCache.buildChatCache(self, {
    friends: { [friend]: cachedFriend() },
    conversations: { [friend]: cachedConversation() },
    groups: {
      [groupId]: {
        chatGroupId: groupId,
        name: 'Cached group',
        tagline: '',
        avatarSha: null,
        avatarUrl: null,
        memberCount: 2,
        topMemberIds: [2],
        defaultChatId: chatId,
        roomOrder: [chatId],
        rooms: {
          [chatId]: {
            chatId,
            name: 'General',
            sortOrder: 0,
            voiceAllowed: false,
            messages: [cachedMessage()],
            loaded: true,
            loading: false,
            hasMore: false,
            oldestTime: 1700000000,
            oldestOrdinal: 6,
            lastMessageAt: 1700000000,
            lastMessage: 'older',
            lastMessageAccountId: 2,
            unread: false,
            syncedAt: 1700000000000,
          },
        },
        selectedChatId: chatId,
        userState: null,
        lastActivity: 1700000000,
        unread: false,
      },
    },
    groupProfiles: { [friend]: { name: 'Cached author', avatarUrl: null } },
  }, 1700000100000);

  const usage = chatCacheUsage.measureChatCache(cache);

  assert.equal(usage.friendCount, 1);
  assert.equal(usage.conversationCount, 1);
  assert.equal(usage.chatMessageCount, 1);
  assert.equal(usage.groupCount, 1);
  assert.equal(usage.groupMessageCount, 1);
  assert.ok(usage.friendsBytes > 0);
  assert.ok(usage.chatBytes > 0);
  assert.ok(usage.groupsBytes > 0);
  assert.equal(usage.totalBytes, usage.friendsBytes + usage.chatBytes + usage.groupsBytes);

  const combined = chatCacheUsage.combineChatCacheUsage([
    usage,
    {
      friendsBytes: 10,
      chatBytes: 20,
      groupsBytes: 30,
      totalBytes: 60,
      friendCount: 2,
      conversationCount: 3,
      chatMessageCount: 4,
      groupCount: 5,
      groupMessageCount: 6,
    },
  ]);

  assert.equal(combined.friendsBytes, usage.friendsBytes + 10);
  assert.equal(combined.chatBytes, usage.chatBytes + 20);
  assert.equal(combined.groupsBytes, usage.groupsBytes + 30);
  assert.equal(combined.totalBytes, usage.totalBytes + 60);
  assert.equal(combined.friendCount, 3);
  assert.equal(combined.conversationCount, 4);
  assert.equal(combined.chatMessageCount, 5);
  assert.equal(combined.groupCount, 6);
  assert.equal(combined.groupMessageCount, 7);

  assert.deepEqual(chatCacheUsage.combineChatCacheUsage([]), chatCacheUsage.EMPTY_CHAT_CACHE_USAGE);
});

test('storage sizes are formatted for the settings list', () => {
  assert.equal(chatCacheUsage.formatChatCacheSize(0), '0 B');
  assert.equal(chatCacheUsage.formatChatCacheSize(1023), '1023 B');
  assert.equal(chatCacheUsage.formatChatCacheSize(1024), '1.0 KB');
  assert.equal(chatCacheUsage.formatChatCacheSize(1536), '1.5 KB');
  assert.equal(chatCacheUsage.formatChatCacheSize(1024 * 1024), '1.0 MB');
  assert.equal(chatCacheUsage.formatChatCacheSize(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(chatCacheUsage.formatChatCacheSize(-1), '0 B');
});
