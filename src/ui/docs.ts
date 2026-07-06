// Multi-document manager (v0.2.1 workstream 2): owns the list of open
// documents (one Editor per doc, each in its own hidden/shown container div),
// the active tab, tab-bar rendering, and the per-doc file lifecycle
// (open/save/close/quit). main.ts stays thin and routes everything that used
// to close over the single editor through activeEditor().

import { GDoc, NodeShape, docFromJson, docToJson, isImageResource } from "../core/model";
import { importVue } from "../core/vueFormat";
import { Editor } from "./editor";
import { confirmSaveClose } from "./dialogs";
import { baseName, isTauri, readFile, saveFileAs, saveFileTo } from "./platform";
import { getPref } from "./prefs";
import { PREF_DEFAULT_SHAPE } from "./preferences";

interface OpenDoc {
  editor: Editor;
  path: string | null; // null = never saved (or browser fallback)
  name: string;
  container: HTMLElement;
}

export interface DocInfo {
  name: string;
  path: string | null;
  dirty: boolean;
  active: boolean;
}

export class DocManager {
  private docs: OpenDoc[] = [];
  private activeIdx = 0;

  /** Chrome refresh (title bar, status bar, toolbar). Assigned by main.ts. */
  onChanged: () => void = () => {};
  /** Fires after the ACTIVE editor renders (panels re-sync). Assigned by main.ts. */
  onRender: () => void = () => {};
  /** Recent-files hook (list lives in main.ts next to the prefs logic). */
  addRecent: (path: string) => void = () => {};

  constructor(private canvasHost: HTMLElement, private tabBar: HTMLElement) {
    this.createDoc(this.nextUntitledName());
    this.activate(0);
  }

  // ---------- queries ----------

  activeEditor(): Editor { return this.docs[this.activeIdx].editor; }
  activePath(): string | null { return this.docs[this.activeIdx].path; }
  activeName(): string { return this.docs[this.activeIdx].name; }
  activeIndex(): number { return this.activeIdx; }
  count(): number { return this.docs.length; }
  editors(): Editor[] { return this.docs.map((d) => d.editor); }
  anyDirty(): boolean { return this.docs.some((d) => d.editor.dirty); }

  list(): DocInfo[] {
    return this.docs.map((d, i) => ({
      name: d.name,
      path: d.path,
      dirty: d.editor.dirty,
      active: i === this.activeIdx,
    }));
  }

  // ---------- tabs ----------

  activate(i: number): void {
    if (i < 0 || i >= this.docs.length) return;
    this.activeIdx = i;
    this.docs.forEach((d, j) => d.container.classList.toggle("active", j === i));
    this.renderTabs();
    this.onChanged();
    this.docs[i].editor.render(); // fires onRender → panels re-sync to this doc
  }

  /** Ctrl+Tab / Ctrl+Shift+Tab. */
  cycle(dir: 1 | -1): void {
    const n = this.docs.length;
    if (n > 1) this.activate((this.activeIdx + dir + n) % n);
  }

