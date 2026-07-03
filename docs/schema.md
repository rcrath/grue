# GrrrphUE document schema (native format, v1)

Native save format is JSON, extension `.grue`. One file = one map. All coordinates are
absolute map coordinates (floats). Colors are CSS strings (`#rrggbb` or `#aarrggbb`
converted to `rgba()` on load); `null` fill = transparent.

```jsonc
{
  "format": "grrrphue-map",
  "formatVersion": 1,
  "background": "#ffffff",          // canvas color
  "userZoom": 1.0,                  // saved viewport
  "userOrigin": { "x": 0, "y": 0 },
  "nextId": 12,                     // next numeric id to allocate
  "items": [                        // paint order: first = bottom
    {
      "kind": "node",
      "id": "1",
      "label": "New Node",          // \n allowed (multi-line)
      "x": 100, "y": 100, "w": 120, "h": 30,
      "shape": "roundRect",         // roundRect|rect|ellipse|diamond|hexagon|octagon|
                                    // triangle|shield|flag|flag2|rhombus|chevron|pentagon
      "fill": "#F2AE45",            // null = transparent
      "stroke": "#776D6D",
      "strokeWidth": 1,
      "strokeStyle": 0,             // 0 solid, 1 dotted(1,1), 2 dashed(2,2), 3 dash2(3,2), 4 dash3(5,3)
      "textColor": "#000000",
      "font": { "family": "Arial", "size": 12, "bold": false, "italic": false, "underline": false },
      "autoSized": true,            // size tracks label
      "url": null                   // optional attached resource URL (from legacy imports)
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
      "font": { "family": "Arial", "size": 11, "bold": false, "italic": false, "underline": false }
    }
  ]
}
```

Rules:

- `items` is the single z-order list; nodes and links interleave freely.
- Link `head`/`tail`: when `node` is set, geometry is recomputed from the shapes at render
  time (x/y kept as a fallback); when `node` is null the x/y point is authoritative.
- Unknown fields must be preserved on round-trip where practical, ignored otherwise.
- `formatVersion` bumps on breaking change; readers reject greater versions with a clear error.

## Legacy interop

- Import: `.vue` files per [docs/legacy-specs/format.md](legacy-specs/format.md)
  (comment-line envelope stripped, `xsi:type` node/link/group/text handled, groups and
  nested children flattened to absolute coordinates, images skipped).
- Export: minimal `.vue` writer emits mapping version 1.1, `modelVersion` 0
  (absolute coordinates), nodes + links only — loadable by legacy VUE.

Defaults follow legacy VUE exactly (see [docs/legacy-specs/defaults.md](legacy-specs/defaults.md)):
node fill `#F2AE45`, stroke `#776D6D` at 1px, round-rect corner arc 20×20, Arial 12 black
label, "New Node"; link stroke `#404040` at 1px, tail arrow, Arial 11 `#404040` label;
canvas white; selection chrome `#4A95FF`.
