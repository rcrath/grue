# agent-ab5022b13ea7fa737.jsonl

## Summary
LWMap (E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWMap.java, 2755 lines) is the top-level document/model class of VUE: a specialized LWContainer whose direct children are Layer objects (since model version 5), which in turn hold the nodes/links/groups. It owns the numeric ID generator for every component in the map, the saved viewport (userZoom + userOrigin), the file association (mFile plus persisted saveFile/saveLocation strings), modified-state tracking (mChanges counter driven by bubbled-up events), map-level metadata (author, creation date, presentation background color), the pathway list, and the save-file model-version upgrade machinery. Crucially for an importer, on save it always flattens all layers' children into one integrated child list directly under the <LW-MAP> root (for backward compatibility with pre-layer VUE), persisting the layers separately as near-empty <layer> elements and tagging every component with a layerID attribute — so a rewrite can read one flat child list whether or not the file has layers.

# LWMap — map-document-level spec

Source: `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWMap.java` (2755 lines)
Castor XML mapping: `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/resources/tufts/vue/resources/lw_mapping_1_1.xml`
Save/load driver: `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/action/ActionUtil.java`

`LWMap extends LWContainer extends LWComponent`. XML root element: `<LW-MAP>` (`map-to xml="LW-MAP"`, mapping line 350). Legacy merge maps use root `<LW-MERGE-MAP>` and are restored as a plain LWMap (stub class `ActionUtil$OLD_MERGE_MAP_STUB`).

## Constructor defaults (new map)

`LWMap(String label)`:
- `setID("0")` — the map itself always has ID `"0"`; component IDs start above that.
- `setFillColor(java.awt.Color.white)` — canvas background, `#FFFFFF`; `mFillColor.setAllowAlpha(false)` (no alpha ever).
- `setTextColor(COLOR_TEXT)` = `Color.black` = `#000000` (VueConstants.java:111).
- `setStrokeColor(COLOR_STROKE)` = `Color.darkGray` = `#404040` (VueConstants.java:113).
- `setFont(FONT_DEFAULT)` = `new Font("SansSerif", Font.PLAIN, 14)` (VueConstants.java:75).
- Label property is disabled as an editable property (`disableProperty(LWKey.Label)`); the label is set to the file name by `setFile`.
- STYLE-type property keys disabled; only FillColor enabled.
- Creates `LWPathwayList`, records creation date, installs one default layer named `"Layer 1"`, ensures IDs, then `markAsSaved()`.

## Z-order

Z-order = position in the container's `mChildren` list. From LWContainer.java:
- `drawChildren` iterates the list in order — index 0 paints FIRST (visually bottom), last index paints LAST (visually on top) (lines 1348–1368).
- `bringToFront(c)`: remove and append to END of list (lines 1168–1189). `sendToBack(c)`: move to index 0 (1190–1208). `bringForward`/`sendBackward`: swap with adjacent index (1209–1245).
- Picking is the reverse of paint order (top-most picked first). Layer doc comment: "Upper layers appear on top, and will be picked first."
- There is no z-index number anywhere; document order of `<child>` elements in a saved file IS the bottom-to-top paint order. `getXMLChildList()` builds the flattened save list by walking layers in map-child order and appending each layer's children, so global z-order is preserved in file order. An importer/exporter that simply preserves array order gets z-order for free.
- Map override: `drawChild` calls `child.drawLocal(dc)`; the map does NOT fill its own background when drawing (background fill is the viewer's job, using the map's fillColor).

## Layers (`LWMap.Layer`, static inner class, lines 862–1091)

