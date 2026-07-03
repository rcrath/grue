// Shared dropdown/popup machinery for the HTML menu bar and right-click context
// menus (ui-spec §1 tech decision: DOM menus, no native menu API).

import type { ActionMap } from "./actions";

export type MenuEntry =
  | { id: string; label?: string } // action item; label overrides the action's label
  | { sep: true }
  | { label: string; sub: MenuEntry[]; enabled?: () => boolean; tooltip?: string };

interface PopupLevel {
  el: HTMLElement;
  items: HTMLElement[]; // actionable (non-separator) item elements
  index: number; // keyboard highlight, -1 = none
}

let levels: PopupLevel[] = [];
let closeCallback: (() => void) | null = null;
let sideNav: ((dir: -1 | 1) => void) | null = null;
let listenersOn = false;

export function anyMenuOpen(): boolean {
  return levels.length > 0;
}

export function closeAllMenus(): void {
  for (const l of levels) l.el.remove();
  levels = [];
  sideNav = null;
  removeGlobalListeners();
  const cb = closeCallback;
  closeCallback = null;
  cb?.();
}

function closeDeeperThan(depth: number): void {
  while (levels.length > depth) levels.pop()!.el.remove();
}

/** Open a root popup. `at` is a screen point (context menu) or an anchor rect
 *  (menu bar dropdown, opens below). */
export function openRootMenu(
  entries: MenuEntry[],
  actions: ActionMap,
  at: { x: number; y: number } | DOMRect,
  opts: { onClose?: () => void; onNavSide?: (dir: -1 | 1) => void } = {},
): void {
  closeAllMenus();
  closeCallback = opts.onClose ?? null;
  sideNav = opts.onNavSide ?? null;
  const pos = at instanceof DOMRect ? { x: at.left, y: at.bottom } : at;
  openPopup(entries, actions, pos, 0);
  addGlobalListeners();
}

function openPopup(entries: MenuEntry[], actions: ActionMap, pos: { x: number; y: number }, depth: number): void {
  closeDeeperThan(depth);
  const pop = document.createElement("div");
  pop.className = "menu-pop";
  const level: PopupLevel = { el: pop, items: [], index: -1 };

  for (const entry of entries) {
    if ("sep" in entry) {
      const sep = document.createElement("div");
      sep.className = "menu-sep";
      pop.appendChild(sep);
      continue;
    }
    const item = document.createElement("div");
    item.className = "menu-item";

    const check = document.createElement("span");
    check.className = "menu-check";
    const label = document.createElement("span");
    label.className = "menu-label";
    const hint = document.createElement("span");
    hint.className = "menu-hint";
    item.append(check, label, hint);

    if ("sub" in entry) {
      label.textContent = entry.label;
      hint.textContent = "▸";
      const enabled = entry.enabled ? entry.enabled() : true;
      if (!enabled) item.classList.add("disabled");
      if (entry.tooltip) item.title = entry.tooltip;
      const openSub = () => {
        if (!enabled) return;
        const r = item.getBoundingClientRect();
        openPopup(entry.sub, actions, { x: r.right - 2, y: r.top - 4 }, depth + 1);
      };
      item.addEventListener("mouseenter", () => {
        highlight(level, level.items.indexOf(item));
        openSub();
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        openSub();
      });
      (item as HTMLElement & { _openSub?: () => void })._openSub = openSub;
    } else {
      const a = actions.get(entry.id);
      label.textContent = entry.label ?? a?.label ?? entry.id;
      if (a?.shortcut) hint.textContent = a.shortcut;
      if (a?.checked?.()) check.textContent = "✓";
      const enabled = a ? a.enabled() : false;
      if (!enabled) item.classList.add("disabled");
      if (a?.tooltip) item.title = a.tooltip;
      item.addEventListener("mouseenter", () => {
        highlight(level, level.items.indexOf(item));
        closeDeeperThan(depth + 1); // hovering a plain item closes a sibling submenu
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!enabled || !a) return;
        closeAllMenus();
        a.run();
      });
    }
    level.items.push(item);
    pop.appendChild(item);
  }

  document.body.appendChild(pop);
  // clamp to the viewport
  const r = pop.getBoundingClientRect();
  let x = pos.x, y = pos.y;
  if (x + r.width > innerWidth - 4) x = Math.max(4, innerWidth - r.width - 4);
  if (y + r.height > innerHeight - 4) y = Math.max(4, innerHeight - r.height - 4);
  pop.style.left = `${x}px`;
  pop.style.top = `${y}px`;
  levels.push(level);
}

function highlight(level: PopupLevel, index: number): void {
  level.index = index;
  level.items.forEach((it, i) => it.classList.toggle("hover", i === index));
}

// ---- global listeners (outside-click, keyboard nav) ----

function onPointerDown(e: PointerEvent): void {
  const t = e.target as HTMLElement;
  if (levels.some((l) => l.el.contains(t))) return;
  if (t.closest?.(".menu-bar")) return; // bar buttons manage their own toggling
  closeAllMenus();
}

function onKeyDown(e: KeyboardEvent): void {
  if (!levels.length) return;
  const top = levels[levels.length - 1];
  const move = (dir: 1 | -1) => {
    if (!top.items.length) return;
    let i = top.index;
    for (let n = 0; n < top.items.length; n++) {
      i = (i + dir + top.items.length) % top.items.length;
      if (!top.items[i].classList.contains("disabled")) break;
    }
    highlight(top, i);
  };
  switch (e.key) {
    case "Escape":
      if (levels.length > 1) closeDeeperThan(levels.length - 1);
      else closeAllMenus();
      break;
    case "ArrowDown":
      move(1);
      break;
    case "ArrowUp":
      move(-1);
      break;
    case "Enter":
    case " ": {
      const it = top.items[top.index];
      if (it) it.click();
      break;
    }
    case "ArrowRight": {
      const it = top.items[top.index] as (HTMLElement & { _openSub?: () => void }) | undefined;
      if (it?._openSub) {
        it._openSub();
        const sub = levels[levels.length - 1];
        if (sub !== top) highlight(sub, 0);
      } else if (levels.length === 1 && sideNav) sideNav(1);
      break;
    }
    case "ArrowLeft":
      if (levels.length > 1) closeDeeperThan(levels.length - 1);
      else if (sideNav) sideNav(-1);
      break;
    default:
      return; // let other keys pass
  }
  e.preventDefault();
  e.stopPropagation();
}

function addGlobalListeners(): void {
  if (listenersOn) return;
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  listenersOn = true;
}

function removeGlobalListeners(): void {
  if (!listenersOn) return;
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("keydown", onKeyDown, true);
  listenersOn = false;
}
