# agent-ae3c8d3429c4f0cc1.jsonl

## Summary
The .vue save format is Castor-marshalled XML defined by lw_mapping_1_1.xml (mapping version 1.1, unchanged since 2006). A file starts with 3-5 HTML-style comment lines BEFORE the XML declaration (an importer must strip everything before "<?xml" or "<LW-MAP"), then an <LW-MAP> root element. Every visible object (node, link, group, image, text) is serialized as a <child> element whose concrete type is given by an xsi:type attribute ("node", "link", "group", "image", "text", ...). Geometry and identity are XML attributes (ID, label, x, y, width, height, strokeWidth, autoSized, ...); styling is child elements (fillColor/strokeColor/textColor as #RRGGBB or #AARRGGBB hex, font as "Name-style-size", shape with its own xsi:type). Links connect components by ID via <ID1> and <ID2> child elements whose text content is the target component's ID attribute, plus <point1>/<point2> coordinate elements for unconnected ends. A <modelVersion> element (0-6, absent=0) controls whether child coordinates are absolute (0) or parent-relative (>=1), and whether top-level children are wrapped in <layer> elements (>=5).

# The .vue XML file format — importer spec

Sources (all verified against code, not guessed):
- Mapping: `E:/Dropbox/audio/git/VUE/2025/VUE/VUE2/src/main/resources/tufts/vue/resources/lw_mapping_1_1.xml` (current mapping version is **1.1**, per `VueResources.properties:1470 mapping.lw.current_version=1.1`)
- Examples: `startup.vue` (2005, flat), `nvdemo.vue` (2005, groups/images), `vue_arch.vue` (2008, nested nodes, `nodeShape` wrapper variant) in the same tree
- Writer/reader: `tufts/vue/action/ActionUtil.java`; model classes `tufts/vue/LWComponent.java`, `LWNode.java`, `LWLink.java`, `LWMap.java`

## 1. File envelope

- **Comment lines precede the XML declaration.** VUE writes (ActionUtil.java:679-698):
  ```
  <!-- Tufts VUE 3.x concept-map (name.vue) 2008-06-20 -->
  <!-- Tufts VUE: http://vue.tufts.edu/ -->
  <!-- Do Not Remove: VUE mapping @version(1.1) jar:file:/...lw_mapping_1_1.xml -->
  <!-- Do Not Remove: Saved date <date> by <user> on platform <os> in JVM <ver> -->
  <!-- Do Not Remove: Saving version @(#)VUE: built ... -->
  <?xml version="1.0" encoding="US-ASCII"?>
  ```
  Older files have only the 2-3 "Do Not Remove" lines. This is **invalid XML** for strict parsers: the importer MUST strip everything before the first `<?xml` (or first `<LW-MAP` if no declaration). VUE itself reads line-by-line and parses `@version(...)` from the `<!-- Do Not Remove: VUE mapping` line.
- **Encoding**: newer files `US-ASCII` (all non-ASCII escaped as numeric character references, e.g. `&#xa;`, `&#x6b22;`); older files `UTF-8` or platform encodings. VUE always reads through UTF-8 (ASCII passes through untouched). Importer: decode as UTF-8, honor the declared encoding if it isn't ASCII/UTF-8.
- **Namespaces**: `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` may appear on the root (old files) or redundantly on individual `child` elements (e.g. vue_arch.vue). `xsi:noNamespaceSchemaLocation="none"` on the root. Use a namespace-tolerant parser or match the literal attribute name `xsi:type`.

## 2. Root element `<LW-MAP>` (class tufts.vue.LWMap)

Attributes (LWMap inherits all LWComponent attributes):
- `ID="0"` — the map is always component ID 0
- `label` — usually the filename ("startup.vue")
- `x y width height` — map content bounds, **informational only**; do not offset children by these
- `strokeWidth`, `autoSized` — ignorable

Child elements, in persist order (only those relevant listed):
- `<fillColor>` — map background color (e.g. `#ffffff`)
- `<font>` — map default font (e.g. `SansSerif-plain-18`)
- `<child ...>` * — components (old files, modelVersion < 5)
- `<layer ...>` * — layers (modelVersion >= 5); element name is `layer`, class LWMap$Layer extends LWContainer, so a layer has ID/label attributes and its own `<child>` list. Layers are at x=0,y=0 scale 1 — their children are in map coordinates.
- `<userZoom>` — double, saved zoom (e.g. `1.0`)
- `<userOrigin x="..." y="..."/>` — saved pan offset (map coords)
- `<PathwayList ...>`, `<mapFilterModel/>`, `<author>`, `<date>`, `<description>`, `<metadata-list>`, `<nodeFilter/>` — safe to ignore for MVP
- `<modelVersion>` — integer element. **Absent = 0.** Current writer emits 6. Semantics (LWMap.java:2703-2712):
  - 0: all coordinates **absolute** map coordinates (even nested children)
  - 1-3: children **relative to parent** (group handling varies per version)
  - >=4: link endpoints (`point1`/`point2`) also parent-relative
  - >=5: layers added
  - >=6: metadata persistence change only
- `<saveLocation>`, `<saveFile>` — original absolute path, ignore

## 3. Components: the `<child>` element

Every node/link/group/image is a `<child>` element (Castor field binding `child` for LWContainer.XMLChildList). Concrete type = `xsi:type` attribute. Values (from the mapping `map-to` declarations):

| xsi:type | class | MVP relevance |
|---|---|---|
| `node` | LWNode | YES |
| `link` | LWLink | YES |
| `group` | LWGroup | container of children; render children |
| `image` | LWImage | skip or placeholder |
| `text` | LWText | rich text; has extra `richText` attribute |
| `portal` | LWPortal | skip |
| `slide`, `masterSlide` | LWSlide/MasterSlide | skip |

Nodes and groups can contain **nested `<child>` elements** (children inside a node). `isChildrenLayoutColumn` boolean attribute on containers.

### 3.1 LWComponent base attributes (identity="ID")

| attribute | type | notes / default |
|---|---|---|
| `ID` | string (integer text) | unique per map; map=0, components count up; links reference these |
| `label` | string | may contain `&#xa;` (newline) char refs; **very old files use `%nl;` inside labels — always replace `%nl;` → newline** (LWComponent.setXMLlabel) |
| `x`, `y` | float | position; absolute if modelVersion 0, parent-relative if >=1 (top level = map coords either way) |
| `width`, `height` | float | component size |
| `strokeWidth` | float | always written; nodes default 1.0, decorative text nodes 0.0 |
| `strokeStyle` | int | **absent = SOLID**; otherwise enum ordinal: 1=DOTTED(1,1) 2=DASHED(2,2) 3=DASH2(3,2) 4=DASH3(5,3) — pairs are dash-on,dash-off units |
| `autoSized` | boolean | true = size tracks label text |
| `hidden`, `pruned`, `locked` | boolean | only written when true |
| `layerID` | ref | which layer owns it (newer files) |
| `created` | long | epoch ms timestamp |
| `styleID`, `syncID`, `parentStyleID`, `isStyle`, `isSlideStyle` | | data-style plumbing, ignore |

### 3.2 LWComponent base child elements (persist order)

`<labelFormat>`, `<notes>`, `<schema>`*, `<resource>`, `<dataMap>`, `<fillColor>`, `<strokeColor>`, `<textColor>`, `<font>`, `<textBox>`, `<nodeFilter/>`, `<metadata-list>`, `<URIString>`.

- `<notes>` — text with whitespace escaping (see §6)
- `<resource ...>` — URL attached to node: attributes `spec` (the URL — the only one that matters), `referenceCreated`, `accessAttempted`, `accessSuccessful`, `size`, `type` (int client type), own `xsi:type` (`map-resource` in old files, or castor-derived name like `URLResource`); optional `<title>` and `<property key="..." value="..."/>` children. MVP: keep `spec` as node URL.
- `<nodeFilter/>` — empty element present on nearly every component; ignore.

## 4. Nodes — `xsi:type="node"` (LWNode)

Adds one child element: the shape.

**Current/old form** (mapping 1.1 today, and 2005 files):
```xml
<shape xsi:type="roundRect" arcwidth="20.0" archeight="20.0"/>
<shape xsi:type="rectangle"/>
<shape xsi:type="ellipse"/>
```
**2008-era variant** (vue_arch.vue — must also be accepted):
```xml
<nodeShape equal-aspect="false">
    <shape arcwidth="20.0" archeight="20.0" xsi:type="roundRect"/>
</nodeShape>
```
Shape xsi:type values (mapping map-to names): `rectangle` (Rectangle2D$Float), `ellipse` (Ellipse2D$Float), `roundRect` (RoundRect2D, attrs `arcwidth`/`archeight`, typically 20.0/20.0), `roundRectRaw` (RoundRectangle2D$Float), `polygon` (RectangularPoly2D, attr `sides`), `triangle`, `shield`, `flag`, `flag2`, `diamond`, `hexagon`, `pentagon`, `chevron`, `octagon`, `rhombus`. Shape elements carry no x/y — the node's x/y/width/height frame the shape.

**Default node shape is roundRect** (LWNode.java:139). Missing `<shape>` → treat as roundRect. Default new-node fill in VUE is `COLOR_NODE_DEFAULT = rgb(200,200,255)` = `#C8C8FF` (VueConstants.java:115); absent `<fillColor>` in a file simply means transparent/none — do not substitute the default when importing.

Typical real node:
```xml
<child ID="1" label="VUE Web Site" x="51.0" y="290.0" width="135.7"
    height="23.0" strokeWidth="1.0" autoSized="true" xsi:type="node">
    <fillColor>#d5e3f8</fillColor>
    <strokeColor>#404040</strokeColor>
    <font>Arial-bold-14</font>
    <nodeFilter/>
    <shape arcwidth="20.0" archeight="20.0" xsi:type="roundRect"/>
</child>
```

## 5. Links — `xsi:type="link"` (LWLink)

Extra attributes:
- `controlCount` — int: **0** straight line, **1** quadratic curve (uses ctrlPoint0), **2** cubic curve (ctrlPoint0 + ctrlPoint1)
- `arrowState` — int bitfield (LWLink.java:60-63): **0** = no arrows, **1** = arrow at head (endpoint 1), **2** = arrow at tail (endpoint 2), **3** = both. Old files mostly 0; current VUE's default for newly created links is 2 (ARROW_TAIL).

Extra child elements:
- `<point1 x="..." y="..."/>` — head endpoint coordinates; `<point2 .../>` — tail endpoint. Absolute map coords for modelVersion < 4, parent-relative for >= 4.
- `<ID1>nn</ID1>` — text content is the **ID attribute of the head component**; `<ID2>nn</ID2>` — tail component. Either may be **absent** (dangling end — e.g. nvdemo.vue link ID=87 has only ID1). Targets can be nodes, groups, images, or **other links** (link-to-link is legal).
- `<ctrlPoint0 x= y=/>`, `<ctrlPoint1 x= y=/>` — only present when curved.
- `<headUserPruned>`, `<tailUserPruned>` — ignore.

Link styling comes from the base properties: `strokeColor` = line color (default darkGray `#404040`), `strokeWidth`, `strokeStyle` (dash pattern), `textColor` + `font` + `label` for the midpoint label. A link's own x/y/width/height are its computed bounding box — recompute; don't trust.

**Importer rule**: when both ID1 and ID2 resolve, ignore point1/point2 and recompute geometry from the connected shapes (this is what VUE does on load — it re-lays-out all links). Use point1/point2 only for a missing/unresolvable endpoint.

Typical real link:
```xml
<child ID="3" x="128.74402" y="177.0" width="97.21968" height="113.0"
    strokeWidth="1.0" autoSized="true" controlCount="0" arrowState="0"
    xsi:type="link">
    <textColor>#404040</textColor>
    <font>Verdana-plain-11</font>
    <nodeFilter/>
    <point1 x="128.74402" y="290.0"/>
    <point2 x="225.9637" y="177.0"/>
    <ID1>1</ID1>
    <ID2>2</ID2>
</child>
```

## 6. Value encodings

### Colors (LWComponent.ColorToString, line 1255-1266)
- Opaque: `String.format("#%06X", rgb)` → `#RRGGBB`, uppercase (real files contain lowercase too — parse case-insensitively)
- With alpha: `String.format("#%08X", argb)` → `#AARRGGBB` (e.g. `#40000000` = 25% black, `#20ffffff`, `#80ffffff`)
- Parser (VueResources.parseHexColor, line 886-915): strip `#`, parse whole string as hex integer; **length > 6 → has alpha** in top byte; length <= 6 → opaque. Also accepts `RRGGBB%NN` (percent alpha) and comma form `r,g,b[,a]` — rare, but cheap to support.
- Real-world quirk: `#cccc` (4 digits, nvdemo.vue) parses as 0x0000CCCC → rgb(0,204,204), opaque.
- Empty/absent element → null = no color (transparent fill / inherit).

### Fonts (LWComponent.FontProperty, line 1037-1074)
Format: `Name-style-size`, e.g. `Arial-bold-14`, `SansSerif-plain-18`, `Arial Unicode MS-bold-12`, `Verdana-plain-11`.
- style ∈ `plain | bold | italic | bolditalic`, optionally with `underline` appended (`boldunderline`, `plainunderline`)
- **Font names contain spaces** (`Arial Unicode MS`); parse from the right: last `-` delimits size, second-to-last delimits style; everything left is the family name. (VUE's own reader naively takes the token after the FIRST `-` for underline detection, but Java Font.decode parses right-to-left.)
- Default: `SansSerif-plain-14` (VueConstants.FONT_DEFAULT).

### Text escaping
- **Labels** are XML attributes: newlines appear as `&#xa;` character refs (castor >= 0.9.7). ALSO unconditionally replace `%nl;` → `\n` on read (old files: `label=" Check out%nl; that mouth!"`).
- **Notes** are elements with VUE's own escaping (LWComponent.java:3154-3177): on write `%` → `%pct;`, two spaces → ` %sp;`, tab → `%tab;`, newline/CR → `%nl;`. On read, first collapse castor indentation (`\n[ \t]*%nl;` → `%nl;`, then `\n[ \t]*` → single space), then unescape in order: `%nl;`→`\n`, `%tab;`→tab, `%sp;`→space, `%pct;`→`%`.

### Booleans
`true` / `false` text. Flag attributes (`hidden`, `pruned`, `locked`, `isStyle`) are only present when true.

## 7. Defaults table (from source)

| property | default | source |
|---|---|---|
| font | SansSerif-plain-14 | VueConstants.java:75 |
| textColor | #000000 (black) | LWComponent.java:1364 |
| strokeColor | #404040 (Java darkGray) | LWComponent.java:1371 |
| fillColor | none/null (transparent) | LWComponent.java:1363 (no default arg) |
| strokeStyle | SOLID (attribute absent) | LWComponent.java:1379, 3361 |
| node fill (new node in VUE UI) | #C8C8FF rgb(200,200,255) | VueConstants.java:115 |
| node shape | roundRect (arc 20x20) | LWNode.java:139 |
| link arrowState (new link, current VUE) | 2 (tail arrow) | LWLink.java:430 |
| userZoom | 1.0 | |
| modelVersion when absent | 0 (absolute coords) | LWMap.java:128 |
| map ID | "0" | all examples |

## 8. Minimal valid .vue file

VUE's loader requires the `Do Not Remove: VUE mapping @version(...)` comment line to pick a mapping (falls back with a warning otherwise). A minimal file that both VUE and the new importer should accept:

```xml
<!-- Do Not Remove: VUE mapping @version(1.1) lw_mapping_1_1.xml -->
<?xml version="1.0" encoding="US-ASCII"?>
<LW-MAP xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:noNamespaceSchemaLocation="none" ID="0" label="minimal.vue">
    <fillColor>#FFFFFF</fillColor>
    <font>SansSerif-plain-18</font>
    <child ID="1" label="Node A" x="100.0" y="100.0" width="120.0" height="30.0"
        strokeWidth="1.0" autoSized="true" xsi:type="node">
        <fillColor>#C8C8FF</fillColor>
        <strokeColor>#404040</strokeColor>
        <font>SansSerif-plain-14</font>
        <shape arcwidth="20.0" archeight="20.0" xsi:type="roundRect"/>
    </child>
    <child ID="2" label="Node B" x="300.0" y="200.0" width="120.0" height="30.0"
        strokeWidth="1.0" autoSized="true" xsi:type="node">
        <fillColor>#C8C8FF</fillColor>
        <strokeColor>#404040</strokeColor>
        <font>SansSerif-plain-14</font>
        <shape arcwidth="20.0" archeight="20.0" xsi:type="roundRect"/>
    </child>
    <child ID="3" x="160.0" y="115.0" width="200.0" height="100.0" strokeWidth="1.0"
        controlCount="0" arrowState="0" xsi:type="link">
        <strokeColor>#404040</strokeColor>
        <font>SansSerif-plain-14</font>
        <point1 x="160.0" y="115.0"/>
        <point2 x="360.0" y="215.0"/>
        <ID1>1</ID1>
        <ID2>2</ID2>
    </child>
    <userZoom>1.0</userZoom>
    <userOrigin x="0.0" y="0.0"/>
    <modelVersion>0</modelVersion>
</LW-MAP>
```

## 9. Importer algorithm (recommended)

1. Read file as UTF-8 text; drop all lines before the line starting `<?xml` (or, if none, before `<LW-MAP`). Parse with any XML parser.
2. Read `<modelVersion>` (absent → 0).
3. Collect components: iterate `<child>` elements directly under `LW-MAP` AND under every `<layer>` element (both can coexist during format transitions). Recurse into `group`/`node` children; when modelVersion >= 1 add parent x/y to nested-child x/y to get map coords (top-level and layer-level children are already map coords).
4. First pass: build every non-link component into a map keyed by `ID` string. Unknown xsi:types: import as a plain node (keeps labels visible) or skip.
5. Second pass: links. Resolve ID1/ID2 against the ID map; drop or dangle if unresolvable. Read arrowState (mask: bit1 = arrow at end1, bit2 = arrow at end2), controlCount + ctrlPoints for curves, strokeColor/strokeWidth/strokeStyle/label.
6. Read map `<fillColor>` as canvas background, `<userZoom>`/`<userOrigin>` as initial viewport.
7. Never write mapping-version comments you can't honor; if the app also EXPORTS .vue, emit the exact envelope of §1 with `@version(1.1)`, US-ASCII, and the element orders shown above — VUE's Castor loader is order-sensitive only in that it expects attributes/elements it knows; unknown extras are ignored via the `matches="*"` catch-all on LWMap only.

## MVP essentials
- Strip all comment lines before the <?xml declaration — every real .vue file is technically invalid XML at the top
- Parse <child> elements by xsi:type: 'node' and 'link' are required; treat 'group'/'text' as importable containers/labels, skip 'image' gracefully
- Node basics: ID, label (unescape %nl; and &#xa;), x, y, width, height, strokeWidth, autoSized attributes; fillColor/strokeColor/textColor/font child elements
- Shape support: rectangle, ellipse, roundRect (arcwidth/archeight, default 20/20); accept both direct <shape> and legacy <nodeShape><shape/></nodeShape> wrapper; default shape is roundRect
- Link connectivity: <ID1>/<ID2> element text = target component's ID attribute; either end may be missing (dangling); use <point1>/<point2> only for unconnected ends; recompute geometry from connected nodes
- arrowState int (0 none, 1 head, 2 tail, 3 both) and controlCount/ctrlPoint0/ctrlPoint1 for curved links (0 straight, 1 quad, 2 cubic)
- Color codec: #RRGGBB opaque, #AARRGGBB with alpha, case-insensitive, tolerate short hex like #cccc (parse whole string as one hex int; >6 digits means alpha)
- Font codec: 'Family-style-size' parsed right-to-left (family names contain spaces); style in plain|bold|italic|bolditalic with optional 'underline' suffix; default SansSerif-plain-14
- modelVersion handling: absent/0 = absolute coordinates; >=1 nested children parent-relative; >=5 children live inside <layer> elements — read children from both LW-MAP directly and from layers
- Map-level: <fillColor> as canvas background, <userZoom> and <userOrigin x y> for initial viewport; map's own x/y/width/height are informational only
- Defaults that make imports look right: text #000000, stroke #404040, node fill #C8C8FF for new nodes, strokeStyle absent = solid, dash ordinals 1-4 = dotted/dashed/dash2/dash3