- `Layer extends LWContainer`. XML element `<layer>` (mapping line 251–253), persisted through LWMap field `XMLLayers` (arraylist, bind name `layer`, mapping lines 356–358).
- A map always has >= 1 layer. All layers share the map's coordinate space exactly: `getX/getY/getMapX/getMapY` return 0, `getMapScale()` returns 1, all transforms are identity no-ops. So a node's x/y inside a layer IS its absolute map coordinate.
- Layer has a label (name), and the inherited `hidden` and `locked` LWComponent attributes (persisted as attributes `hidden`, `locked` on the `<layer>` element). Hiding a layer hides all its objects; locking locks all its objects (excluded from EDITABLE child-kind iteration; hidden excluded from VISIBLE/EDITABLE).
- Style properties disabled; `getXMLfillColor/textColor/strokeColor/font` all return null (never persisted). Renders using parent (map) fill.
- `getXMLChildList()` returns null (line 1066): **layer contents are never persisted inside the `<layer>` element** — kept flat under the map for back-compat.
- Cannot be region-picked (`intersectsImpl` returns false), no multi-selection, no on-map user label, never filtered, only parent allowed is an LWMap.
- Duplicate appends `" Copy"` to the label.
- Map tracks `mActiveLayer` (transient, not persisted); `getActiveContainer()` returns active layer or the map. `addChildren`/`addChildImpl` on the map divert any non-Layer child into the active layer (with a warning).
- New maps get a single layer `"Layer 1"` (`installDefaultLayers`, lines 1251–1309; the old three-layer scheme "Background"/"Default"/"Notations" is dead code behind `if (true)`).
- Internal layers (`getInternalLayer`) start at the back with flag INTERNAL — used by tooling, not typical files.

### Can an MVP flatten layers? Yes.

Because the save format is already flat: every node/link is a direct `<child>` of `<LW-MAP>` regardless of layers. The `<layer>` elements are empty shells and each component merely carries a `layerID` attribute (LWComponent field `persistLayer`, bind `layerID`, reference=true — mapping lines 153–155). An MVP importer can ignore `<layer>` elements and `layerID` attributes entirely and read the flat child list; z-order in document order is already correct across layers. Two caveats: (1) a layer with `hidden="true"` — its children would become visible in a naive flatten (honor per-layer hidden if you care, or accept the difference); (2) same for `locked`. Pathways are the only content NOT in the child list (inside `<PathwayList>`), safe to skip.

## ID allocation (`mNextID`)

- `private final AtomicInteger mNextID`; `getNextUniqueID()` returns `Integer.toString(mNextID.getAndIncrement(), 10)` (lines 743–746). IDs are decimal-integer strings, unique per map, never reused within a session. Map itself is ID `"0"`.
- On restore (`completeXMLRestore`, line 1452): `mNextID.set(findGreatestID(allRestored) + 1)` — scan every restored component (ChildKind.ANY, includes pathways/slides) for the greatest numeric ID; returns -1 if none, so nextID becomes 0. Components persisted without an ID are logged (`"found a child persisted without an id"`) and skipped — old LWPathways may lack IDs (pre 2006-11-30 files) and get IDs assigned after restore via `ensureID`. Layers freshly created during restore of a pre-layer file also get IDs assigned after the max scan.
- MVP rule: on load, `nextId = max(numeric ids) + 1`; on new-component creation, assign `String(nextId++)`.

## Saved viewport: userZoom / userOrigin

- Fields (lines 102–105): `float userOriginX` (default 0), `float userOriginY` (default 0), `double userZoom = 1`.
- `setUserOrigin(float,float)` is called by the viewer on pan drags; deliberately does NOT mark the map modified (markChange call commented out). `setUserZoom(double)` takes the zoom of whichever viewer changed zoom most recently.
- Persistence (mapping lines 360–365): `<userZoom>` element containing the double (e.g. `<userZoom>1.0</userZoom>`), and `<userOrigin x="..." y="..."/>` element — a `Point2D$Float`, mapped with `x`/`y` as attributes (mapping lines 46–50).
- Transient, never persisted: `tempZoom`, `tempOrigin`, `tempBounds` (presentation-mode save/restore of viewport).
- Importer: restore pan/zoom from these two; if absent, zoom=1, origin=(0,0).

## Map-level metadata (persisted fields on `<LW-MAP>`)

From mapping lines 349–408, all child ELEMENTS of LW-MAP unless noted:

