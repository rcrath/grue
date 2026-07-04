import "./style.css";
import { Editor, Tool } from "./ui/editor";
import { NODE_SHAPES, NodeShape, docFromJson, docToJson, newDoc } from "./core/model";
import { exportVue, importVue } from "./core/vueFormat";
import { baseName, isTauri, openFile, readFile, saveFileAs, saveFileTo } from "./ui/platform";
import { buildActions } from "./ui/actions";
import { installMenuBar } from "./ui/menubar";
import { installContextMenu } from "./ui/contextmenu";
import { installShortcuts } from "./ui/shortcuts";
import { promptText } from "./ui/dialogs";
import { createPanels } from "./ui/panels";
import { getPref, setPref } from "./ui/prefs";
import { PREF_AUTOSAVE, PREF_DEFAULT_SHAPE, PREF_PANNER_ON_START } from "./ui/preferences";

const app = document.getElementById("app")!;
app.innerHTML = `
  <div id="menubar-host"></div>
  <div id="toolbar">
    <div class="tool-group" id="tools"></div>
    <div class="sep"></div>
    <div class="tool-group" id="file-ops"></div>
    <div class="sep"></div>
    <div class="tool-group" id="edit-ops"></div>
    <div class="sep"></div>
    <div class="tool-group" id="style-ops">
      <select id="shape-pick" title="Node shape"></select>
      <label class="swatch" title="Fill color"><input type="color" id="fill-pick" value="#F2AE45"><span>fill</span></label>
      <label class="swatch" title="Line color"><input type="color" id="stroke-pick" value="#776D6D"><span>line</span></label>
      <label class="swatch" title="Text color"><input type="color" id="text-pick" value="#000000"><span>text</span></label>
      <button id="arrow-cycle" title="Cycle arrowheads on selected links">arrows</button>
      <select id="curve-pick" title="Link curve">
        <option value="0">straight</option>
        <option value="1">curved</option>
        <option value="2">s-curve</option>
      </select>
    </div>
    <div class="sep"></div>
    <div class="tool-group" id="view-ops"></div>
  </div>
  <div id="canvas"></div>
  <div id="statusbar"><span id="status-file">untitled</span><span id="status-hint"></span><span id="status-zoom">100%</span></div>
`;

const editor = new Editor(document.getElementById("canvas")!);

let currentPath: string | null = null;
let currentName = "untitled.grue";

// ---------- toolbar ----------

function button(parent: HTMLElement, label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.title = title;
  b.addEventListener("click", () => {
    onClick();
    b.blur();
  });
  parent.appendChild(b);
  return b;
}

const toolsDiv = document.getElementById("tools")!;
const toolButtons = new Map<Tool, HTMLButtonElement>();
const toolDefs: [Tool, string, string][] = [
  ["select", "select", "Selection tool (s)"],
  ["node", "node", "Node tool (n): click or drag to create"],
  ["link", "link", "Link tool (l): drag from node to node"],
  ["combo", "rapid", "Rapid-link tool (r): link to empty space to create the node, hold Alt for one-shot"],
  ["hand", "pan", "Pan tool (m), or hold Space"],
];
for (const [t, label, title] of toolDefs) {
  toolButtons.set(t, button(toolsDiv, label, title, () => editor.setTool(t)));
}

const fileDiv = document.getElementById("file-ops")!;
button(fileDiv, "new", "New map", () => newMap());
button(fileDiv, "open", "Open .grue or .vue (Ctrl+O)", () => doOpen());
button(fileDiv, "save", "Save (Ctrl+S)", () => doSave());
button(fileDiv, "save as", "Save As (Ctrl+Shift+S)", () => doSaveAs());
button(fileDiv, "export .vue", "Export as legacy VUE map", () => doExportVue());

const editDiv = document.getElementById("edit-ops")!;
const undoBtn = button(editDiv, "undo", "Undo (Ctrl+Z)", () => editor.undo());
const redoBtn = button(editDiv, "redo", "Redo (Ctrl+Shift+Z)", () => editor.redo());
button(editDiv, "delete", "Delete selection (Del)", () => editor.deleteSelection());

const viewDiv = document.getElementById("view-ops")!;
button(viewDiv, "−", "Zoom out (Ctrl+-)", () => editor.zoomStep(-1));
button(viewDiv, "+", "Zoom in (Ctrl+=)", () => editor.zoomStep(1));
button(viewDiv, "fit", "Zoom to fit (Ctrl+])", () => editor.zoomFit());
button(viewDiv, "100%", "Actual size (Ctrl+')", () => editor.zoomActual());

// style controls
const shapePick = document.getElementById("shape-pick") as HTMLSelectElement;
for (const s of NODE_SHAPES) {
  const o = document.createElement("option");
  o.value = s;
  o.textContent = s === "roundRect" ? "rounded" : s === "rect" ? "rectangle" : s === "ellipse" ? "oval" : s;
  shapePick.appendChild(o);
}
shapePick.addEventListener("change", () => {
  const shape = shapePick.value as NodeShape;
  editor.defaultShape = shape;
  editor.applyStyleToSelection({ shape });
});

