# grue wave 2 UI spec

Scope: interaction UI only — top menu, context menus, shortcuts, format palette,
copy/paste style, small dialogs. Assumes wave 1 data model already lands (layers,
stroke style, 12 shapes, arrow states, notes, file/URL attachments, hidden/collapse
flags, map background) per issue #3. Source: `gh issue view 3 --repo rcrath/grue`
(kept-feature checklist + wave-plan comment), `README.md`, `docs/legacy-specs/`.

Wave tags used throughout: **existing** (already built), **W2** (build now),
**W3** (menu/entry exists now but disabled — wave 3 wires it up), **W4** (same,
wave 4). Dropped-for-certain (not shown anywhere): slides/presentations, pathways,
hop-distance highlighting, arrange/layout submenus, import/publish integrations,
analysis menu, interaction tools dock, portal/slide context menus, split/super/kiosk
screen modes, "lucky image", auto-tag.

Open question for Rich before coding starts: the checklist keeps an "Image" context
menu and Format-menu image submenu, but the wave-1 data model (`src/core/model.ts`)
has no distinct image component — a `GResource` is just a URL/file attachment on any
node. This spec treats "image variant" as *a node whose attached resource is an image
file* (rendered as a thumbnail once wave 3/4 adds preview rendering) rather than a
separate LWImage-equivalent type. Confirm or correct before building §2's image menu.

---

## 0. Conventions

- `MOD` = Ctrl (Windows/Linux) / Cmd (macOS). `ALT` = Alt (Windows/Linux) / Option (macOS).
- Only a Windows build ships today (README). Shortcut table is written cross-platform
  now since macOS/Linux builds are wave 4 — no rework needed later.
- "Disabled" means grayed-out and non-actionable, not hidden, unless noted.

---

## 1. Top menu bar

### Menu tech: HTML/DOM menu bar, not Tauri's native `Menu` API

Reasons:
- The app already runs in two modes — Tauri desktop and plain-browser dev
  (`npm run dev`, see `src/ui/platform.ts` `isTauri()` fallback pattern). A native
  Tauri menu only exists in the desktop build; an HTML bar behaves identically in
  both, so dev-mode testing matches production.
- Tauri 2's native menu is a known source of webview focus glitches on Windows
  (menu-open steals keyboard focus from the SVG canvas; reported upstream). An
  in-page bar keeps focus management in our own code.
- Cross-platform consistency: native menu bars differ in placement (in-window on
  Windows/Linux, global top bar on macOS) and require per-platform testing; an HTML
  bar renders identically everywhere and matches the "low overhead over max native
  fidelity" architecture conclusion in README.
- Wave 3/4 add ~10 checkable Window-menu items (panel show/hide) and live-updating
  enable/disable state tied to selection — trivial with DOM+event listeners, more
  plumbing via native menu's item-update APIs.
- Revisit only if Rich wants a macOS global app menu (About/Quit/Preferences in the
  system menu bar) for platform polish — that can be a thin native-menu shim added in
  wave 4 alongside the macOS build, coexisting with the HTML bar.

Structure: fixed horizontal bar, one root button per menu, click opens a dropdown,
click-outside or Escape closes it, arrow keys move between items, click elsewhere in
the bar while a menu is open switches menus without a second click (standard menu-bar
behavior). No native OS menu, no browser `<menu>` element (unsupported/deprecated).

### File menu

