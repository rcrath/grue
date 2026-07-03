# agent-adcdcb83ac2a5b9a8.jsonl

## Summary
VUE's canvas interaction model is tool-modal: a toolbar of tools (selection "s", node "n", link "l", hand "m", zoom, text "t") plus hold-down temporary tools (Space=pan, X=node, backquote=zoom, Alt=combo link). Nodes are created by dragging out a rectangle with the node tool (live preview drawn while dragging; must exceed 10x10 screen px), which creates a fixed-size node labeled "New Node" and immediately opens an inline label editor. Links are created by pressing on a node with the link tool and dragging to another node — a temporary arrow-tailed link follows the cursor, prospective targets highlight ("indication"), and release over a valid target (after >10px of drag) creates the link; release over empty space in combo mode auto-creates a destination node. The selection tool gives click-to-select, shift-click toggle, intersection-based rubber-band marquee, drag-moves of the whole selection (3px threshold), and resize handles (10px, color #4A95FF). Pan is Space+drag or the hand tool; zoom is a preset ladder (1/64…128) driven by Ctrl+=/Ctrl+-, Alt/Meta+wheel (±15% per notch anchored at cursor), or the zoom tool (click in, shift-click out, drag-rect to fit). Double-click any labeled component to edit its label inline; Delete/Backspace deletes the selection; arrows nudge 1px (Shift = 10px).

# VUE interaction model — extracted from NodeTool.java, LinkTool.java, MapViewer.java (9152 lines), ZoomTool.java, Actions.java

Sources (all absolute):
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/NodeTool.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LinkTool.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/MapViewer.java` (keyPressed @6017, mousePressed @6587, mouseWheelMoved @7079, mouseDragged @7477, mouseReleased @7852, mouseClicked @8283)
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/ZoomTool.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/Actions.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/HandTool.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/resources/tufts/vue/VueResources.properties`

## 1. Tool model

Everything is modal on an "active tool". Two activation styles:

**Toggle tools (single-key shortcut, no modifiers, switches tool):** from VueResources.properties:
- `s` selection/arrow tool, `v` direct-selection, `b` browse (all sub-tools of selectionTool)
- `n` node tool (`nodeModeTool.shortcutKey=n`)
- `l` link tool (`linkModeTool.shortcutKey=l`)
- `r` rapid-prototyping / combo link tool (`rapidLinkModeTool.shortcutKey=r`)
- `m` hand/pan tool (`handTool.shortcutKey=m`)
- `t` text tool / rich-text tool
- `/` view tool

