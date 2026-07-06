import "./style.css";
import { installLogCapture, onLog } from "./core/log";
import { Tool } from "./ui/editor";
import { NODE_SHAPES, NodeShape, docFromJson, docToJson } from "./core/model";
import { exportVue, importVue } from "./core/vueFormat";
import { baseName, isTauri, openFile, readFile, saveFileAs } from "./ui/platform";
import { buildActions } from "./ui/actions";
import { DocManager } from "./ui/docs";
import { installMenuBar } from "./ui/menubar";
import { installContextMenu } from "./ui/contextmenu";
import { installShortcuts } from "./ui/shortcuts";
import { promptText } from "./ui/dialogs";
import { createPanels } from "./ui/panels";
import { getPref, setPref } from "./ui/prefs";
import { PREF_AUTOSAVE, PREF_PANNER_ON_START } from "./ui/preferences";

// capture console output + uncaught errors for Help > Show Log, before
// anything else gets a chance to log something
installLogCapture();

const app = document.getElementById("app")!;
app.innerHTML = `
  <div id="menubar-host"></div>
  <div id="tabbar"></div>
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
  <div id="statusbar"><span id="status-file">untitled</span><span id="status-hint"></span><span id="status-log" class="status-log" title="An error was logged — click to view (Help &gt; Show Log)" style="display:none">⚠ log</span><span id="status-zoom">100%</span></div>
`;

// multi-document manager: one Editor per open tab; everything below routes
// through ed() so it always targets the active document
const docs = new DocManager(document.getElementById("canvas")!, document.getElementById("tabbar")!);
const ed = () => docs.activeEditor();

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
  ["node", "node", "Node tool (n): double-click or drag to create"],
  ["link", "link", "Link tool (l): drag from node to node"],
  ["combo", "rapid", "Rapid-link tool (r): link to empty space to create the node, hold Alt for one-shot"],
  ["hand", "pan", "Pan tool (m), or hold Space"],
];
for (const [t, label, title] of toolDefs) {
  toolButtons.set(t, button(toolsDiv, label, title, () => ed().setTool(t)));
}

const fileDiv = document.getElementById("file-ops")!;
button(fileDiv, "new", "New map (new tab)", () => docs.newTab());
button(fileDiv, "open", "Open .grue or .vue (Ctrl+O)", () => doOpen());
button(fileDiv, "save", "Save (Ctrl+S)", () => void docs.saveActive());
button(fileDiv, "save as", "Save As (Ctrl+Shift+S)", () => void docs.saveActiveAs());
button(fileDiv, "export .vue", "Export as legacy VUE map", () => doExportVue());

const editDiv = document.getElementById("edit-ops")!;
const undoBtn = button(editDiv, "undo", "Undo (Ctrl+Z)", () => ed().undo());
const redoBtn = button(editDiv, "redo", "Redo (Ctrl+Shift+Z)", () => ed().redo());
button(editDiv, "delete", "Delete selection (Del)", () => ed().deleteSelection());

const viewDiv = document.getElementById("view-ops")!;
button(viewDiv, "−", "Zoom out (Ctrl+-)", () => ed().zoomStep(-1));
button(viewDiv, "+", "Zoom in (Ctrl+=)", () => ed().zoomStep(1));
button(viewDiv, "fit", "Zoom to fit (Ctrl+])", () => ed().zoomFit());
button(viewDiv, "100%", "Actual size (Ctrl+')", () => ed().zoomActual());

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
  for (const e of docs.editors()) e.defaultShape = shape; // default shape is app-wide
  ed().applyStyleToSelection({ shape });
});

(document.getElementById("fill-pick") as HTMLInputElement).addEventListener("input", (e) => {
  ed().applyStyleToSelection({ fill: (e.target as HTMLInputElement).value });
});
(document.getElementById("stroke-pick") as HTMLInputElement).addEventListener("input", (e) => {
  ed().applyStyleToSelection({ stroke: (e.target as HTMLInputElement).value });
});
(document.getElementById("text-pick") as HTMLInputElement).addEventListener("input", (e) => {
  ed().applyStyleToSelection({ textColor: (e.target as HTMLInputElement).value });
});
document.getElementById("arrow-cycle")!.addEventListener("click", () => {
  // cycle NONE -> HEAD -> TAIL -> BOTH like legacy VUE
  const sel = [...ed().selection];
  const firstLink = ed().doc.items.find((i) => sel.includes(i.id) && i.kind === "link");
  const next = firstLink && firstLink.kind === "link" ? (firstLink.arrowState + 1) % 4 : 2;
  ed().applyStyleToSelection({ arrowState: next });
});
(document.getElementById("curve-pick") as HTMLSelectElement).addEventListener("change", (e) => {
  ed().applyStyleToSelection({ controlCount: parseInt((e.target as HTMLSelectElement).value, 10) as 0 | 1 | 2 });
});

// ---------- status / title ----------

const statusFile = document.getElementById("status-file")!;
const statusHint = document.getElementById("status-hint")!;
const statusLog = document.getElementById("status-log")!;
const statusZoom = document.getElementById("status-zoom")!;

// status-bar error indicator: appears on any captured error, clears when the
// log panel is opened (panels.log.onOpened is wired once the panel exists, below)
onLog((e) => {
  if (e.level === "error") statusLog.style.display = "";
});

let lastTitle = "";

