// Right-click context menus (ui-spec §2): canvas, single node, single link,
// multi-selection, group, and image-variant menus. Menu shapes only — every
// item delegates to the shared action registry.

import { ActionMap, isImageResource } from "./actions";
import { GItem } from "../core/model";
import { Editor } from "./editor";
import { MenuEntry, openRootMenu } from "./menu";
import { alignSub, arrowSub, fontSub, imageSub, lineSub, shapeSub } from "./menubar";

const sep: MenuEntry = { sep: true };

const editBlock: MenuEntry[] = [
  { id: "edit.cut" },
  { id: "edit.copy" },
  { id: "edit.paste" },
  { id: "edit.duplicate" },
  { id: "edit.delete" },
];

function resourceEntries(it: GItem): MenuEntry[] {
  const has = it.resource != null;
  const out: MenuEntry[] = [
    { id: has ? "content.replaceUrl" : "content.addUrl" },
    { id: has ? "content.replaceFile" : "content.addFile" },
  ];
  if (has) {
    out.push({ id: "content.removeResource" });
    if (isImageResource(it.resource)) out.push({ id: "content.removeKeepImage" });
  }
  return out;
}

function canvasMenu(): MenuEntry[] {
  // Paste Style omitted per spec recommendation (style paste needs a selected target)
  return [
    { id: "edit.paste" },
    sep,
    { id: "edit.selectAll" },
    { id: "view.zoomFit" },
    { id: "view.zoomActual" },
    sep,
    { id: "window.formatPalette", label: "Format Palette…" },
    { id: "window.layers", label: "Layers…" },
    { id: "window.mapInfo", label: "Map Info…" },
    { id: "window.mapBackground" },
  ];
}

function nodeMenu(editor: Editor, node: GItem): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    shapeSub(editor),
    fontSub(editor),
    sep,
    ...resourceEntries(node),
    { id: "content.notes" },
    sep,
    ...editBlock,
  ];
}

function linkMenu(editor: Editor, link: GItem): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    lineSub(editor),
    arrowSub(editor),
    sep,
    ...resourceEntries(link),
    { id: "content.notes" },
    sep,
    ...editBlock,
  ];
}

function imageNodeMenu(): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    imageSub(),
    sep,
    { id: "content.replaceFile" },
    { id: "content.replaceUrl" },
    { id: "content.removeResource" },
    { id: "content.removeKeepImage" },
    { id: "content.notes" },
    sep,
    ...editBlock,
  ];
}

function groupMenu(): MenuEntry[] {
  // minimal groups carry no notes field — Notes… omitted (see report)
  return [
    { id: "edit.ungroup" },
    sep,
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    ...editBlock,
  ];
}

function multiMenu(editor: Editor): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    shapeSub(editor),
    lineSub(editor),
    arrowSub(editor),
    fontSub(editor),
    alignSub(editor),
    sep,
    { id: "edit.group" },
    { id: "edit.ungroup" },
    sep,
    ...editBlock,
  ];
}

export function installContextMenu(canvas: HTMLElement, editor: Editor, actions: ActionMap): void {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const w = editor.screenToWorld(e.clientX, e.clientY);
    const hit = editor.contextHit(w);

    let entries: MenuEntry[];
    if (!hit) {
      entries = canvasMenu();
    } else if (editor.selection.size > 1) {
      entries = editor.selectionIsGroup() ? groupMenu() : multiMenu(editor);
    } else if (hit.kind === "node") {
      entries = isImageResource(hit.resource) ? imageNodeMenu() : nodeMenu(editor, hit);
    } else {
      entries = linkMenu(editor, hit);
    }
    openRootMenu(entries, actions, { x: e.clientX, y: e.clientY });
  });
}
