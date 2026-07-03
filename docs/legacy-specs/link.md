# agent-af27da24e7a77196d.jsonl

## Summary
LWLink (E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWLink.java, 3689 lines) is VUE's edge component: a two-ended connector whose each end (head/tail) is either attached to a component (node, image, group, or even another link) or free-floating at a fixed parent-local x/y. Its geometry is a straight line, a quadratic curve (1 control point), or a cubic curve (2 control points), selected by a "control count" of 0/1/2. On every recompute it re-derives the visible endpoints by ray-casting from each attached node's center toward the far end (or toward the nearest curve control point) and clipping at the first intersection with the node's flattened outline shape; failure to intersect leaves the endpoint at the node center. Arrowheads (5x6.5 filled triangles in the stroke color) are a 2-bit state (none/head/tail/both, default: tail arrow on newly drawn links). The label is a text box centered at the line midpoint (curve midpoint for curves) with an opaque background. Endpoint moves just set a dirty flag; the link lazily recomputes on next paint/pick/bounds query. Persisted to .vue XML as a <link> element with point1/point2 coordinate elements, ID1/ID2 node references, controlCount and arrowState attributes, and optional ctrlPoint0/ctrlPoint1 elements.

# VUE Link (LWLink) — spec extracted from source

Source of record: `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWLink.java` (3689 lines).
Supporting files: `tufts/vue/VueUtil.java` (intersection math), `tufts/vue/LWComponent.java` (inherited stroke/color/font properties), `tufts/vue/LinkTool.java` (creation defaults), `tufts/vue/shape/Triangle2D.java` (arrowhead shape), `src/main/resources/tufts/vue/resources/lw_mapping_1_1.xml` (XML persistence mapping), `src/main/resources/tufts/vue/VueResources.properties` (resource defaults).

## 1. Data model

`LWLink extends LWComponent` and holds exactly two endpoint records, `head` and `tail` (inner class `End extends Point2D.Float`):

| End field | Type | Meaning |
|---|---|---|
| `x, y` | float | The actual **connection point**, in the link's parent-local coordinate space. If unconnected, the free-floating point location. |
| `node` | LWComponent | The attached component. **`null` = not connected** (free-floating endpoint is fully supported). |
| `pruned` | boolean | User-pruned flag (prune feature; see §10). |
| `rotation` | double | Cached "normalizing rotation" (radians) that rotates the link direction at this end to vertical; used to orient arrowheads. |

Comment in source: "Currently, we always have exactly two endpoints, each of which may or may not be connected to another node."