**Hold-down temporary tools** (`setActiveWhileDownKeyCode`; tool active only while key held, reverts on release — deferred until drag ends if a drag is underway):
- Space = HandTool (pan) — HandTool.java:22
- X = NodeModeTool — NodeTool.java:306
- Backquote ` = ZoomTool — ZoomTool.java:58
- Alt = ComboModeTool (link+node combo) — LinkTool.java:331 (comment: Mac steals Ctrl+mouse for right-click, hence Alt)
- Modifier-key temp tools (Ctrl/Alt/Shift/Meta) are "pending": not activated until a mouse press on a component (MapViewer keyPressed @6329-6343).

## 2. Node creation (NodeTool.NodeModeTool)

- **Drag-out rectangle** is the primary gesture. With node tool active, press-drag on canvas draws the selector rect plus a **live preview of the node** (`drawSelector`: `creationNode.setFrame(r); creationNode.draw(dc)` — NodeTool.java:339-348).
- On `handleMousePressed`, current editor style properties are applied to the hidden `creationNode` (`EditorManager.applyCurrentProperties(creationNode)`).
- On release, MapViewer only calls `handleSelectorRelease` if the dragged box is **> 10 x 10 screen pixels** (MapViewer.java:7906). Then (NodeTool.java:322-336):
  1. duplicate creationNode; `setAutoSized(false)`
  2. `setFrame(e.getMapSelectorBox())` — node takes exactly the dragged rect (map coords)
  3. label = resource `newnode.html` = **"New Node"**
  4. add to focal (`viewer.getFocal().addChild(node)`)
  5. undo mark **"New Node"**
  6. selection set to the new node
  7. **inline label edit opens immediately** (`viewer.activateLabelEdit(node)`)
- **Single-click creation**: only if boolean preference `oneClickCreation` (category INTERACTIONS, **default false**) is true; single click with node tool fires `Actions.NewNode` (MapViewer.java:8349).
- **Menu/keyboard creation**: `Actions.NewNode` = Ctrl/Cmd+N. Places node at the last mouse-press point (`screenToFocalPoint`), auto-selects, opens label edit. Repeat invocations at the same mouse point stagger: `x+10, y+lastItemHeight` (Actions.java:4204-4219). New node from actions = `new LWNode(label)` styled with `EditorManager.targetAndApplyCurrentProperties(node)`.
- Text nodes: `createDefaultTextNode` = LWNode + `setAsTextNode(true)`. Rich text: `LWText`, `setAutoSized(false)`, `setSize(150, 5)`.

## 3. Link creation (LinkTool.LinkModeTool)

- Gesture: **press on a component, drag, release over another component.**
- `handleComponentPressed` (LinkTool.java:554-588): if picked component `canLinkTo(null)`, it becomes `linkSource`. A persistent temporary `creationLink` (an LWLink whose free end is an invisible 0x0 endpoint component) is set up:
  - `creationLink.setArrowState(LWLink.ARROW_TAIL)` — arrowhead at the dragged end
  - current editor properties applied to it
  - minimum on-screen stroke while dragging: `1 / zoomFactor` map units (never < 1 screen px)
  - the invisible endpoint becomes the drag component (`e.setDragRequest(invisibleLinkEndpoint)`)
- `handleMouseDragged`: repick under cursor each move; if valid target, `viewer.setIndicated(over)` — **target highlight** ("indication"). Cleared when invalid/none.
- `handleMouseReleased` (LinkTool.java:605-622): requires **drag distance > 10 px in x or y** from press (`|deltaPressX| > 10 || |deltaPressY| > 10`), otherwise nothing is created. Destination = current indication. If dest != source, `makeLink`:
  - `pMakeConnection = !e.isShiftDown()` — **Shift-release creates a dangling link**: `new LWLink(source, null)` with `setTailPoint(mapPoint)` at the drop location.
  - Normal case with a dest: `new LWLink(source, dest)`. If a **straight link already exists between the pair, the new one gets `setControlCount(1)` (curved)** so parallels are distinguishable (multiple links between the same two nodes are allowed).
  - **Combo mode** (rapid-prototyping tool, `r` / hold Alt): release over empty space **creates a new node** at the drop point (`NodeModeTool.createNewNode(); setCenterAt(mapPoint)`) and links to it.
  - Link styled by `EditorManager.targetAndApplyCurrentProperties(link)`; added to common parent (map, or shared parent of endpoints); selection set to the link; **label edit auto-activated** on the link (or on the auto-created node in combo mode).
- Validity (`isValidLinkTarget`, LinkTool.java:180-237): no self-link (source == target rejected); no parent↔child links; `source.canLinkTo(target)` must pass; can't link to the link's own parent; a link can't connect to another link already connected to it. Links may terminate on links (link-to-link allowed otherwise).
- ComboModeTool special case (MapViewer.java:6726-6741): with combo tool and empty selection, pressing on blank canvas creates a node right there ("VUE-1597" — usable on a blank map).

## 4. Selection semantics (selection/arrow tool)

- **Click on component** (button 1): if not already selected → `selectionSet(hit)`; then the *whole selection* is prepared for drag (`setToDrag(getSelection())`) with `dragOffset = componentXY - mapXY`.
- **Shift-click** (or **Ctrl-click on Windows**, MapViewer.java:6839): `selectionToggle(hit)` — add/remove from selection.
- **Click on empty canvas**:
  - if the click point falls inside the bounds of the current (multi)selection and no modifiers: pick the selection up for dragging;
  - else (no shift): `selectionClear()` and begin **rubber-band selector box**.
- **Rubber-band marquee**: `draggedSelectorBox` in screen coords (normalized min/min/abs/abs). On release, `computeSelection(screenToMapRect(box))` = `LWTraversal.RegionPick` — **selects components that INTERSECT the rect** (`c.intersects(mapRect)`, LWTraversal.java:648), not containment-only.
  - Shift held at release → `selectionToggle(list)`; else `selectionSet(list)`.
  - Ctrl held at release → children of hit components are added too.
- **Right-click / popup trigger**: if hit isn't selected, select it; show context menu (map popup if empty selection, single-selection popup, or multi-selection popup) — MapViewer.java:6779-6789.
- **Selection visuals**: selection color = resource `mapViewer.selection.color` = **#4A95FF**; handle fill white (`COLOR_SELECTION_HANDLE = Color.white`); handle size = resource `mapViewer.selection.handleSize` = **10** px; selection stroke width constant **8** (`SelectionStrokeWidth`, VueConstants.java:160); marquee drawn in XOR gray (`COLOR_SELECTION_DRAG = Color.gray`); node-tool selector drawn in COLOR_SELECTION; link-tool selector drawn blue.
- **Selection handles / control points**: mouse press within a handle rect (handleSize with 1 px slop) starts a resize or link-control-point drag rather than a selection change (`checkAndHandleControlPointPress`, MapViewer.java:6501-6558).

## 5. Moving / dragging

- Drag of selected component(s) begins after a **3 screen-px threshold** (`|dx|<3 && |dy|<3` → wait; MapViewer.java:7591).
- The whole selection always moves as a unit (an internal group), positioned as `mapXY + dragOffset`.
- While dragging over other components, a candidate **drop parent is highlighted** ("indication") if `isValidParentTarget` (not selected itself, supports children, not top-level, etc.). On mouse release the selection is **reparented into the indicated container** (child node nesting). **Shift held at release suppresses reparenting** (`isDropRequest = !e.isShiftDown()`, MapViewer.java:7472).
- Undo mark **"Drag"** after any drag.
- **Escape** during drag aborts: component returns to its position at drag start; also cancels an in-progress selector box (keyPressed @6065-6096).
- **System drag out of the app / copy-drag**: modifier combo at drag start = Meta (Mac) or **Ctrl+Alt (Windows)** (`SYSTEM_DRAG_MODIFIER`, MapViewer.java:8244).
- Auto-scroll when dragging near the viewport edge (`scrollToMouse`).

## 6. Pan

- **Hand tool** (`m`, or **hold Space**): drag anywhere repositions the viewport (scroll-pane pan, or map-origin offset when not in a scroll pane) — MapViewer.java:6688-6703, 7521-7532.
- **Plain mouse wheel**: normal scroll (event passed through to the scroll pane). Outside modifier use, wheel pans; **Shift+wheel = horizontal pan**; pan step `PanFactor = 8` px per wheel notch (applied ~3x via deferred repeats for smoothness) — MapViewer.java:7121-7136.
- **Middle-button press** (wheel click; detected as button==0 with BUTTON2_DOWN_MASK): **zoom-to-fit** the whole map (MapViewer.java:6679-6683).

## 7. Zoom

- **Modifier+wheel**: Meta (Mac) or **Alt (Windows) + wheel** zooms, **anchored at the cursor's map location**: `zoomFactorAdjustor = 1.0 - rotation * 0.15` — **±15% per notch** multiplied into current zoom (MapViewer.java:7114-7120).
- **Zoom tool** (hold backquote, or toolbar): click = zoom **in** one preset step anchored at click point; Shift-click or non-left button = zoom **out** one step; **drag a rect > 10x10 px = zoom-to-fit that region** (ZoomTool.handleMouseReleased @502-537).
- **Preset zoom ladder** (`ZoomDefaults`, ZoomTool.java:44-51): `1/64, 1/32, 1/16, 1/8, 1/4, 1/2, 0.75, 1.0, 1.25, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 128`. MAX_ZOOM = 128. Hard clamp in `setZoom`: 0.001 … 100000. Zoom-fit padding `ZOOM_FIT_PAD = 20` px.
- Keyboard (Actions.java:3665-3690, COMMAND = platform menu key, Ctrl on Windows):
  - **Ctrl+=** ZoomIn (next preset up, anchored at view center)
  - **Ctrl+-** ZoomOut (next preset down)
  - **Ctrl+]** ZoomFit (fit whole map)
  - **Ctrl+'** ZoomActual (100%)
- Zoom always anchors the focus point (cursor or view center) to the same screen position.

## 8. Label editing

- **Double-click** a component (button 1, click-count even, **no modifier keys**, tool didn't consume the press): component gets `handleDoubleClick`; if unhandled and `supportsUserLabel()` → `activateLabelEdit(hit)` (MapViewer.java:8364-8394). This is the standard "double-click node/link to edit its label".
- **Single click on an already-selected component** (that was not selected by this very press: `hit.isSelected() && hit != justSelected`) also opens label edit — the click-selected-again-to-rename pattern (MapViewer.java:8336-8338).
- **Text tool**: single click on a component = label edit; single click on empty canvas = create new text item (`Actions.NewRichText`).
- `activateLabelEdit` (MapViewer.java:4344): opens an inline TextBox positioned over the label; empty labels show placeholder text `"label"` (resource `mapviewer.label.tooltip`); all global actions disabled while editing; the editor manages its own undo.
- **Rename action**: **F2 on Windows, Enter on Mac** (`Actions.Rename`, Actions.java:1917-1918); `Rename2` binds the opposite key. Enabled for a single selected component supporting a user label. Enter otherwise pops the focal (zoom-out of a focused container).
- New-node and new-link creation both auto-open the label editor.
- Double-click on empty canvas: pops the focal back to the map if focused into something (`defaultDoubleClickAction`).

## 9. Delete

- **Delete or Backspace** in the viewer fires `Actions.Delete` (keyPressed @6040-6048; the action's registered keystroke is VK_BACK_SPACE). Deletes every editable component in the selection (links attached to deleted nodes are cleaned up in the model layer).

## 10. Keyboard shortcut inventory (COMMAND = Ctrl on Windows / Cmd on Mac)

| Key | Action |
|---|---|
| s / v / b / n / l / r / m / t / `/` | switch tool (see §1) |
| Space (hold) | pan (hand tool) |
| X (hold) | node tool |
| ` (hold) | zoom tool |
| Alt (hold) | combo node+link tool |
| Delete / Backspace | delete selection |
| Escape | abort drag / cancel marquee / exit full-screen |
| Enter | pop focal, or Rename (Mac) |
| F2 | Rename (Windows) |
| \\ | toggle full-screen (no modifiers) |
| Arrows | nudge selection **1 screen px** (`NudgeAction(0,-1)` etc., Actions.java:2855-2858) |
| Shift+Arrows | big nudge **10 px** (Actions.java:2860-2863) |
| Ctrl+Arrows | navigate selection along links to nearest node in that direction (MapViewer.java:6159-6234) |
| Cmd+A | Select All (editable descendants) |
| Cmd+Shift+A | Deselect All |
| Cmd+D | Duplicate |
| Cmd+G | Group |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo |
| Cmd+N | New Node at last mouse-press point |
| Cmd+= / Cmd+- | Zoom in / out one preset |
| Cmd+] | Zoom to fit |
| Cmd+' | Zoom 100% |
| Cmd+Shift+= / Cmd+Shift+- | Font bigger / smaller |
| Alt+= / Alt+- | Push out / pull in (arrange) |
| Alt+Up/Down/Left/Right | align edges |
| Alt+1 / Alt+2 | Make row / make column |