(document.getElementById("fill-pick") as HTMLInputElement).addEventListener("input", (e) => {
  editor.applyStyleToSelection({ fill: (e.target as HTMLInputElement).value });
});
(document.getElementById("stroke-pick") as HTMLInputElement).addEventListener("input", (e) => {
  editor.applyStyleToSelection({ stroke: (e.target as HTMLInputElement).value });
});
(document.getElementById("text-pick") as HTMLInputElement).addEventListener("input", (e) => {
  editor.applyStyleToSelection({ textColor: (e.target as HTMLInputElement).value });
});
document.getElementById("arrow-cycle")!.addEventListener("click", () => {
  // cycle NONE -> HEAD -> TAIL -> BOTH like legacy VUE
  const sel = [...editor.selection];
  const firstLink = editor.doc.items.find((i) => sel.includes(i.id) && i.kind === "link");
  const next = firstLink && firstLink.kind === "link" ? (firstLink.arrowState + 1) % 4 : 2;
  editor.applyStyleToSelection({ arrowState: next });
});
(document.getElementById("curve-pick") as HTMLSelectElement).addEventListener("change", (e) => {
  editor.applyStyleToSelection({ controlCount: parseInt((e.target as HTMLSelectElement).value, 10) as 0 | 1 | 2 });
});

// ---------- status / title ----------

const statusFile = document.getElementById("status-file")!;
const statusHint = document.getElementById("status-hint")!;
const statusZoom = document.getElementById("status-zoom")!;

function refreshChrome(): void {
  statusFile.textContent = currentName + (editor.dirty ? " •" : "");
  document.title = `${currentName}${editor.dirty ? " •" : ""} — grue`;
  statusZoom.textContent = `${Math.round(editor.zoom * 100)}%`;
  undoBtn.disabled = !editor.canUndo();
  redoBtn.disabled = !editor.canRedo();
  for (const [t, b] of toolButtons) b.classList.toggle("active", editor.tool === t);
  statusHint.textContent =
    editor.tool === "node" ? "click or drag on the canvas to create a node"
    : editor.tool === "link" ? "drag from one node to another to connect them"
    : editor.tool === "combo" ? "drag from a node; release on empty space to create the target node"
    : editor.tool === "hand" ? "drag to pan"
    : "";
}

editor.onChange = refreshChrome;
editor.onViewChange = refreshChrome;
refreshChrome();

// ---------- file operations ----------

function confirmDiscard(): boolean {
  if (!editor.dirty) return true;
  return window.confirm("You have unsaved changes. Discard them?");
}

function newMap(): void {
  if (!confirmDiscard()) return;
  currentPath = null;
  currentName = "untitled.grue";
  editor.setDoc(newDoc());
  refreshChrome();
}

/** Load .grue/.vue text into the editor (shared by Open, Open from URL, drag & drop). */
function loadContent(name: string, text: string, path: string | null): void {
  if (name.toLowerCase().endsWith(".vue")) {
    const { doc, warnings } = importVue(text);
    editor.setDoc(doc);
    editor.zoomFit();
    currentPath = null; // imported: force Save As so we don't overwrite the .vue
    currentName = name.replace(/\.vue$/i, ".grue");
    editor.dirty = true;
    if (warnings.length) console.warn("VUE import warnings:", warnings);
  } else {
    editor.setDoc(docFromJson(text));
    currentPath = path;
    currentName = name;
  }
}

async function doOpen(): Promise<void> {
  if (!confirmDiscard()) return;
  const f = await openFile();
  if (!f) return;
  try {
    loadContent(f.name, f.text, f.path);
    if (f.path) addRecent(f.path);
  } catch (err) {
    alert(`Could not open ${f.name}:\n${err instanceof Error ? err.message : err}`);
  }
  refreshChrome();
}

// ---------- recently opened (localStorage; Tauri-only — browser files have no path) ----------

function recentFiles(): string[] {
  return isTauri() ? getPref<string[]>("recentFiles", []) : [];
}

function addRecent(path: string | null): void {
  if (!isTauri() || !path) return;
  const list = recentFiles().filter((x) => x !== path);
  list.unshift(path);
  setPref("recentFiles", list.slice(0, 8));
}

function dropRecent(path: string): void {
  setPref("recentFiles", recentFiles().filter((x) => x !== path));
}

async function openRecent(index: number): Promise<void> {
  const path = recentFiles()[index];
  if (!path) return;
  if (!confirmDiscard()) return;
  try {
    const text = await readFile(path);
    loadContent(baseName(path), text, path);
    addRecent(path); // bump to the top of the list
  } catch (err) {
    alert(`Could not open ${path}:\n${err instanceof Error ? err.message : err}`);
    dropRecent(path);
  }
  refreshChrome();
}

