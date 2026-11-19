---
name: FilmFrame
description: A tactile film index for selecting, adjusting, and finishing photographs in a local digital darkroom.
colors:
  oxidized-orange: "#ed9b52"
  oxidized-orange-hover: "#f4af6d"
  action-ink: "#1c2426"
  oxidized-orange-soft: "rgba(237, 155, 82, 0.14)"
  oxidized-orange-line: "rgba(237, 155, 82, 0.65)"
  focus-orange: "#f5b778"
  cool-cyan: "#92afb4"
  cool-cyan-soft: "rgba(146, 175, 180, 0.12)"
  cool-cyan-line: "rgba(146, 175, 180, 0.6)"
  processing-safelight: "#a55247"
  processing-safelight-soft: "rgba(165, 82, 71, 0.16)"
  processing-safelight-line: "rgba(197, 111, 97, 0.75)"
  processing-safelight-text: "#e6a296"
  ready-green: "#8da795"
  ready-green-text: "#c0d6bd"
  ready-green-soft: "rgba(141, 167, 149, 0.14)"
  ready-green-line: "rgba(141, 167, 149, 0.65)"
  attention-amber: "#e0ac64"
  attention-amber-soft: "rgba(224, 172, 100, 0.12)"
  attention-amber-line: "rgba(224, 172, 100, 0.75)"
  danger-coral: "#e08b7d"
  danger-coral-soft: "rgba(224, 139, 125, 0.12)"
  danger-coral-line: "rgba(224, 139, 125, 0.7)"
  graphite-deep: "#101719"
  graphite-workspace: "#171d20"
  graphite-panel: "#20292d"
  graphite-raised: "#273237"
  graphite-soft: "#303d42"
  structure-soft: "#35464c"
  structure-line: "#53676e"
  structure-strong: "#8ba3a9"
  lime-white: "#e8e7df"
  content-muted: "#b1bdbd"
  content-dim: "#97a9ac"
  film-rail: "#182226"
  film-perforation: "#080f12"
  film-empty-frame: "#243237"
  film-caption: "#edb66a"
  dialog-overlay: "rgba(7, 13, 15, 0.86)"
  atmosphere-cyan: "rgba(146, 175, 180, 0.035)"
typography:
  display:
    fontFamily: "FilmFrame Display, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(32px, 3vw, 42px)"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "-0.035em"
  display-mobile:
    fontFamily: "FilmFrame Display, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "30px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  workspace-title:
    fontFamily: "FilmFrame Display, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: "36px"
    letterSpacing: "-0.025em"
  brand:
    fontFamily: "FilmFrame Display, -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0em"
  panel-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.55
    letterSpacing: "0em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  intro:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: "0em"
  control:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    lineHeight: "20px"
    letterSpacing: "0em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Noto Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
    letterSpacing: "0em"
  metadata:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0em"
  status-code:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, ui-monospace, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.1em"
rounded:
  control: "4px"
  card: "6px"
  dialog: "8px"
  round: "999px"
  segment: "2px"
  photo-card: "3px"
  fieldset: "5px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.oxidized-orange}"
    textColor: "{colors.action-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.oxidized-orange-hover}"
    textColor: "{colors.action-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-primary-large:
    backgroundColor: "{colors.oxidized-orange}"
    textColor: "{colors.action-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.lime-white}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.content-muted}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger-coral}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "44px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.content-muted}"
    rounded: "{rounded.control}"
    padding: "0px"
    size: "44px"
    height: "44px"
    width: "44px"
  segmented-control:
    backgroundColor: "{colors.graphite-workspace}"
    textColor: "{colors.content-muted}"
    rounded: "{rounded.control}"
    padding: "2px"
  segmented-option:
    backgroundColor: "transparent"
    textColor: "{colors.content-muted}"
    rounded: "{rounded.segment}"
    padding: "8px 12px"
    height: "40px"
  segmented-option-selected:
    backgroundColor: "{colors.oxidized-orange-soft}"
    textColor: "{colors.lime-white}"
    rounded: "{rounded.segment}"
    padding: "8px 12px"
    height: "40px"
  settings-field:
    backgroundColor: "{colors.graphite-soft}"
    textColor: "{colors.lime-white}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
    height: "44px"
  output-tab:
    backgroundColor: "transparent"
    textColor: "{colors.content-muted}"
    typography: "{typography.body}"
    padding: "0px 4px"
    height: "46px"
  output-tab-selected:
    backgroundColor: "transparent"
    textColor: "{colors.lime-white}"
    typography: "{typography.body}"
    padding: "0px 4px"
    height: "46px"
  photo-card:
    backgroundColor: "{colors.graphite-panel}"
    textColor: "{colors.lime-white}"
    rounded: "{rounded.photo-card}"
  recipe-summary:
    backgroundColor: "transparent"
    textColor: "{colors.content-muted}"
    typography: "{typography.label}"
    padding: "0px 0px 20px"
  status-stamp-info:
    backgroundColor: "{colors.cool-cyan-soft}"
    textColor: "{colors.cool-cyan}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  status-stamp-processing:
    backgroundColor: "{colors.processing-safelight-soft}"
    textColor: "{colors.processing-safelight-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  status-stamp-ready:
    backgroundColor: "{colors.ready-green-soft}"
    textColor: "{colors.ready-green-text}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 9px"
  session-chip:
    backgroundColor: "rgba(0, 0, 0, 0.22)"
    textColor: "{colors.lime-white}"
    typography: "{typography.status-code}"
    rounded: "{rounded.segment}"
    padding: "4px 7px"
    height: "22px"
