// Right-click context menus (ui-spec §2): canvas, single node, single link,
// multi-selection, group, and image-variant menus. Menu shapes only — every
// item delegates to the shared action registry.

import type { ActionMap } from "./actions";
import { GItem, GLink, getNode, isImageResource } from "../core/model";
import { Editor } from "./editor";
import { MenuEntry, openRootMenu } from "./menu";
import { alignSub, arrangeSub, arrowSub, fontSub, imageSub, lineSub, shapeSub } from "./menubar";

/** World coordinates of the most recent canvas right-click. The canvas menu's
 *  "Add a New Node" action reads this so the node lands exactly where the user
 *  right-clicked, not wherever the mouse ended up over the menu. */
let contextWorld: { x: number; y: number } | null = null;

export function lastCanvasContextPoint(): { x: number; y: number } | null {
  return contextWorld;
}

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
    // tool/mode block (issue #9): quick mode switching + node creation at the click point
    { id: "tool.select" },
    { id: "canvas.newNodeHere" },
    { id: "tool.link" },
    { id: "tool.combo" },
    sep,
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

function nodeMenu(ed: () => Editor, node: GItem): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    shapeSub(ed),
    fontSub(ed),
    arrangeSub(ed),
    sep,
    ...resourceEntries(node),
    { id: "content.notes" },
    sep,
    { id: "item.collapse" },
    { id: "item.hide" },
    sep,
    ...editBlock,
  ];
}

/** Per-endpoint prune commands, labeled with the endpoint node's name when it
 *  has one. "Prune X Side" hides everything reachable through that endpoint
 *  (legacy LWLink chain semantics — see core/model.ts pruneHiddenIds). */
function pruneEntries(editor: Editor, link: GLink): MenuEntry[] {
  const name = (id: string | null, fallback: string) => {
    const label = getNode(editor.doc, id)?.label.trim();
    if (!label) return fallback;
    return label.length > 14 ? label.slice(0, 13) + "…" : label;
  };
  return [
    { id: "link.pruneHead", label: `Prune ${name(link.head.node, "Head")} Side` },
    { id: "link.pruneTail", label: `Prune ${name(link.tail.node, "Tail")} Side` },
  ];
}

function linkMenu(ed: () => Editor, link: GLink): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    lineSub(ed),
    arrowSub(ed),
    arrangeSub(ed),
    sep,
    ...resourceEntries(link),
    { id: "content.notes" },
    sep,
    ...pruneEntries(ed(), link),
    { id: "item.hide" },
    sep,
    ...editBlock,
  ];
}

function imageNodeMenu(ed: () => Editor): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    imageSub(ed),
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

function multiMenu(ed: () => Editor): MenuEntry[] {
  return [
    { id: "format.copyStyle" },
    { id: "format.pasteStyle" },
    sep,
    shapeSub(ed),
    lineSub(ed),
    arrowSub(ed),
    fontSub(ed),
    alignSub(ed),
    arrangeSub(ed),
    sep,
    { id: "edit.group" },
    { id: "edit.ungroup" },
    sep,
    { id: "item.hide" },
    sep,
    ...editBlock,
  ];
}

export function installContextMenu(canvas: HTMLElement, ed: () => Editor, actions: ActionMap): void {
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const editor = ed(); // active document's editor
    const w = editor.screenToWorld(e.clientX, e.clientY);
    contextWorld = w; // remembered for canvas.newNodeHere
    const hit = editor.contextHit(w);

    let entries: MenuEntry[];
    if (!hit) {
      entries = canvasMenu();
    } else if (editor.selection.size > 1) {
      entries = editor.selectionIsGroup() ? groupMenu() : multiMenu(ed);
    } else if (hit.kind === "node") {
      entries =
        hit.image != null || isImageResource(hit.resource)
          ? imageNodeMenu(ed)
          : nodeMenu(ed, hit);
    } else {
      entries = linkMenu(ed, hit);
    }
    openRootMenu(entries, actions, { x: e.clientX, y: e.clientY });
  });
}
