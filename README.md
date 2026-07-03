# grue
# Project brief

Build a future-hardened, open-source functional successor to VUE based on the public `rpavlik/VUE` `2025` branch, but preserve functionality rather than implementation.

## Product conclusion

The target product is a cross-platform visual knowledge-mapping application with:
- infinite/large canvas graph editing
- nodes, links, groups/containers, and layers
- rich metadata and external/internal resource attachments
- saved map documents in an open, durable format
- inspector/search/sidebar workflows
- pathway/presentation mode that turns map subsets into guided sequences
- import/export surfaces suitable for long-term interoperability

## Architecture conclusion

Use a web-tech UI packaged with Tauri for desktop-first delivery on Windows, macOS, and Linux, with a path to iOS and Android later. Favor platform leverage, low overhead, lean installers, and future maintainability over maximum UI uniformity. Keep the core domain model, document format, command system, and sync/storage abstractions platform-agnostic.

## Functional snapshot of legacy VUE to preserve

Legacy VUE functionally behaves like:
- a visual knowledge/concept mapping workspace
- multi-document map editor
- node/link/group/layer canvas editor
- zoom/navigation over large maps
- metadata/resource curation environment
- presentation/storytelling tool via pathways/slides
- import/export and packaging-capable desktop application

## Build conclusions from repo analysis

- The strongest branch baseline is `2025`.
- `flatlaf` appears to be a small UI-oriented delta on top of `2025`, not a better base branch.
- `2025` compiles locally with JDK 17 + Gradle wrapper, but Windows exe packaging currently fails in Launch4j task `:VUE:createExe`.
- The failure is in packaging config, not core compilation.
- In the old Java build, `settings.gradle` maps the app subproject to `:VUE`.
- This replacement project should not inherit Swing/applet-era assumptions or legacy packaging.

## Licensing conclusion

Do not reuse bundled legacy jars or distribution logic from VUE as authoritative assets. Treat the old repo as a functional reference and migration source, not a dependency source. Replace third-party dependencies with clearly licensed modern equivalents.

## Delivery plan

1. Define domain model and document schema.
2. Build canvas/editor MVP.
3. Add metadata/resource model.
4. Add pathway/presentation model.
5. Add import/export.
6. Add desktop packaging in Tauri.
7. Add mobile targets later from shared core.

## Current state (2026-07-02)

Nodes-and-edges MVP implemented (delivery plan steps 1, 2, and the node/link part of 5):

- Tauri 2 + Vite + TypeScript, no UI framework; SVG rendering.
- Node/link editing: select, node, link, and pan tools (keys s/n/l/m, hold Space to pan);
  drag-out or click node creation; drag node-to-node link creation with target highlight,
  tail arrowhead, auto-curve for parallel links; marquee and shift-click selection;
  move, resize handles, link endpoint re-attach, curve control points; inline label
  editing (double-click); delete; duplicate; nudge; undo/redo; zoom presets, wheel
  zoom/pan, fit, 100%.
- Legacy defaults preserved: node fill #F2AE45, stroke #776D6D, round-rect arc 20,
  link #404040 with tail arrow, selection chrome #4A95FF.
- Native format `.grue` (JSON, docs/schema.md). Legacy `.vue` import (nodes, links,
  curves, colors, fonts, labels, layers, groups flattened; images skipped) and minimal
  `.vue` export, verified round-trip on real maps.
- Extracted legacy behavior specs live in docs/legacy-specs/.

Build (Windows): `npm install`, then `npx tauri build`.
Artifacts: portable exe at `src-tauri/target/release/Grue.exe`,
installer at `src-tauri/target/release/bundle/nsis/`.
Dev: `npm run tauri dev` (desktop) or `npm run dev` (browser, file dialogs fall back
to download/upload).

## How to work in this repo

- Read this file first on every session.
- Prefer small, reviewable commits.
- Keep domain/core logic isolated from UI.
- Propose schema before implementing persistence.
- For every major subsystem, write migration notes from VUE behavior to the new design.
- Use the VUE MCP server when you need to inspect legacy build behavior, files, or branch-specific details.