- **Links to links are supported**: `head.node`/`tail.node` may be an `LWLink`. When the far component is a link, no edge clipping is done — the connection stays at the other link's center point (its curve midpoint if curved, "the same place we put the label").
- Endpoints register back-references: `setPersistHead/Tail` call `node.addLinkRef(this)`; disconnect calls `removeLinkRef`.
- You cannot connect both ends to the same component via drag (`controlPointDropped` requires `tail.node != dropTarget` / `head.node != dropTarget`).
- `canLinkTo(target)`: default true for any non-LOCKED component (LWComponent.canLinkToImpl).
- A link's "position" (x/y/width/height inherited from LWComponent) is derived, not authoritative: after each recompute the bounds are set to the geometry bounds. Comment: "links have position (always their mid-point) only so that there's a place to connect for another link and/or a place for the label."
- `getScale()` is hardwired to `1.0` — "links never scaled by themselves". Link coordinates are always **parent-local** (its transformDown methods are no-ops).
- `supportsReparenting()` = false (you can't manually reparent a link; it auto-reparents, §7).

## 2. Geometry: straight / quad / cubic

`mCurveControls` ("control count"): `0` = straight (`Line2D.Float mLine`), `1` = quadratic curve (`QuadCurve2D.Float mQuad`), `2` = cubic curve (`CubicCurve2D.Float mCubic`). Values > 2 throw `IllegalArgumentException`. Property key: `"link.shape"` (`KEY_LinkShape`), value = the integer control count. **Default: 0 (straight).**

- Curve endpoints (`mQuad.x1/y1/x2/y2`, `mCubic.…`) are always snapped to `head.x/y` and `tail.x/y` on recompute; only the control points are user state.
- `Float.MIN_VALUE` (`NEEDS_DEFAULT`, from LWComponent line 259) marks an uninitialized control point; `NaN` inputs are coerced to `NEEDS_DEFAULT` with a warning.
- **Implicit promotion**: `setCtrlPoint0` on a straight link promotes it to control count 1; `setCtrlPoint1` promotes to 2. (This is how persistence restores curves: the `ctrlPoint0/1` XML elements imply the curved state.)
- **Curve caching** (`CacheCurves = true`): switching 1→0→1 restores the previous quad control point; 2→1 copies `ctrl1` of the cubic into the quad control; 1→2 keeps the quad control as the cubic's `ctrl1`.
- **Default control-point placement** (`initCurveControlPoints`): control points are placed on a line through the chord midpoint, rotated to the chord axis; offset = chordLength/3 (quad) or chordLength/4 (cubic, mirrored pair spanning `2*offset`). Multiple curved links between the same two nodes alternate sides and step outward: `reverse = existingCurveCount % 2 == 1`, `further = 1 + existingCurveCount/2`.
- **Curve midpoint** (label anchor, `mCurveCenterX/Y`): computed by de Casteljau subdivision midpoints — quad: midpoint of the two chord-to-control midpoints; cubic: the standard double-subdivision midpoint of six averaged points.
- **Flattening**: for hit-testing (and bounds) curves are flattened with `FlatteningPathIterator(curve.getPathIterator(null), 1f)` (flatness 1.0) into `mPoints` float array (initial 16 floats, doubles as needed; ~17 segments for a small quad, ~25 for a cubic). Straight-chord center `mCenterX/Y = head - (head - tail)/2`.
- `mLength` = straight-line distance head→tail (curve arc length is *not* computed; "Length isn't meaningfully used with curves").
- Bounds: for curves, union of flattened points (control points deliberately **excluded**: `IncludeControlPointsInBounds = false`); for straight, the endpoint bbox. Then grown by `strokeWidth/2`, plus the label box bounds, plus the icon block.

## 3. Endpoint attachment / clipping math (`computeLink` + `VueUtil.computeIntersection`)

Per recompute:
1. For each connected end, get the node's **center** relative to the link's parent (`getLinkConnectionCenterRelativeTo`) — that seeds `head.x/y`, `tail.x/y`.
2. If the attached component is an `LWLink`, stop there (connect to its center). Otherwise:
3. Build a ray from the node center to a **source point**: the opposite endpoint (straight); the single control point (quad); the near control point (cubic: `ctrl1` for head, `ctrl2` for tail).
4. `VueUtil.computeIntersection(x1,y1, x2,y2, shape, shapeTransform, result, 1)` (VueUtil.java line 321): iterate the node's zero shape via `FlatteningPathIterator(pathIterator(shapeTransform), 0.5)` (flatness 0.5, transform = node's transform relative to the link parent, so scaled/nested nodes clip correctly); for each flattened segment test `Line2D.linesIntersect(ray, segment)`; on the first hit solve the exact line–line intersection with slope/intercept algebra (vertical-line special cases handled) and return `{x, y}`. `SEG_CLOSE` closes back to the first point.
5. No intersection (returns `NoIntersection` = NaN pair — happens when nodes overlap so the center is inside the other shape, or shape is degenerate): **leave the connection point at the node center**.
6. `mLine.setLine(head.x, head.y, tail.x, tail.y)`; recompute curve geometry, flatten, compute rotations:
   - straight: `head.rotation = computeVerticalRotation(line)`; `tail.rotation = head.rotation + PI`.
   - curved: each end's rotation computed against its adjacent control point.
   - `computeVerticalRotation(x1,y1,x2,y2)` (VueUtil line 582): `radians = -atan((x1-x2)/(y1-y2))`, `+PI` if both diffs >= 0, `-PI` if xdiff<=0 && ydiff>=0 — the rotation that makes the segment vertical.
7. `layout()` (place label & icon block), then set the link's x/y/width/height to the computed bounds and propagate `updateConnectedLinks(null)` so links-to-this-link recompute too.

