// Minimal preferences dialog (wave 3). Only real, existing settings — backed
// by the simple localStorage store in prefs.ts. Changes apply immediately.

import { NodeShape } from "../core/model";
import { Editor } from "./editor";
import { SHAPE_LABELS, SHAPE_ORDER } from "./palette";
import { getPref, setPref } from "./prefs";
import { isTauri } from "./platform";

export const PREF_DEFAULT_SHAPE = "defaultShape";
export const PREF_AUTOSAVE = "autosave";
export const PREF_PANNER_ON_START = "pannerOnStart";

export function openPreferences(editor: Editor): void {
  document.querySelector(".dlg-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "dlg-overlay";
  const dlg = document.createElement("div");
  dlg.className = "dlg";

  const title = document.createElement("div");
  title.className = "dlg-title";
  title.textContent = "Preferences";
  dlg.appendChild(title);

  // default node shape
  const shapeRow = document.createElement("label");
  shapeRow.className = "dlg-label";
  shapeRow.innerHTML = "<span>Default node shape</span>";
  const shapeSel = document.createElement("select");
  for (const s of SHAPE_ORDER) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = SHAPE_LABELS[s];
    shapeSel.appendChild(o);
  }
  shapeSel.value = getPref<NodeShape>(PREF_DEFAULT_SHAPE, editor.defaultShape);
  shapeSel.addEventListener("change", () => {
    const shape = shapeSel.value as NodeShape;
    setPref(PREF_DEFAULT_SHAPE, shape);
    editor.defaultShape = shape;
  });
  shapeRow.appendChild(shapeSel);
  dlg.appendChild(shapeRow);

  const check = (label: string, key: string, fallback: boolean, note?: string) => {
    const row = document.createElement("label");
    row.className = "dlg-check";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = getPref(key, fallback);
    box.addEventListener("change", () => setPref(key, box.checked));
    const span = document.createElement("span");
    span.textContent = label;
    if (note) span.title = note;
    row.append(box, span);
    dlg.appendChild(row);
  };

  check(
    "Autosave every minute (when the map has a file path)",
    PREF_AUTOSAVE,
    false,
    isTauri() ? "" : "Only works in the desktop app",
  );
  check("Open the panner at startup", PREF_PANNER_ON_START, false);

  const buttons = document.createElement("div");
  buttons.className = "dlg-buttons";
  const close = document.createElement("button");
  close.className = "dlg-ok";
  close.textContent = "Close";
  close.addEventListener("click", () => overlay.remove());
  buttons.appendChild(close);
  dlg.appendChild(buttons);

  overlay.appendChild(dlg);
  document.body.appendChild(overlay);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  dlg.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") overlay.remove();
  });
  close.focus();
}
