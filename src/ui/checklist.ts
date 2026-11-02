// Checked-maps list (web version). Maps pages (the generated index maps) carry
// small check boxes beside each file plus two buttons. They are ordinary nodes whose
// attachment ("blue dot") spec uses a grue-... scheme handled here instead of opened:
//   grue-check:<map path>   toggle that map in the list
//   grue-open-list:         open grue with every checked map open
//   grue-clear-list:        empty the list
// The list lives in localStorage, so every maps page in this browser shares it.

import type { GDoc } from "../core/model";
import { toast } from "./help";
import { isTauri } from "./platform";

const KEY = "grue.checkedMaps";
const CHECK = "grue-check:";
const OPEN = "grue-open-list:";
const CLEAR = "grue-clear-list:";

function getList(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function setList(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage blocked: the list just won't persist
  }
}

export function isCheckSpec(spec: string): boolean {
  return spec.startsWith(CHECK);
}

/** Keep every check box node showing the current state of the list:
 *  white when off, blue when the file is on the list. */
export function syncChecklistLabels(doc: GDoc): void {
  const list = getList();
  for (const it of doc.items) {
    if (it.kind !== "node" || !it.resource || !isCheckSpec(it.resource.spec)) continue;
    const want = list.includes(it.resource.spec.slice(CHECK.length)) ? "#4A95FF" : "#FFFFFF";
    if (it.fill !== want) it.fill = want;
    if (it.label !== "") it.label = "";
  }
}

/** Returns true when the spec was a checklist command (and was handled). */
export function handleChecklistSpec(spec: string, redraw: () => void): boolean {
  if (spec.startsWith(CHECK)) {
    const map = spec.slice(CHECK.length);
    const list = getList();
    setList(list.includes(map) ? list.filter((m) => m !== map) : [...list, map]);
    redraw();
    return true;
  }
  if (spec === OPEN) {
    const list = getList();
    if (isTauri()) toast("Open checked maps works in the web version");
    else if (!list.length) toast("No maps are checked");
    else {
      const q = list.map((m) => "map=" + encodeURIComponent(m).replace(/%2F/g, "/")).join("&");
      window.open(location.origin + location.pathname + "?" + q, "_blank");
    }
    return true;
  }
  if (spec === CLEAR) {
    setList([]);
    redraw();
    toast("List cleared");
    return true;
  }
  return false;
}
