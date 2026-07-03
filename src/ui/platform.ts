// File open/save: Tauri when available, browser fallbacks for `npm run dev` in a browser.

export interface OpenedFile {
  path: string | null; // null in browser fallback
  name: string;
  text: string;
}

export function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const FILTERS = [
  { name: "GrrrphUE map", extensions: ["grue"] },
  { name: "VUE map", extensions: ["vue"] },
  { name: "All files", extensions: ["*"] },
];

export async function openFile(): Promise<OpenedFile | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({ multiple: false, filters: FILTERS });
    if (typeof path !== "string") return null;
    const text = await readTextFile(path);
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
    const path = await save({
      defaultPath: suggestedName,
      filters: wantVue ? [FILTERS[1], FILTERS[2]] : [FILTERS[0], FILTERS[2]],
    });
    if (!path) return null;
    await writeTextFile(path, text);
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
    return;
  }
  await saveFileAs(baseName(path), text);
}

export function baseName(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i >= 0 ? path.slice(i + 1) : path;
}
