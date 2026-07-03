# agent-aac61359adaedc44a.jsonl

## Summary
LWNode (E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWNode.java, subclass of LWContainer/LWComponent) is VUE's core visual node: a RectangularShape (round-rect by default, 12 named shapes total) filled with #F2AE45 and stroked 1px #776D6D, carrying a single-line centered text label (Arial plain 12, black), an optional vertical icon block (resource/notes/pathway/metadata/hierarchy/merge/ontology indicators, 22x14px icons in a 26px left gutter), and optional scaled-down child components (75% per nesting level). Nodes are auto-sized by default — the node computes its own minimum size from label + icons + children and only leaves auto-size mode when the user drags it larger than that minimum; shrinking back to minimum re-enables it. Geometry lives in LWComponent as float x/y/width/height (min size 10x10) plus stroke/fill/text/font style properties, all persisted via Castor XML mapping (lw_mapping_1_1.xml) as a <child> element of xsi:type node with attributes x, y, width, height, strokeWidth, strokeStyle, autoSized, label, ID and child elements fillColor/strokeColor/textColor/font/shape.

# VUE Node spec (from LWNode.java + LWComponent.java + VueResources.properties + lw_mapping_1_1.xml)

Source files (all under E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main):

- java/tufts/vue/LWNode.java (2921 lines) — node class
- java/tufts/vue/LWComponent.java (8212 lines) — base geometry/style
- java/tufts/vue/shape/RectangularPoly2D.java, RoundRect2D.java — custom shapes
- resources/tufts/vue/VueResources.properties — defaults
- resources/tufts/vue/resources/lw_mapping_1_1.xml — XML persistence mapping
- java/tufts/vue/NodeTool.java — shape subtool registry, node creation

## 1. Shape

Property key: `"node.shape"` (CSS name `"shape"`), defined as `KEY_Shape` in LWNode. Value is a Java `RectangularShape` class; every node holds one instance in `mShape`, always framed at `(0, 0, width, height)`.

Shape list — from `nodeTool.subtools` in VueResources.properties (line 1787), in toolbar order. Default subtool: `roundRect` (`nodeTool.defaultSubtool=roundRect`).

| tool name | display name | cssName | Java class | XML element |
|---|---|---|---|---|
| roundRect | Rounded Rectangle | round-rect | tufts.vue.shape.RoundRect2D | `<shape ... xsi:type="roundRect">` (arcwidth/archeight attrs) |
| rect | Rectangle | rect | java.awt.geom.Rectangle2D$Float | `rectangle` |
| oval | Oval | ellipse | java.awt.geom.Ellipse2D$Float | `ellipse` |
| diamond | Diamond | diamond | RectangularPoly2D$Diamond (4 sides) | `diamond` |
| hexagon | Hexagon | hexagon | RectangularPoly2D$Hexagon (6 sides, x-inset = 0.2257085*width) | `hexagon` |
| octagon | Octagon | octagon | RectangularPoly2D$Octagon (8 sides, inset = w/3.4, h/3.4) | `octagon` |
| flag | FlagRight | flag | RectangularPoly2D$Flag (3 pts, content gravity WEST) | `flag` |
| flag2 | FlagLeft | flagLeft | RectangularPoly2D$Flag2 (3 pts, gravity EAST) | `flag2` |
| triangle | Triangle | triangle | RectangularPoly2D$Triangle (3 pts, apex top-center, gravity SOUTH) | `triangle` |
| shield | Shield | shield | RectangularPoly2D$Shield (3 pts, point-down, gravity NORTH) | `shield` |
| rhombus | Rhombus | rhombus | RectangularPoly2D$Rhombus (4 pts, slanted) | `rhombus` |
| chevron | Chevron | chevron | RectangularPoly2D$Chevron | `chevron` |

(A `pentagon` subtool exists in the properties file (`RectangularPoly2D$Pentagon`, XML `pentagon`) but is NOT in the active subtool list — old files may still contain it, so the importer should accept it.)

