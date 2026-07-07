# /grue-code — Get oriented on the grue codebase at session start

Run this when a session starts (or Rich asks "where are we"). It loads the facts below,
takes a snapshot of the repo state, reports in a few lines, and waits for Rich's task.
Context-loading only — change nothing.

## What to do on invocation

1. Read the version from `src-tauri/tauri.conf.json` and confirm `package.json` and
   `src-tauri/Cargo.toml` carry the same string. Flag any mismatch.
2. `git -C E:/Dropbox/audio/git/grue status --short`, `git log -1 --oneline`, `git branch --show-current`.
3. `gh release list --limit 3` and `gh issue list --milestone v0.2-alpha --state open` (or the current milestone).
4. Report: version, branch + last commit, dirty/clean tree, latest release, open issues. One short paragraph + a list. Then stop and wait.

## Project facts (do not rediscover)

- **Repo:** `E:/Dropbox/audio/git/grue` — Tauri 2 + Vite + TypeScript, no UI framework, SVG canvas. Branch `main`, remote `rcrath/grue` (public).
- **What it is:** GrUE — Graph-based Understanding Environment. Free desktop concept-mapper, successor to Tufts VUE. Reads/writes `.grue`, imports/exports legacy `.vue`.
- **Verify any change:** `npx tsc --noEmit && npx vite build` from repo root. Both must pass before calling work done.
- **Build:** `npx tauri build` (~4 min Rust compile — run in background). Exe: `src-tauri/target/release/grue.exe`; installer: `.../release/bundle/nsis/`.
- **Release:** `/publish-grue` skill (the ONLY place git writes happen). CI (`.github/workflows/build.yml`) builds 6 platforms on `v*` tag push and drafts the GitHub release. Installers also deploy to `way.net/grue/installers/` (SSH alias `way`, manual scp + index.html).
- **Roadmap:** GitHub issue #3 — Keep/Done checklist. Tick Done boxes only for features Rich confirmed. Never close any issue.
- **Test checklist page:** `E:\Dropbox\audio\vst\localhost\grue-issues.html` — keep updated when Rich asks what to test.

## Code map (where things live)

- `src/ui/editor.ts` — the canvas editor: tools, selection, drag, zoom, hit-testing, rendering, label editing, badges. One Editor per open document.
- `src/ui/docs.ts` — multi-document manager (tabs). `activeEditor()` is how everything reaches the current doc.
- `src/ui/actions.ts` — central action registry. EVERY command lives here; menus and shortcuts only reference action ids. Add features as actions first.
- `src/ui/menubar.ts` / `contextmenu.ts` / `menu.ts` — DOM menus built from the registry. Shared submenus (align, arrange, shape, font…) are exported from menubar.ts.
- `src/ui/shortcuts.ts` — `BINDINGS` table, single source of truth; the Help shortcut table renders from it.
- `src/ui/panels.ts` + `panel.ts` — floating panels (Info, Layers, Outline, Panner, Search, Log) extend FloatingPanel; positions persist via prefs.
- `src/ui/platform.ts` — file open/save (Tauri + browser fallback), filters, last-folder memory.
- `src/ui/prefs.ts` — localStorage prefs (`getPref`/`setPref`).
- `src/ui/help.ts` — About, shortcut table, `openExternal` (URLs) and `openAttachment` (URLs or local files).
- `src/core/model.ts` — document model, paint order, layers, groups, containment.
- `src/core/log.ts` — 500-entry log ring buffer behind Help > Show Log; wraps console + window errors.

## Conventions (follow these when coding)

- Doc mutations go through `editor.mutate()` so undo works. View-only state (zoom, toggles) does not.
- New commands: action in actions.ts → menu entry by id → optional BINDINGS row. Never wire a menu straight to code.
- Single click never creates nodes — double-click creates (all modes); single click escapes an active label edit. In labels: Return commits, Ctrl+Return inserts a newline.
- Tauri permission gotcha: window ops (destroy/close/setTitle) and plugin calls silently fail unless listed in `src-tauri/capabilities/default.json`. Symptom: "works but nothing happens" — check Help > Show Log for rejected-promise errors.
- Headless testing trick: bundle a module with `npx esbuild <file> --bundle --format=esm` to the scratchpad, stub `window`/`localStorage`, run with node.

## Rich's rules (non-negotiable)

- **Versions:** Rich supplies every version number. On ANY build request, first ask the version, offering the current one as the Enter-default. Version lives in exactly three files: `src-tauri/tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml` — update all three only after Rich confirms.
- **Git:** never commit or push outside `/publish-grue`. Never close GitHub issues.
- **Style:** terse replies, plain English, no code symbols or file paths in prose to Rich unless he asks. Do exactly what's asked — no adjacent cleanups.
- **Environment:** Dropbox syncing can lock files in `src-tauri/target/` mid-compile ("os error 32" archive failures). If a build fails that way, have Rich pause Dropbox and retry.