---

# Design System: FilmFrame

## Overview

**Creative North Star: "可触阅的胶片索引" (A tactile, readable film index)**

FilmFrame is a calm, precise, restrained Operate tool for photography enthusiasts. The working path is select, adjust, finish. Photography leads: the current photograph or the contact sheet carries the visual weight, while film stock, edge treatment, and output controls remain legible but subordinate. Engineering controls are disclosed on demand rather than presented as equally important dashboard modules.

The empty workspace presents several human-documentary photographs inside a continuous 135 strip, sliding from right to left so adjacent 3:2 frames are visible together. With one imported photo, the same frame grammar expands into a focus view; with several, it becomes an ordered index. The dark graphite-blue environment, lime-white reading text, oxidized-orange action, and cool-cyan structure are a working system, not a simulation of a brown analog desk. There is no global grain or vignette overlay. The local display font is used only for headings; interface text remains in the system sans.

**Key Characteristics:**
- Photography first, with a shared 3:2 frame across the empty strip, contact cards, and sequence rail.
- Flat graphite-blue tonal hierarchy, thin cool borders, and restrained soft depth.
- Oxidized orange for primary action and selection; cyan, safelight red, green, and coral communicate state.
- A 12s frame-by-frame leftward transport with duplicated end frames for continuity, plus a static reduced-motion alternative.
- At least 44px primary interaction targets, visible focus, and keyboard-operable tabs, segments, and dialogs.

## Colors

Graphite blue is the working field, lime white is the reading layer, oxidized orange is reserved for action and selection, and cool cyan defines structure and informational state. The 135 material may use its own photographic frame colors; those are film content, not a second interface palette.

### Primary
- **Oxidized Orange**: the main import/develop action, selected settings, output-tab underline, slider accent, and drop target. It changes to a lighter orange on hover; dark ink keeps labels readable on the filled action.
- **Focus Orange**: the 2px keyboard-focus outline. It is a visibility treatment, not a decorative glow.

### Secondary
- **Cool Cyan**: structural borders, informational states, queued work, and the faint cool wash at the top of the working field. Use muted cool text for secondary reading rather than introducing more accent colors.

### Tertiary
- **Processing Safelight**: active development, processing labels, and stop actions. It is deliberately distinct from the orange action and from destructive coral.
- **Ready Green**: completed output and success feedback.
- **Attention Amber**: stale or incomplete work that needs attention.
- **Danger Coral**: removal, errors, and destructive actions; do not use it for routine processing.

### Neutral
- **Graphite Deep / Workspace / Panel / Raised / Soft**: the ordered working-surface ramp. Deep is the page and photographic mat; workspace is the main field; panel holds controls and cards; raised is used for elevated surfaces and fixed action regions; soft is used for fields and hover fills.
- **Structure Soft / Line / Strong**: separators, control outlines, and strengthened hover or selected structure. Prefer a 1px rule or spacing to an additional containing card.
- **Lime White / Content Muted / Content Dim**: primary reading, supporting text, and low-priority metadata. These are content tones, not a beige page background.
- **Film Rail / Perforation / Empty Frame / Caption**: the continuous strip's blue-black rails, cut perforations, unexposed blue-graphite frames, and warm frame lettering. Their scope is the film artifact.

