# In-game friend presence

The decompiled `CMsgClientPersonaState.Friend` descriptor in the supplied
`com.valvesoftware.android.steam.friendsui` APK uses `game_played_app_id`
(field 3), `game_name` (field 55), and a repeated `rich_presence` key/value
message (field 71). The official client only consumes field 71 when
`EClientPersonaStateFlag` `0x1000` is requested, so
`ClientRequestFriendData` uses a mask of `0x17ff`: the common persona fields
plus rich presence. K/V keys are lower-cased before lookup, matching
`CPersonaStateCMImpl.UpdateFromMessage`.

The chat-only client has no local app-info cache, so the community icon for an
app id comes from `IStoreBrowseService/GetItems`
(`assets.community_icon`). The store `logo.png` is the fallback while that
request is in flight; failures are non-fatal. The store name is used only when
the persona payload has no `game_name`.

The friends list renders this data as a game tile, the friend's normal avatar,
a bright game-presence rail, and up to two lines: game name and the short
`status` (or de-tokenized `steam_display`) rich-presence value. A friend with
no rich presence keeps only the game-name line, matching the supplied mockup.
