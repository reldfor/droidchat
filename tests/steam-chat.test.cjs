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
const { ProtoWriter, readMessage, firstOf, asUint64String } = loadSource('src/lib/steam/protobuf.ts');
const { decodeHeader, encodeGetRecentMessages, GID_NIL } = loadSource('src/lib/steam/cm-proto.ts');
const { reduce, initialState, describeError } = loadSource('src/context/steam-chat.tsx');
const { ConversationScreen } = loadSource('src/components/chat/conversation-screen.tsx');
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

const { decodeEmoticonList, parseMessageContent } = loadSource('src/lib/steam/chat-media.ts');
const { uploadChatImage, ImageUploadError } = loadSource('src/lib/steam/image-upload.ts');
const { MessageBubble } = loadSource('src/components/chat/message-bubble.tsx');
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
  // APK #9265 sets CHAT_BASE_URL; #19574 / #26258 build this request.
  assert.equal(calls[0].url, 'https://steam-chat.com/chat/beginfileupload/?l=english');
  const begin = calls[0].options;
  assert.match(begin.headers.Cookie, /steamLoginSecure=76561197960265729%7C%7Ctest-access-token/);
  assert.equal(begin.credentials, 'omit');
  assert.equal(begin.redirect, 'error');
  assert.equal(begin.body.get('sessionid'), uploadCredentials.sessionId);
  assert.equal(begin.body.get('file_sha'), testImage.sha1);
  assert.equal(begin.body.get('file_size'), '4');
  assert.equal(calls[1].options.method, 'PUT');
  assert.deepEqual(calls[1].options.body, testImage.bytes);
  assert.deepEqual(calls[1].options.headers, { 'Content-Type': 'image/png', Authorization: 'AWS signed-storage-credential' });
  assert.equal(calls[1].options.credentials, 'omit');
  assert.equal(calls[1].options.redirect, 'error');
  const commit = calls[2].options;
  assert.equal(calls[2].url, 'https://steam-chat.com/chat/commitfileupload/');
  assert.equal(commit.headers.Cookie, begin.headers.Cookie);
  assert.equal(commit.body.get('friend_steamid'), friend);
  assert.equal(commit.body.get('ugcid'), '18446744073709551614');
  assert.equal(commit.body.get('hmac'), beginUpload.hmac);
  assert.equal(commit.body.get('file_sha'), begin.body.get('file_sha'));
  assert.equal(commit.body.get('success'), '1');
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
    '@/lib/steam/credential-storage': { writeStoredCredentials: async () => {}, readStoredCredentials: async () => null },
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
    '@/lib/steam/credential-storage': { writeStoredCredentials: async (value) => { persisted.push(value); }, readStoredCredentials: async () => null },
  });
  const session = SessionProvider({ children: null }).props.value;
  session.signIn({ steamId: self, accountName: 'test', accessToken: accessJwt(true), refreshToken: 'mobile-chat-refresh', guardData: '' });
  return { session, persisted };
}

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

test('image upload derives and persists a CM token even when the cached token has not expired', async (t) => {
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
