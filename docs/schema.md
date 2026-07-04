# grue document schema (native format, v2)

Native save format is JSON, extension `.grue`. One file = one map. All coordinates are
absolute map coordinates (floats). Colors are CSS strings (`#rrggbb` or `#aarrggbb`
converted to `rgba()` on load); `null` fill = transparent.

```jsonc
{
  "format": "grue-map",              // "grrrphue-map" (pre-rename) is accepted on load
  "formatVersion": 2,
  "background": "#ffffff",          // canvas color (map fill; no alpha, legacy rule)
  "userZoom": 1.0,                  // saved viewport
  "userOrigin": { "x": 0, "y": 0 },
  "nextId": 12,                     // next numeric id to allocate (shared by items and layers)
  "layers": [                       // paint order: first = bottom
    {
      "id": "1",
      "name": "Layer 1",
      "hidden": false,              // hides everything on the layer
      "locked": false               // layer contents aren't selectable/editable
    }
  ],
  "activeLayer": "1",               // layer id; newly created items land here
  "groups": [                       // flat membership sets; items in a group select/move
    { "id": "9", "members": ["1", "2", "3"] }  //   as a unit (no nesting, 2+ members,
  ],                                //   an item belongs to at most one group)
  "items": [                        // paint order within a layer: first = bottom
    {
      "kind": "node",
      "id": "1",
      "label": "New Node",          // \n allowed (multi-line)
      "x": 100, "y": 100, "w": 120, "h": 30,
      "shape": "roundRect",         // roundRect|rect|ellipse|diamond|hexagon|octagon|
                                    // triangle|shield|flag|flag2|rhombus|chevron|pentagon
      "fill": "#F2AE45",            // null = transparent
      "stroke": "#776D6D",
      "strokeWidth": 1,             // 0–6 fractional px; 0 = no stroke
      "strokeStyle": 0,             // 0 solid, 1 dotted(1,1), 2 dashed(2,2), 3 dash2(3,2), 4 dash3(5,3)
      "textColor": "#000000",
      "font": { "family": "Arial", "size": 12, "bold": false, "italic": false, "underline": false },
      "autoSized": true,            // size tracks label
      "hidden": false,              // hidden items don't render and aren't hit-testable
      "collapsed": false,           // collapsed node hides its children (reserved; no
                                    //   node-children in the model yet)
      "layer": "1",                 // owning layer id
      "notes": "",                  // free-text note
      "resource": null              // attached file/URL, or:
                                    // { "spec": "https://...", "title": "..."|null,
                                    //   "properties": [{ "key": "...", "value": "..." }] }
    },
    {
      "kind": "link",
      "id": "3",
      "label": "",
      "head": { "node": "1", "x": 160, "y": 115 },  // node = id or null (free end); x/y = last
      "tail": { "node": "2", "x": 360, "y": 215 },  //   computed/free point in map coords
      "controlCount": 0,            // 0 straight, 1 quadratic, 2 cubic
      "ctrl0": null,                // {x,y} when controlCount >= 1
      "ctrl1": null,                // {x,y} when controlCount == 2
      "arrowState": 2,              // bitmask: 1 = arrow at head, 2 = arrow at tail
      "stroke": "#404040",
      "strokeWidth": 1,
      "strokeStyle": 0,
      "textColor": "#404040",
      "font": { "family": "Arial", "size": 11, "bold": false, "italic": false, "underline": false },
      "hidden": false,
      "headPruned": false,          // legacy headUserPruned: hides everything reachable
      "tailPruned": false,          //   from the TAIL node without passing through the
                                    //   head node (head side survives; the link renders
                                    //   as a ~7px stub dot at the head end, next to the
                                    //   surviving node). tailPruned is the mirror image.
                                    //   Whether prunes take effect on screen is a
                                    //   view-only toggle (View > Toggle Pruning), not
                                    //   part of the file.
      "layer": "1",
      "notes": "",
      "resource": null
    }
  ]
}
```

Rules:

- `items` is a single list; nodes and links interleave freely. Global paint order is
  layers bottom-to-top, then item order within each layer. Items referencing a missing
  layer paint last and are reassigned to the bottom layer on load.