### Named Rules
**The Action Has One Color Rule.** Use oxidized orange for the principal forward action, selected controls, and direct manipulation feedback. Do not distribute it across decorative badges, section labels, or every icon.

**The State Is Not the Surface Rule.** Cool cyan, safelight red, ready green, and danger coral describe state in stamps, borders, and small fills. They do not replace the graphite working surfaces.

## Typography

**Display Font:** FilmFrame Display, a self-hosted 500-weight WOFF subset derived from Adobe Source Han Sans CN Medium, with the system sans as fallback.
**Body Font:** the native system sans stack for explanatory text, controls, settings, and general labels.
**Label/Mono Font:** SFMono-Regular, Consolas, Liberation Mono, then ui-monospace/monospace for frame numbers, filenames, counts, film captions, measured values, and compact status codes.

**Character:** The display face gives Chinese workspace headings a quiet editorial presence without turning the entire tool into a styled poster. Body copy stays familiar and compact; monospace is evidence and measurement, not a general interface texture.

### Hierarchy
- **Display** (500, responsive 32–42px; 30px on mobile): the empty-darkroom promise. Use balanced wrapping and tight display letterspacing; the frontmatter is normative for each viewport variant.
- **Workspace Title** (500, 26px/36px): the populated workbench heading. The FilmFrame wordmark uses the same display family at 18px.
- **Panel Title** (600, 16px): settings and dialog titles in system sans, not display type.
- **Body / Intro** (400, 14px; intro 15px with generous leading): instructions and task copy. Keep the empty introduction near 29ch on desktop and up to 46ch at intermediate widths; toolbar description is capped at 62ch.
- **Control / Label** (650 at 14px for shared buttons; 500 at 12px for setting labels): clear actions and quiet field naming without invented eyebrow copy.
- **Metadata / Status Code** (12px mono; 10px, 600, tracked uppercase for laboratory status): film stock measurements, frame tags, filenames, and the English half of a bilingual status stamp. Keep the Chinese status label in system sans.

### Named Rules
**The Display Has a Boundary Rule.** FilmFrame Display belongs to the brand and workspace headings. Controls and normal reading text use system sans; measurements use monospace. The bundled subset contains only current workspace headings and printable ASCII, so extend it from the official Source Han Sans source before adding new Chinese display copy.

## Layout

The app shell is capped at 1900px. At 1180px and above, it becomes a working column plus a sticky 344px inspector; at 1536px the inspector becomes 368px. Below 1180px the inspector leaves the grid: tablet settings open in a right drawer up to 380px wide, while smaller screens use a bottom sheet with a maximum height of 92dvh. The header is 56px high below 768px and 64px from 768px upward.

The populated workspace content is capped at 1500px. Its gutters grow from 12px to 20px at 640px and 32px at 1024px; the shared spacing rhythm is a 4px base with 8, 12, 16, 20, 24, 32, 40, 48, and 64px steps. Toolbars wrap actions rather than compressing them, and settings scroll independently while their primary action remains fixed.

The empty darkroom uses an intro-to-film ratio of 0.7fr to 1.5fr with a 48px gap from 1000px upward. Below that it stacks title, explanation, film, and import action. At 640px and below, the page padding becomes 26px 20px 32px, the import button fills the width, and the film frame width is the viewport minus 140px. From 1000px upward each exposure is a fixed 300px wide. Every exposure remains 3:2.

A single contact item becomes a centered focus view, limited by 1080px and the available viewport-height calculation, with a desktop mat minimum of 260px. Multiple items use one column by default, two from 640px, three from 1024px, and four from 1536px; gaps are 16px, then 20px from 1024px. This is one index adapting to count, not separate gallery and editor products.

The empty strip carries 12 documentary photographs and moves continuously left at 24px per second; it does not stop between frames. The full cycle is measured from the first real exposure to its duplicate, so the end joins without a blank gap or reverse jump. Hover, focus within, drag activity and a hidden document pause at the current position; reduced motion holds the strip still. The attribution follows the leftmost photograph that is at least half visible.

## Elevation & Depth

The active system is mostly flat tonal layering. Workspace, panel, and raised surfaces differ by graphite value and 1px cool borders, not by stacks of nested cards. Earlier metallic, beveled, and hard-highlight button treatments are overridden: primary actions and secondary working controls have no resting drop shadow.

