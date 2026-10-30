---
name: Droidchat
description: The existing Steam-style mobile chat interface, recorded from the implementation.
colors:
  canvas: "#202126"
  canvas-raised: "#26282E"
  chrome: "#292C33"
  chrome-deep: "#23262C"
  chrome-pressed: "#343841"
  border: "#14161A"
  text: "#DDE1E5"
  text-strong: "#F1F3F5"
  muted: "#8D949D"
  icon: "#C3CAD1"
  accent: "#66C0F4"
  accent-deep: "#216CAD"
  accent-pressed: "#195E96"
  error: "#E2807D"
  settings-icon-tile: "#3D4049"
  settings-separator: "#2F323A"
  settings-field: "#2B2F37"
  settings-field-border: "#3A3E46"
  settings-switch-off: "#3B4048"
  settings-switch-on: "#2C8C86"
  settings-link: "#3B9EDB"
  in-game-name: "#E8F7D4"
  in-game-game: "#9CC46B"
  in-game-presence: "#7E9A60"
  in-game-rail: "#8FDB24"
  game-icon-background: "#111317"
typography:
  body:
    fontSize: "15.5px"
  label:
    fontSize: "14px"
rounded:
  control: "4px"
  avatar: "2px"
spacing:
  tight: "4px"
  small: "8px"
  group: "12px"
  section: "16px"
components:
  button-send:
    backgroundColor: "{colors.accent-deep}"
    textColor: "{colors.text-strong}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "48px"
  button-send-pressed:
    backgroundColor: "{colors.accent-pressed}"
  button-media:
    textColor: "{colors.icon}"
    rounded: "{rounded.control}"
    width: "44px"
    height: "48px"
  input-message:
    backgroundColor: "{colors.canvas-raised}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: "48px"
  settings-row:
    backgroundColor: "{colors.chrome}"
    textColor: "{colors.text}"
    iconBackgroundColor: "{colors.settings-icon-tile}"
    height: "80px"
  settings-toggle:
    backgroundColor: "{colors.chrome}"
    trackColor: "{colors.settings-switch-off}"
    selectedTrackColor: "{colors.settings-switch-on}"
    width: "46px"
    height: "26px"
  settings-select:
    backgroundColor: "{colors.settings-field}"
    borderColor: "{colors.settings-field-border}"
    textColor: "{colors.text}"
    rounded: "6px"
    height: "48px"
---

# Design System: Droidchat

## Overview

**Creative North Star: "Existing Steam-style chat"**

This is a record of the incumbent interface, not a new visual identity. The app is a dark, mobile-first tool for conversation: restrained chrome, a flexible message area, and compact controls anchored below it. The media additions inherit that system.

**Key Characteristics:**

- Charcoal tonal layers with blue actions and pale content.
- Native platform body typography and familiar symbol icons.
- Small control corners, square avatars, and directional message bubbles.
- Visible loading, disabled, failure, empty, and recovery states.

## Colors

Primary blue distinguishes actions and outgoing messages. Neutral tones separate the header, conversation canvas, inputs, and emoticon tray without ornamental surfaces. Error coral identifies failed sends and actionable upload problems.

**The Semantic Color Rule.** Reuse `SteamColors` for shared roles. The light accent marks links and selected controls; the deeper accent fills Send and outgoing bubbles. Muted text carries secondary information, not the main message.

## Typography

The components do not declare a custom font family; body text follows the native platform. Message and input text use the body size above, with respective line heights of 21 and 20. Secondary labels generally use the label size. The contact title is larger (19, line height 24); the emoticon tray heading is compact and semibold (15, weight 600). Message timestamps are deliberately subordinate (10.5, line height 14).

These are observed roles, not an invented global type ramp. No display face or promotional headline style is established.

## Layout

The screen fills available height. The header, composer, attachment row, and emoticon tray use a centered maximum width of 560. The message list grows between header and composer and places short conversations near the bottom. New messages scroll into view; earlier-history loading does not intentionally pull the reader to the latest item.