async function doOpenUrl(): Promise<void> {
  if (!confirmDiscard()) return;
  const url = await promptText({ title: "Open from URL", label: "URL", placeholder: "https://example.com/map.grue" });
  if (!url || !url.trim()) return;
  const spec = url.trim();
  try {
    const res = await fetch(spec);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const text = await res.text();
    let name = "untitled.grue";
    try {
      name = baseName(decodeURIComponent(new URL(spec).pathname)) || name;
    } catch {
      // unparseable URL path: keep the fallback name
    }
    loadContent(name, text, null);
    if (!name.toLowerCase().endsWith(".vue")) {
      currentPath = null; // came from the network — force Save As
      editor.dirty = true;
    }
  } catch (err) {
    alert(`Could not open ${spec}:\n${err instanceof Error ? err.message : err}`);
  }
  refreshChrome();
}

async function doSave(): Promise<void> {
  if (!currentPath) return doSaveAs();
  editor.prepareForSave();
  await saveFileTo(currentPath, docToJson(editor.doc));
  addRecent(currentPath);
  editor.markSaved();
  refreshChrome();
}

async function doSaveAs(): Promise<void> {
  editor.prepareForSave();
  const path = await saveFileAs(currentName, docToJson(editor.doc));
  if (!path) return;
  if (isTauri()) {
    currentPath = path;
    currentName = baseName(path);
    addRecent(path);
  }
  editor.markSaved();
  refreshChrome();
}

async function doRevert(): Promise<void> {
  if (!currentPath || !editor.dirty) return;
  if (!window.confirm("Revert to the last saved version? Your unsaved changes will be lost.")) return;
  try {
    const text = await readFile(currentPath);
    editor.setDoc(docFromJson(text));
  } catch (err) {
    alert(`Could not revert:\n${err instanceof Error ? err.message : err}`);
  }
  refreshChrome();
}

async function doExportVue(): Promise<void> {
  editor.prepareForSave();
  const name = currentName.replace(/\.grue$/i, "") + ".vue";
  await saveFileAs(name, exportVue(editor.doc, name));
}

async function doExit(): Promise<void> {
  if (!confirmDiscard()) return;
  editor.dirty = false; // confirmed: don't double-prompt via beforeunload
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } else {
    window.close(); // browser dev: usually a no-op, degrade gracefully
  }
}

// ---------- menus / panels / shortcuts ----------

const panels = createPanels(editor, {
  getPath: () => currentPath,
  getName: () => currentName,
});
const actions = buildActions(
  editor,
  {
    open: () => void doOpen(),
    openUrl: () => void doOpenUrl(),
    save: () => void doSave(),
    saveAs: () => void doSaveAs(),
    revert: () => void doRevert(),
    canRevert: () => currentPath != null && editor.dirty,
    newMap,
    closeMap: newMap, // Close Map = new-map-with-discard-check semantics
    exportVue: () => void doExportVue(),
    exit: () => void doExit(),
    newNodeAtCursor: () => void editor.createNodeAt(...lastCanvasPoint()),
    recentFiles,
    openRecent: (i) => void openRecent(i),
  },
  panels,
);
installMenuBar(document.getElementById("menubar-host")!, actions, editor, recentFiles);
installContextMenu(document.getElementById("canvas")!, editor, actions);
installShortcuts(actions);

// panels re-sync after every render (doc, selection, or view changed)
editor.onRender = () => panels.refreshAll();

// ---------- preferences / startup state ----------

editor.defaultShape = getPref<NodeShape>(PREF_DEFAULT_SHAPE, "roundRect");
shapePick.value = editor.defaultShape;

for (const p of panels.all()) p.restore(); // reopen panels left open last session
if (getPref(PREF_PANNER_ON_START, false)) panels.panner.show();
panels.refreshAll();

// autosave (preference; desktop only — needs a real file path)
setInterval(() => {
  if (getPref(PREF_AUTOSAVE, false) && isTauri() && currentPath && editor.dirty) void doSave();
}, 60_000);

let lastMouse: [number, number] = [innerWidth / 2, innerHeight / 2];
window.addEventListener("pointermove", (e) => (lastMouse = [e.clientX, e.clientY]));
function lastCanvasPoint(): [number, number] {
  const w = editor.screenToWorld(lastMouse[0], lastMouse[1]);
  return [w.x, w.y];
}

// drag & drop a map file onto the window
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (!confirmDiscard()) return;
  const text = await f.text();
  try {
    loadContent(f.name, text, null);
  } catch (err) {
    alert(`Could not open ${f.name}:\n${err instanceof Error ? err.message : err}`);
  }
  refreshChrome();
});

window.addEventListener("beforeunload", (e) => {
  if (editor.dirty) e.preventDefault();
});

// debug/automation hook (also used by smoke tests)
(window as unknown as Record<string, unknown>).__grue = {
  editor,
  importVue,
  exportVue,
  docToJson,
  docFromJson,
  actions,
};
