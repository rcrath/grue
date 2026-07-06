// File open/save: Tauri when available, browser fallbacks for `npm run dev` in a browser.

import { getPref, setPref } from "./prefs";

export interface OpenedFile {
  path: string | null; // null in browser fallback
  name: string;
  text: string;
}

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const GRUE_FILTER = { name: "Grue map", extensions: ["grue"] };
const VUE_FILTER = { name: "VUE map", extensions: ["vue"] };
const ALL_FILTER = { name: "All files", extensions: ["*"] };

// Open dialog: a combined "Maps" filter first (so both extensions show by
// default), then the type-specific and catch-all filters. Save keeps its own
// type-specific first filter (see saveFileAs) — Save always writes one kind.
const OPEN_FILTERS = [{ name: "Maps", extensions: ["grue", "vue"] }, GRUE_FILTER, VUE_FILTER, ALL_FILTER];

/** Directory of the last file opened or saved (localStorage; Tauri only —
 *  browser files have no real path to remember). */
function lastDir(): string | null {
  return getPref<string | null>("lastDir", null);
}

function rememberDir(path: string): void {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (i > 0) setPref("lastDir", path.slice(0, i));
}

export async function openFile(): Promise<OpenedFile | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({ multiple: false, filters: OPEN_FILTERS, defaultPath: lastDir() ?? undefined });
    if (typeof path !== "string") return null;
    const text = await readTextFile(path);
    rememberDir(path);
    return { path, name: baseName(path), text };
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".grue,.vue,.json,.xml";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ path: null, name: f.name, text: await f.text() });
    };
    // cancel: resolve null when the window regains focus with no change
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export async function saveFileAs(suggestedName: string, text: string): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const wantVue = suggestedName.toLowerCase().endsWith(".vue");
    const dir = lastDir();
    const defaultPath = dir ? `${dir}${dir.includes("\\") ? "\\" : "/"}${suggestedName}` : suggestedName;
    const path = await save({
      defaultPath,
      filters: wantVue ? [VUE_FILTER, ALL_FILTER] : [GRUE_FILTER, ALL_FILTER],
    });
    if (!path) return null;
    await writeTextFile(path, text);
    rememberDir(path);
    return path;
  }
  const blob = new Blob([text], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
  return suggestedName;
}

export async function saveFileTo(path: string, text: string): Promise<void> {
  if (isTauri()) {
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, text);
    rememberDir(path);
    return;
  }
  await saveFileAs(baseName(path), text);
}

/** Re-read a previously opened file (File > Revert). Tauri only — browser files have no path. */
export async function readFile(path: string): Promise<string> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return readTextFile(path);
}

/** Pick any file and return its path (Tauri) or its name (browser fallback — no
 *  real path is available in a browser, the name is stored as the resource spec). */
export async function pickFilePath(): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, defaultPath: lastDir() ?? undefined });
    if (typeof path !== "string") return null;
    rememberDir(path);
    return path;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => resolve(input.files?.[0]?.name ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

export function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}
