---
name: "FlowChat"
description: "Production-label clarity for an evidence-backed trading workspace"
colors:
  canvas: "#f5f7fb"
  surface: "#ffffff"
  ink: "#1b2c43"
  muted: "#5a6a7f"
  faint: "#6c7b90"
  line: "#dfe5ee"
  line-soft: "#edf0f5"
  nav: "#172a46"
  nav-ink: "#eef3fb"
  nav-muted: "#b9c8dc"
  blue: "#315fe5"
  blue-soft: "#edf2ff"
  teal: "#147760"
  teal-soft: "#e9f5ef"
  purple: "#7550b5"
  purple-soft: "#f1ecf9"
  amber: "#8f5e15"
  amber-soft: "#fff5df"
  red: "#aa4545"
  red-soft: "#fff0ee"
  primary-hover: "#254dca"
  primary-active: "#203fa0"
  focus: "#688af3"
  chart-blue: "#4368d6"
  chart-violet: "#8562bd"
  chart-teal: "#2c8b70"
  chart-coral: "#c96858"
  chart-amber: "#ba8a3f"
  chart-slate: "#9aa9bd"
  stock-on-hand: "#c78332"
  stock-inbound: "#b7c9fa"
  stock-target: "#324d77"
typography:
  headline:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  subheading:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.45
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  support:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.55
  button:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.4
  metric:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  table-label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 550
    lineHeight: 1.4
    letterSpacing: "0.015em"
rounded:
  focus: "4px"
  tag: "5px"
  field: "6px"
  button: "7px"
  inset: "8px"
  avatar: "10px"
  mobile-panel: "12px"
  panel: "14px"
  dialog: "16px"
spacing:
  4: "4px"
  6: "6px"
  8: "8px"
  12: "12px"
  16: "16px"
  20: "20px"
  24: "24px"
  28: "28px"
  32: "32px"
  36: "36px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.button}"
    padding: "11px 17px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "#466185"
    typography: "{typography.button}"
    rounded: "{rounded.field}"
    padding: "8px 11px"
  button-inline:
    textColor: "#3a5f9f"
    typography: "{typography.button}"
    padding: "7px 0"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "#304b6e"
    rounded: "{rounded.field}"
    padding: "11px 12px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "24px"
  status:
    backgroundColor: "#eef1f5"
    textColor: "#55667d"
    rounded: "{rounded.tag}"
    padding: "5px 8px"
  nav-active:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "10px 13px"
---

# Design System: FlowChat

## Overview

**Creative North Star: "Production-label clarity"**

Production-label clarity gives FlowChat a professional, colourful working interface for a busy textile distributor. Public Sans, an ink-blue navigation rail, a cool off-white work area and crisp white sheets carry the system. Colour identifies customer, supplier and stock contexts while numbers, source evidence and next actions supply the emphasis.

The material is flat and precise: thin borders, tonal insets, modest corners and tabular figures. The source implements responsive grids, labelled controls, visible focus styles and reduced-motion overrides. This record describes implemented source, not rendered approval: current desktop/mobile captures are absent, and rendered contrast, keyboard interaction and microphone operation remain unverified.

**Key Characteristics:**

- One sans family with tabular business figures.
- Ink-blue shell with white working sheets.
- Cobalt customer, violet supplier and emerald stock context.
- Evidence links and explicit status text alongside colour.
- Border-led depth and brief state transitions.

Source basis: `app/globals.css`, `app/Demo.tsx`, `app/Operations.tsx`, `app/Charts.tsx`, `app/ui.tsx`, `app/CatalogControls.tsx`, `app/VoiceNotes.tsx`, `PRODUCT.md` and `.impeccable/surfaces/app-demo-tsx.md`. Font files are in `public/fonts`; no raster imagery defines this system. Verification disposition remains **recapture** pending current desktop/mobile render evidence. Existing tests/build checks provide code confidence; they do not substitute for visual or interaction verification.

## Colors

A cool working palette uses stronger department colours on restrained neutral sheets. Frontmatter records the literal source values; chart colours are intentionally separate from interface accents.

### Primary

- **Cobalt (`blue`)**: primary actions, links, selected navigation and customer context; `blue-soft` supplies supporting tint. Hover and pressed variants belong to actions.
- **Ink Blue (`nav`)**: persistent rail identity, with `nav-ink` and `nav-muted` for its text hierarchy.

### Secondary

- **Emerald (`teal`)** and **Pale Stock Green (`teal-soft`)**: inventory and positive context. Some stock controls use local green variants rather than the root emerald.
- **Supplier Violet (`purple`)** and **Pale Violet (`purple-soft`)**: supplier context; voice evidence also uses a violet family.

