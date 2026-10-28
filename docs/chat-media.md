# Images and Steam emoticons

In a connected conversation:

- Tap the photo icon, choose an image, review its preview, then tap Send.
  Remove the preview with × to choose a different image. Optional text is sent
  as a separate message after the image succeeds.
- Tap the smile icon to search the signed-in account's Steam emoticon collection.
  Choosing one inserts `:name:` at the cursor. Tap Send to post it. Typed Steam
  emoticon codes work too.
- Incoming messages and loaded history display images and emoticons inline.
  Tap a shared image to open its full version. Missing assets retain a readable
  fallback rather than an empty bubble.

Photo uploads are supported by the native Android/iOS app. Browser JavaScript
cannot set Steam Chat's authentication cookie, so the web build explains
that limitation when the photo button is used. Emoticons and media rendering
work in the web build. A proxy/backend would be needed for browser uploads.

The photo picker, image manipulator, and filesystem modules are installed for
Expo SDK 58. Rebuild an installed standalone APK/development client to include
them. Expo Go with the matching SDK can use its bundled modules. The picker uses
the system photo UI; camera and microphone permissions are disabled in app.json.
Photos are converted/downsampled to at most 2048 pixels per dimension; PNG
transparency and GIF animation are retained. Steam's upload limit is 30 MiB.

## Protocol

The implementation follows the supplied vanilla Steam Chat APK's upload flow:
`https://steam-chat.com/chat/beginfileupload/?l=english` → signed binary PUT →
`https://steam-chat.com/chat/commitfileupload/` with the
friend's SteamID. **Commit dispatches the image**, so it does not send an extra
`FriendMessages.SendMessage`. Each form carries the same session ID and file SHA-1.
The APK configures `CHAT_BASE_URL` separately from `COMMUNITY_BASE_URL`; using
the Community origin here did not match the mobile app. Its Hermes bytecode
sets `steamLoginSecure` to the encoded SteamID + `||` + mobile access token,
and installs the matching `sessionid` cookie. This also matches
[node-steam-session](https://github.com/DoctorMcKay/node-steam-session/blob/master/src/LoginSession.ts).
Before each image upload, the app calls `Authentication.GenerateAccessTokenForApp#1`
over its already authenticated CM connection, following the APK's token-refresh
transport. The resulting access token and any rotated refresh token are
persisted before building the cookie. This avoids relying on an expired HTTP
routing token while ordinary chat remains connected using the refresh token.
Explicit refresh failures stop the upload instead of returning a cached token.
Account changes invalidate queued/in-flight refreshes.

The app sends these cookies explicitly to the chat origin and omits the
ambient cookie jar. Login cookies are never attached to the storage-host PUT.
Reading a published CDN image URL is separate from the authenticated upload
and commit operations. Upload errors distinguish HTTP/authentication failures,
invalid responses, and transport failures rather than labeling all of them as
a connection problem.

`Player.GetEmoticonList#1` uses the
[Steam protobuf schema](https://github.com/SteamTracking/Protobufs/blob/master/steam/steammessages_player.steamclient.proto).
Message state preserves raw markup alongside readable chat-list previews. The
renderer recognizes image attributes (including thumbnails and unclosed stored
tags), `:name:`, `[emoticon]name[/emoticon]`, and legacy `ːnameː`.

Upload failures retain the selected image and draft. Upload authentication is
renewed automatically through CM; a rejected web cookie does not by itself
tell the user to sign in again. If a commit response is
lost, history is refreshed and the image cannot be blindly resent; remove it
only after checking whether it arrived. In-flight token refreshes are shared,
and old clients cannot populate a newly signed-in account's history.

## Verification

`npm test`, `npx tsc --noEmit`, `npm run lint`, and
`npx expo export --platform android --output-dir .expo/verification-android`.
The tests use independent wire/HTTP fixtures and send no real Steam messages.
The actual components were exercised in an isolated React Native Web preview at
320 and 390 pixels: search, cursor insertion, sending, missing-asset fallback,
draft recovery, and horizontal fit. Preview contacts and messages are synthetic.
Native photo selection and a real signed-in upload still need device validation;
ADB/emulator access was unavailable in this workspace.

The supplied APK was inspected with REA/JADX and its Hermes v96 bundle was
disassembled with hermes-dec 0.1.7. The extracted bundle was byte-for-byte
verified against `assets/index.android.bundle` inside the APK. Exact function
IDs, offsets, digests, retained bytecode, and the boundary between static
findings and unverified signed-in behavior are recorded in the workspace's
`.analysis/media-research/` directory. Tests also cover HTTP 401/403/404/503,
HTML in place of JSON, failed HTTP refresh followed by CM recovery, rotated
tokens, expired-token fallback prevention, and account changes during a queued
refresh. A rejected/ambiguous commit is never automatically resent.
