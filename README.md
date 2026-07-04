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

## Current state (2026-07-03)

Waves 1–4 complete. Wave 1: SVG canvas editor — tools (s/n/l/r/m, Space pan),
node/link creation and editing, selection, undo/redo, zoom, native `.grue`
format plus `.vue` import/export, legacy visual defaults preserved
(docs/legacy-specs/). Wave 2: HTML menu bar, context menus, central shortcut
dispatcher, format palette with the 48-swatch legacy palette, copy/paste style,
notes, URL/file resources. Wave 3: floating panels (Layers, Info, Map Info,
Outline, Panner, Search), view toggles and pruning, preferences, recently
opened. Wave 4: Print / Print Visible / Export PDF through the system print
dialog (whole map fitted to one page, or the current view), a real Help menu
(About, User Guide, live keyboard-shortcut table generated from the actual
bindings), and cross-platform CI builds.

### Build

Local (any platform): `npm install`, then `npx tauri build`.

- Windows: portable exe at `src-tauri/target/release/Grue.exe`,
  NSIS installer in `src-tauri/target/release/bundle/nsis/`.
- macOS: dmg in `src-tauri/target/release/bundle/dmg/`
  (Xcode command-line tools required).
- Linux: AppImage and deb in `src-tauri/target/release/bundle/appimage/` and
  `.../deb/` (install the Tauri 2 prerequisites first: `libwebkit2gtk-4.1-dev`,
  `build-essential`, `libssl-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`).

CI: `.github/workflows/build.yml` builds Windows x64 (NSIS), macOS Intel +
Apple Silicon (dmg), Linux x64 and Linux ARM64 (AppImage + deb). Run it
manually from the Actions tab, or push a `v*` tag — tag builds also draft a
GitHub release with the installers attached (publish manually; nothing is
auto-published and nothing auto-bumps versions). Installers are attached to
every run as workflow artifacts.

macOS note: builds are unsigned and un-notarized for now. On first launch,
right-click the app and choose Open (or allow it under System Settings >
Privacy & Security).

Dev: `npm run tauri dev` (desktop) or `npm run dev` (browser, file dialogs fall back
to download/upload).

## How to work in this repo

- Read this file first on every session.
- Prefer small, reviewable commits.
- Keep domain/core logic isolated from UI.
- Propose schema before implementing persistence.
- For every major subsystem, write migration notes from VUE behavior to the new design.
- Use the VUE MCP server when you need to inspect legacy build behavior, files, or branch-specific details.