### Tertiary

- **Commitment Amber (`amber`, `amber-soft`)**: pending, partial and low-stock states.
- **Risk Coral (`red`, `red-soft`)**: delayed, potentially missed, critical and out-of-stock states.
- **Chart series (`chart-*`)**: blue, violet, teal, coral, amber and slate distinguish data categories.
- **Stock diagram (`stock-*`)**: amber on-hand, pale-blue incoming and a dark target marker. This diagram uses its own encodings; do not recolour its on-hand segment emerald by assumption.

### Neutral

- **Cool Canvas (`canvas`)** surrounds white **Working Surface (`surface`)** sheets.
- **Business Ink (`ink`)**, **Supporting Slate (`muted`)** and **Quiet Slate (`faint`)** establish reading hierarchy.
- **Sheet Line (`line`)** and **Soft Divider (`line-soft`)** separate containers and rows.
- **Focus Blue (`focus`)** identifies focus outlines in the source. Its presence is not a verified contrast result.

**The Context Colour Rule.** Keep customer, supplier and inventory colour assignments consistent; pair commitment and risk colours with explicit state text.

## Typography

**Display and Body Font:** Public Sans, with system-ui and sans-serif fallbacks. The local variable TrueType font supports weights (100–900), loads with `font-display: swap`, and is accompanied by its SIL Open Font License. There is no separate display face or decorative hero scale.

**Label/Mono Font:** Public Sans for labels; `ui-monospace, monospace` is used only for source references and code excerpts.

**Character:** Clear, compact sans typography separates headings from dense business evidence. Most emphasis uses medium or semibold weight rather than large display text.

### Hierarchy

- **Headline:** page title role; mobile reduces it to (26px), line-height (1.3).
- **Title / Subheading:** section hierarchy, with context-specific headings between (17px) and (24px).
- **Body:** baseline prose; paragraphs cap at (72ch). Several operational explanations use line-height (1.85–1.9).
- **Support / Table label:** compact controls and metadata. Source contains local (10–13px) variants, including smaller mobile metadata; those are not a universal body-text scale.
- **Metric:** strip figures, with local operational values ranging from (22px) to (36px). Match the existing component rather than applying the largest figure everywhere.

**The Numeric Alignment Rule.** Use tabular figures for money, table cells and operational metrics; retain Indian-format currency labels.

## Layout

The desktop shell fixes a full-height rail (236px) beside the workspace. The toolbar is (72px) high. A centred content region caps at (1512px), with default padding (34px 36px 20px). Panels and major grids use (24px) gaps; smaller relationships use the observed spacing steps in frontmatter. The system uses context-sensitive spacing, not a strict single-base scale.

Two-column briefs and chart regions use unequal fractions; summary strips use four equal cells. Chat review uses three columns (205px, flexible, 255px). Tables retain their columns with horizontal overflow rather than squeezing each column into unreadable widths.

- Above (1550px), horizontal gutters grow to (44px) and brief padding to (30px).
- At or below (1250px), the rail is (216px), content gutters (24px), catalog filters have three columns and voice columns stack.
- At or below (1050px), briefs, chart groups, operations groups and bargaining layouts stack; the cash divider moves to the top edge.
- At or below (760px), the rail becomes a named open/close drawer (248px); the workspace fills the viewport. Toolbar height is (65px), content padding (25px 17px 16px), panels use (20px 16px), summary strips and catalog filters use two columns, and priority/chat/voice layouts stack.

The drawer source includes a backdrop, inert regions, Escape handling, focus containment and focus restoration. These are implementation facts; keyboard and mobile behaviour still require browser verification.

## Elevation & Depth

The system is flat at rest. No `box-shadow` declarations occur in the global stylesheet. White sheets, cool canvas, fine borders and contextual tints establish depth. Dialog and mobile-navigation backdrops dim the underlying workspace; the diagram target marker and chart reference lines express data, not elevation.

**The Border-Led Depth Rule.** Use thin dividers and tonal insets to separate working regions. Resting panels do not carry box shadows.

## Shapes

Panels use gentle corners; dialogs and the combined brief are slightly rounder. Controls use the smaller field and button radii, status tags the tag radius, and internal chart tracks modest (3–4px) corners. Border weight is generally (1px). Avatars are rounded squares; small presence marks are circular. Conversation bubbles use asymmetric (10px) corners with a (2px) tail-side corner. Borders and shapes retain conventional control affordances.

## Components

### Buttons