- Every map has at least one layer. Deleting a layer deletes its contents (legacy VUE
  behavior); the last layer can't be deleted. Duplicating a layer copies its contents,
  names the copy "&lt;name&gt; Copy", places it directly above the original, and makes it
  active.
- `hidden` (item or layer) removes the item from rendering, hit-testing, and selection.
  `locked` on a layer leaves its items visible but unselectable/uneditable.
- Link `head`/`tail`: when `node` is set, geometry is recomputed from the shapes at render
  time (x/y kept as a fallback); when `node` is null the x/y point is authoritative.
- Unknown fields must be preserved on round-trip where practical, ignored otherwise.
- `formatVersion` bumps on breaking change; readers reject greater versions with a clear error.

## Version history / migration

- **v2 (additive, wave 2)**: `groups` — flat membership sets (id + member item ids).
  Older readers ignore the field; files without it load with no groups. Groups whose
  members are missing or fewer than 2 are dropped on load. Not exported to `.vue`
  (legacy groups are containers; grue's flat sets have no faithful container mapping yet).
- **v1 → v2**: added `layers`, `activeLayer`, and per-item `hidden`, `collapsed` (nodes),
  `headPruned`/`tailPruned` (links), `layer`, `notes`, `resource`. v1 files load fine:
  missing fields get defaults (visible, not collapsed/pruned, empty notes, no resource),
  one default layer "Layer 1" is created and everything is placed on it. The v1 node
  `url` string is migrated to `resource: { spec: url }`.

## Legacy interop

- Import: `.vue` files per [docs/legacy-specs/format.md](legacy-specs/format.md)
  (comment-line envelope stripped, `xsi:type` node/link/group/text handled, groups and
  nested children flattened to absolute coordinates, images skipped).
  - `<layer>` shell elements → `layers` (ID, label, `hidden`/`locked` attributes);
    components map to layers via their `layerID` attribute. Pre-layer files
    (modelVersion < 5) get one default layer "Layer 1". Active layer follows the legacy
    restore rule: layer named "Default", else the second layer, else the first.
  - `hidden` attribute → item `hidden`; `headUserPruned`/`tailUserPruned` elements →
    `headPruned`/`tailPruned`.
  - `<notes>` → `notes` (unescaped: `%nl;` newline, `%tab;` tab, `%sp;` space,
    `%pct;` percent, after collapsing castor re-indentation).
  - `<resource>` → `resource` (`spec` attribute, `<title>`, `<property key= value=/>`
    children; the old `propertyEntry` entryKey/entryValue form is also accepted).
  - Legacy per-node collapse is a global mode in the reference build and is never
    persisted, so `collapsed` always imports as false.
- Export: `.vue` writer emits mapping version 1.1, `modelVersion` 5: children flat under
  `LW-MAP` in global paint order with `layerID` attributes, plus empty `<layer>` shells
  (exactly how legacy VUE persists layered maps — coordinates stay absolute because all
  exported components are top-level children of layers at 0,0). Writes `hidden`
  attributes, `strokeStyle` ordinals, `<notes>` with legacy escaping, `<resource>` with
  title/properties, `headUserPruned`/`tailUserPruned`, font strings `Family-style-size`
  (style `plain|bold|italic|bolditalic` + optional `underline` suffix), and node shape
  `xsi:type` names `roundRect` (arcwidth/archeight 20)/`rectangle`/`ellipse`/`diamond`/
  `hexagon`/`octagon`/`triangle`/`shield`/`flag`/`flag2`/`rhombus`/`chevron`/`pentagon`.

Defaults follow legacy VUE exactly (see [docs/legacy-specs/defaults.md](legacy-specs/defaults.md)):
node fill `#F2AE45`, stroke `#776D6D` at 1px, round-rect corner arc 20×20, Arial 12 black
label, "New Node"; link stroke `#404040` at 1px, tail arrow, Arial 11 `#404040` label;
canvas white; selection chrome `#4A95FF`; map text default SansSerif plain 14 black.