The composer is one row: photo action, flexible text field, emoticon action, Send. Controls retain 44-unit widths; the text field takes remaining space and can shrink. Small gaps keep these controls together. Bottom padding respects the device safe area. The optional attachment preview and emoticon tray appear above this row rather than replacing the conversation.

## Settings surfaces

The Settings and Interface screens invert the chat surface relationship: the header uses `canvas`, while the list body uses `chrome`. Rows are 80 units tall with 32-unit icon tiles, full-bleed hairline separators, and a muted chevron. Interface toggles use a 46 × 26 track with a 20-unit thumb; the selected track is settings teal (`#2C8C86`), not the chat action blue. Dropdown fields are 48 units tall with 6-unit corners and a raised `#2B2F37` surface. Links use `#3B9EDB`. Version and supporting copy stay on the muted token so they remain readable on chrome.

These settings pages are an extension of the incumbent Steam-style system, not a second identity. The teal selected state is local to interface toggles; chat actions continue to use the blue accent.

## Elevation & Depth

The sampled chat components use flat tonal layering and hairline separators, not drop shadows. Raised inputs and deeper chrome make adjoining regions distinguishable without decorative elevation. Pressed state changes tone or opacity.

## Shapes

Controls, image previews, and the emoticon search field use small rounded corners. Avatars remain nearly square. Message bubbles use softer corners (9) with a tightened lower corner (2) on the author's side. The circular back-button hit area is a navigation treatment, not a general container shape.

## Components

**Buttons.** Send is a filled blue action; media actions are unfilled symbols. Back and Close have 44-unit hit regions. Send becomes dimmed when unavailable, and a spinner replaces its symbol during submission. Use the existing `SymbolView` platform mappings rather than Unicode characters as control icons.

**Message field.** The field is a raised tonal surface with a compact radius. Text selection and cursor location are preserved when inserting an emoticon. Editing and media actions are disabled while a send operation owns the draft.

**Emoticon tray.** A heading and Close control precede a search field and six-column collection grid. Search filters the account's collection. Loading, retry, empty search, empty collection, and missing-asset fallback are separate states. The tray stays within the composer's width cap.

**Image attachment.** A thumbnail, dimensions, and file size precede sending. Remove remains explicit. Upload failures retain the attachment and draft; uncertain delivery is stated before another image can be sent. This behavior is task-specific recovery, not a new system-wide modal pattern.

**Messages.** Outgoing content uses the blue bubble; incoming content uses the raised canvas tone. Images and emoticons render inline with readable asset fallbacks. Timestamps and send state sit outside the bubble. Shared images open their full version through a labeled action.

**In-game friend rows.** An online friend who is playing a game gets a 32-unit game tile before the normal 48-unit avatar. The presence rail switches from Steam blue to the bright game green, the name takes a pale green tint, and the second and third lines carry the game name and the game's short rich-presence status. A friend without rich presence keeps only the game-name line, matching Steam's own client. Game tiles use the store community icon, fall back to the store wordmark, then to a gamepad symbol; the game name falls back to the store name when the persona payload has no name. This green treatment is local to game presence; ordinary online, away, and offline rows keep their existing blue and neutral roles.

## Do's and Don'ts

- **Do** preserve the existing token palette and compact mobile control geometry.
- **Do** preserve native accessibility labels, touch targets, and safe-area spacing.
- **Do** keep readable text when an image or emoticon cannot load.
- **Don't** turn a local composer feature into a new visual identity.
- **Don't** replace symbol controls with decorative emoji or text glyphs.
- **Don't** treat synthetic web-preview content as product or native-device evidence.

Recorded from the theme and chat components on 2026-10-27. Settings surfaces added 2026-10-29 from the supplied Settings and Interface mockups. In-game friend rows added 2026-10-30 from the supplied friends-game mockup; store metadata comes from Steam's public StoreBrowse service. The supplied 320- and 390-pixel captures are React Native Web previews with synthetic content. Native device capture and live Steam upload verification were unavailable; no device-specific visual certification is implied.
