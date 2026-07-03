// Central keyboard shortcut dispatcher (ui-spec §3). One action table feeds both
// this dispatcher and the menus, so there is a single codepath per command.
// MOD = Ctrl on Windows/Linux, Cmd on macOS.
//
// Browser-reserved chords (Ctrl+N/W/P/U, Ctrl+1..9) can't be intercepted in a plain
// browser tab; they work in the Tauri webview. QA those via `npm run tauri dev`.

import type { ActionMap } from "./actions";

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** binding combo → action id */
const BINDINGS: Record<string, string> = {
  "mod+o": "file.open",
  "mod+s": "file.save",
  "mod+shift+s": "file.saveAs",
  "mod+q": "file.exit",
  "mod+p": "file.print",
  "mod+w": "file.close",
  "mod+n": "edit.newNodeAtCursor", // reality: legacy Ctrl+N = new node at cursor (kept from wave 1)
  "mod+z": "edit.undo",
  "mod+shift+z": "edit.redo",
  "mod+y": "edit.redo",
  "mod+x": "edit.cut",
  "mod+c": "edit.copy",
  "mod+v": "edit.paste",
  "mod+d": "edit.duplicate",
  "mod+a": "edit.selectAll",
  "mod+alt+a": "edit.selectAllNodes",
  "mod+alt+shift+a": "edit.selectAllLinks",
  "mod+shift+]": "edit.expandSelection",
  "mod+shift+[": "edit.shrinkSelection",
  "mod+g": "edit.group",
  "mod+shift+g": "edit.ungroup",
  "mod+,": "edit.preferences",
  "mod+=": "view.zoomIn",
  "mod+-": "view.zoomOut",
  "mod+]": "view.zoomFit",
  "mod+'": "view.zoomActual",
  "mod+shift+f": "view.zoomSelection",
  "\\": "view.fullScreen",
  "mod+b": "format.bold",
  "mod+i": "format.italic",
  "mod+u": "format.underline",
  "mod+shift+=": "format.bigger",
  "mod+shift+-": "format.smaller",
  "mod+alt+c": "format.copyStyle",
  "mod+alt+v": "format.pasteStyle",
  "mod+1": "window.formatPalette",
  "alt+arrowup": "format.align.top",
  "alt+arrowdown": "format.align.bottom",
  "alt+arrowleft": "format.align.left",
  "alt+arrowright": "format.align.right",
  "mod+arrowup": "nav.jumpUp",
  "mod+arrowdown": "nav.jumpDown",
  "mod+arrowleft": "nav.jumpLeft",
  "mod+arrowright": "nav.jumpRight",
};

/** Normalize a keydown to a combo string like "mod+shift+]". Uses e.code for
 *  punctuation so Shifted chords ("}" etc.) still match. */
function comboOf(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  let key: string;
  switch (e.code) {
    case "BracketRight": key = "]"; break;
    case "BracketLeft": key = "["; break;
    case "Equal": case "NumpadAdd": key = "="; break;
    case "Minus": case "NumpadSubtract": key = "-"; break;
    case "Quote": key = "'"; break;
    case "Comma": key = ","; break;
    case "Backslash": key = "\\"; break;
    default: key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  }
  parts.push(key);
  return parts.join("+");
}

export function installShortcuts(actions: ActionMap): void {
  window.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    const id = BINDINGS[comboOf(e)];
    if (!id) return;
    const a = actions.get(id);
    if (!a) return;
    e.preventDefault();
    if (a.enabled()) a.run();
  });
}

/** Display label for a combo, e.g. "mod+shift+]" → "Ctrl+Shift+]" / "⌘⇧]". */
export function keyLabel(combo: string): string {
  const parts = combo.split("+").map((p) => {
    switch (p) {
      case "mod": return isMac ? "⌘" : "Ctrl";
      case "alt": return isMac ? "⌥" : "Alt";
      case "shift": return isMac ? "⇧" : "Shift";
      default: return p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1);
    }
  });
  return parts.join(isMac ? "" : "+");
}
