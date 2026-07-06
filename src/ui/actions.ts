// Central action registry (ui-spec §7 PR 2): one table of app actions shared by
// the menu bar, context menus, and the keyboard shortcut dispatcher, so menu
// items and shortcuts never diverge.

import { NodeShape, isImageResource } from "../core/model";
import { AlignMode, Editor, Tool } from "./editor";
import { lastCanvasContextPoint } from "./contextmenu";
import { DocManager } from "./docs";
import { promptText, openNotesEditor } from "./dialogs";
import { pickFilePath } from "./platform";
import { SHAPE_ORDER, SHAPE_LABELS, openSwatchPopup } from "./palette";
import { PanelSet } from "./panels";
import { openPreferences } from "./preferences";
import { keyLabel } from "./shortcuts";
import { printMap } from "./print";
import { GUIDE_URL, openAbout, openExternal, openShortcutTable } from "./help";

export interface AppAction {
  label: string;
  shortcut?: string; // display only; bindings live in shortcuts.ts
  enabled: () => boolean;
  run: () => void;
  checked?: () => boolean;
  tooltip?: string; // "coming soon" on wave 3/4 stubs
}

export type ActionMap = Map<string, AppAction>;

export interface FileOps {
  open(): void;
  openUrl(): void;
  save(): void;
  saveAs(): void;
  revert(): void;
  canRevert(): boolean;
  newMap(): void;
  closeMap(): void;
  exportVue(): void;
  exit(): void;
  newNodeAtCursor(): void;
  /** Recently opened/saved file paths, newest first (Tauri only; empty in a browser). */
  recentFiles(): string[];
  openRecent(index: number): void;
}

// Re-exported for menu code: "image variant" = node whose attached resource is
// an image file (the check itself lives in core/model.ts).
export { isImageResource };