| XML | Java | Notes |
|---|---|---|
| `layer` (repeating) | `XMLLayers` / restore list `mLayers` | Empty-shell layers; see above |
| `userZoom` | `userZoom` double, default 1.0 | |
| `userOrigin` | `Point2D.Float`, x/y attrs | |
| `searchArrLst` | `List<SearchData>` | saved searches; MVP: skip |
| `presentationBackground` | ColorProperty `presentation.color` | default `new Color(32,32,32)` = `#202020` |
| `PathwayList` | `LWPathwayList` | presentation trails; MVP: skip but tolerate |
| `author` | `mAuthor` String | |
| `date` | `mDateCreated` String, format `yyyy-MM-dd` | set at map creation |
| `description` | deprecated | getter always null (never written by modern VUE); on READ, forwarded to notes if notes empty |
| `mapFilterModel` | deprecated | getter always null; ignore on read |
| `modelVersion` | int | current = 6; see versions below |
| `saveLocation` | String dir path of last save | used to resolve map-relative resources |
| `saveFile` | String full path of last save | |
| `archive` (repeating) | archive manifest PropertyEntry | only in .vpk archive maps |
| `schema` (repeating) | included data schemas | persisted BEFORE children; MVP: skip |
| anything else | `addObject` catch-all (`matches="*"`) | unknown tags ignored; special case skips millions of `*Boundaries` junk nodes from old merge maps |

Inherited LWComponent attributes on the `<LW-MAP>` tag itself: `ID="0"`, `label` (= file name), `created` (epoch millis), `x`/`y` (always 0 — map getX/getY hardwired to 0), `width`/`height` (cached bounds size), plus elements `<fillColor>` (canvas background, `#FFFFFF` default, hex string), `<textColor>`, `<strokeColor>`, `<font>` (e.g. `SansSerif-plain-14`). Note the `PropertyMap metadata` field ("Metadata for Publishing") has no entry in mapping 1.1 — not persisted.

## File association ("currentlyOpenFile")

- Runtime state is just `private File mFile` + `getFile()/setFile(File)` (lines 65–70, 251–303). `setFile` also: sets the map label to `file.getName()`, computes `mSaveLocation` (parent dir string) and `mSaveLocationURI`, and points the map's own Resource at the file. `setFile(null)` clears the resource.
- Persisted echoes: `<saveLocation>` and `<saveFile>` strings — written at save, and on restore `mSaveLocationURI` (derived from where the file was actually opened, via MapUnmarshalHandler calling setFile) is used to re-resolve resources saved with `@file.relative` properties (`restoreRelativeLocations`). `setSaveLocation` nulls the URI because a path from another platform may not parse.
- Dirty tracking: `long mChanges` (0 = clean). `markAsModified()`, `markAsSaved()`, `isModified()`. Every undoable LWCEvent bubbling to the map on the AWT thread increments it (`markChange`, lines 2302+); events from non-AWT threads (image loads) intentionally do NOT dirty the map. `mChangeState` is the same counter but never reset (cache invalidation). Save path (`marshallMapToWriter`) calls `map.makeReadyForSaving(file)` first (records map-relative resource paths), then sets modelVersion to current and setFile(target).

## Model versions (lines 2700–2713)

```
0: absolute child coordinates (pre-versioning)
1: relative children incl. groups (except link members)
2: relative children, groups absolute again (few days only)
3: relative children, groups relative w/ crude node-embedding
4: link points relative to parent (links no longer absolute)
5: layers added
6: metadata persistence change (old VUE can't read the meta-data)
```
`completeXMLRestore` upgrades in place: if `isGroupAbsolute(version)` (v0 or v2) → convert child coords absolute-to-relative; if version < 4 → convert link coords to parent-relative. An MVP that only reads top-level nodes in layers largely dodges this (layer children are absolute map coords in all versions; only nested group/node children and old link geometry need the upgrades).

## Restore sequence (completeXMLRestore, lines 1411–1571) — importer checklist

1. Guard: ensure child list is a real mutable list (empty-map files, VUE-1463).
2. `reparentAllToLayers()`: if the file had `<layer>` elements, move each flat child into the layer matching its `layerID` (orphans logged `"Layer orphaned node"` and left at map level); else create default `"Layer 1"` and move all children into it. Active layer := layer named "Default", else `mLayers.get(1)` if more than one, else `get(0)`.
3. Restore pathway list; create empty one if absent.
4. Collect all descendants depth-first; `mNextID = greatestID + 1`; ensure IDs on new layers and old pathways.
5. Model-version coordinate upgrades (above), then stamp current version.
6. Resource passes: deserialize inits → `restoreRelativeLocations(resources, mSaveLocationURI)` (skipped for archive maps and unrooted maps) → final inits.
7. Layout everything: all NON-links first, then all links (so link endpoints see final node borders), then re-normalize all groups.
8. `mXMLRestoreUnderway = false; markAsSaved()`.