### Shadow Vocabulary
- **Contact lift** (`box-shadow: 0 8px 22px rgba(4, 12, 16, 0.26)`): a restrained lift for an explicitly raised shared surface.
- **Photograph / paper** (`box-shadow: 0 6px 18px rgba(4, 12, 16, 0.24)`): the soft offset beneath photo cards; it separates the print tray from the work surface without making every setting a card.
- **Floating surface** (`box-shadow: 0 18px 44px rgba(4, 12, 16, 0.38)`): modal and listbox elevation.
- **Transient feedback** (`box-shadow: 0 10px 28px rgba(4, 12, 16, 0.3)`): notice toasts and other short-lived floating feedback.
- **Pressed control** (`box-shadow: inset 0 1px 2px rgba(4, 12, 16, 0.3)`): a brief inward response on active buttons, paired with a 1px downward translation where motion is allowed.
- **Settings sheet** (`box-shadow: 0 -16px 40px rgba(0,0,0,.42)` on mobile; `-16px 0 40px rgba(0,0,0,.42)` on tablet): directional separation for the overlay drawer.

### Named Rules
**The Print, Not the Panel Rule.** Soft shadows belong to photographs and genuinely floating layers. Ordinary settings groups use spacing and separators, not elevated cards inside elevated panels.

## Shapes

Controls are gently squared at 4px, dialogs at 8px, and general shared cards at 6px. Photograph cards, film cells, inset segments, and compact status details use tighter 2–3px corners; fieldsets and small menus may use 5px. Fully rounded geometry is reserved for slider thumbs, tiny indicators, and loading spinners rather than turning every action into a pill.

Photographs are clipped into 3:2 mats and rendered with object containment so the actual film frame can include its own aspect and border treatment. The continuous empty strip uses square exposure windows, blue-black rails, and repeated rectangular perforations; it does not need an outer decorative card. Borders are normally 1px, with a 2px lower rule for the selected output tab and a 2px outline for keyboard focus. Inline icons use a 24px view box, 1.8px rounded strokes, and currentColor.

## Components

### Buttons
- **Shape:** compact corners (4px), 44px medium height, 48px large height, and 36px compact height. The shared compact button is a density exception; primary touch workflows and icon buttons retain at least 44px.
- **Primary:** flat oxidized-orange fill with dark ink, medium padding (10px 16px), and system-sans emphasis. The large empty-state import action uses 12px 20px and becomes full width on mobile.
- **Hover / Active / Focus:** hover lightens the orange; secondary hover uses a stronger border; ghost hover adds a graphite-soft fill. Active controls move down 1px with a subtle inset press. Focus is always a visible 2px outline, normally offset 2px.
- **Secondary / Ghost / Danger:** secondary actions use graphite panels and lime-white text; ghost actions are quiet text-level commands; danger actions use a coral outline and a coral-soft hover fill. Loading disables the button and shows the existing spinner; disabled controls reduce opacity without hiding their role.

### Icon Buttons
Use the shared icon button for photograph actions and compact utilities. It is a 44px square with a thin structural border and muted icon; the large variant is 48px. Hover adds a soft graphite fill, stronger border, and brighter icon. Every icon-only action requires an accessible label and tooltip; SVG strokes follow currentColor.

### Inputs / Fields
- **Style:** settings selects and text inputs use a graphite-soft fill, 1px structural border, 4px corners, and a 44px minimum height. The shared generic field primitive has a darker graphite-workspace fill; use the matching existing primitive in its established context rather than blending the two.
- **Focus / Error / Disabled:** focus uses the global orange outline, hover strengthens the border, errors use danger coral, and disabled fields use dimmer content with reduced opacity.
- **Ranges:** use an orange track/thumb accent and a monospace numeric output. The reusable range field keeps the control at 44px high and places its value in a right-aligned output; current recipe sliders may use the same native accent directly.

### Selection Controls
- **Segmented control:** a graphite-workspace inset group with a 1px border, 2px padding, and 40px options. The shared primitive marks selection with an orange-soft fill and orange outline; the recipe inspector and mobile settings intentionally use the stronger filled-orange selection already in the build. Preserve each existing context rather than introducing a third selection style.
- **Output tabs:** text-led single/strip choices with counts in smaller muted text. Selection is a 2px orange underline, not a filled tab. Arrow keys, Home, and End move selection and focus.
- **Status stamps:** compact bordered status with an icon, tracked English code, and Chinese state label. Queued is cyan, processing is safelight, complete is green, stale is orange, and failed is coral. Icon-only completion stamps collapse to 24px but keep an accessible name; they are indicators, not reduced touch buttons.