RoundRect2D is a fixed-arc round rectangle: `setRoundRect(0,0, 10,10, 20,20)` — arc width 20, arc height 20 always. The class exists (vs raw RoundRectangle2D) so shape equality can be class-based. Raw `java.awt.geom.RoundRectangle2D$Float` maps to XML `roundRectRaw`.

`isRectShape` = true when shape is Rectangle2D or RoundRectangle2D; drives layout mode (boxed vs centered — see section 6).

`RoundRectCorner = (2.928932, 2.928932)` — precomputed NW-corner intersection for the 20x20 arc, used for link attach points.

## 2. Colors and stroke

All from LWComponent property slots (LWComponent.java lines 1363–1382), persisted as strings via `ColorToString`: `#RRGGBB` when opaque, `#AARRGGBB` when translucent; null (element omitted) means transparent/unset.

| property key | CSS name | LWComponent default | LWNode default (set in constructor, from VueResources) |
|---|---|---|---|
| `fill.color` (`mFillColor`) | background | null (transparent) | `node.fillColor=F2AE45` → **#F2AE45** |
| `stroke.color` (`mStrokeColor`) | border-color | Color.darkGray (#404040) | `node.strokeColor=776D6D` → **#776D6D** |
| `text.color` (`mTextColor`) | font-color | **Color.black (#000000)** | same (inherited) |
| `stroke.width` (`mStrokeWidth`) | stroke-width | 0.0f | `node.strokeWidth=1` → **1.0f** |
| `stroke.style` (`mStrokeStyle`) | — | **StrokeStyle.SOLID** | same |

`StrokeStyle` enum (LWComponent.java line 1385): `SOLID(1,0), DOTTED(1,1), DASHED(2,2), DASH2(3,2), DASH3(5,3)` — pairs are (pixels on, pixels off) dash patterns. Persisted as the enum ordinal integer in attribute `strokeStyle`; attribute omitted when SOLID (ordinal 0). Strokes are drawn CAP_BUTT; JOIN_MITER for solid, JOIN_BEVEL + miter-limit 10 for dashed.

Stroke is drawn only when `strokeWidth > 0`; fill drawn only when fill color non-null and alpha != 0. `COLOR_TRANSPARENT` is literally `null` (VueConstants.java line 109).

Fill darkening: if a child node's fill equals its parent node's fill, it renders darkened (`VueUtil.darkerColor`) so nesting is visible (LWNode.getRenderFillColor).

Selection chrome (MapViewer, not persisted): selection color `mapViewer.selection.color=4A95FF`, highlight `mapViewer.highlight.color=804A95FF` (alpha-leading), selection handle size 10.

## 3. Label + font

- Label: `KEY_Label` (`"label"`), persisted as XML **attribute** `label` on the node element. Default new-node label: resource string `newnode.html` = **"New Node"**.
- Font slots: `font` (composite), `font.name`, `font.size`, `font.style`, `font.underline`.
  - LWNode default: `node.font=Arial,plain,12` → **Arial plain 12**.
  - Text-node default: `text.font=Arial,plain,12` (same in this build).
- XML: single element `<font>` serialized as `Name-style-size`, e.g. `Arial-plain-12`; style word is `plain|bold|italic|bolditalic`, with `underline` appended (e.g. `boldunderline`) when `mFontUnderline == "underline"`.
- Label rendering is a `TextBox` (Swing). `WrapText = false` (hard-coded compile flag): labels are single-line unless the user embeds newlines. `textSize` Dimension is persisted (`<textBox width= height=>` element) only for wrapped text; usually absent.
- Text measurement fudge: `getTextSize()` takes max-width/min-height of getSize vs getPreferredSize, multiplies width by `TextWidthFudgeFactor = 1` (historically 1.05–1.1), then adds 3px.
- Label position (boxed layout): horizontally centered when no icon block (`(width - textWidth)/2 + 1`), at fixed x = `LabelPositionXWhenIconShowing` = 34 when icons show; vertically centered when no children (`(height - textHeight)/2`), at `EdgePadY` = 4 from top when children exist. `mAlignment` (`"alignment"`, enum LEFT/CENTER/RIGHT, default **LEFT**) only affects label x for RIGHT (`width - textWidth - 1`) and slide-style nodes; effective default look is centered.
- Non-rect shapes: label/content block centered in the shape, with per-shape content gravity (Triangle SOUTH, Shield NORTH, Flag WEST, Flag2 EAST, others CENTER).
- Double-click on the label region opens inline label edit; double-click elsewhere opens the node's resource if any.

## 4. Autosize vs manual size

`isAutoSized` (LWNode field, default **true**; persisted as XML attribute `autoSized`).

Behavior (LWNode.setAutoSized / setAutomaticAutoSized / layoutNode):

- When auto-sized, node size = computed minimum size from content: label + padding, icon block, children block.
- The bit is **cleared automatically**: `setSizeImpl` clears it when a requested size is larger than current (`w > width || h > height`). Manual clearing is pointless — next layout at minimum size re-sets it.
- The bit is **re-set automatically** when layout finds requested size <= minimum in both dimensions (`request.height <= min.height && request.width <= min.width`).
- When not auto-sized, layout still computes minimum and clamps: `newWidth = max(request.width, min.width)` — a node can never be smaller than its content.
- Drag-creating a node with the node tool calls `setAutoSized(false)` then `setFrame(selectorBox)`; click-creating yields an auto-sized node.
- Text nodes: `supportsUserResize()` is false while auto-sized.
- `setToNaturalSize()` sets size to the computed minimum.

Base geometry (LWComponent): `x, y` floats (map coordinates, attribute names `x`/`y`); `width, height` floats, initialized to `NEEDS_DEFAULT` (Float.MIN_VALUE) until first layout. **MIN_SIZE = 10** (both axes, clamped in setSizeImpl). `scale` (double, default 1.0) — child nodes inside a parent node get `ChildScale = node.child.scale/100 = 0.75` applied per nesting level (not persisted; re-applied on restore in `XML_completed`).

## 5. Icon block

`mIconBlock` — `LWIcon.Block(this, IconWidth, IconHeight, null, VERTICAL)`, a vertical stack at the node's left edge showing up to 7 indicator icons (LWIcon.java line 301): Resource, Notes, Pathway, MetaData, Hierarchy, MergeSourceMetaData, OntologicalMetaData. Each appears only when the node has that content; the block `isShowing()` when nonempty and enabled by the global "show icons" preference.

Constants (LWNode.java lines 2835–2888):

- `IconGutterWidth = 26`, `IconPadLeft = 2`, `IconPadRight = 0`
- `IconWidth = 24` (gutter − padLeft; comment: 22 is min that fits "www" in the icon font), `IconHeight = 14` (`node.icon.height=14`)
- `IconMargin = IconPadLeft + IconWidth + IconPadRight = 26`
- Icon font `node.icon.font=Arial,plain,9`; foreground `node.icon.color.foreground=51,51,51` (RGB), fill `node.icon.color.fill=#EEEEEE%70`
- A 1px vertical divider line (`mIconDivider`) is drawn at x = IconMargin between icon block and label, inset `MarginLinePadY = 5` from top/bottom, in a contrast stroke color.
- When icons show, label shifts right to `LabelPositionXWhenIconShowing = IconMargin + LabelPadLeft = 34` and min width = labelX + textWidth + `IconPadLeft` (2).
- Icon block is clickable (opens resource, notes, etc.) and has rollover tooltips.

## 6. Layout constants (boxed layout, rect shapes)

- `EdgePadY = 4` (top/bottom label padding; was 3 in VUE 1.5)
- `LabelPadLeft = 8`, `LabelPadRight = 8` (was 6 in VUE 1.5)
- Minimum node (no icons): width = textWidth + LabelPadLeft, height = 4 + textHeight + 4
- Children: laid out below label in a single column (`isChildrenLayoutColumn` attribute, or single row otherwise), `ChildOffsetX = 34` (when icons showing) else `ChildPadX = 5`; `ChildOffsetY = 4`, `ChildVerticalGap = 3`, `ChildHorizontalGap = 3`, `ChildrenPadBottom = 2`
- Non-rect shapes use `layoutCentered`: brute-force grow the shape (10% increments, then shrink-back) until it contains the content rect.
- Collapse (`KEY_Collapsed`, `COLLAPSE_IS_GLOBAL = true` in this build) hides children of all nodes globally.

## 7. Text nodes

`setAsTextNode(true)`: shape forced to Rectangle2D.Float, shape property disabled, fill = transparent (null), font = `text.font`, auto-sized true. `isTextNode()` heuristic: plain LWNode + translucent fill + no children + rectangle shape + not on a pathway. Type token becomes `"textNode"`. Stroke width 0 is conventional but not enforced.

## 8. XML persistence (.vue files, Castor mapping lw_mapping_1_1.xml)

A node inside a map appears as a `<child>` element (in LWContainer's child list) with `xsi:type="node"`; top-level class mapping is `<node>` (LWPortal extends it as `portal`). LWComponent fields:

- Attributes: `ID` (identity), `label`, `layerID` (ref), `created` (timestamp), `x`, `y`, `width`, `height`, `strokeWidth`, `strokeStyle` (int ordinal, omitted when SOLID), `autoSized` (boolean), `hidden`, `pruned`, `locked` (booleans), `styleID`/`syncID`/`isStyle`/`isSlideStyle` (style system)
- Elements: `fillColor`, `strokeColor`, `textColor` (`#RRGGBB`/`#AARRGGBB` strings), `font` (`Name-style-size`), `notes`, `resource`, `textBox` (width/height, wrapped text only), `shape` (with `xsi:type` = shape XML name; roundRect carries `arcwidth`/`archeight` attributes; polygon subclasses carry nothing extra), `metadata-list`, `nodeFilter`, `URIString`
- LWContainer adds: repeated `<child>` elements and `isChildrenLayoutColumn` attribute.
- Restore path: `setXMLshape()` → setShapeInstance; children re-scaled to 0.75 in `XML_completed`.

## 9. Creation defaults (new node via tool)

`NodeModeTool.createDefaultNode(label)` → `new LWNode(label)` → constructor sequence: fill #F2AE45 → shape RoundRect2D → strokeWidth 1 → strokeColor #776D6D → location (0,0 or click point) → width/height = NEEDS_DEFAULT → font Arial-plain-12 → setLabel → first layout auto-sizes to fit "New Node" (approx 58x22 at these paddings). Editor then applies any user-customized current tool style, and inline label edit is activated immediately.

## MVP essentials
- Round-rect (arc 20x20), rect, and oval shapes minimum; parse-but-degrade the other polygon shapes on import (render as rect if unimplemented)
- Node style properties with exact defaults: fill #F2AE45, stroke #776D6D at 1px solid, text color #000000, font Arial plain 12
- Single-line centered label; double-click to edit inline; new nodes created with label 'New Node' and label editor open
- Auto-size behavior: node size = label size + padding (EdgePadY=4 top/bottom, LabelPadLeft/Right=8); dragging larger disables autosize, shrinking to minimum re-enables it; node can never be smaller than its content or 10x10
- Manual resize with min-size clamp (max of content minimum and 10x10)
- Persistence of x, y, width, height, autoSized, strokeWidth, label as attributes and fillColor/strokeColor/textColor (#RRGGBB), font (Name-style-size), shape (xsi:type) as elements — matching the .vue Castor XML so legacy import works
- Selection highlight in #4A95FF with resize handles
- Fill drawn only when non-transparent; stroke drawn only when width > 0 (transparent-fill zero-stroke rect + autosize = VUE 'text node')