| Item | Shortcut | Wave | Disabled when |
|---|---|---|---|
| Open... | MOD+O | existing | never |
| Open from URL... | — | W2 (needs `tauri-plugin-http` or `fetch`, not yet a dependency — flag in PR 7 below) | never |
| — separator — | | | |
| Save | MOD+S | existing | never (Save As behavior when no path yet) |
| Save As... | MOD+Shift+S | existing | never |
| Revert | — | W2 | no file path, or no unsaved changes |
| — separator — | | | |
| New Map | MOD+N | W3 (#4 tracked separately) | shown, disabled, tooltip "coming soon" |
| Close Map | MOD+W | W3 (#7) | shown, disabled |
| — separator — | | | |
| Print... | MOD+P | W4 | shown, disabled |
| Print Visible | — | W4 | shown, disabled |
| Export PDF... | — | W4 | shown, disabled |
| Recently Opened | ▸ submenu | W3 | shown, disabled (empty submenu) |
| — separator — | | | |
| Exit | MOD+Q (Win: Alt+F4 also works natively) | W2 (#6) | never |

### Edit menu

| Item | Shortcut | Wave | Disabled when |
|---|---|---|---|
| Undo | MOD+Z | existing | history empty |
| Redo | MOD+Shift+Z | existing | redo stack empty |
| — separator — | | | |
| Cut | MOD+X | W2 | no selection |
| Copy | MOD+C | W2 | no selection |
| Paste | MOD+V | W2 | clipboard empty |
| Duplicate | MOD+D | existing | no selection |
| Delete | Delete / Backspace | existing | no selection |
| — separator — | | | |
| Rename | F2 (Win) / Enter (Mac) | W2 (binds to the existing double-click inline editor, README) | selection is not exactly one labeled item |
| — separator — | | | |
| Select All | MOD+A | W2 | no items in doc |
| Select All Nodes | MOD+Alt+A | W2 | no nodes |
| Select All Links | MOD+Shift+A wait — see collision note below | W2 | no links |
| Reselect | — | W2 | no prior selection recorded |
| Deselect All | Escape (see §3 for Escape's other meanings) | W2 | no selection |
| Expand Selection | MOD+] | W2 | no selection |
| Shrink Selection | MOD+[ | W2 | selection already at minimum |
| — separator — | | | |
| Group | MOD+G | W2 | fewer than 2 items selected |
| Ungroup | MOD+Shift+G | W2 | selection has no group |
| — separator — | | | |
| Preferences... | MOD+, | W3 | shown, disabled |

Note: legacy used Cmd+Shift+A for Deselect All. Grue instead binds Escape to
deselect (matches legacy's Escape-cancels-marquee behavior, README's existing space/
tool-key scheme) and frees Cmd/Ctrl+Shift+A. Select All Links needs its own chord —
recommend `MOD+Alt+Shift+A` (Select All Nodes takes `MOD+Alt+A`) to keep the family
readable; confirm with Rich, this is a new (non-legacy) chord.

### View menu

| Item | Shortcut | Wave | Disabled when |
|---|---|---|---|
| Zoom In | MOD+= | existing | at max zoom (128×) |
| Zoom Out | MOD+- | existing | at min zoom (1/64) |
| Zoom to Fit | MOD+] — **collides with Expand Selection above** | existing | see note |
| Zoom to Selection | MOD+Shift+F | W2 | no selection |
| Zoom Actual (100%) | MOD+' | existing | already at 100% |
| — separator — | | | |
| Toggle Full Screen | \\ (no modifier) | W2 | never |
| — separator — | | | |
| Toggle Global Collapse | — | W3 | shown, disabled |
| Toggle Pruning | — | W3 | shown, disabled |
| Clear All Pruning | — | W3 | shown, disabled |
| Toggle Links | — | W3 | shown, disabled |
| Toggle Link Labels | — | W3 | shown, disabled |

**Collision found**: legacy `Ctrl+]` = Zoom to Fit. This spec's Edit menu also wants
`MOD+]` for Expand Selection (legacy has no Expand/Shrink Selection chord — it's a
new binding grue needs). Resolution: keep `MOD+]` / `MOD+[` for Zoom to Fit / (no
legacy zoom-out-to-fit equivalent, so `[` is free) and move Expand/Shrink Selection
to `MOD+Shift+]` / `MOD+Shift+[`. Zoom to Fit is existing/legacy and shouldn't move.

### Format menu

| Item | Shortcut | Wave | Disabled when |
|---|---|---|---|
| Copy Style | MOD+Alt+C | W2 | no selection |
| Paste Style | MOD+Alt+V | W2 | no style copied, or no selection |
| — separator — | | | |
| Shape | ▸ submenu, 12 shapes | W2 | selection has no nodes |
| Line Style | ▸ submenu (straight/curved/S-curved) | W2 | selection has no links |
| Arrow | ▸ submenu (none/head/tail/both) | W2 | selection has no links |
| Font | ▸ submenu (bold/italic/underline, bigger/smaller) | W2 | selection has no labeled item |
| Bold | MOD+B | W2 | same |
| Italic | MOD+I | W2 | same |
| Underline | MOD+U | W2 | same |
| Bigger | MOD+Shift+= | W2 | same |
| Smaller | MOD+Shift+- | W2 | same |
| — separator — | | | |
| Image | ▸ submenu (bigger/smaller/natural size/hide/show) | W2, gated on open question above | selection has no image-resource node |
| — separator — | | | |
| Align | ▸ submenu (top/bottom/left/right edges, center row/col) | W2 | fewer than 2 selected |
| — separator — | | | |
| Group | MOD+G | W2 (same action, also reachable from Edit) | fewer than 2 selected |
| Ungroup | MOD+Shift+G | W2 | selection has no group |

### Content menu

| Item | Shortcut | Wave | Disabled when |
|---|---|---|---|
| Add URL... | — | W2 | no selection, or selection already has a resource |
| Replace URL... | — | W2 | selection has no resource |
| Add File... | — | W2 | no selection, or selection already has a resource |
| Replace File... | — | W2 | selection has no resource |
| — separator — | | | |
| Remove Resource | — | W2 | selection has no resource |
| Remove Resource, Keep Image | — | W2, gated on image open question | resource is not an image file |

### Window menu

All items W3 except Format Palette, which is W2 (built as part of this wave).

| Item | Shortcut | Wave |
|---|---|---|
| Format Palette | MOD+1 | W2 |
| Info Dock | MOD+2 | W3 |
| Content Dock | MOD+3 | W3 |
| Layers | MOD+5 | W3 |
| Map Info | MOD+6 | W3 |
| Outline | MOD+7 | W3 |
| Panner | MOD+8 | W3 |
| Metadata Search | MOD+9 | W3 |
| Full Screen Toolbar | MOD+0 | W3 |
| — separator — | | |
| Gather Windows | — | W3 |

Note: legacy numbering had 10 dockable panels on MOD+1..0; grue drops Interaction
Tools Dock and Pathways panel (not kept), so MOD+4 is unassigned — leave a gap
rather than renumbering, so wave 3 issue text and this table stay in sync.

### Help menu

Entire menu is **W4** per the wave-plan comment. Build the shell now (grayed) so the
top bar's final shape is visible in review.

| Item | Wave |
|---|---|
| About | W4 |
| User Guide | W4 |
| Feedback | W4 |
| Keyboard Shortcuts... | W4 |
| Show Log | W4 |

---

## 2. Right-click context menus

Six menus (Slide, Portal not kept — dropped). Each starts with a type-appropriate
header action and ends with the same cut/copy/paste/duplicate/delete block. `Layers…`
etc. that jump to a panel are listed but stubbed until wave 3 (per task instruction —
same pattern as the top menu's W3/W4 tags above).

### Canvas / background menu (no selection, right-click empty space)

1. Paste — disabled if clipboard empty
2. Paste Style — disabled if no style copied (style-only paste needs a target; see §5 — disabled here, kept for menu-shape parity, or omit; recommend **omit**, style paste needs a selected target)
3. — separator —
4. Select All
5. Zoom to Fit
6. Zoom Actual
7. — separator —
8. Format Palette... (W2)
9. Layers... (W3, disabled)
10. Map Info... (W3, disabled)
11. Map Background Color... (W3, disabled — tracked as "canvas color picker" in wave plan)

### Single node menu

1. Copy Style / Paste Style
2. — separator —
3. Shape ▸, Font ▸, Align ▸ (disabled, single item — align needs 2+, so omit Align
   here entirely; single-node menu has no Align entry)
4. — separator —
5. Add URL... / Replace URL... (label toggles once resource present)
6. Add File... / Replace File...
7. Remove Resource / Remove Resource, Keep Image (image-file resources only)
8. Notes... (W2, §6)
9. — separator —
10. Group (disabled — single item, no-op) — recommend **omit** from single-item menu
11. Cut / Copy / Paste / Duplicate / Delete

### Single link menu

1. Copy Style / Paste Style
2. — separator —
3. Line Style ▸, Arrow ▸
4. — separator —
5. Add URL... / Replace URL...
6. Add File... / Replace File...
7. Remove Resource
8. Notes...
9. — separator —
10. Cut / Copy / Paste / Duplicate / Delete

### Multi-selection menu (2+ items, mixed or same kind)

1. Copy Style / Paste Style
2. — separator —
3. Shape ▸ (disabled if no nodes in selection)
4. Line Style ▸ / Arrow ▸ (disabled if no links in selection)
5. Font ▸
6. Align ▸ (top/bottom/left/right, center row/col)
7. — separator —
8. Group
9. Ungroup (disabled if selection has no group)
10. — separator —
11. Cut / Copy / Paste / Duplicate / Delete

### Group menu (right-click a collapsed group)

1. Ungroup
2. — separator —
3. Copy Style / Paste Style
4. Notes...
5. — separator —
6. Cut / Copy / Paste / Duplicate / Delete

### Image-variant menu (node whose resource is an image file — see open question)

1. Copy Style / Paste Style
2. — separator —
3. Image ▸ (bigger / smaller / natural size / hide / show) — W2, gated
4. — separator —
5. Replace File... / Replace URL...
6. Remove Resource / Remove Resource, Keep Image
7. Notes...
8. — separator —
9. Cut / Copy / Paste / Duplicate / Delete

Right-click behavior (already spec'd in `docs/legacy-specs/interaction.md` §4): if
the clicked item isn't already selected, select it (replacing selection) before
opening the menu; if it's already part of a multi-selection, keep the whole
selection and open the multi-selection menu.

---

## 3. Keyboard shortcut table

`MOD` = Ctrl (Win/Linux) / Cmd (Mac). `ALT` = Alt (Win/Linux) / Option (Mac).

| Action | Shortcut | Wave | Notes |
|---|---|---|---|
| Tool: Select | s | existing | |
| Tool: Node | n | existing | |
| Tool: Link | l | existing | |
| Tool: Pan | m | existing | |
| Tool: Rapid-link/combo | r | W2 | new vs. README's current-state list |
| Tool: Zoom | (none yet — legacy used backtick hold only) | W2 | add backtick **hold** below; no toggle key needed |
| Hold: Pan | Space (hold) | existing | |
| Hold: Node tool | X (hold) | W2 | |
| Hold: Zoom tool | \` backtick (hold) | W2 | |
| Hold: Combo node+link | Alt (hold) | W2 | Mac note: legacy avoided Ctrl here because macOS steals Ctrl+click for right-click; keep Alt on both platforms |
| Full screen toggle | \\ | W2 | no modifier, matches legacy |
| New Map | MOD+N | W3 | **collision**: browser reserves Ctrl/Cmd+N (new window) — unfixable via `preventDefault` in a browser tab; not an issue inside the Tauri webview (no browser chrome). Only affects `npm run dev` testing — test that flow via `npm run tauri dev` instead |
| Open | MOD+O | existing | |
| Save | MOD+S | existing | **collision**: browser default Save Page; harmless in Tauri, must preventDefault in browser-dev fallback |
| Save As | MOD+Shift+S | existing | |
| Print | MOD+P | W4 | **collision**: browser print dialog; same Tauri-vs-browser-dev caveat as above |
| Close Map | MOD+W | W3 | **collision**: browser reserves Ctrl/Cmd+W (close tab), same as Ctrl+N — unfixable in a browser tab, fine in Tauri |
| Exit | MOD+Q | W2 | Mac: Cmd+Q is the OS quit convention, fine. Win: also bind Alt+F4 (native, free) |
| Undo | MOD+Z | existing | |
| Redo | MOD+Shift+Z | existing | |
| Cut | MOD+X | W2 | |
| Copy | MOD+C | W2 | |
| Paste | MOD+V | W2 | |
| Duplicate | MOD+D | existing | |
| Delete | Delete / Backspace | existing | |
| Rename | F2 (Win) / Enter (Mac) | W2 | matches legacy's platform split |
| Select All | MOD+A | W2 | |
| Select All Nodes | MOD+Alt+A | W2 | new chord, no legacy precedent |
| Select All Links | MOD+Alt+Shift+A | W2 | new chord, no legacy precedent |
| Deselect All | Escape | W2 | also cancels drag/marquee (existing) and exits full screen — priority order: exit full screen > cancel drag/marquee > deselect |
| Expand Selection | MOD+Shift+] | W2 | moved off legacy's unused slot to avoid the Zoom-to-Fit collision, see §1 |
| Shrink Selection | MOD+Shift+[ | W2 | |
| Group | MOD+G | W2 | |
| Ungroup | MOD+Shift+G | W2 | |
| Zoom In | MOD+= | existing | |
| Zoom Out | MOD+- | existing | |
| Zoom to Fit | MOD+] | existing | |
| Zoom Actual | MOD+' | existing | |
| Zoom to Selection | MOD+Shift+F | W2 | new, no legacy precedent |
| Alt+wheel zoom at cursor | ALT+wheel | existing | |
| Plain wheel pan / Shift+wheel horizontal pan | wheel / Shift+wheel | existing | |
| Align edges | ALT+Up/Down/Left/Right | W2 | |
| Nudge | Arrows | existing | 1 px |
| Big nudge | Shift+Arrows | existing | 10 px |
| Jump to linked node | MOD+Arrows | W2 | legacy: Ctrl+Arrows navigates to nearest linked node in that direction |
| Bold / Italic / Underline | MOD+B / MOD+I / MOD+U | W2 | **collision**: browser/webview may treat Ctrl+U as "view source" in a plain browser tab (Chrome/Firefox reserve it, unpreventable). No conflict inside Tauri. Flag as browser-dev-only limitation, same resolution as Ctrl+N/W/P above |
| Font bigger / smaller | MOD+Shift+= / MOD+Shift+- | W2 | |
| Copy Style / Paste Style | MOD+Alt+C / MOD+Alt+V | W2 | new chords, no legacy precedent (legacy only exposed these via menu/context-menu) |
| Panel shortcuts | MOD+1,2,3,5,6,7,8,9,0 (4 unassigned) | W2 (palette)/W3 (rest) | **collision**: browsers bind Ctrl/Cmd+1..8 to tab-switching and Ctrl/Cmd+9 to last-tab. Unpreventable in a bare browser tab in Chrome/Firefox; harmless in Tauri (no tab strip). Same browser-dev-only caveat — test panel shortcuts via `npm run tauri dev`, not the browser |
| Preferences | MOD+, | W3 | Mac convention; Windows has no default clash |
| Escape | Escape | existing/W2 | see Deselect All row for priority order |
| Enter | Enter | W2 | Mac: also triggers Rename (see Rename row); Windows: pops focal / no-op if nothing to pop |

### Collision summary and resolution

All the flagged collisions (Ctrl/Cmd+N, W, P, U, 1–9) are **browser-reserved
shortcuts that cannot be intercepted from page JavaScript**. They do not affect the
shipped Tauri app (no browser chrome to steal the shortcut). They only affect testing
via `npm run dev` in an actual browser tab. Resolution: don't try to work around them
in the browser-dev fallback — document that shortcut-table QA must happen through
`npm run tauri dev`, and leave the browser-dev path for canvas/rendering iteration
only.

---

## 4. Format palette

Dockable/floating panel (`Window > Format Palette`, `MOD+1`). Three sections, shown
based on selection kind; both sections show (stacked) when selection is mixed.

### Node section (visible when selection has ≥1 node)

- Shape picker: 12 shapes as icon buttons, legacy order —
  `roundRect, rect, oval(ellipse), diamond, hexagon, octagon, flag, flag2, triangle, shield, rhombus, chevron`
  (matches `NODE_SHAPES` in `src/core/model.ts` and the legacy
  `nodeModeTool.subtool.*` list). `pentagon` exists in the `NodeShape` type but has no
  picker button in legacy or here — leave it importable-only (via .vue import), not
  user-selectable, matching current code.
- Fill color: swatch button opens the 48-swatch palette (§4.5)
- Stroke color: swatch button, same palette
- Stroke width: 0–6 px stepper (legacy `strokeWeightValues=0,1,2,3,4,5,6`)
- Stroke style: solid/dotted/dashed/dash2/dash3 dropdown (5 options, matches
  `STROKE_DASHES` in `src/core/model.ts`)

### Link section (visible when selection has ≥1 link)

- Arrow state: 4-way toggle, none/head/tail/both
- Line style: 3-way toggle, straight/curved/S-curved (`controlCount` 0/1/2)
- Stroke width: same 0–6 stepper as node section
- Stroke style: same 5-option dropdown
- Stroke color: swatch button, 48-swatch palette (legacy links use a separate
  7-color `linkColorValues` list, but node/stroke/text share one 48-swatch palette —
  recommend using the shared 48-swatch palette everywhere for one consistent picker,
  not the smaller legacy link-only list; flag as a deliberate simplification)

### Text section (visible when selection has ≥1 labeled item)

- Font family: text input or short dropdown (no legacy enumerated list — free text,
  default "Arial")
- Size: dropdown/stepper with presets `8,9,10,12,14,16,18,21,24,28,32,36,42,48,54,60,72,90`
  (legacy `fontSizes`, `VueResources.properties:1503`)
- Bold / Italic / Underline: 3 toggle buttons
- Text color: swatch button, 48-swatch palette

### 48-swatch color palette

Shared by fill, stroke, and text color pickers (legacy also shares one list across
all three — `fillColorValues` = `strokeColorValues` = `textColorValues` =
`prsntBkgrndColorValues`, all identical in the source).

Source: `E:\Dropbox\audio\git\VUE\2025\VUE\VUE2\src\main\resources\tufts\vue\VueResources.properties`,
line 1528 (single `fillColorValues=` line, verified present). Values, in order:

```
000000, ffffff, eeeeee, d0d0d0, a6a6a6, 7f7f7f, 4c4c4c, 00000000,
fefec9, fefd8c, fefb03, e8e622, fde888, ffc63b, F2AE45, dd7b11,
fcdbd9, fc938d, ea2218, ad0c03, f4e5ff, daa9ff, af55f4, 7c18c9,
eaeaff, c1c1ff, 8484ef, 5252a8, c6e8ff, 83ceff, 33a8f5, 0877c0,
e6f7fd, bde5f2, 82cde4, 5491a4, ecffd4, c1f780, 9ddb53, 76af31,
e0ffe4, 8aee95, 30d643, 0aad1d, f4f5e9, e4e6d2, b5b995, 8c8f72
```

Layout: 8 columns × 6 rows (matches the 8-per-row grouping above — grayscale row,
then 5 rows of 8 hues each light-to-dark). `00000000` (8th swatch) is fully
transparent — render as a checkerboard/"none" swatch, not black. No named tooltips
in legacy for this list (only the smaller `linkColorValues` set has names) — omit
tooltips or add generic "Color 1..48" labels.

---

## 5. Copy style / paste style

**Copy Style** captures a style snapshot from the single selected item (or the
frontmost/first if multiple selected — legacy behavior; disable if selection is
empty). Snapshot fields, by kind:

Node: `shape, fill, stroke, strokeWidth, strokeStyle, textColor, font` (family,
size, bold, italic, underline). Does **not** capture `label, x, y, w, h, notes,
resource, hidden, collapsed, layer`.

Link: `stroke, strokeWidth, strokeStyle, textColor, font, arrowState, controlCount`.
Does **not** capture `label, head, tail, notes, resource, hidden, headPruned,
tailPruned, layer`.

**Paste Style** applies the captured snapshot to every selected item, matched by
kind: a node-style snapshot only applies to selected nodes, a link-style snapshot
only to selected links (mixed selection: apply each field set to its matching
items, skip the rest — no error). One style buffer at a time, held in memory only
(not persisted to the document or `.grue` file, not part of undo history until
applied — applying is a single undoable command).

---

## 6. Smaller dialogs

**Add URL** — modal or inline popover, single text input (URL), Enter/OK to
confirm, Escape/Cancel to dismiss. On confirm: set `resource = { spec: url, title:
null, properties: [] }` on the selected item(s). No validation beyond non-empty
(legacy doesn't validate URLs either).

**Add File** — native file picker via Tauri (`@tauri-apps/plugin-dialog` `open()`,
already a dependency per `src-tauri/Cargo.toml`/`package.json`). Single-file mode;
on confirm set `resource = { spec: path, title: null, properties: [] }`. Browser-dev
fallback: reuse the existing hidden `<input type=file>` pattern in
`src/ui/platform.ts`.

**Notes editor** — plain-text popup (textarea in a small floating panel or modal),
bound to `notes` on the selected node/link/group. No rich text, no legacy
`%nl;`/`%tab;`/`%pct;` escaping needed in the native `.grue` JSON format — that
escaping is only applied on `.vue` export/import (already handled in
`src/core/vueFormat.ts`). Save on close or blur; Escape discards changes made since
open (match Escape's cancel-in-progress convention used elsewhere).

**Rename inline** — already exists (double-click, README "Current state"). Wave 2
only adds the F2/Enter keyboard trigger to open the same existing editor on the
current selection; no new editor UI.

---

## 7. Implementation order (PR-sized chunks)

1. **HTML menu bar shell** — static File/Edit/View/Format/Content/Window/Help bar,
   all items from §1 rendered with correct labels/shortcuts/separators, wired to
   open/close/keyboard-nav only. Every action is a no-op stub except items already
   marked "existing" (wire those to current code). No dependencies.

2. **Shortcut dispatcher** — central keydown handler mapping every §3 row to an
   action id, respecting MOD/ALT platform mapping, feeding both the menu bar and
   bare keyboard input (so menu items and shortcuts share one action table, not two
   codepaths). Depends on PR 1 (menu item ids). Wire the Escape-priority chain
   (full screen > drag/marquee cancel > deselect) here.

3. **Edit menu actions**: Cut/Copy/Paste, Select All / Select All Nodes / Select All
   Links, Reselect, Deselect All, Expand/Shrink Selection, Group/Ungroup, Rename
   (F2/Enter binding only). Each is a `history.checkpoint(doc)` + mutation, following
   the existing snapshot-undo pattern in `src/core/history.ts`. Depends on PR 2.

4. **Format palette panel** — dockable/floating panel per §4, node/link/text
   sections switching on selection kind, 48-swatch color picker component (shared by
   all three color pickers). No dependency on menu bar; can run parallel to PR 1–3.
   Wire `Window > Format Palette` (§1) and `MOD+1` (§3) to open it once built.

5. **Format menu + Copy Style / Paste Style** — Format menu items in §1 dispatch
   into the same style-setting code the palette (PR 4) uses, so palette and menu
   never diverge. Copy/Paste Style per §5 (new style-buffer module, no persistence).
   Depends on PR 4.

6. **Align actions** — top/bottom/left/right edge alignment, ALT+arrow shortcuts.
   Small, isolated; depends only on PR 2 for shortcut wiring.

7. **Content menu + dialogs** — Add URL (§6, simple popover), Add File (§6, Tauri
   dialog — already a dependency, no new crate needed), Remove Resource variants,
   Notes editor (§6, textarea popup). "Open from URL" (§1 File menu) is grouped here
   too since it shares the URL-input UI, but needs a fetch capability grue doesn't
   have yet — **add `tauri-plugin-http` (or use plain `fetch`, which Tauri's webview
   supports for `https://` targets under default CSP) before this sub-item**; flag
   to Rich which approach before implementing. Depends on PR 1 for menu wiring only.

8. **Context menus** (§2) — six right-click menus, reusing the same action ids from
   PRs 3/5/6/7 (no new business logic, just menu-shape + right-click-to-select
   behavior per `docs/legacy-specs/interaction.md` §4). Depends on 1, 3, 5, 6, 7 all
   being done, since every context-menu item delegates to an action built there.

Suggested order: 1 → 2 → (3 and 4 in parallel) → (5 and 6 in parallel) → 7 → 8.