Click classification (MapViewer.java:8262-8273): single-click = clickCount 1 + button1 + **zero modifier keys**; double-click = even clickCount >1 + button1 + zero modifiers (even-count test tolerates cascading 4/6-click reports).

## 11. Numeric constants recap

- Node drag-out minimum: selector box > **10x10** screen px
- Link drag minimum: > **10** px in x or y from press
- Move-drag start threshold: **3** px
- Nudge: **1** px; big nudge: **10** px (screen-space deltas)
- Wheel zoom: **±15%** per notch; wheel pan: **8** px per notch
- Selection color **#4A95FF**; handle size **10**; handle fill white; selection stroke width constant **8**; marquee XOR gray
- Zoom presets: 1/64 → 128; fit-pad **20** px; hard zoom clamp 0.001–100000
- Control-point hit slop: **1** px
- Default new-node label: **"New Node"**; label-edit placeholder: **"label"**
- One-click node creation preference `oneClickCreation`: default **false**

## MVP essentials
- Tool-modal canvas with at least: selection tool (default), node tool, link tool, pan; single-key tool switching (s, n, l, m) and hold-Space temporary pan
- Node creation by drag-out rectangle with live node preview; ignore boxes <=10x10 px; new node gets label 'New Node', is selected, and inline label edit opens immediately
- Link creation by press-on-node then drag: temporary link with arrowhead follows cursor, prospective target highlights while hovering, release (>10px drag) over a valid target creates the link; reject self-links; allow multiple links between the same pair
- Selection: click selects (replacing), shift-click toggles, click empty canvas clears and starts a rubber-band marquee that selects everything INTERSECTING the rect (shift = toggle mode); selection rendered with #4A95FF and 10px white-filled handles
- Drag moves the entire selection as a unit with a 3px start threshold and Escape-to-abort; resize via corner/edge handles on the selected node
- Pan: Space+drag or hand tool; plain wheel scrolls, Shift+wheel pans horizontally; Alt/Meta+wheel zooms +/-15% per notch anchored at the cursor
- Zoom: preset ladder 1/64..128 stepped by Ctrl+= and Ctrl+-, Ctrl+] zoom-to-fit (20px pad), Ctrl+' for 100%; zoom always anchored so the focus point stays put on screen
- Double-click a node or link to edit its label inline (placeholder 'label' when empty); Enter/F2 rename; new nodes/links auto-open the editor
- Delete and Backspace both delete the selection; arrows nudge 1px, Shift+arrows 10px
- Standard edit chords: Ctrl+A select all, Ctrl+Shift+A deselect, Ctrl+D duplicate, Ctrl+Z / Ctrl+Shift+Z undo/redo, Ctrl+N new node at cursor
