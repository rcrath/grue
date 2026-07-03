// HTML/DOM top menu bar (ui-spec §1). One root button per menu; dropdowns are
// rebuilt on every open so enabled/checked state is always current.

import { ActionMap } from "./actions";
import { MenuEntry, anyMenuOpen, closeAllMenus, openRootMenu } from "./menu";
import { SHAPE_ORDER } from "./palette";
import { Editor } from "./editor";

const sep: MenuEntry = { sep: true };

function shapeSub(editor: Editor): MenuEntry {
  return {
    label: "Shape",
    sub: SHAPE_ORDER.map((s) => ({ id: `format.shape.${s}` })),
    enabled: () => editor.selectedNodes().length > 0,
  };
}

function lineSub(editor: Editor): MenuEntry {
  return {
    label: "Line Style",
    sub: [{ id: "format.line.0" }, { id: "format.line.1" }, { id: "format.line.2" }],
    enabled: () => editor.selectedLinks().length > 0,
  };
}

function arrowSub(editor: Editor): MenuEntry {
  return {
    label: "Arrow",
    sub: [{ id: "format.arrow.0" }, { id: "format.arrow.1" }, { id: "format.arrow.2" }, { id: "format.arrow.3" }],
    enabled: () => editor.selectedLinks().length > 0,
  };
}

function fontSub(editor: Editor): MenuEntry {
  return {
    label: "Font",
    sub: [
      { id: "format.bold" },
      { id: "format.italic" },
      { id: "format.underline" },
      sep,
      { id: "format.bigger" },
      { id: "format.smaller" },
    ],
    enabled: () => editor.selection.size > 0,
  };
}

function imageSub(): MenuEntry {
  return {
    label: "Image",
    sub: [
      { id: "format.image.bigger" },
      { id: "format.image.smaller" },
      { id: "format.image.natural" },
      sep,
      { id: "format.image.hide" },
      { id: "format.image.show" },
    ],
    enabled: () => false,
    tooltip: "coming soon",
  };
}

function alignSub(editor: Editor): MenuEntry {
  return {
    label: "Align",
    sub: [
      { id: "format.align.top" },
      { id: "format.align.bottom" },
      { id: "format.align.left" },
      { id: "format.align.right" },
      sep,
      { id: "format.align.rowCenter" },
      { id: "format.align.colCenter" },
    ],
    enabled: () => editor.selectedNodes().length >= 2,
  };
}

export { shapeSub, lineSub, arrowSub, fontSub, imageSub, alignSub };

export function installMenuBar(container: HTMLElement, actions: ActionMap, editor: Editor): void {
  const menus: { title: string; entries: () => MenuEntry[] }[] = [
    {
      title: "File",
      entries: () => [
        { id: "file.open" },
        { id: "file.openUrl" },
        sep,
        { id: "file.save" },
        { id: "file.saveAs" },
        { id: "file.revert" },
        sep,
        { id: "file.new" },
        { id: "file.close" },
        sep,
        { id: "file.print" },
        { id: "file.printVisible" },
        { id: "file.exportPdf" },
        { id: "file.exportVue" },
        { id: "file.recent" },
        sep,
        { id: "file.exit" },
      ],
    },
    {
      title: "Edit",
      entries: () => [
        { id: "edit.undo" },
        { id: "edit.redo" },
        sep,
        { id: "edit.cut" },
        { id: "edit.copy" },
        { id: "edit.paste" },
        { id: "edit.duplicate" },
        { id: "edit.delete" },
        sep,
        { id: "edit.rename" },
        sep,
        { id: "edit.selectAll" },
        { id: "edit.selectAllNodes" },
        { id: "edit.selectAllLinks" },
        { id: "edit.reselect" },
        { id: "edit.deselectAll" },
        { id: "edit.expandSelection" },
        { id: "edit.shrinkSelection" },
        sep,
        { id: "edit.group" },
        { id: "edit.ungroup" },
        sep,
        { id: "edit.preferences" },
      ],
    },
    {
      title: "View",
      entries: () => [
        { id: "view.zoomIn" },
        { id: "view.zoomOut" },
        { id: "view.zoomFit" },
        { id: "view.zoomSelection" },
        { id: "view.zoomActual" },
        sep,
        { id: "view.fullScreen" },
        sep,
        { id: "view.globalCollapse" },
        { id: "view.pruning" },
        { id: "view.clearPruning" },
        { id: "view.toggleLinks" },
        { id: "view.toggleLinkLabels" },
      ],
    },
    {
      title: "Format",
      entries: () => [
        { id: "format.copyStyle" },
        { id: "format.pasteStyle" },
        sep,
        shapeSub(editor),
        lineSub(editor),
        arrowSub(editor),
        fontSub(editor),
        { id: "format.bold" },
        { id: "format.italic" },
        { id: "format.underline" },
        { id: "format.bigger" },
        { id: "format.smaller" },
        sep,
        imageSub(),
        sep,
        alignSub(editor),
        sep,
        { id: "edit.group" },
        { id: "edit.ungroup" },
      ],
    },
    {
      title: "Content",
      entries: () => [
        { id: "content.addUrl" },
        { id: "content.replaceUrl" },
        { id: "content.addFile" },
        { id: "content.replaceFile" },
        sep,
        { id: "content.notes" },
        sep,
        { id: "content.removeResource" },
        { id: "content.removeKeepImage" },
      ],
    },
    {
      title: "Window",
      entries: () => [
        { id: "window.formatPalette" },
        { id: "window.infoDock" },
        { id: "window.contentDock" },
        { id: "window.layers" },
        { id: "window.mapInfo" },
        { id: "window.outline" },
        { id: "window.panner" },
        { id: "window.metaSearch" },
        { id: "window.fsToolbar" },
        sep,
        { id: "window.gather" },
      ],
    },
    {
      title: "Help",
      entries: () => [
        { id: "help.about" },
        { id: "help.guide" },
        { id: "help.feedback" },
        sep,
        { id: "help.shortcuts" },
        { id: "help.showLog" },
      ],
    },
  ];

  const bar = document.createElement("div");
  bar.className = "menu-bar";
  container.appendChild(bar);

  const buttons: HTMLButtonElement[] = [];
  let openIndex = -1;

  const openAt = (i: number) => {
    openIndex = i;
    buttons.forEach((b, j) => b.classList.toggle("open", j === i));
    openRootMenu(menus[i].entries(), actions, buttons[i].getBoundingClientRect(), {
      onClose: () => {
        if (openIndex === i) {
          openIndex = -1;
          buttons[i].classList.remove("open");
        }
      },
      onNavSide: (dir) => openAt((i + dir + menus.length) % menus.length),
    });
  };

  menus.forEach((menu, i) => {
    const b = document.createElement("button");
    b.textContent = menu.title;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (openIndex === i) closeAllMenus();
      else openAt(i);
    });
    b.addEventListener("mouseenter", () => {
      if (anyMenuOpen() && openIndex !== i && openIndex >= 0) openAt(i);
    });
    buttons.push(b);
    bar.appendChild(b);
  });
}