export function buildActions(docs: DocManager, file: FileOps, panels: PanelSet): ActionMap {
  const ed = (): Editor => docs.activeEditor(); // every action targets the active tab
  const m: ActionMap = new Map();
  const add = (id: string, a: AppAction) => m.set(id, a);
  const stub = (id: string, label: string, shortcut?: string) =>
    add(id, { label, shortcut, enabled: () => false, run: () => {}, tooltip: "coming soon" });

  const sel = () => ed().selection.size;
  const selItems = () => ed().selectedItems();
  const hasNodesSelected = () => ed().selectedNodes().length > 0;
  const hasLinksSelected = () => ed().selectedLinks().length > 0;
  const anyResource = () => selItems().some((i) => i.resource != null);
  const single = () => (sel() === 1 ? selItems()[0] : undefined);

  // ---------- File ----------
  add("file.open", { label: "Open…", shortcut: keyLabel("mod+o"), enabled: () => true, run: file.open });
  add("file.openUrl", { label: "Open from URL…", enabled: () => true, run: file.openUrl });
  add("file.save", { label: "Save", shortcut: keyLabel("mod+s"), enabled: () => true, run: file.save });
  add("file.saveAs", { label: "Save As…", shortcut: keyLabel("mod+shift+s"), enabled: () => true, run: file.saveAs });
  add("file.revert", { label: "Revert", enabled: file.canRevert, run: file.revert });
  // spec marks New Map W3, but wave-1 reality already ships a working new-map — reality wins
  add("file.new", { label: "New Map", shortcut: keyLabel("mod+alt+n"), enabled: () => true, run: file.newMap });
  add("file.close", { label: "Close", shortcut: keyLabel("mod+w"), enabled: () => true, run: file.closeMap, tooltip: "Close the active document tab" });
  const printable = () => ed().doc.items.length > 0;
  add("file.print", { label: "Print…", shortcut: keyLabel("mod+p"), enabled: printable, run: () => printMap(ed(), "fit"), tooltip: "Print the whole map, fitted to the page" });
  add("file.printVisible", { label: "Print Visible", enabled: printable, run: () => printMap(ed(), "viewport"), tooltip: "Print the current view as-is" });
  add("file.exportPdf", { label: "Export PDF (via Print…)", enabled: printable, run: () => printMap(ed(), "fit"), tooltip: "Opens the print dialog — choose “Save as PDF” there" });
  // Recently Opened submenu entries (the File menu builds labels from the list)
  for (let i = 0; i < 8; i++) {
    add(`file.recent.${i}`, {
      label: `Recent ${i + 1}`,
      enabled: () => file.recentFiles().length > i,
      run: () => file.openRecent(i),
    });
  }
  add("file.exportVue", { label: "Export .vue…", enabled: () => true, run: file.exportVue });
  add("file.exit", { label: "Exit", shortcut: keyLabel("mod+q"), enabled: () => true, run: file.exit });

  // ---------- Edit ----------
  add("edit.undo", { label: "Undo", shortcut: keyLabel("mod+z"), enabled: () => ed().canUndo(), run: () => ed().undo() });
  add("edit.redo", { label: "Redo", shortcut: keyLabel("mod+shift+z"), enabled: () => ed().canRedo(), run: () => ed().redo() });
  add("edit.cut", { label: "Cut", shortcut: keyLabel("mod+x"), enabled: () => sel() > 0, run: () => ed().cutSelection() });
  add("edit.copy", { label: "Copy", shortcut: keyLabel("mod+c"), enabled: () => sel() > 0, run: () => ed().copySelection() });
  add("edit.paste", { label: "Paste", shortcut: keyLabel("mod+v"), enabled: () => ed().canPaste(), run: () => ed().paste() });
  add("edit.duplicate", { label: "Duplicate", shortcut: keyLabel("mod+d"), enabled: () => sel() > 0, run: () => ed().duplicateSelection() });
  add("edit.delete", { label: "Delete", shortcut: "Del", enabled: () => sel() > 0, run: () => ed().deleteSelection() });
  add("edit.rename", { label: "Rename", shortcut: "F2", enabled: () => sel() === 1, run: () => ed().renameSelection() });
  add("edit.selectAll", { label: "Select All", shortcut: keyLabel("mod+a"), enabled: () => ed().doc.items.length > 0, run: () => ed().selectAll() });
  add("edit.selectAllNodes", { label: "Select All Nodes", shortcut: keyLabel("mod+alt+a"), enabled: () => ed().doc.items.some((i) => i.kind === "node"), run: () => ed().selectAllNodes() });
  add("edit.selectAllLinks", { label: "Select All Links", shortcut: keyLabel("mod+alt+shift+a"), enabled: () => ed().doc.items.some((i) => i.kind === "link"), run: () => ed().selectAllLinks() });
  add("edit.reselect", { label: "Reselect", enabled: () => ed().canReselect(), run: () => ed().reselect() });
  add("edit.deselectAll", { label: "Deselect All", shortcut: "Esc", enabled: () => sel() > 0, run: () => ed().deselectAll() });
  add("edit.expandSelection", { label: "Expand Selection", shortcut: keyLabel("mod+shift+]"), enabled: () => sel() > 0, run: () => ed().expandSelection() });
  add("edit.shrinkSelection", { label: "Shrink Selection", shortcut: keyLabel("mod+shift+["), enabled: () => ed().canShrinkSelection(), run: () => ed().shrinkSelection() });
  add("edit.group", { label: "Group", shortcut: keyLabel("mod+g"), enabled: () => ed().canGroup(), run: () => ed().groupSelection() });
  add("edit.ungroup", { label: "Ungroup", shortcut: keyLabel("mod+shift+g"), enabled: () => ed().selectionHasGroup(), run: () => ed().ungroupSelection() });
  add("edit.preferences", {
    label: "Preferences…",
    shortcut: keyLabel("mod+,"),
    enabled: () => true,
    run: () => openPreferences(ed()),
  });
  add("edit.newNodeAtCursor", { label: "New Node", shortcut: keyLabel("mod+n"), enabled: () => true, run: file.newNodeAtCursor });

  // ---------- tools (canvas context menu, issue #9; tool keys live in editor.ts) ----------
  const toolAction = (id: string, label: string, tool: Tool, key: string) =>
    add(id, {
      label,
      shortcut: key,
      enabled: () => true,
      checked: () => ed().tool === tool,
      run: () => ed().setTool(tool),
    });
  toolAction("tool.select", "Select Mode", "select", "S");
  toolAction("tool.link", "Link Mode", "link", "L");
  toolAction("tool.combo", "Rapid Mode", "combo", "R");
  // node at the right-click point (falls back to the cursor position when
  // invoked without a preceding canvas right-click)
  add("canvas.newNodeHere", {
    label: "Add a New Node",
    shortcut: keyLabel("mod+n"),
    enabled: () => true,
    run: () => {
      const p = lastCanvasContextPoint();
      if (p) ed().createNodeAt(p.x, p.y);
      else file.newNodeAtCursor();
    },
  });

  // ---------- View ----------
  add("view.zoomIn", { label: "Zoom In", shortcut: keyLabel("mod+="), enabled: () => !ed().atMaxZoom(), run: () => ed().zoomStep(1) });
  add("view.zoomOut", { label: "Zoom Out", shortcut: keyLabel("mod+-"), enabled: () => !ed().atMinZoom(), run: () => ed().zoomStep(-1) });
  add("view.zoomFit", { label: "Zoom to Fit", shortcut: keyLabel("mod+]"), enabled: () => ed().doc.items.length > 0, run: () => ed().zoomFit() });
  add("view.zoomSelection", { label: "Zoom to Selection", shortcut: keyLabel("mod+shift+f"), enabled: () => sel() > 0, run: () => ed().zoomToSelection() });
  add("view.zoomActual", { label: "Zoom Actual (100%)", shortcut: keyLabel("mod+'"), enabled: () => Math.abs(ed().zoom - 1) > 1e-9, run: () => ed().zoomActual() });
  add("view.fullScreen", {
    label: "Toggle Full Screen",
    shortcut: "\\",
    enabled: () => true,
    checked: () => document.fullscreenElement != null,
    run: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen();
    },
  });
  add("view.globalCollapse", {
    label: "Toggle Global Collapse",
    enabled: () => ed().doc.items.some((i) => i.kind === "node"),
    checked: () => ed().allNodesCollapsed(),
    run: () => ed().setGlobalCollapse(!ed().allNodesCollapsed()),
  });
  add("view.pruning", {
    label: "Toggle Pruning",
    enabled: () => true,
    checked: () => ed().showPruning,
    run: () => ed().toggleViewFlag("showPruning"),
    tooltip: "Show/hide the effect of pruned links (display only)",
  });
  add("view.clearPruning", {
    label: "Clear All Pruning",
    enabled: () => ed().anyPruned(),
    run: () => ed().clearAllPruning(),
  });
  add("view.toggleLinks", {
    label: "Toggle Links",
    enabled: () => true,
    checked: () => ed().showLinks,
    run: () => ed().toggleViewFlag("showLinks"),
  });
  add("view.toggleLinkLabels", {
    label: "Toggle Link Labels",
    enabled: () => true,
    checked: () => ed().showLinkLabels,
    run: () => ed().toggleViewFlag("showLinkLabels"),
  });
  add("view.showAllHidden", {
    label: "Show All Hidden",
    enabled: () => ed().anyHidden(),
    run: () => ed().showAllHidden(),
  });

  // ---------- per-item hide / collapse / prune (context menus) ----------
  add("item.hide", {
    label: "Hide",
    enabled: () => sel() > 0,
    run: () => ed().hideSelection(),
    tooltip: "Hide the selection (View > Show All Hidden brings it back)",
  });
  add("item.collapse", {
    label: "Collapse",
    enabled: hasNodesSelected,
    checked: () => hasNodesSelected() && ed().selectedNodes().every((n) => n.collapsed),
    run: () => ed().toggleCollapseSelection(),
  });
  // NOTE legacy field cross-mapping (see core/model.ts pruneHiddenIds): hiding
  // the head-side chain is persisted as tailPruned, and vice versa.
  add("link.pruneHead", {
    label: "Prune Head Side",
    enabled: () => ed().canPruneSide("head"),
    checked: () => ed().isSidePruned("head"),
    run: () => ed().togglePruneSide("head"),
    tooltip: "Hide everything reachable through this link's head end",
  });
  add("link.pruneTail", {
    label: "Prune Tail Side",
    enabled: () => ed().canPruneSide("tail"),
    checked: () => ed().isSidePruned("tail"),
    run: () => ed().togglePruneSide("tail"),
    tooltip: "Hide everything reachable through this link's tail end",
  });

  // ---------- Format ----------
  add("format.copyStyle", { label: "Copy Style", shortcut: keyLabel("mod+alt+c"), enabled: () => sel() > 0, run: () => ed().copyStyle() });
  add("format.pasteStyle", { label: "Paste Style", shortcut: keyLabel("mod+alt+v"), enabled: () => ed().canPasteStyle(), run: () => ed().pasteStyle() });

  for (const s of SHAPE_ORDER) {
    add(`format.shape.${s}`, {
      label: SHAPE_LABELS[s],
      enabled: hasNodesSelected,
      checked: () => hasNodesSelected() && ed().selectedNodes().every((n) => n.shape === s),
      run: () => {
        ed().defaultShape = s as NodeShape;
        ed().applyStyleToSelection({ shape: s });
      },
    });
  }
  const lineOpts: [string, 0 | 1 | 2][] = [["Straight", 0], ["Curved", 1], ["S-Curved", 2]];
  for (const [label, count] of lineOpts) {
    add(`format.line.${count}`, {
      label,
      enabled: hasLinksSelected,
      checked: () => hasLinksSelected() && ed().selectedLinks().every((l) => l.controlCount === count),
      run: () => ed().applyStyleToSelection({ controlCount: count }),
    });
  }
  const arrowOpts: [string, number][] = [["None", 0], ["Start", 1], ["End", 2], ["Both", 3]];
  for (const [label, state] of arrowOpts) {
    add(`format.arrow.${state}`, {
      label,
      enabled: hasLinksSelected,
      checked: () => hasLinksSelected() && ed().selectedLinks().every((l) => l.arrowState === state),
      run: () => ed().applyStyleToSelection({ arrowState: state }),
    });
  }
  const fontFlag = (id: string, label: string, key: string, flag: "bold" | "italic" | "underline") =>
    add(id, {
      label,
      shortcut: keyLabel(key),
      enabled: () => sel() > 0,
      checked: () => sel() > 0 && selItems().every((it) => it.font[flag]),
      run: () => ed().toggleFontFlag(flag),
    });
  fontFlag("format.bold", "Bold", "mod+b", "bold");
  fontFlag("format.italic", "Italic", "mod+i", "italic");
  fontFlag("format.underline", "Underline", "mod+u", "underline");
  add("format.bigger", { label: "Bigger", shortcut: keyLabel("mod+shift+="), enabled: () => sel() > 0, run: () => ed().fontStep(1) });
  add("format.smaller", { label: "Smaller", shortcut: keyLabel("mod+shift+-"), enabled: () => sel() > 0, run: () => ed().fontStep(-1) });

  // image submenu: acts on selected nodes with an inline image block
  const anyImage = () => ed().imageNodes().length > 0;
  add("format.image.bigger", { label: "Bigger", enabled: anyImage, run: () => ed().imageScale(1.25) });
  add("format.image.smaller", { label: "Smaller", enabled: anyImage, run: () => ed().imageScale(0.8) });
  add("format.image.natural", {
    label: "Natural Size",
    enabled: () => ed().imageNodes().some((n) => n.image!.naturalW != null && n.image!.naturalH != null),
    run: () => ed().imageNaturalSize(),
  });
  add("format.image.hide", {
    label: "Hide Image",
    enabled: () => ed().imageNodes().some((n) => !n.image!.hidden),
    run: () => ed().setImageHidden(true),
  });
  add("format.image.show", {
    label: "Show Image",
    enabled: () => ed().imageNodes().some((n) => n.image!.hidden),
    run: () => ed().setImageHidden(false),
  });
  for (const px of [64, 128, 256, 512]) {
    add(`format.image.preset.${px}`, {
      label: `Width ${px} px`,
      enabled: anyImage,
      run: () => ed().imagePresetWidth(px),
    });
  }

  const align = (id: string, label: string, mode: AlignMode, key?: string) =>
    add(id, {
      label,
      shortcut: key ? keyLabel(key) : undefined,
      enabled: () => ed().selectedNodes().length >= 2,
      run: () => ed().alignSelection(mode),
    });
  align("format.align.top", "Top Edges", "top", "alt+arrowup");
  align("format.align.bottom", "Bottom Edges", "bottom", "alt+arrowdown");
  align("format.align.left", "Left Edges", "left", "alt+arrowleft");
  align("format.align.right", "Right Edges", "right", "alt+arrowright");
  align("format.align.rowCenter", "Center in Row", "rowCenter");
  align("format.align.colCenter", "Center in Column", "colCenter");

  // make row/column + distribute (legacy Align/Arrange extras)
  add("format.align.makeRow", { label: "Make Row", enabled: () => ed().selectedNodes().length >= 2, run: () => ed().makeRowOrColumn("row") });
  add("format.align.makeColumn", { label: "Make Column", enabled: () => ed().selectedNodes().length >= 2, run: () => ed().makeRowOrColumn("column") });
  add("format.dist.h", { label: "Distribute Horizontally", enabled: () => ed().selectedNodes().length >= 3, run: () => ed().distributeSelection("h") });
  add("format.dist.v", { label: "Distribute Vertically", enabled: () => ed().selectedNodes().length >= 3, run: () => ed().distributeSelection("v") });

  // arrange (z-order within the layer)
  const arrange = (id: string, label: string, mode: "front" | "back" | "forward" | "backward") =>
    add(id, { label, enabled: () => sel() > 0, run: () => ed().arrangeZ(mode) });
  arrange("format.arrange.front", "Bring to Front", "front");
  arrange("format.arrange.forward", "Bring Forward", "forward");
  arrange("format.arrange.backward", "Send Backward", "backward");
  arrange("format.arrange.back", "Send to Back", "back");

  // ---------- Content ----------
  const setUrl = async (title: string) => {
    const first = selItems()[0];
    if (!first) return;
    const url = await promptText({ title, label: "URL", initial: first.resource?.spec ?? "", placeholder: "https://…" });
    if (url == null || !url.trim()) return;
    ed().setResourceOnSelection({ spec: url.trim(), title: null, properties: [] });
  };
  const setFile = async () => {
    const path = await pickFilePath();
    if (!path) return;
    ed().setResourceOnSelection({ spec: path, title: null, properties: [] });
  };
  add("content.addUrl", { label: "Add URL…", enabled: () => sel() > 0 && !anyResource(), run: () => void setUrl("Add URL") });
  add("content.replaceUrl", { label: "Replace URL…", enabled: anyResource, run: () => void setUrl("Replace URL") });
  add("content.addFile", { label: "Add File…", enabled: () => sel() > 0 && !anyResource(), run: () => void setFile() });
  add("content.replaceFile", { label: "Replace File…", enabled: anyResource, run: () => void setFile() });
  add("content.removeResource", {
    label: "Remove Resource",
    enabled: anyResource,
    run: () => {
      const n = selItems().filter((i) => i.resource).length;
      if (window.confirm(`Remove the attached resource from ${n} item${n === 1 ? "" : "s"}?`))
        ed().setResourceOnSelection(null);
    },
  });
  stub("content.removeKeepImage", "Remove Resource, Keep Image");
  add("content.notes", {
    label: "Notes…",
    enabled: () => sel() === 1,
    run: () => {
      const it = single();
      if (!it) return;
      const name = it.label.trim() || (it.kind === "node" ? "node" : "link");
      openNotesEditor({
        title: `Notes — ${name}`,
        initial: it.notes,
        onSave: (text) => ed().setNotes(it.id, text),
      });
    },
  });

  // ---------- Window ----------
  const panelAction = (id: string, label: string, panel: { isOpen(): boolean; toggle(): void }, key: string) =>
    add(id, {
      label,
      shortcut: keyLabel(key),
      enabled: () => true,
      checked: () => panel.isOpen(),
      run: () => panel.toggle(),
    });
  panelAction("window.formatPalette", "Format Palette", panels.palette, "mod+1");
  panelAction("window.infoDock", "Info", panels.info, "mod+2");
  stub("window.contentDock", "Content Dock", keyLabel("mod+3")); // resources/datasets backends don't exist yet
  panelAction("window.layers", "Layers", panels.layers, "mod+5");
  panelAction("window.mapInfo", "Map Info", panels.mapInfo, "mod+6");
  panelAction("window.outline", "Outline", panels.outline, "mod+7");
  panelAction("window.panner", "Panner", panels.panner, "mod+8");
  panelAction("window.metaSearch", "Search", panels.search, "mod+9");
  // permanently N/A: the full-screen toolbar was an artifact of legacy
  // presentation mode, which grue dropped — kept visible so the menu shape
  // matches the spec, but it will never be wired up
  add("window.fsToolbar", {
    label: "Full Screen Toolbar",
    enabled: () => false,
    run: () => {},
    tooltip: "not applicable — legacy presentation-mode feature, dropped in grue",
  });
  add("window.gather", { label: "Gather Windows", enabled: () => true, run: () => panels.gather() });
  add("window.mapBackground", {
    label: "Map Background Color…",
    enabled: () => true,
    run: () =>
      openSwatchPopup({ x: innerWidth / 2 - 90, y: 120 }, (c) => ed().setBackground(c ?? "#ffffff")),
  });

  // open-document list (Window menu bottom section; labels come from the menu)
  for (let i = 0; i < 20; i++) {
    add(`window.doc.${i}`, {
      label: `Document ${i + 1}`,
      enabled: () => docs.count() > i,
      checked: () => docs.activeIndex() === i,
      run: () => docs.activate(i),
    });
  }
  add("window.nextDoc", {
    label: "Next Document",
    shortcut: keyLabel("mod+tab"),
    enabled: () => docs.count() > 1,
    run: () => docs.cycle(1),
  });
  add("window.prevDoc", {
    label: "Previous Document",
    shortcut: keyLabel("mod+shift+tab"),
    enabled: () => docs.count() > 1,
    run: () => docs.cycle(-1),
  });

  // ---------- Help (wave 4) ----------
  add("help.about", { label: "About grue", enabled: () => true, run: openAbout });
  add("help.guide", {
    label: "User Guide",
    enabled: () => true,
    run: () => openExternal(GUIDE_URL),
    tooltip: "Opens the README on GitHub",
  });
  stub("help.feedback", "Feedback");
  add("help.shortcuts", { label: "Keyboard Shortcuts…", enabled: () => true, run: () => openShortcutTable(m) });
  add("help.showLog", {
    label: "Show Log",
    enabled: () => true,
    checked: () => panels.log.isOpen(),
    run: () => panels.log.toggle(),
  });

  // ---------- keyboard-only (no menu entry) ----------
  const jump = (id: string, dir: "up" | "down" | "left" | "right") =>
    add(id, {
      label: `Jump to Linked (${dir})`,
      enabled: () => ed().selectedNodes().length === 1,
      run: () => ed().jumpToLinked(dir),
    });
  jump("nav.jumpUp", "up");
  jump("nav.jumpDown", "down");
  jump("nav.jumpLeft", "left");
  jump("nav.jumpRight", "right");

  return m;
}