Compact, labelled actions with optional outline SVGs. Primary actions use cobalt and white; stock and promise-story surfaces carry local green or amber variants. Primary padding is recorded in frontmatter; its source minimum height is (40px). Secondary buttons are white with a thin cool border; inline actions use text with an underline on hover. Primary hover and pressed states darken the fill. Disabled buttons use opacity (0.45) and a not-allowed cursor.

Global button/link/summary focus uses a (3px) outline with (4px) offset; fields use (2px) with (2px) offset. Primary and rail transitions use (0.16s ease-out). These are source treatments, not confirmed interaction results.

### Chips

Status chips pair text with a semantic pale fill. Adequate and kept use green; low/pending use amber; critical, out of stock and delayed use coral; excess uses violet. Unverified/default stays neutral. Query suggestion chips are outlined actions with a light blue hover; selected tabs use a pale contextual fill. Do not assume every chip is interactive.

### Cards / Containers

White panels and chart cards share the panel radius, (1px) border and standard padding. Customer sheets use blue header tint, supplier sheets violet, and stock sheets green. Tables remain primarily white. Summary strips share one outer border and internal dividers instead of four detached cards. See Elevation & Depth for depth behaviour.

### Inputs / Fields

Fields use white fill, thin borders, compact padding and visible labels. Catalog filters use contextual green borders and a responsive grid. Search fields are bounded by the available width; editable catalog columns retain a minimum control width and scroll with the table. The question composer moves focus treatment to its outer form using `:focus-within`. Errors are explicit text blocks; empty results have a dedicated message. Do not infer an unimplemented hover style for fields.

### Navigation

The rail has labelled department groups, outline icons and full-row buttons. Default text is pale blue; hover uses a darker blue surface; active uses cobalt with white text and `aria-current`. Mobile exposes labelled menu and close buttons, a backdrop and the drawer state described in Layout. The skip link targets the main workspace.

### Evidence tables and dialogs

Tables use semibold small headers, pale header backgrounds, fine row dividers, tabular figures and a quiet row hover. Original source quotes and original/revised delivery dates remain visibly distinct in the source structure. Evidence dialogs use native `dialog`, a bounded viewport height, internal scrolling and a labelled close action. Their heading and body sizes are local to the modal context.

### Stock-position diagram

The signature brief distinguishes on-hand and incoming segments in a (16px) track with an independent target line (26px high). A text legend, unit-bearing totals, target label and an accessible description accompany the geometry. Keep all three meanings separate; incoming stock is not available on-hand stock. Sidecar preview geometry is illustrative, not live business data.

### Charts and voice evidence

Chart cards combine explanatory headings, compact currency labels, legends and evidence buttons. Donuts have textual totals and category lists; interactive filters are available as labelled buttons outside the chart. Recharts animations are disabled in the source. Voice evidence combines selectable transcript records, source references, verbatim quotes and a separate review/editor area. File upload provides playback; browser speech recognition is browser-dependent and its operation is unverified.

All icons are inline (24 × 24) SVG paths with (1.7px) strokes, round caps and joins, generally displayed at (14–22px). Decorative icons are `aria-hidden`; text supplies the meaning. No icon font is required.

## Do's and Don'ts

### Do:

- **Do** use Public Sans and the established headline, body and supporting hierarchy.
- **Do** retain labelled controls, visible focus treatments and reduced-motion overrides.
- **Do** keep on-hand, incoming and target quantities separately labelled in stock diagrams.
- **Do** use horizontally scrolling table wrappers and source evidence actions for dense records.

### Don't:

- **Don't** replace semantic status text with colour alone.
- **Don't** add resting panel shadows to this flat working system.
- **Don't** promote a one-off accent, caption or uppercase metadata treatment into a global display style.
- **Don't** describe current screenshots, contrast, keyboard flows or microphone operation as verified without rendered evidence.

Not canonized or repaired: no material defect was reported by the source review. Local caption sizes, uppercase priority/roadmap metadata and one-off tint literals are recorded only as existing component details, not global rules. Rendered accessibility and layout remain pending; documentation does not turn absent evidence into approval.

## Integration workspaces

The new Import Chats, Accounting & Documents, Excel Sync, Plans & Billing, AI Copilot and Workspace Settings pages reuse the existing navy rail, Public Sans, white sheets, border system and semantic palette. Forms use labelled inputs and inline status/error messages; accounting uses a library table plus a two-column PDF/field review. Provisional plans use four comparable plan columns with Pro in the existing navy; they collapse to two and then one column. No new identity or colour token replaces the established dashboard. Rendered desktop/mobile and interaction approval remain pending where permitted browser tooling is unavailable.
