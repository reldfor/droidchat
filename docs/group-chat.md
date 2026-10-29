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

## Verification

`npm test`, `npx tsc --noEmit`, `npx expo lint`, and a web export cover the
protocol fixtures, reducer behavior, group upload commit fields, and screen
states. The protocol was derived statically from the supplied APK; a signed-in
device check of live group messages, read receipts, and a real group image
upload is still outstanding.