### Cards / Containers
- **Photo card:** a single shallow graphite container with a 3px corner, thin border, soft print shadow, frame heading, 3:2 mat, action row, and filename/footer. Included photographs use a stronger border; active processing uses safelight; drop targets use orange. Excluded items dim to 75% without disappearing.
- **Recipe summary:** a borderless summary separated only by a bottom rule and 20px lower padding. Its two-column definition list pairs dim setting names with muted values. Do not wrap it in another card.
- **Recipe inspector:** a flat graphite panel with section rules, 20px desktop content padding, independently scrolling controls, and a raised fixed footer. Empty settings expose only the film-stock choice and the promise that advanced rendering appears when needed.

### Navigation
The 56/64px sticky header combines the orange film-frame mark, FilmFrame display wordmark, roll number, local-processing summary, and menu. Session information is separated by quiet slash marks rather than a row of dashboard tiles. Settings access appears when photographs exist; the desktop inspector replaces that trigger at 1180px. Mobile settings use four text tabs, a close target, and a persistent bottom action; a separate mobile action bar keeps settings and the current develop/export command reachable below 768px.

### Empty Darkroom and Contact Print
The empty darkroom leads with its heading and a single filled import action beside twelve public-domain photographs by Dorothea Lange, Gordon Parks and Walker Evans in a continuously moving 135 strip. The caption explicitly says it is a photographic illustration, not a film-render result. Provenance and hashes for the 12 bundled frames and the 12 replacement frames live in `public/images/documentary/README.md`; they do not enter the rendering or export pipeline. Quotes and the select-adjust-finish path sit below a separator at lower visual weight.

Contact cards show the source preview while idle, a restrained bath state while processing, and a result-driven contact reveal once a print URL exists. That reveal is distinct from the one-shot 1800ms empty-strip clip. The final print replaces transient effects, and reduced motion skips directly to a readable result.

### Dialogs and Sheets
Dialogs use an 86% dark overlay, 8px surface corners, and floating-surface shadow. Mobile settings are bottom anchored with rounded top corners; tablet settings become a full-height right drawer. They trap and restore focus, close on Escape, lock background scroll, and preserve safe-area padding. Use the existing sheet/modal primitives and state behavior rather than visually similar but inaccessible overlays.

## Do's and Don'ts

### Do:
- **Do** keep the photograph and its 3:2 frame as the primary compositional unit from empty state through selection and output.
- **Do** use oxidized orange for the main forward action and selected state, with dark ink on the filled orange.
- **Do** build hierarchy from graphite tonal steps, 1px cool rules, spacing, and the existing type ramp before adding containers.
- **Do** preserve 44px primary touch targets, visible focus, keyboard-operable selection controls, dialog focus restoration, and reduced-motion results.
- **Do** keep film stock names and measured values accurate, and disclose engineering controls through the existing advanced-settings disclosures.
- **Do** use the local display subset only for supported headings and retain the bundled font/photo provenance.

### Don't:
- **Don't** revive warm-brown workspace surfaces, metallic/beveled action buttons, global grain, or a global vignette as the current system.
- **Don't** flatten all rendering capabilities into equally weighted dashboard controls or turn every settings group into a nested card.
- **Don't** crop every photograph into a generic thumbnail; preserve the shared frame ratio and object-contained film output.
- **Don't** apply monospace to general body copy or the display family to controls and newly unsupported Chinese text.
- **Don't** invent eyebrow labels, decorative glyph substitutes, or new accent colors to fill quiet areas; existing bilingual status codes and technical fieldset legends are scoped content, not a new heading system.
- **Don't** imply that the empty-state photograph is a rendered sample, or that this visual specification guarantees physical-rendering correctness, full cross-browser rendering parity, or release readiness.

<!-- Not canonized or repaired: a compact shared button has a 36px height, completed-photo stamps and toast-dismiss targets can be 24px/32px, and small 9–12px uppercase technical labels remain in scoped legacy material. These are recorded as localized defects/drift, not rules for new primary controls or invented eyebrow systems. Full rendering/browser/device verification is outside this document's authority. -->
