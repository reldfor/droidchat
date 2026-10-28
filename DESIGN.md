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

## Do's and Don'ts

- **Do** preserve the existing token palette and compact mobile control geometry.
- **Do** preserve native accessibility labels, touch targets, and safe-area spacing.
- **Do** keep readable text when an image or emoticon cannot load.
- **Don't** turn a local composer feature into a new visual identity.
- **Don't** replace symbol controls with decorative emoji or text glyphs.
- **Don't** treat synthetic web-preview content as product or native-device evidence.

Recorded from the theme and chat components on 2026-10-27. The supplied 320- and 390-pixel captures are React Native Web previews with synthetic content. Native device capture and live Steam upload verification were unavailable; no device-specific visual certification is implied.
