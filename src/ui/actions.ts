// Central action registry (ui-spec §7 PR 2): one table of app actions shared by
// the menu bar, context menus, and the keyboard shortcut dispatcher, so menu
// items and shortcuts never diverge.

import { GResource, NodeShape } from "../core/model";
import { AlignMode, Editor } from "./editor";
import { promptText, openNotesEditor } from "./dialogs";
import { pickFilePath } from "./platform";
import { FormatPalette, SHAPE_ORDER, SHAPE_LABELS } from "./palette";
import { keyLabel } from "./shortcuts";

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
  exportVue(): void;
  exit(): void;
  newNodeAtCursor(): void;
}

/** True when a resource points at an image file (spec-open-question reading:
 *  "image variant" = node whose attached resource is an image file). */
export function isImageResource(r: GResource | null): boolean {
  if (!r) return false;
  const spec = r.spec.split(/[?#]/)[0];
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(spec);
}

export function buildActions(editor: Editor, file: FileOps, palette: FormatPalette): ActionMap {
  const m: ActionMap = new Map();
  const add = (id: string, a: AppAction) => m.set(id, a);
  const stub = (id: string, label: string, shortcut?: string) =>
    add(id, { label, shortcut, enabled: () => false, run: () => {}, tooltip: "coming soon" });

  const sel = () => editor.selection.size;
  const selItems = () => editor.selectedItems();
  const hasNodesSelected = () => editor.selectedNodes().length > 0;
  const hasLinksSelected = () => editor.selectedLinks().length > 0;
  const anyResource = () => selItems().some((i) => i.resource != null);
  const single = () => (sel() === 1 ? selItems()[0] : undefined);

  // ---------- File ----------
  add("file.open", { label: "Open…", shortcut: keyLabel("mod+o"), enabled: () => true, run: file.open });
  add("file.openUrl", { label: "Open from URL…", enabled: () => true, run: file.openUrl });
  add("file.save", { label: "Save", shortcut: keyLabel("mod+s"), enabled: () => true, run: file.save });
  add("file.saveAs", { label: "Save As…", shortcut: keyLabel("mod+shift+s"), enabled: () => true, run: file.saveAs });
  add("file.revert", { label: "Revert", enabled: file.canRevert, run: file.revert });
  // spec marks New Map W3, but wave-1 reality already ships a working new-map — reality wins
  add("file.new", { label: "New Map", enabled: () => true, run: file.newMap });
  stub("file.close", "Close Map", keyLabel("mod+w"));
  stub("file.print", "Print…", keyLabel("mod+p"));
  stub("file.printVisible", "Print Visible");
  stub("file.exportPdf", "Export PDF…");
  stub("file.recent", "Recently Opened");
  add("file.exportVue", { label: "Export .vue…", enabled: () => true, run: file.exportVue });
  add("file.exit", { label: "Exit", shortcut: keyLabel("mod+q"), enabled: () => true, run: file.exit });

  // ---------- Edit ----------
  add("edit.undo", { label: "Undo", shortcut: keyLabel("mod+z"), enabled: () => editor.canUndo(), run: () => editor.undo() });
  add("edit.redo", { label: "Redo", shortcut: keyLabel("mod+shift+z"), enabled: () => editor.canRedo(), run: () => editor.redo() });
  add("edit.cut", { label: "Cut", shortcut: keyLabel("mod+x"), enabled: () => sel() > 0, run: () => editor.cutSelection() });
  add("edit.copy", { label: "Copy", shortcut: keyLabel("mod+c"), enabled: () => sel() > 0, run: () => editor.copySelection() });
  add("edit.paste", { label: "Paste", shortcut: keyLabel("mod+v"), enabled: () => editor.canPaste(), run: () => editor.paste() });
  add("edit.duplicate", { label: "Duplicate", shortcut: keyLabel("mod+d"), enabled: () => sel() > 0, run: () => editor.duplicateSelection() });
  add("edit.delete", { label: "Delete", shortcut: "Del", enabled: () => sel() > 0, run: () => editor.deleteSelection() });
  add("edit.rename", { label: "Rename", shortcut: "F2", enabled: () => sel() === 1, run: () => editor.renameSelection() });
  add("edit.selectAll", { label: "Select All", shortcut: keyLabel("mod+a"), enabled: () => editor.doc.items.length > 0, run: () => editor.selectAll() });
  add("edit.selectAllNodes", { label: "Select All Nodes", shortcut: keyLabel("mod+alt+a"), enabled: () => editor.doc.items.some((i) => i.kind === "node"), run: () => editor.selectAllNodes() });
  add("edit.selectAllLinks", { label: "Select All Links", shortcut: keyLabel("mod+alt+shift+a"), enabled: () => editor.doc.items.some((i) => i.kind === "link"), run: () => editor.selectAllLinks() });
  add("edit.reselect", { label: "Reselect", enabled: () => editor.canReselect(), run: () => editor.reselect() });
  add("edit.deselectAll", { label: "Deselect All", shortcut: "Esc", enabled: () => sel() > 0, run: () => editor.deselectAll() });
  add("edit.expandSelection", { label: "Expand Selection", shortcut: keyLabel("mod+shift+]"), enabled: () => sel() > 0, run: () => editor.expandSelection() });
  add("edit.shrinkSelection", { label: "Shrink Selection", shortcut: keyLabel("mod+shift+["), enabled: () => editor.canShrinkSelection(), run: () => editor.shrinkSelection() });
  add("edit.group", { label: "Group", shortcut: keyLabel("mod+g"), enabled: () => editor.canGroup(), run: () => editor.groupSelection() });
  add("edit.ungroup", { label: "Ungroup", shortcut: keyLabel("mod+shift+g"), enabled: () => editor.selectionHasGroup(), run: () => editor.ungroupSelection() });
  stub("edit.preferences", "Preferences…", keyLabel("mod+,"));
  add("edit.newNodeAtCursor", { label: "New Node", shortcut: keyLabel("mod+n"), enabled: () => true, run: file.newNodeAtCursor });

  // ---------- View ----------
  add("view.zoomIn", { label: "Zoom In", shortcut: keyLabel("mod+="), enabled: () => !editor.atMaxZoom(), run: () => editor.zoomStep(1) });
  add("view.zoomOut", { label: "Zoom Out", shortcut: keyLabel("mod+-"), enabled: () => !editor.atMinZoom(), run: () => editor.zoomStep(-1) });
  add("view.zoomFit", { label: "Zoom to Fit", shortcut: keyLabel("mod+]"), enabled: () => editor.doc.items.length > 0, run: () => editor.zoomFit() });
  add("view.zoomSelection", { label: "Zoom to Selection", shortcut: keyLabel("mod+shift+f"), enabled: () => sel() > 0, run: () => editor.zoomToSelection() });
  add("view.zoomActual", { label: "Zoom Actual (100%)", shortcut: keyLabel("mod+'"), enabled: () => Math.abs(editor.zoom - 1) > 1e-9, run: () => editor.zoomActual() });
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
  stub("view.globalCollapse", "Toggle Global Collapse");
  stub("view.pruning", "Toggle Pruning");
  stub("view.clearPruning", "Clear All Pruning");
  stub("view.toggleLinks", "Toggle Links");
  stub("view.toggleLinkLabels", "Toggle Link Labels");

  // ---------- Format ----------
  add("format.copyStyle", { label: "Copy Style", shortcut: keyLabel("mod+alt+c"), enabled: () => sel() > 0, run: () => editor.copyStyle() });
  add("format.pasteStyle", { label: "Paste Style", shortcut: keyLabel("mod+alt+v"), enabled: () => editor.canPasteStyle(), run: () => editor.pasteStyle() });

  for (const s of SHAPE_ORDER) {
    add(`format.shape.${s}`, {
      label: SHAPE_LABELS[s],
      enabled: hasNodesSelected,
      checked: () => hasNodesSelected() && editor.selectedNodes().every((n) => n.shape === s),
      run: () => {
        editor.defaultShape = s as NodeShape;
        editor.applyStyleToSelection({ shape: s });
      },
    });
  }
  const lineOpts: [string, 0 | 1 | 2][] = [["Straight", 0], ["Curved", 1], ["S-Curved", 2]];
  for (const [label, count] of lineOpts) {
    add(`format.line.${count}`, {
      label,
      enabled: hasLinksSelected,
      checked: () => hasLinksSelected() && editor.selectedLinks().every((l) => l.controlCount === count),
      run: () => editor.applyStyleToSelection({ controlCount: count }),
    });
  }
  const arrowOpts: [string, number][] = [["None", 0], ["Start", 1], ["End", 2], ["Both", 3]];
  for (const [label, state] of arrowOpts) {
    add(`format.arrow.${state}`, {
      label,
      enabled: hasLinksSelected,
      checked: () => hasLinksSelected() && editor.selectedLinks().every((l) => l.arrowState === state),
      run: () => editor.applyStyleToSelection({ arrowState: state }),
    });
  }
  const fontFlag = (id: string, label: string, key: string, flag: "bold" | "italic" | "underline") =>
    add(id, {
      label,
      shortcut: keyLabel(key),
      enabled: () => sel() > 0,
      checked: () => sel() > 0 && selItems().every((it) => it.font[flag]),
      run: () => editor.toggleFontFlag(flag),
    });
  fontFlag("format.bold", "Bold", "mod+b", "bold");
  fontFlag("format.italic", "Italic", "mod+i", "italic");
  fontFlag("format.underline", "Underline", "mod+u", "underline");
  add("format.bigger", { label: "Bigger", shortcut: keyLabel("mod+shift+="), enabled: () => sel() > 0, run: () => editor.fontStep(1) });
  add("format.smaller", { label: "Smaller", shortcut: keyLabel("mod+shift+-"), enabled: () => sel() > 0, run: () => editor.fontStep(-1) });

  // image submenu: no image rendering exists in the wave-1 model, so these are
  // stubs until thumbnails land (wave 3/4) — see report
  stub("format.image.bigger", "Bigger");
  stub("format.image.smaller", "Smaller");
  stub("format.image.natural", "Natural Size");
  stub("format.image.hide", "Hide Image");
  stub("format.image.show", "Show Image");

  const align = (id: string, label: string, mode: AlignMode, key?: string) =>
    add(id, {
      label,
      shortcut: key ? keyLabel(key) : undefined,
      enabled: () => editor.selectedNodes().length >= 2,
      run: () => editor.alignSelection(mode),
    });
  align("format.align.top", "Top Edges", "top", "alt+arrowup");
  align("format.align.bottom", "Bottom Edges", "bottom", "alt+arrowdown");
  align("format.align.left", "Left Edges", "left", "alt+arrowleft");
  align("format.align.right", "Right Edges", "right", "alt+arrowright");
  align("format.align.rowCenter", "Center in Row", "rowCenter");
  align("format.align.colCenter", "Center in Column", "colCenter");

  // ---------- Content ----------
  const setUrl = async (title: string) => {
    const first = selItems()[0];
    if (!first) return;
    const url = await promptText({ title, label: "URL", initial: first.resource?.spec ?? "", placeholder: "https://…" });
    if (url == null || !url.trim()) return;
    editor.setResourceOnSelection({ spec: url.trim(), title: null, properties: [] });
  };
  const setFile = async () => {
    const path = await pickFilePath();
    if (!path) return;
    editor.setResourceOnSelection({ spec: path, title: null, properties: [] });
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
        editor.setResourceOnSelection(null);
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
        onSave: (text) => editor.setNotes(it.id, text),
      });
    },
  });

  // ---------- Window ----------
  add("window.formatPalette", {
    label: "Format Palette",
    shortcut: keyLabel("mod+1"),
    enabled: () => true,
    checked: () => palette.isOpen(),
    run: () => palette.toggle(),
  });
  stub("window.infoDock", "Info Dock", keyLabel("mod+2"));
  stub("window.contentDock", "Content Dock", keyLabel("mod+3"));
  stub("window.layers", "Layers", keyLabel("mod+5"));
  stub("window.mapInfo", "Map Info", keyLabel("mod+6"));
  stub("window.outline", "Outline", keyLabel("mod+7"));
  stub("window.panner", "Panner", keyLabel("mod+8"));
  stub("window.metaSearch", "Metadata Search", keyLabel("mod+9"));
  stub("window.fsToolbar", "Full Screen Toolbar", keyLabel("mod+0"));
  stub("window.gather", "Gather Windows");
  stub("window.mapBackground", "Map Background Color…");

  // ---------- Help (entire menu is W4) ----------
  stub("help.about", "About");
  stub("help.guide", "User Guide");
  stub("help.feedback", "Feedback");
  stub("help.shortcuts", "Keyboard Shortcuts…");
  stub("help.showLog", "Show Log");

  // ---------- keyboard-only (no menu entry) ----------
  const jump = (id: string, dir: "up" | "down" | "left" | "right") =>
    add(id, {
      label: `Jump to Linked (${dir})`,
      enabled: () => editor.selectedNodes().length === 1,
      run: () => editor.jumpToLinked(dir),
    });
  jump("nav.jumpUp", "up");
  jump("nav.jumpDown", "down");
  jump("nav.jumpLeft", "left");
  jump("nav.jumpRight", "right");

  return m;
}