## Real-world .vue file quirks an importer MUST handle

- **Header comments precede the XML declaration.** ActionUtil writes 5 comment lines, THEN Castor writes `<?xml version="1.0" encoding="US-ASCII"?>`:
  ```
  <!-- Tufts VUE 3.x concept-map (name.vue) 2010-01-01 -->
  <!-- Tufts VUE: http://vue.tufts.edu/ -->
  <!-- Do Not Remove: VUE mapping @version(1.1) <mapping-url> -->
  <!-- Do Not Remove: Saved date ... by <user> on platform ... -->
  <!-- Do Not Remove: Saving version @(#)VUE ... -->
  <?xml version="1.0" encoding="US-ASCII"?>
  ...
  ```
  Strict XML parsers reject a declaration that isn't first — strip/skip leading comment lines. The `@version(...)` token in the third comment selects the mapping (1.1 current, 1.0 old, `version_none` if absent).
- **Encoding**: output is US-ASCII (ActionUtil.java:70). Older files may be `windows-1252` (pre-ASCII enforcement, guessed for old Windows saves) or the declared encoding; default input fallback UTF-8.
- **Polymorphic children**: all components are `<child ...>` elements distinguished by `xsi:type` (Castor), e.g. `xsi:type="node"`, `"link"`, `"group"`, `"image"`, `"text"`, `"portal"`, `"slide"`, `"masterSlide"` — per the `map-to` names in the mapping.
- **Maps with vs without layers**: both have the identical flat `<child>` list under LW-MAP. Layered files (modelVersion >= 5) additionally have `<layer>` elements and `layerID` attributes on children. One import path covers both; honor or drop layers as a policy choice.
- **Link endpoint references**: `<ID1>`/`<ID2>` elements inside `<link>` children reference other components' `ID` attributes (persistHead/persistTail, reference=true). Resolve after all children parsed.
- **Root may be `<LW-MERGE-MAP>`** — treat as `<LW-MAP>`.
- **Unknown/junk elements**: must be skipped silently; pathological files contain millions of `*Boundaries` elements (merge-map bug, LWMap.addObject override, lines 2743–2752).
- **`<description>` → notes** migration; `<mapFilterModel>` ignored.
- **Missing IDs** possible on old pathways; assign fresh ones after computing max ID.
- ID scan must be numeric-max, not lexical (IDs are decimal strings).

## MVP essentials
- Flat z-ordered child array where array index = paint order (index 0 bottom, last on top) with bring-to-front (append), send-to-back (prepend), bring-forward/send-backward (adjacent swap); no z-index numbers anywhere
- ID scheme: decimal-integer-string IDs; map document is ID "0"; nextId = max(numeric IDs found) + 1 on load, increment on every new component
- Saved viewport: userZoom (double, default 1.0) and userOrigin x/y (floats, default 0,0), restored on open, pan changes do not dirty the document
- Document defaults: canvas fill #FFFFFF (no alpha), text #000000, stroke #404040, font SansSerif plain 14; document label = file name; author + creation date (yyyy-MM-dd) metadata fields
- Dirty tracking: change counter incremented on every user-visible model event, reset to 0 on save/load, drives the modified flag/title asterisk
- Importer reads the flat <child> list under <LW-MAP> (children carry xsi:type node/link/group/etc.); ignore <layer> elements and layerID attributes to flatten — document order of children is already correct global z-order; resolve link <ID1>/<ID2> references after parsing
- Importer tolerances: comment lines BEFORE the <?xml?> declaration, US-ASCII/windows-1252/UTF-8 encodings, <LW-MERGE-MAP> root treated as a map, unknown elements skipped, read <modelVersion> (current 6; >=4 means link/child coords already parent-relative; layer children are absolute map coords in every version)
