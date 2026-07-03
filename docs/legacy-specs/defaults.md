# agent-a3b2d882d296efa3f.jsonl

## Summary
VUE's default visual style is defined in VueResources.properties (E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/resources/tufts/vue/VueResources.properties) and consumed by LWNode/LWLink/LWComponent/LWMap in E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/. New nodes are rounded rectangles filled sienna-orange #F2AE45 with a 1px #776D6D stroke and Arial 12pt black text, labeled "New Node". New links are straight 1px dark-gray (#404040) lines with an arrowhead at the tail (drop) end, Arial 11pt dark-gray labels, and no fill. The canvas is plain white (#FFFFFF); selection chrome is light blue #4A95FF (50%-alpha #804A95FF for rollover highlight). Persistence to .vue files is Castor XML driven by lw_mapping_1_1.xml: root <LW-MAP>, children as <child> elements with a class-mapped identity (node/link/group/image/text), colors as #RRGGBB elements, fonts as "Arial-plain-12" strings, link endpoints as ID1/ID2 references with controlCount and arrowState attributes. NodeToolPanel.java exists but only builds the shape/link-style combo widgets; it holds no default values.

# VUE default visual style — recon spec

Sources (all absolute paths):
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/resources/tufts/vue/VueResources.properties` (lines cited below)
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWNode.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWLink.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWComponent.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LWMap.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/LinkTool.java`, `NodeTool.java`, `VueConstants.java`
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/resources/tufts/vue/resources/lw_mapping_1_1.xml` (Castor persistence mapping — defines all .vue XML names)
- `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/java/tufts/vue/NodeToolPanel.java` — **exists**, but contains no style defaults; it is only the Swing combo-box UI for picking node shape and link style.

## 1. Node defaults (new node created with the Node tool)

From VueResources.properties (exact keys and values):

```
node.font=Arial,plain,12          (line 1584)
node.fillColor=F2AE45             (line 1589, comment: "fillColor: sienna")
node.strokeColor=776D6D           (line 1592, comment: "strokeColor: Dark Gray")
node.strokeWidth=1                (line 1595)
text.font=Arial,plain,12          (line 1597, used for pure text nodes)
newnode.html=New Node             (line 427; default label of a freshly created node)
```

Wired in `LWNode.java` lines 83–87 as `DEFAULT_NODE_FONT`, `DEFAULT_NODE_FILL`, `DEFAULT_NODE_STROKE_WIDTH`, `DEFAULT_NODE_STROKE_COLOR`, `DEFAULT_TEXT_FONT`, and applied in the constructor (lines 133–150).

- **Fill**: `#F2AE45` (sienna/orange).
- **Stroke**: `#776D6D`, width `1` px. (Stroke style default is solid.)
- **Font**: Arial, plain, 12 pt.
- **Label text color**: black `#000000` — `LWComponent.java` line 1364: `mTextColor = new ColorProperty(KEY_TextColor, Color.black)`.
- **Default shape**: rounded rectangle. `LWNode` constructor: if no shape given, `setShape(tufts.vue.shape.RoundRect2D.class)` (line 139). `RoundRect2D` (`.../tufts/vue/shape/RoundRect2D.java`) extends `java.awt.geom.RoundRectangle2D.Float` and initializes `setRoundRect(0,0, 10,10, 20,20)` → **arcWidth = 20, arcHeight = 20** (Java2D clamps arc to the shape size; visually ~10 px corner radius on typical nodes).
- **Sizing**: `isAutoSized = true` by default (size computed from label + children); minimum size `MIN_SIZE = 10` px (`LWComponent.java` lines 257–258). When created by click-dragging the node tool, the drag box becomes the frame and `setAutoSized(false)` is called; label edit activates immediately (`NodeTool.java` `NodeModeTool.handleSelectorRelease`, lines 322–336).
- **Available shape subtools** (VueResources line 1787): `roundRect,rect,oval,diamond,hexagon,octagon,flag,flag2,triangle,shield,rhombus,chevron`; default subtool `roundRect` (line 1789). Node tool shortcut key: `n`; link tool: `l`.
- Child nodes render at 75% scale of parent, cumulative: `node.child.scale` default 75 (`LWNode.java` line 90).

## 2. Link defaults (new link drawn with the Link tool)

From `LWLink.java`:

- **Font**: `link.font=Arial,plain,11` (VueResources line 1586; `DEFAULT_FONT`, line 57).
- **Label color**: `java.awt.Color.darkGray` = `#404040` (`DEFAULT_LABEL_COLOR`, line 58).
- **Stroke width**: `1.0` — `SetDefaults(LWLink)` line 355: `l.setStrokeWidth(1f)`. (The temporary rubber-band "creationLink" uses 2f / zoom-min-1px, but the persisted link goes through `new LWLink(head, tail)` → `SetDefaults` → 1f, then `EditorManager.targetAndApplyCurrentProperties(link)` applies whatever the toolbar editors currently hold — `LinkTool.java` lines 667–676.)
- **Stroke color**: dark gray `#404040` — links never override `LWComponent.java` line 1371: `mStrokeColor = new ColorProperty(KEY_StrokeColor, Color.darkGray)`. Note: the resource `defaultLinkColor=000000` (line 1558) sits under a comment `# are these used?` and is not referenced from code; the *rendered* default is #404040.
- **Fill**: disabled entirely — `initLink()` calls `disableProperty(KEY_FillColor)` (line 341).
- **Arrow state**: default **ARROW_TAIL (=2)** — arrowhead at the tail/destination end. `mArrowState = new IntProperty(KEY_LinkArrows, ARROW_TAIL)` (line 430) and the link tool re-asserts `creationLink.setArrowState(LWLink.ARROW_TAIL)` (`LinkTool.java` line 521). Enum values (lines 60–63): `ARROW_NONE=0`, `ARROW_HEAD=1` (head end), `ARROW_TAIL=2`, `ARROW_BOTH=3`. Arrowhead geometry: triangle, base 5, length 5×1.3 = 6.5 (lines 69–71).
- **Curve style** (`controlCount`, exposed as `KEY_LinkShape`): `0` = straight (default; `linkTool.defaultsubtool=line`, VueResources line 1901), `1` = curved (one quadratic control point, persisted `ctrlPoint0`), `2` = S-curved (cubic, `ctrlPoint0` + `ctrlPoint1`). Behavior: if a straight link already exists between the same two nodes, the next one is auto-created with `controlCount=1` so it doesn't overlap (`LinkTool.java` lines 670–671).
- Links can connect to nodes, other links, images, or dangle unconnected (tail point at drop location). Self-links and parent↔child links are rejected (`isValidLinkTarget`).

## 3. Canvas / map

- **Background**: white `#FFFFFF` — `LWMap` constructor: `setFillColor(java.awt.Color.white)` (`LWMap.java` line 134); alpha disallowed on map fill (`mFillColor.setAllowAlpha(false)`, line 170). User-changeable per map ("Map Color" in map inspector).
- Map-level fallback text color black, stroke color darkGray, font `SansSerif,plain,14` (`VueConstants.java`: `FONT_DEFAULT = new Font("SansSerif", Font.PLAIN, 14)`, `COLOR_TEXT = black`, `COLOR_STROKE = darkGray`).

## 4. Selection / highlight chrome

VueResources lines 1630–1641 + `VueConstants.java` lines 95–101:

```
mapViewer.selection.color=4A95FF            # selection outline + handles (light blue)
mapViewer.highlight.color=804A95FF          # rollover/indication highlight, ARGB (alpha 0x80 = 50%)
mapViewer.textBox.selection.color=FFFF00    # label-edit text selection (yellow)
mapViewer.selection.handleSize=10           # selection-box corner handle, px
mapViewer.selection.componentHandleSize=8   # per-component handle, px
COLOR_SELECTION_HANDLE = white              # handle fill
COLOR_SELECTION_DRAG   = gray               # drag rubber-band
COLOR_SELECTION_NOTICE = rgb(255,74,74)
```

## 5. Toolbar color palettes and pick lists (VueResources)

- `fillColorValues` = `strokeColorValues` = `textColorValues` = `prsntBkgrndColorValues` — one shared 48-swatch palette (lines 1528–1537): `000000,ffffff,eeeeee,d0d0d0,a6a6a6,7f7f7f,4c4c4c,00000000,fefec9,fefd8c,fefb03,e8e622,fde888,ffc63b,F2AE45,dd7b11,fcdbd9,fc938d,ea2218,ad0c03,f4e5ff,daa9ff,af55f4,7c18c9,eaeaff,c1c1ff,8484ef,5252a8,c6e8ff,83ceff,33a8f5,0877c0,e6f7fd,bde5f2,82cde4,5491a4,ecffd4,c1f780,9ddb53,76af31,e0ffe4,8aee95,30d643,0aad1d,f4f5e9,e4e6d2,b5b995,8c8f72` (note `00000000` = fully transparent entry).
- `linkColorValues=000000, 515151, FFFFFF, C1081C, 164992, 5F2E87, 33641B` with `linkColorNames=Black, Gray, White, Red, Blue, Mauve, Green` (lines 1539–1541).
- `strokeWeightValues=0,1,2,3,4,5,6` (px; 0 = none) (line 1505).
- `fontSizes=8,9,10,12,14,16,18,21,24,28,32,36,42,48,54,60,72,90` (line 1503).
- Color-button initial states (FillToolPanel): `defaultFillColor=F1A83E`, `defaultStrokeColor=000000`, `defaultTextColor=000000` (lines 1552–1556).