function refreshChrome(): void {
  const e = ed();
  const dot = e.dirty ? " •" : "";
  statusFile.textContent = docs.activeName() + dot;
  // title bar: full path of the active doc (name only if unsaved) + dirty dot
  const title = `${docs.activePath() ?? docs.activeName()}${dot} — grue`;
  if (title !== lastTitle) {
    lastTitle = title;
    document.title = title;
    if (isTauri()) void setWindowTitle(title);
  }
  statusZoom.textContent = `${Math.round(e.zoom * 100)}%`;
  undoBtn.disabled = !e.canUndo();
  redoBtn.disabled = !e.canRedo();
  shapePick.value = e.defaultShape;
  for (const [t, b] of toolButtons) b.classList.toggle("active", e.tool === t);
  statusHint.textContent =
    e.tool === "node" ? "double-click or drag on the canvas to create a node"
    : e.tool === "link" ? "drag from one node to another to connect them; double-click empty canvas for a new node"
    : e.tool === "combo" ? "drag from a node; release on empty space to create the target node; double-click empty canvas for a new node"
    : e.tool === "hand" ? "drag to pan"
    : "";
}

async function setWindowTitle(title: string): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

// ---------- file operations (thin wrappers; lifecycle lives in ui/docs.ts) ----------

async function doOpen(): Promise<void> {
  const f = await openFile();
  if (!f) return;
  try {
    docs.openContent(f.name, f.text, f.path);
    if (f.path) addRecent(f.path);
  } catch (err) {
    alert(`Could not open ${f.name}:\n${err instanceof Error ? err.message : err}`);
  }
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
  try {
    const text = await readFile(path);
    docs.openContent(baseName(path), text, path);
    addRecent(path); // bump to the top of the list
  } catch (err) {
    alert(`Could not open ${path}:\n${err instanceof Error ? err.message : err}`);
    dropRecent(path);
  }
}

async function doOpenUrl(): Promise<void> {
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
    // came from the network — no path, force Save As
    docs.openContent(name, text, null, true);
  } catch (err) {
    alert(`Could not open ${spec}:\n${err instanceof Error ? err.message : err}`);
  }
}

async function doExportVue(): Promise<void> {
  const e = ed();
  e.prepareForSave();
  const name = docs.activeName().replace(/\.grue$/i, "") + ".vue";
  await saveFileAs(name, exportVue(e.doc, name));
}

async function doExit(): Promise<void> {
  if (!(await docs.confirmQuitAll())) return;
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy(); // already prompted — skip onCloseRequested
  } else {
    window.close(); // browser dev: usually a no-op, degrade gracefully
  }
}

// Tauri window close button (✕): intercept, run the same per-doc prompt flow
if (isTauri()) {
  void (async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    await win.onCloseRequested(async (event) => {
      event.preventDefault();
      if (await docs.confirmQuitAll()) await win.destroy();
    });
  })();
}

// ---------- menus / panels / shortcuts ----------

const panels = createPanels(ed, {
  getPath: () => docs.activePath(),
  getName: () => docs.activeName(),
});
panels.log.onOpened = () => (statusLog.style.display = "none");
statusLog.addEventListener("click", () => panels.log.show());
const actions = buildActions(
  docs,
  {
    open: () => void doOpen(),
    openUrl: () => void doOpenUrl(),
    save: () => void docs.saveActive(),
    saveAs: () => void docs.saveActiveAs(),
    revert: () => void docs.revertActive(),
    canRevert: () => docs.activePath() != null && ed().dirty,
    newMap: () => docs.newTab(),
    closeMap: () => void docs.closeActive(), // Close = close the active tab
    exportVue: () => void doExportVue(),
    exit: () => void doExit(),
    newNodeAtCursor: () => void ed().createNodeAt(...lastCanvasPoint()),
    recentFiles,
    openRecent: (i) => void openRecent(i),
  },
  panels,
);
installMenuBar(document.getElementById("menubar-host")!, actions, docs, recentFiles);
installContextMenu(document.getElementById("canvas")!, ed, actions);
installShortcuts(actions);

// doc manager hooks: chrome after any change, panels after every render
docs.onChanged = refreshChrome;
docs.onRender = () => panels.refreshAll();
docs.addRecent = addRecent;
refreshChrome();

// ---------- preferences / startup state ----------

for (const p of panels.all()) p.restore(); // reopen panels left open last session
if (getPref(PREF_PANNER_ON_START, false)) panels.panner.show();
panels.refreshAll();

// autosave (preference; desktop only — needs a real file path). Saves every
// open document that has a path, not just the active one.
setInterval(() => {
  if (getPref(PREF_AUTOSAVE, false) && isTauri()) docs.autosaveAll();
}, 60_000);

let lastMouse: [number, number] = [innerWidth / 2, innerHeight / 2];
window.addEventListener("pointermove", (e) => (lastMouse = [e.clientX, e.clientY]));
function lastCanvasPoint(): [number, number] {
  const w = ed().screenToWorld(lastMouse[0], lastMouse[1]);
  return [w.x, w.y];
}

// drag & drop a map file onto the window — opens in a new tab
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  const text = await f.text();
  try {
    docs.openContent(f.name, text, null);
  } catch (err) {
    alert(`Could not open ${f.name}:\n${err instanceof Error ? err.message : err}`);
  }
});

// browser dev fallback only — the Tauri close button goes through onCloseRequested
window.addEventListener("beforeunload", (e) => {
  if (!isTauri() && docs.anyDirty()) e.preventDefault();
});

// debug/automation hook (also used by smoke tests)
(window as unknown as Record<string, unknown>).__grue = {
  get editor() {
    return docs.activeEditor();
  },
  docs,
  importVue,
  exportVue,
  docToJson,
  docFromJson,
  actions,
};
