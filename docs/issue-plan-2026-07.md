# Plan: grue open issues #4, #6, #9, #10–#14 (2026-07-19)

Planning only — no code was changed producing this document. Issue #3 (the legacy
feature inventory/roadmap) is out of scope here by request; it's tracked separately.

Everything below came from reading the actual current code in
`E:\Dropbox\audio\git\grue` (plus the legacy Java source for #14) — not guessed from
issue text alone. Three items turned out to already be implemented; five need real work.

---

## Already implemented — verify and close, no coding needed

### #4 — "opening a new map with ctrl+shift+n"

Done. `src/ui/shortcuts.ts` binds `mod+alt+n` → `file.new` (New Map), with a comment
crediting this exact issue: Ctrl+Shift+N is grabbed by the OS/clipboard manager, so
grue uses Ctrl+Alt+N instead. `mod+n` alone still does the legacy "new node at
cursor" behavior, matching old VUE.

**Action for Rich:** open the app, confirm Ctrl+Alt+N creates a new map and Ctrl+N
still creates a node, then close #4.

### #6 — "Keep" (empty title/body, no comments) — CLOSED 2026-07-19

Confirmed: was tracking Exit/Quit, which is fully built (`doExit()` prompts-then-quits
cleanly, OS close button intercepted the same way). Rich closed the issue.

### #9 — "graph canvas context menu choices"

Done. `src/ui/contextmenu.ts`'s `canvasMenu()` opens with exactly the four items the
issue asked for, in the requested order, with a separator before the existing
choices: Select mode → Add a new node (at the right-click point) → Link mode → Rapid
mode, then a separator, then Paste/Select All/Zoom/etc.

**Action for Rich:** right-click empty canvas, confirm the four items appear at the
top in that order with working shortcuts (S/Ctrl+N-at-point/L/R), then close #9.

---

## Real work — #10 and #11 (layers panel)

These two issues both rewrite the same code (the layer visibility "eye" button in
`src/ui/panels.ts`'s `LayersPanel`), so they need to be built together, not as two
separate patches, or one will clobber the other's use of Ctrl-click.

### #10 — mutually exclusive layers choice

A new toggle button on the Layers panel switches the eye-button's behavior between
two modes:
- **Solo mode**: click a layer's eye → that layer becomes the only visible one, all
  others hide. Ctrl-click → toggle just that layer, others untouched (escape hatch).
- **Multi mode** (today's default): click toggles just that layer. Ctrl-click's
  meaning here is the ambiguous part of the issue text — see open question below.

Design notes: no data-model change needed — this is a batch write to existing
per-layer `hidden` flags, wrapped in one `mutate()` call so solo-ing five layers is
one undo step. The mode toggle itself (solo vs. multi) is proposed as UI-only state
(not saved in the document, not undoable) — consistent with how the panel already
treats "which layer is active" as UI state, not document content.

**Resolved 2026-07-19:** confirmed — Ctrl-click in Multi mode does the same "solo this
layer" action that plain-click does in Solo mode. Click and Ctrl-click swap meaning
between the two modes.

### #11 — LAYERS: have selection follow visibility

Clicking a layer's eye (to toggle its visibility) also makes that layer the active
layer — the one new items land on. Ctrl-click toggles visibility only, active layer
stays put. The "activate a layer" mechanism already exists
(`Editor.activateLayer()`) — it's just not currently wired to the eye button, only to
clicking the layer row itself.

**Resolved 2026-07-19:** confirmed as proposed — Ctrl-click never touches active-layer
state, even when it hides the currently-active layer.

### How #10 and #11 combine

Plain click always activates the clicked layer (regardless of solo/multi mode,
including a solo-click in Solo mode); Ctrl-click never changes the active layer
(regardless of mode). That keeps the two features from fighting over the same
gesture. **Resolved 2026-07-19:** Rich confirmed this combined rule covers both
issues as proposed — no separate design needed for #11 beyond building #10 with this
rule baked in.

**Files touched:** `src/ui/panels.ts` (`LayersPanel` — mode-toggle button, eye-button
click handler rewritten to take the click event and branch on mode + Ctrl key).
Possibly a small helper in `src/core/model.ts` if you'd rather the solo-batch logic
live there than inline.

---

## Real work — #12 and #13 (bugs)

These turned out to share a root cause, and #13 partly depends on #12 being fixed
first. High-confidence diagnosis from reading the actual code, not just the bug
reports.

### #12 — "Cannot edit nodes except initially"

**Root cause:** every render fully rebuilds the SVG (`itemsG.replaceChildren()`),
and a render happens between mousedown and mouseup on every click on an item. The
browser only fires a `dblclick` event when the same element received both clicks —
since the element is destroyed and recreated in between, the browser never fires
`dblclick` for a second click on an existing item. This is why the *first* label
edit works (it's opened directly by node creation, not by a double-click) but nothing
after that does — matching the issue title exactly ("except initially").

**Fix:** stop relying on the native `dblclick` event. Track click timing/position/hit
target manually in the editor's own pointer-up handling (which isn't affected by the
DOM rebuild) and detect double-clicks that way instead. The native `dblclick`
listener gets removed entirely — keeping both would create two nodes per
double-click on empty canvas.

**Bonus finding:** the same DOM-rebuild-swallows-dblclick mechanism likely also
breaks "double-click to zoom" in the Outline panel. Worth checking at the same time
rather than leaving a second copy of the same bug.

### #13 — "paste pastes whole map instead of clipboard"

**Root cause, two parts:**
1. Copy/paste in grue is entirely in-memory — it never touches the real OS
   clipboard. So Ctrl+V always re-pastes whatever was last copied *inside grue*
   (e.g. a prior Select-All-Copy), regardless of what's actually on the clipboard —
   which is exactly "pastes the whole map instead of clipboard."
2. Because of #12, double-clicking a node to edit it silently fails, so a user who
   believes they're typing/pasting into a node's label is actually not focused on
   anything — the keystroke goes to the app-level paste instead of a normal text
   paste. Once #12 is fixed, pasting into an *actually open* label editor already
   works correctly today (verified in code) — no separate fix needed for that part.
   The right-click-menu route to Paste while a label editor is open is a distinct,
   smaller wrinkle (menu click blurs the editor first) — plan includes an optional
   fix for that, flagged as lower-priority/riskier than the main fix.

**Fix:** make Copy write to the real OS clipboard (as grue-tagged JSON) and make
Paste read from it first — pasting grue-tagged content pastes items as today, pasting
plain external text creates a single new node with that text as its label, and if the
clipboard is empty or unreadable it falls back to the in-memory buffer (keeps
`npm run dev` working without clipboard permissions).

**Real, user-visible side effect, confirmed OK by Rich 2026-07-19:** after this fix,
copying items in grue will overwrite whatever the user had on their system clipboard.
That's necessary for the fix to work and matches how copy/paste works in every other
app.

**Files touched:** `src/ui/editor.ts` (copy/cut/paste, new `isEditingLabel()` check),
`src/ui/actions.ts` (paste action becomes async), optionally `src/ui/menu.ts` if the
right-click-Paste-while-editing wrinkle gets fixed too (flagged as touching a shared
menu-popup code path used everywhere in the app — needs care).

**Recommended build order:** #12 first, then #13 — #13's second cause goes away for
free once #12 lands, leaving a smaller, cleaner #13 fix.

---

## Real work — #14 (no text box item type)

**Key finding:** legacy VUE never had a distinct "text box" item type either — a
text box there was just a regular node with its fill turned off, shape locked to
rectangle, and stroke width 0 (confirmed in the legacy Java source, `LWNode.java`).
"Is this a text box" was a runtime heuristic (transparent + borderless + rectangular
+ no children), not a stored flag.

**Recommended approach:** match legacy exactly rather than inventing a third item
kind. A text box becomes a plain node with `fill: null`, `strokeWidth: 0`,
`shape: "rect"` — no schema change, no migration, and (this is the big win) none of
the roughly 80 places in the codebase that branch on "is this a node or a link" need
to change, because a text box stays a node. It also means text boxes can take links,
notes, and attachments, same as legacy allowed.

The alternative (a genuine new `kind: "text"`) was considered and rejected — it would
mean touching all ~80 of those branch sites (hit-testing, drag, resize, copy/paste,
grouping, undo, import/export...) for a capability legacy didn't actually have
either.

**What's actually needed:**
- A `t` tool key and Ctrl+T shortcut (both free, and Ctrl+T is legacy's actual
  chord) to create a text box — double-click empty canvas in text-tool mode, same
  creation gesture pattern as every other tool.
- A "New Text" entry in the canvas right-click menu, next to "Add a new node."
- One real bug fix in the `.vue` file importer: legacy rich-text items (`LWText`,
  a different, separate legacy concept) currently import with the wrong default
  shape, which would stop them from being recognized as text boxes after import.
- A small proposed rule for what happens if someone creates a text box and commits
  an empty label immediately — recommend deleting it rather than leaving an invisible
  empty item behind. New rule with no confirmed legacy precedent; confirmed OK by
  Rich 2026-07-19.

**What's explicitly not needed:** no rendering changes (a fill-less, borderless node
already renders correctly today), no hit-testing changes, no `.grue` file format
version bump.

**One thing to flag plainly:** because "text box" is a heuristic, manually giving a
text box a fill or a different shape turns it back into an ordinary node (and vice
versa). That's a faithful match to legacy behavior, but it means "text box" isn't a
locked-in type the way node/link are — worth being aware of before it surprises
someone in testing.

**Files touched:** `src/core/model.ts` (new `makeTextNode`/`isTextNode` helpers),
`src/ui/editor.ts` (tool + creation + empty-commit rule), `src/ui/actions.ts` /
`src/ui/shortcuts.ts` / `src/main.ts` (tool wiring, Ctrl+T), `src/ui/contextmenu.ts`
(menu entry), `src/core/vueFormat.ts` (one importer default fix).

---

## Status as of 2026-07-19

All open questions answered by Rich. #6 closed. Every remaining item (#10, #11, #12,
#13, #14) is cleared to build per the recommendations above — still no code written
yet, this document is the go-ahead reference for whoever picks up implementation.

## Suggested order

1. **#4, #9** — verification only, five minutes each, closes both issues.
2. **#12** — fixes the more damaging of the two bugs and unblocks half of #13.
3. **#13** — smaller once #12 is done; clipboard behavior change confirmed OK.
4. **#14** — self-contained, no dependency on the others; the "legacy already did it
   this way" finding makes this lower-risk than it looked from the issue title alone.
5. **#10 + #11** — build together since they share code; all interaction questions
   resolved, ready to implement as specced above.