  private renderTabs(): void {
    this.tabBar.replaceChildren();
    this.docs.forEach((d, i) => {
      const tab = document.createElement("div");
      tab.className = "tab" + (i === this.activeIdx ? " active" : "");
      tab.title = d.path ?? d.name;

      const name = document.createElement("span");
      name.className = "tab-name";
      name.textContent = d.name + (d.editor.dirty ? " •" : "");

      const close = document.createElement("button");
      close.className = "tab-close";
      close.textContent = "×";
      close.title = "Close (Ctrl+W)";
      close.addEventListener("click", (e) => {
        e.stopPropagation();
        void this.closeDoc(this.docs.indexOf(d));
      });

      tab.append(name, close);
      tab.addEventListener("click", () => this.activate(this.docs.indexOf(d)));
      tab.addEventListener("pointerdown", (e) => {
        if (e.button === 1) e.preventDefault(); // no middle-click autoscroll
      });
      tab.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          void this.closeDoc(this.docs.indexOf(d));
        }
      });
      this.tabBar.appendChild(tab);
    });
  }

  // ---------- document creation / opening ----------

  private createDoc(name: string): OpenDoc {
    const container = document.createElement("div");
    container.className = "doc-canvas";
    this.canvasHost.appendChild(container);
    const editor = new Editor(container);
    editor.defaultShape = getPref<NodeShape>(PREF_DEFAULT_SHAPE, "roundRect");
    const d: OpenDoc = { editor, path: null, name, container };
    editor.onChange = () => {
      this.renderTabs(); // dirty dots
      this.onChanged();
    };
    editor.onViewChange = () => this.onChanged();
    editor.onRender = () => {
      if (this.docs[this.activeIdx] === d) this.onRender();
    };
    this.docs.push(d);
    return d;
  }

  private nextUntitledName(): string {
    const used = new Set(this.docs.map((d) => d.name));
    if (!used.has("untitled.grue")) return "untitled.grue";
    let n = 2;
    while (used.has(`untitled-${n}.grue`)) n++;
    return `untitled-${n}.grue`;
  }

  /** File > New Map: a fresh untitled tab. */
  newTab(): void {
    this.createDoc(this.nextUntitledName());
    this.activate(this.docs.length - 1);
  }

  /** An untitled doc nobody has touched — Open reuses its tab instead of adding one. */
  private isPristineUntitled(d: OpenDoc): boolean {
    return d.path == null && !d.editor.dirty && d.editor.doc.items.length === 0;
  }

  /** Load .grue/.vue text into a NEW tab (shared by Open, recents, Open from
   *  URL, drag & drop). Reuses the current tab when it's a pristine untitled.
   *  Throws on parse errors (before any tab is created). */
  openContent(name: string, text: string, path: string | null, forceUnsaved = false): void {
    const isVue = name.toLowerCase().endsWith(".vue");
    let doc: GDoc;
    if (isVue) {
      const { doc: imported, warnings } = importVue(text);
      if (warnings.length) console.warn("VUE import warnings:", warnings);
      doc = imported;
    } else {
      doc = docFromJson(text);
    }

    const current = this.docs[this.activeIdx];
    const target = this.isPristineUntitled(current) ? current : this.createDoc(name);
    // imported .vue: force Save As so we don't overwrite the .vue; ditto network files
    target.name = isVue ? name.replace(/\.vue$/i, ".grue") : name;
    target.path = isVue || forceUnsaved ? null : path;
    this.activate(this.docs.indexOf(target)); // before setDoc so zoomFit sees real bounds
    target.editor.setDoc(doc);
    if (isVue) target.editor.zoomFit();
    if (isVue || forceUnsaved) {
      target.editor.dirty = true;
      this.renderTabs();
      this.onChanged();
    }
    // image paths from other machines (e.g. /home/... on Windows) resolve against
    // the map file's own folder via the legacy @file.relative property
    void this.resolveImagePaths(target, dirName(path));
  }

  // ---------- save / revert ----------

  private async saveDoc(d: OpenDoc): Promise<boolean> {
    if (!d.path) return this.saveDocAs(d);
    d.editor.prepareForSave();
    await saveFileTo(d.path, docToJson(d.editor.doc));
    this.addRecent(d.path);
    d.editor.markSaved(); // onChange → tab dots + chrome
    return true;
  }

  private async saveDocAs(d: OpenDoc): Promise<boolean> {
    d.editor.prepareForSave();
    const path = await saveFileAs(d.name, docToJson(d.editor.doc));
    if (!path) return false; // user cancelled the dialog
    if (isTauri()) {
      d.path = path;
      d.name = baseName(path);
      this.addRecent(path);
    }
    d.editor.markSaved();
    return true;
  }

  /** Ctrl+S. Resolves false when the user cancelled a Save As dialog. */
  saveActive(): Promise<boolean> {
    return this.saveDoc(this.docs[this.activeIdx]);
  }

  saveActiveAs(): Promise<boolean> {
    return this.saveDocAs(this.docs[this.activeIdx]);
  }

  /** File > Revert keeps its simple binary confirm. */
  async revertActive(): Promise<void> {
    const d = this.docs[this.activeIdx];
    if (!d.path || !d.editor.dirty) return;
    if (!window.confirm("Revert to the last saved version? Your unsaved changes will be lost.")) return;
    try {
      const text = await readFile(d.path);
      d.editor.setDoc(docFromJson(text));
    } catch (err) {
      alert(`Could not revert:\n${err instanceof Error ? err.message : err}`);
    }
  }

  /** Autosave preference: save every open doc that has a path (desktop only). */
  autosaveAll(): void {
    for (const d of this.docs) {
      if (d.path && d.editor.dirty) void this.saveDoc(d);
    }
  }

  // ---------- close / quit ----------

  /** Close one tab. Dirty docs get Save / Don't Save / Cancel; Save on an
   *  untitled doc runs Save As, and cancelling that cancels the close.
   *  Resolves false when the user cancelled. */
  private closing = false; // re-entry guard: one close prompt at a time

  async closeDoc(i: number): Promise<boolean> {
    if (this.closing) return false;
    this.closing = true;
    try {
      const d = this.docs[i];
      if (!d) return true;
      if (d.editor.dirty) {
        this.activate(this.docs.indexOf(d)); // show the doc being asked about
        const choice = await confirmSaveClose(d.name);
        if (choice === "cancel") return false;
        if (choice === "save" && !(await this.saveDoc(d))) return false;
      }
      const idx = this.docs.indexOf(d);
      if (idx < 0) return true; // already gone
      d.editor.dispose();
      d.container.remove();
      this.docs.splice(idx, 1);
      if (this.docs.length === 0) this.createDoc(this.nextUntitledName()); // always one doc
      const next = this.activeIdx > idx ? this.activeIdx - 1 : Math.min(this.activeIdx, this.docs.length - 1);
      this.activate(next);
      return true;
    } finally {
      this.closing = false;
    }
  }

  /** Ctrl+W / File > Close / tab ×. */
  closeActive(): Promise<boolean> {
    return this.closeDoc(this.activeIdx);
  }

  /** App quit: close every doc one by one. Dirty docs get the three-way
   *  prompt — Save saves then closes the tab, Don't Save closes it unsaved,
   *  Cancel aborts the quit (already-closed tabs stay closed). Once every doc
   *  is closed the quit proceeds with no further prompt.
   *  Resolves false when the user cancelled. */
  async confirmQuitAll(): Promise<boolean> {
    for (const d of [...this.docs]) {
      if (this.docs.indexOf(d) < 0) continue;
      if (d.editor.dirty) {
        this.activate(this.docs.indexOf(d)); // show the doc being asked about
        const choice = await confirmSaveClose(d.name);
        if (choice === "cancel") return false;
        if (choice === "save" && !(await this.saveDoc(d))) return false;
      }
      // close the tab immediately (visibly) — no replacement untitled during quit
      const idx = this.docs.indexOf(d);
      if (idx < 0) continue;
      d.editor.dispose();
      d.container.remove();
      this.docs.splice(idx, 1);
      if (this.docs.length) {
        this.activate(Math.min(idx, this.docs.length - 1));
      } else {
        this.activeIdx = 0;
        this.renderTabs(); // empty tab bar while the window closes
      }
    }
    // browser dev: window.close() is usually a no-op, so keep the app usable
    if (!isTauri() && this.docs.length === 0) {
      this.createDoc(this.nextUntitledName());
      this.activate(0);
    }
    return true;
  }

  // ---------- image path resolution (moved from main.ts) ----------

  /** For every image node whose resource path doesn't exist here, try the legacy
   *  `@file.relative` property (URL-encoded filename) against the map file's
   *  folder; on success the RESOLVED path is stored back on the resource so
   *  saves keep working. Tauri only — a browser can't probe the filesystem. */
  private async resolveImagePaths(d: OpenDoc, dir: string | null): Promise<void> {
    if (!isTauri()) return;
    const { exists } = await import("@tauri-apps/plugin-fs");
    let changed = false;
    for (const it of d.editor.doc.items) {
      if (it.kind !== "node" || !it.image || !it.resource || !isImageResource(it.resource)) continue;
      const r = it.resource;
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(r.spec)) continue; // URLs load as-is
      try {
        if (await exists(r.spec)) continue; // path works on this machine
      } catch {
        // foreign/invalid path shape — fall through to the relative lookup
      }
      const rel = r.properties.find((p) => p.key === "@file.relative")?.value;
      if (!rel || !dir) continue;
      let fileName = rel;
      try {
        fileName = decodeURIComponent(rel);
      } catch {
        // keep the raw value when it isn't valid URL-encoding
      }
      const sep = dir.includes("\\") ? "\\" : "/";
      const candidate = dir + sep + fileName;
      try {
        if (await exists(candidate)) {
          r.spec = candidate;
          changed = true;
        }
      } catch {
        // unreadable candidate: leave the spec alone (placeholder renders)
      }
    }
    if (changed) {
      d.editor.dirty = true;
      d.editor.render();
      this.renderTabs();
      this.onChanged();
    }
  }
}

function dirName(p: string | null): string | null {
  if (!p) return null;
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i > 0 ? p.slice(0, i) : null;
}
