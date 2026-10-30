# Steam group chats

The Groups tab lists the signed-in account's joined Steam groups and clan
chats. A group opens to its default room, with any additional rooms available
as chips below the header. Group avatars use Steam's group icon CDN, and
members who are not friends are resolved through their Steam profiles.

Unread state is per room. A room is unread when its latest message is newer
than that room's `CUserChatRoomGroupState.time_last_ack`; reading one room does
not clear the badge on another.

## Protocol

Group chat uses `ChatRoom` service calls over the existing CM connection:

- `ChatRoom.GetMyChatRoomGroups#1` loads group summaries and user state.
- `ChatRoom.SetSessionActiveChatRoomGroups#1` activates every listed group for
  the session. Steam only pushes live group messages for active groups, so the
  app keeps the set active and replays it after a reconnect or a
  `ChatRoomClient.NotifyChatRoomDisconnect#1` resync.
- `ChatRoom.GetMessageHistory#1` loads recent messages and older pages.
- `ChatRoom.SendChatMessage#1` sends a message to one room.
- `ChatRoom.AckChatMessage#1` is sent as a client notification and records the
  per-room read timestamp.

Live updates arrive through:

- `ChatRoomClient.NotifyIncomingChatMessage#1`
- `ChatRoomClient.NotifyAckChatMessageEcho#1`
- `ChatRoomClient.NotifyChatGroupUserStateChanged#1`
- `ChatRoomClient.NotifyChatRoomHeaderStateChange#1`
- `ChatRoomClient.NotifyChatRoomGroupRoomsChange#1`
- `ChatRoomClient.NotifyChatMessageModified#1`
- `ChatRoomClient.NotifyChatRoomDisconnect#1`

Non-friend author names and avatars come from
`Player.GetPlayerLinkDetails#1`, batched and cached in the group profile map.

## Creating a group chat

The Friends, Chats, and Groups top bars expose a plus-in-speech-bubble action
beside search, matching the header in the supplied APK and the app mockups. It
opens **New Chat**, where friends are selected from the account's friend list
and invited in one step.

The action is group-first: one or more selected friends creates a group. Tapping
a friend already opens a direct chat, so this screen does not repeat the APK's
single-invitee direct-message shortcut.

Submission calls `ChatRoom.CreateChatRoomGroup#1`:

- Field 3 is the optional group name. The New Chat flow mirrors the APK and
  leaves it empty, so the UI derives a display name from the member list.
- Field 4 is the repeated fixed64 `steamid_invitees` list. The app sends every
  selected friend in this single request; it does not create an empty group and
  invite people afterward.
- The response supplies `chat_group_id`, the complete `CChatRoomGroupState`,
  and the creator's `CChatRoomUserGroupState`.

The response is applied straight to the group reducer, so the new room and its
default `General` channel are usable before `GetMyChatRoomGroups` refreshes.
The reducer seeds `topMemberIds` from the returned members, which keeps an
unnamed group from rendering as "Group chat". The creator then joins the
session's active group set through `SetSessionActiveChatRoomGroups#1`; without
that step the client would not receive live messages for the room it just made.

## Images

Group images use the same `beginfileupload` → signed binary PUT →
`commitfileupload` flow as friend images. The group commit carries
`chat_group_id` and `chat_id` instead of `friend_steamid`; the commit itself
dispatches the room message. After a commit—including an ambiguous one—the room
history is refreshed so delivery is reconciled from Steam rather than assumed.

The supplied APK (`com.valvesoftware.android.steam.friendsui` 1.1, build
10167321) shows this in `PopulateCommitFileUploadFormData`: group rooms append
`chat_group_id`, `chat_id`, and `spoiler`, while friend chats append
`friend_steamid` and `spoiler`.

## Implementation map

The alternative frontend already implements the same model:

- `src/lib/steam/cm-proto.ts` encodes and decodes the group requests and
  notifications, including summary pairs, room history, sends, acknowledgements,
  room changes, deleted messages, player link details, and group creation.
- `src/context/steam-chat.tsx` loads joined groups, activates the group set,
  creates a group and invites its first members, pages room history, sends and
  acknowledges messages, keeps per-room read state, and resolves non-friend
  authors in batches.
- `src/context/group-chat-state.ts` stores groups, rooms, messages, previews,
  per-room unread state, and the immediate result of group creation.
- `src/app/(app)/groups.tsx` and `src/app/group/[id].tsx` provide the existing
  group list and room UI. `src/app/new-chat.tsx` is the invite picker opened
  from the top-bar action; it reuses the friend list and then opens the created
  room. The Settings work does not add another group page.