Chained recompute: if an endpoint is itself a dirty link, `computeLink` forces it to compute first; the cleared `mRecompute` bit protects against link-loops (loops "never reach a final state" but don't crash).

## 4. What happens when an endpoint node moves

- `LWComponent.updateConnectedLinks` calls `link.notifyEndpointMoved(movingSrc, end)` which simply sets `mRecompute = true` — **recomputation is lazy**, performed at the next `drawImpl`, pick (`pickDistance`/`intersectsImpl`), bounds query (`getZeroShape`, `getLocalBounds`, `getMapBounds`), or control-point query.
- Optimization: if the link and the endpoint both move inside the same moving ancestor (`hasAncestor(movingSrc) && end.hasAncestor(movingSrc)`), the flag is skipped — relative geometry unchanged.
- `translate(dx, dy)` on the link itself moves **only free points**: unconnected endpoints and curve control points. If both ends are connected and the link is straight, translate is a no-op (the link is fully determined by its endpoints).
- Endpoint reparent/hierarchy change queues a cleanup task (`run()`): reparent the link to the **common ancestor** of its two endpoints (`findCommonEndpointAncestor`; a single connected end uses that node's parent; top-level/layer parents are treated as equivalent), and re-order z so the link paints above both endpoints' ancestor chains (`LWContainer.ensureLinkPaintsOverAllAncestors`).
- Endpoint deletion: `disconnectFrom(c)` nulls that end (link survives with a free end). Exception: data links (`Flag.DATA_LINK`) self-delete when either end is missing.

## 5. Arrow state

Constants (LWLink lines 60–63):
```java
ARROW_NONE = 0;  ARROW_HEAD = 0x1;  ARROW_TAIL = 0x2;  ARROW_BOTH = 3;   // bitmask
```
- Property key `"link.arrows"` (`KEY_LinkArrows`). Stored in `mArrowState = new IntProperty(KEY_LinkArrows, ARROW_TAIL)` — the **in-memory default is ARROW_TAIL (2)**, and `LinkModeTool` also explicitly sets `creationLink.setArrowState(LWLink.ARROW_TAIL)`: a freshly drawn link has an arrow at the tail (drag-destination) end.
- `rotateArrowState()` cycles NONE→HEAD→TAIL→BOTH→NONE.
- **Arrowhead geometry**: `ArrowBase = 5`; `HeadShape = TailShape = Triangle2D(0,0, 5, 6.5)` (width 5, height 5*1.3, apex-up isoceles triangle; `tufts/vue/shape/Triangle2D.java`). Drawing: translate to endpoint, rotate by `end.rotation`, scale by `getMapScale()`, translate `-width/2` to center on the line, then `fill` + `draw` (outline stroked with the link's stroke width — this fattens the arrow proportionally) in the **stroke color**. Dash patterns are suppressed for the arrow (a SOLID stroke of the same width is used).
- LOD: arrows are skipped when `dc.zoom <= 0.125`.

## 6. Label

- Standard LWComponent label (persisted as `label` attribute on the XML element). `DEFAULT_FONT = VueResources.getFont("link.font")` → **`link.font=Arial,plain,11`** (VueResources.properties line 1586). `DEFAULT_LABEL_COLOR = Color.darkGray` = **#404040** (applied as textColor by `SetDefaults`).
- Placement (`layoutImpl`): the text box is **centered on the link midpoint** — `mCurveCenter` for curved links, `mCenterX/Y` for straight. If the link has a resource, the icon block is placed *below* the label (label center shifted up by half total height); otherwise the icon block sits at the label's right and the label shifts left. Label box position is not persisted; recomputed on restore from the saved endpoint coordinates.
- Rendering: the label text box is forced **opaque** with a background = the render fill color of the surroundings (or `Color.white` fallback) "to make sure we create a contrast between the text and the background, which otherwise would include the usually black link stroke in the middle".
- The label box participates in hit-testing (a click on the label picks the link) and in the link's bounds.
- Global static toggle `DisplayLabels` (default true) can hide all link labels. `hasLabel()` is false when display is off. `supportsUserLabel()` is false while pruned.

## 7. Stroke & style

Inherited from LWComponent, with link-specific tweaks:

| Property | XML | Default | Notes |
|---|---|---|---|
| strokeWidth | `strokeWidth` attribute | **1.0** for user links (`SetDefaults`: `setStrokeWidth(1f)`); the interactive rubber-band creation link uses 2.0 | `setStrokeWidth` clamps `w <= 0` to **0.1f** for links. `weight` = `round(strokeWidth)`. |
| strokeColor | `<strokeColor>` element, `#RRGGBB` (or `#AARRGGBB` if alpha) | **Color.darkGray = #404040** (`mStrokeColor = new ColorProperty(KEY_StrokeColor, Color.darkGray)`, LWComponent line 1371) | Arrows drawn in same color. |
| strokeStyle | `strokeStyle` attribute (enum name) | **SOLID** | Enum `StrokeStyle` (LWComponent line 1385) with dash on/off pixel pairs: `SOLID(1,0)`, `DOTTED(1,1)`, `DASHED(2,2)`, `DASH2(3,2)`, `DASH3(5,3)`; strokes built with `CAP_BUTT`, `JOIN_BEVEL`, miter 10 (SOLID: `CAP_BUTT`/`JOIN_MITER`). |
| fillColor | — | **disabled** for links (`initLink()` calls `disableProperty(KEY_FillColor)`) | |
| font / textColor | `<font>` element `Name-style-size` (e.g. `Arial-plain-11`), `<textColor>` | Arial plain 11 / #404040 | |

- Zero-width links still draw a hairline: width forced to 0.5 and divided by current zoom scale when zoomed in.
- Selection halo: when selected, an under-stroke of the whole shape is drawn first in `COLOR_HIGHLIGHT` (resource `mapViewer.highlight.color=804A95FF`, i.e. #4A95FF at 50% alpha) with width `strokeWidth + 5`, cap ROUND.
- Selection color constants: `mapViewer.selection.color=4A95FF`; unconnected endpoint handle fill = white; curve control = selection color brightened.

## 8. Hit testing / picking

- Fast reject on the cached bounds box (already includes stroke).
- `pickDistance`: hit if squared distance from point to the line segment (or to any flattened curve segment) `<= (strokeWidth/2)^2` → distance 0; otherwise returns `minDistSq - hitDistSq`. Icon block and label box also count as direct hits (unless the link is a "nested link").
- Rect selection (`intersectsImpl`): rect-vs-line for straight, rect-vs-each-flattened-segment for curves, plus icon block and label box.

## 9. Selection controls (edit affordances)

Controller indices: `CHead=0, CTail=1, CCurve1=2, CCurve2=3`. Shapes: connect controls 9x9 ellipse, curve controls 8x8 ellipse.
- Dragging an endpoint control **detaches** it (`setHead(null)` + `setHeadPoint(local)`), live-highlights valid targets, and on drop over a valid target reattaches (`setHead(dropTarget)`); shift-drop forces staying unconnected.
- Quad: the single controller sits exactly at the control point. Cubic: each controller is drawn at the **midpoint between the endpoint and its control point** (`CurveCtrl(p, epx, epy)` averages them); drags apply the mouse delta to the underlying control point.
- While selected, faint guide lines (0.5px absolute) are drawn from each endpoint to its control point.

## 10. Pruning (post-MVP; documented for import fidelity)

Each end has a user-pruned bit (`headUserPruned`/`tailUserPruned` XML elements, persisted only when true). Toggling a prune hides the entire far endpoint chain (`setPruned` + `HideCause.PRUNE` recursively). A pruned link renders only a 7px dot (`PruneDotSize=7`, light-gray fill, dark-gray outline) at the pruned end. Static global `PruneControlsEnabled` gates the whole feature (default false).

## 11. XML persistence (castor mapping, lw_mapping_1_1.xml lines 308–347)

Element: **`<link>`** (`<class name="tufts.vue.LWLink" extends="tufts.vue.LWComponent"><map-to xml="link"/>`), inheriting all `LWC` fields (ID attribute, `label` attribute, `x`/`y`/`width`/`height` float attributes, `strokeWidth` + `strokeStyle` + `autoSized` + `layerID` attributes, `<notes>`, `<resource>`, `<fillColor>`/`<strokeColor>`/`<textColor>`/`<font>` elements, `<metadata-list>`, `URIString` element, etc.).

Link-specific fields:
```xml
<link ID="5" x="..." y="..." width="..." height="..." strokeWidth="1.0" strokeStyle="SOLID"
      controlCount="0" arrowState="2" ...>
  <strokeColor>#404040</strokeColor>
  <textColor>#404040</textColor>
  <font>Arial-plain-11</font>
  <point1 x="120.5" y="88.0"/>          <!-- headPoint (connection or free point), Point2D$Float: x,y attributes -->
  <point2 x="310.0" y="140.2"/>         <!-- tailPoint -->
  <ID1>2</ID1>                          <!-- head node reference (castor ID reference); absent if unconnected -->
  <ID2>7</ID2>                          <!-- tail node reference; absent if unconnected -->
  <ctrlPoint0 x="..." y="..."/>         <!-- only present when controlCount >= 1; presence implies curved -->
  <ctrlPoint1 x="..." y="..."/>         <!-- only present when controlCount == 2 -->
  <headUserPruned>true</headUserPruned> <!-- only when true -->
  <tailUserPruned>true</tailUserPruned>
</link>
```
Mapping comment: "if isn't curved, these [ctrlPoint0/1] will be null, and thus not saved. so if this is present, we know it's a curved link."
- `arrowState` attribute: 0/1/2/3 bitmask as in §5.
- `point1`/`point2` are always saved (last computed connection points) even when both ends are connected — used at restore time to position labels before the first computeLink. During XML restore, `setHeadPoint/setTailPoint` write raw x/y without events.
- Restore path: `setPersistHead/Tail` reconnect the node references and re-register link refs; `XML_completed` re-derives data-link flags.
- Colors serialize as `#%06X` (opaque) or `#%08X` (with alpha); null color → element omitted.

## 12. Creation flow & defaults recap (LinkTool)

- Drag > 10px from a source component with the link tool creates the link; the drop target under the mouse becomes the tail. `new LWLink(head, tail)` runs `SetDefaults`: font = Arial plain 11, textColor = #404040, strokeWidth = 1.0. Arrow default ARROW_TAIL. StrokeColor inherits component default #404040, strokeStyle SOLID, controlCount 0.
- If a straight link already exists between the same two nodes, the new link is auto-curved (`setControlCount(1)`); additional curved links fan out on alternating sides (§2).
- Dropping on empty canvas: link keeps a free tail point at the drop location (plain link tool), or (combo-mode tool) creates a new node there and connects.
- The link is added to the common parent, painted above endpoint links, selected, and label edit is activated.
- `duplicate()` copies geometry and control points but **not** connections ("The new link will not be connected to any endpoints").

## MVP essentials
- Two endpoints (head/tail), each either referencing a node by ID or holding a free-floating x/y point; both states must round-trip through save/load (point1/point2 elements + optional ID1/ID2 references)
- Straight-line links with edge clipping: connection point = first intersection of the center-to-center ray with the node's boundary shape; fall back to node center when there is no intersection (overlapping nodes)
- Lazy recompute on endpoint move: moving a node marks its links dirty and their endpoints re-clip on next render
- Arrow state bitmask 0-3 (none/head/tail/both), default 2 (tail arrow on new links); arrowhead = filled 5x6.5 triangle in the stroke color, rotated to the line direction, centered on the endpoint
- Link label: text box centered at the link midpoint with an opaque background so it reads over the stroke; Arial plain 11, text color #404040; label is click-hittable and included in link bounds
- Stroke defaults: width 1.0 (clamp <=0 to 0.1), color #404040, style SOLID, plus dash styles DOTTED(1,1)/DASHED(2,2)/DASH2(3,2)/DASH3(5,3); no fill property on links
- Hit testing: point-to-segment distance <= strokeWidth/2 (plus label box) selects the link
- Endpoint drag detach/reattach: dragging an endpoint handle disconnects it, dropping on a node reconnects; disallow connecting both ends to the same node
- Import fidelity for curves even if editing them is deferred: controlCount attribute 0/1/2 and ctrlPoint0/ctrlPoint1 elements define quadratic/cubic Bezier geometry with endpoints snapped to the clipped connection points; render curves and place labels at the Bezier midpoint
- Parse but safely ignore post-MVP features when importing legacy .vue files: headUserPruned/tailUserPruned, links-to-links (connect to the other link's midpoint or degrade gracefully)
