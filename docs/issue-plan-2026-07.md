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

**Superseded 2026-07-19 (via GitHub issue comments after this doc's first draft):**
Rich rephrased #10 on the issue itself, dropping the solo/multi toggle-button design
below entirely. #11's only comment points back at that rephrase, asking whether it
also cures #11 — so #11 is folded into #10, not a separate feature. Current, final
design:

### #10 + #11 — Focus Follows Eyeball (final design, revised 2026-07-20)

**Superseded again 2026-07-20:** Rich posted a further refinement on #10 after the
2026-07-19 design (below) was built and verified. This is now the true final design;
the 2026-07-19 version (Ctrl-click = add to selection, Shift-click = select range
only, no solo) is obsolete and was replaced in code the same day.

One interaction model on the Layers panel's eye button, no mode-toggle button, no
separate "selection" concept — visibility itself carries the meaning:

- **Plain click** on a layer's eye → solos that layer: every other layer's eye turns
  off, this one turns on, and focus (active layer) moves here.
- **Ctrl-click** → toggles ONLY that layer's visibility (additive if it was off,
  subtractive if clicked again while on). Does not touch any other layer's
  visibility and does not touch focus.
- **Shift-click** → turns visible (additive only) the inclusive range between the
  current focus layer and this one, by panel display order. Does not touch focus,
  does not hide anything outside the range.
- **Confirmed:** focus only ever moves on a plain click. Ctrl-click and Shift-click
  never change which layer is active, even when a plain click's solo action hides
  the layer that used to be focused (the newly-clicked layer becomes focus instead).

The "activate a layer" mechanism already exists (`Editor.activateLayer()`); it's wired
to the eye button's plain-click branch only.

**Files touched:** `src/ui/panels.ts` (`LayersPanel.onEyeClick` — branches on
Ctrl/Shift/plain; `refresh()` — dropped the now-unused `selected` UI-state field,
signature is back to `[doc.layers, doc.activeLayer]`), `src/style.css` (removed the
now-unused `.layer-row.selected` rules from the 07-19 build).

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