- `MessageBubble` now honors the Interface settings that suppress inline images
  and emoticons, including the Wi-Fi-only media rule. Those settings apply to
  direct and group messages through the shared bubble.

## APK evidence

REA/JADX inspected the supplied package as
`com.valvesoftware.android.steam.friendsui` 1.1 (build 10167321), SHA-256
`e5425fa146c254c59856b8a64c129fdb95fcf8249c4958b9ec73fedf0d0d4d5c`
(package Evidence `ev_a33adf72fa1b3089978928b353ff47cb454612245b46afe194aa0305071b2d14`).
A class search for `ChatRoom` returned no Android classes
(`ev_08ffdd6aedf54a129b62697cd770644f37ca69372c7190396eb1c8c78797b70c`),
which is expected: the chat implementation is in the bundled Hermes bytecode,
not in Java/Kotlin. A fresh REA package inspection during this work returned
`ev_b15e8ff3f93e62ce09bdd573f0d0d4ed49760f7f1379a4657b3b86823d9841c9`
(package `com.valvesoftware.android.steam.friendsui`, version 1.1/10167321,
14,304 classes). The service descriptors and message fields used above were
extracted from that bundle into `.analysis/chatroom-schema.txt` and
`.analysis/chatroom-messages.txt`, then checked against the Steam protobuf
schemas. The `CreateChatRoomGroup` request/response shape, the New Chat submit
handler, and the top-bar New Chat icon were read from the decompiled bundle at
`steam-index.decompiled.js` lines 525240-525380, 529581-530265, 1393790-1393905,
and 1421509-1421884. REA also parsed the desktop friendsui bundle
(Evidence `ev_2c8929e0a0643049f9d10ae41cb5a0a1ddd783af9fa0a7684eb8f16b70811935`)
and found the same `ChatRoom.CreateChatRoomGroup#1` service call in
`CreateChatRoomGroup`; that is corroboration, not an Android runtime capture.
This is static evidence of the shipped contract, not a runtime capture of a
signed-in group session.

The exact wire fields used by this client are:

- `ChatRoom.GetMyChatRoomGroups#1` (empty request) → repeated
  `CChatRoomSummaryPair` with `group_summary` and `user_chat_group_state`.
- `ChatRoom.SetSessionActiveChatRoomGroups#1` → `chat_group_ids`,
  `chat_groups_data_requested`, and an optional member-virtualization threshold.
- `ChatRoom.GetMessageHistory#1` → `chat_group_id`, `chat_id`, `last_time`,
  `last_ordinal`, `start_time`, `start_ordinal`, `max_count`; the response
  carries messages, deletions, reactions, and `more_available`.
- `ChatRoom.SendChatMessage#1` → `chat_group_id`, `chat_id`, `message`,
  `echo_to_sender`; the response carries the modified message, timestamp,
  ordinal, and BBCode-free text.
- `ChatRoom.AckChatMessage#1` → `chat_group_id`, `chat_id`, `timestamp`.
- `ChatRoom.CreateChatRoomGroup#1` → `name` and repeated fixed64
  `steamid_invitees`; the response carries `chat_group_id`, `state`, and
  `user_chat_state`.
- `ChatRoomClient.NotifyIncomingChatMessage#1` →
  `chat_group_id`, `chat_id`, `steamid_sender`, `message`, `timestamp`,
  `ordinal`, `chat_name`, `notification_key`.
- `ChatRoomClient.NotifyAckChatMessageEcho#1`,
  `NotifyChatGroupUserStateChanged#1`,
  `NotifyChatRoomHeaderStateChange#1`,
  `NotifyChatRoomGroupRoomsChange#1`, `NotifyChatMessageModified#1`, and
  `NotifyChatRoomDisconnect#1` keep the open group set synchronized.

Live group messages only flow for groups in the active session set. That is why
the client replays `SetSessionActiveChatRoomGroups` after a reconnect or a
`NotifyChatRoomDisconnect` resync, and why the room list is loaded separately
from the per-room history.

## Verification

`npm test`, `npx tsc --noEmit`, `npx expo lint`, and a web export cover the
protocol fixtures, group creation encoding/decoding, reducer behavior, group
upload commit fields, and screen states. The protocol was derived statically
from the supplied APK; a signed-in device check of group creation, live group
messages, read receipts, and a real group image upload is still outstanding.