## 6. .vue file XML (Castor mapping `lw_mapping_1_1.xml`) — what the importer must read

- Root element: `<LW-MAP>` (class `tufts.vue.LWMap`). Layers: `<layer>`; every child component is a `<child>` element whose concrete type is class-mapped (`node`, `link`, `group`, `image`, `text`, `slide`, `portal`, `LWC` base).
- **LWComponent attributes**: `ID` (identity), `label`, `layerID` (ref), `created`, `x`, `y` (float), `width`, `height`, `strokeWidth`, `strokeStyle`, `autoSized`, `hidden`, `pruned`, `locked`, `styleID`, `isStyle`.
- **LWComponent child elements**: `fillColor`, `strokeColor`, `textColor`, `font`, `notes`, `resource`, `dataMap`, `metadata-list`, `URIString`.
- **Color format**: `#RRGGBB`, or `#AARRGGBB` when alpha < 255 (`LWComponent.ColorToString`, lines 1255–1266).
- **Font format**: `Name-style-size`, e.g. `Arial-plain-12`; style ∈ `plain|bold|italic|bolditalic`, optional `underline` suffix appended to style (e.g. `Arial-boldunderline-12`) — `FontProperty.asString`, lines 1057–1073.
- **Node** (`<node>`): adds `<shape>` element; the shape's concrete type is one of the class-mapped names `roundRect` (attributes `arcwidth`, `archeight` — default 20/20), `rectangle`, `ellipse`, `roundRectRaw`, and polygons `triangle`, `shield`, `flag`, `flag2`, `diamond`, `hexagon`, `pentagon`, `chevron`, `octagon`, `rhombus` (polygon base persists a `sides` attribute). In practice the shape element carries an `xsi:type` per Castor class mapping.
- **Link** (`<link>`): attributes `controlCount` (0/1/2), `arrowState` (0–3); elements `point1`/`point2` (endpoint coordinates, each a `point` with `x`,`y` attrs), `ID1`/`ID2` (element-content references to endpoint component IDs; absent when an end dangles), `ctrlPoint0`/`ctrlPoint1` (only present when curved), `headUserPruned`/`tailUserPruned`.
- Containers (`LWContainer`, i.e. map/layer/node/group): repeated `<child>` elements, plus `isChildrenLayoutColumn` attribute.

## 7. Behaviors worth replicating

- Node created by dragging a box: box = frame, autoSized false, label immediately editable, label defaults to "New Node".
- Node created any other way starts auto-sized to its label (min 10×10).
- Link drag requires >10 px movement to create; releasing over empty canvas with Shift held leaves a dangling link; the combo/rapid-prototyping tool (`rapidLinkModeTool`, shortcut `r`) creates a new default node at the drop point and links to it.
- Second straight link between the same pair auto-becomes curved (controlCount 1).
- Every new link gets an arrowhead at the destination end (arrowState 2), no fill, dark-gray 1 px stroke.

## MVP essentials
- Node default style: rounded-rect (arc 20x20) fill #F2AE45, stroke #776D6D at 1px, label Arial plain 12 in black #000000, default label 'New Node', auto-sized to label with 10px minimum
- Link default style: straight line, stroke #404040 (Java darkGray) at 1px, no fill, arrowhead at destination end (arrowState=2 of NONE=0/HEAD=1/TAIL=2/BOTH=3), label Arial plain 11 in #404040
- Canvas: plain white #FFFFFF background, user-changeable per map
- Selection chrome: #4A95FF outline/handles (10px box handles, 8px component handles, white handle fill), 50%-alpha #804A95FF rollover highlight
- Node-tool interaction: drag a box to place a node with that frame, immediately edit its label; link-tool drag from node to node (>10px) creates the link and opens label edit; second straight link between same pair auto-curves (controlCount 1)
- Shape set (minimum roundRect + rect + oval to feel right; full set adds diamond/hexagon/octagon/flag/flag2/triangle/shield/rhombus/chevron) and link styles straight/curved/S-curved via controlCount 0/1/2
- Shared 48-swatch color palette for fill/stroke/text, 7-color link palette (000000,515151,FFFFFF,C1081C,164992,5F2E87,33641B), stroke weights 0-6, font sizes 8-90
- .vue import: root <LW-MAP>, <layer> containers, <child> components typed node/link/group/image/text; attributes ID,x,y,width,height,strokeWidth,autoSized,label; elements fillColor/strokeColor/textColor as #RRGGBB or #AARRGGBB, font as 'Arial-plain-12'; links join via ID1/ID2 refs with controlCount+arrowState attributes and ctrlPoint0/ctrlPoint1 when curved
