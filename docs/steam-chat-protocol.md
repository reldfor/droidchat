# Chat replies and history loading

The CM client sent unified service calls with packet ID 151, but listened for
replies on 152 instead of 147. Steam could deliver a message while the app
ignored its confirmation, then timed out. History requests had the same issue.
Packet 152 carries server notifications; 146 is `ServiceMethod`.

Protocol references:

- [SteamKit packet IDs](https://github.com/SteamRE/SteamKit/blob/master/Resources/SteamLanguage/emsg.steamd)
- [Steam header schema and defaults](https://github.com/SteamTracking/Protobufs/blob/master/steam/steammessages_base.proto)
- [Friend message request and response schemas](https://github.com/SteamTracking/Protobufs/blob/master/steam/steammessages_friendmessages.steamclient.proto)

The fix uses the correct packet IDs, registers pending jobs before sending,
honors header defaults, and encodes history start times as `fixed32`. Request
timeouts have their own error code. A server-confirmed message cannot be marked
failed by a later timeout. History failures stop the spinner and offer Retry;
an empty successful response shows the empty conversation state.

Run `npm test` with Node.js 24 or newer, `npx tsc --noEmit`, and `npm run lint`.
For an Android bundle check, run
`npx expo export --platform android --output-dir .expo/verification-android`.
Tests inject independent wire fixtures into the real transport and exercise the
chat reducer and screen states. They cover empty/populated history, compressed
Multi packets, concurrent replies, delivery confirmations, notifications,
rejections, timeouts, closed sockets, and retry rendering. They send no traffic
to Steam. A signed-in device check is still needed for live verification.

REA inspected the supplied APK as `com.valvesoftware.android.steam.friendsui`
1.1, build 10167321, SHA-256
`e5425fa146c254c59856b8a64c129fdb95fcf8249c4958b9ec73fedf0d0d4d5c`
(package evidence `ev_9018ce36bd09530784415fef594cced57f401c66a75773d9365da89147433c7f`).
The Android class-name search found no `EMsg` class
(`ev_1aef9cbf7f17b2e8e95f486698cbb9cba3212e55aab2f2b04e2417850e877ef9`).
The bundled frontend is Hermes bytecode; these observations do not establish
its runtime behavior. The packet corrections above were verified against the
linked protocol definitions and local regression fixtures.
