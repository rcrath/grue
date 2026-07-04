// Help menu (wave 4): About dialog, User Guide link, and the keyboard-shortcut
// table. The table is rendered live from BINDINGS in shortcuts.ts (single
// source of truth) plus the action labels — never duplicated by hand.

import type { ActionMap } from "./actions";
import { isTauri } from "./platform";
import { BINDINGS, keyLabel } from "./shortcuts";

export const REPO_URL = "https://github.com/rcrath/grue";
export const GUIDE_URL = "https://github.com/rcrath/grue#readme";

/** External link: system browser via the opener plugin on desktop,
 *  window.open in the browser-dev fallback. */
export function openExternal(url: string): void {
  if (isTauri()) {
    void import("@tauri-apps/plugin-opener").then((m) => m.openUrl(url));
  } else {
    window.open(url, "_blank", "noreferrer");
  }
}

function baseDialog(title: string, wide = false): { overlay: HTMLElement; dlg: HTMLElement } {
  document.querySelector(".dlg-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "dlg-overlay";
  const dlg = document.createElement("div");
  dlg.className = "dlg" + (wide ? " dlg-wide" : "");
  const t = document.createElement("div");
  t.className = "dlg-title";
  t.textContent = title;
  dlg.appendChild(t);
  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  dlg.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") overlay.remove();
  });
  return { overlay, dlg };
}

function closeButton(overlay: HTMLElement, dlg: HTMLElement): void {
  const buttons = document.createElement("div");
  buttons.className = "dlg-buttons";
  const close = document.createElement("button");
  close.className = "dlg-ok";
  close.textContent = "Close";
  close.addEventListener("click", () => overlay.remove());
  buttons.appendChild(close);
  dlg.appendChild(buttons);
  close.focus();
}

// ---------------------------------------------------------------- About

export function openAbout(): void {
  const { overlay, dlg } = baseDialog("About grue");

  const body = document.createElement("div");
  body.className = "about-body";

  const name = document.createElement("div");
  name.className = "about-name";
  name.textContent = "grue";
  const tag = document.createElement("div");
  tag.className = "about-tag";
  tag.textContent = "graph-based understanding environment";
  const line = document.createElement("div");
  line.className = "about-line";
  line.textContent = "A functional successor to Tufts VUE (Visual Understanding Environment).";

  const link = document.createElement("a");
  link.className = "about-link";
  link.href = REPO_URL;
  link.textContent = REPO_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    openExternal(REPO_URL);
  });

  body.append(name, tag, line, link);
  dlg.appendChild(body);

  // version: read live from the app (tauri.conf.json) — never hardcoded here
  if (isTauri()) {
    void import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => {
        const ver = document.createElement("div");
        ver.className = "about-line";
        ver.textContent = `version ${v}`;
        body.appendChild(ver);
      })
      .catch(() => {});
  }

  closeButton(overlay, dlg);
}

// ------------------------------------------------------- Keyboard shortcuts

export function openShortcutTable(actions: ActionMap): void {
  const { overlay, dlg } = baseDialog("Keyboard Shortcuts", true);

  const scroll = document.createElement("div");
  scroll.className = "dlg-scroll";
  const table = document.createElement("table");
  table.className = "shortcut-table";

  for (const [combo, id] of Object.entries(BINDINGS)) {
    const a = actions.get(id);
    if (!a) continue;
    const tr = document.createElement("tr");
    const key = document.createElement("td");
    key.className = "shortcut-key";
    key.textContent = keyLabel(combo);
    const what = document.createElement("td");
    what.textContent = a.label;
    tr.append(key, what);
    table.appendChild(tr);
  }
  scroll.appendChild(table);
  dlg.appendChild(scroll);

  // not part of the BINDINGS table: tool/hold keys live in the editor itself
  const foot = document.createElement("div");
  foot.className = "shortcut-foot";
  foot.textContent =
    "Tools: s select, n node, l link, r rapid-link, m pan. Hold Space to pan, " +
    "X for node tool, ` for zoom, Alt for rapid-link. Del deletes, F2 renames, " +
    "Esc cancels/deselects, arrows nudge (Shift = 10 px).";
  dlg.appendChild(foot);

  closeButton(overlay, dlg);
}
