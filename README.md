# GrUE — Graphical User Environment

GrUE is a visual mapping tool for thinking on a canvas. You put down nodes,
connect them with links, group them, stack them in layers, and attach notes,
files and web links to anything. Maps can be printed, exported to PDF, or
opened in a browser straight from a link.

The name unpacks as **Gr**aphical **U**ser **E**nvironment: a workspace you
arrange yourself, rather than a form you fill in.

GrUE is a modernized successor to [VUE](https://github.com/VUE/VUE), the
Visual Understanding Environment from Tufts University. It keeps VUE's way of
working and opens VUE's `.vue` files, but is built on current web technology
and ships as a small desktop app for Windows, macOS and Linux, and as a web
version that runs in any browser.

## What it does

- Infinite canvas with nodes, links, groups and layers
- Multiple maps open at once in tabs
- Notes, web links and file attachments on any node
- Search, outline view, panner and an info panel
- Print, print the current view, or export to PDF
- Native `.grue` format, plus import and export of VUE `.vue` files
- Keyboard-driven tools: select, node, link, rapid-link, pan

## Getting it

Installers for each platform are attached to the
[releases](https://github.com/rcrath/grue/releases).

## Building from source

You need [Node.js](https://nodejs.org/) and the
[Rust toolchain](https://rustup.rs/). On Linux, also install the Tauri 2
prerequisites first: `libwebkit2gtk-4.1-dev`, `build-essential`,
`libssl-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`. On macOS,
install the Xcode command-line tools.

```
npm install
npx tauri build
```

The results land under `src-tauri/target/release/`:

- Windows: `grue.exe`, plus an installer in `bundle/nsis/`
- macOS: a dmg in `bundle/dmg/` (unsigned; right-click and choose Open on
  first launch)
- Linux: AppImage and deb in `bundle/appimage/` and `bundle/deb/`

Web version: `npm run build` writes a static site to `dist/` that any web
server can host. If you serve it from a subfolder, change the asset paths in
`dist/index.html` from `/assets/` to `./assets/`.

For development, `npm run tauri dev` runs the desktop app with live reload,
and `npm run dev` runs the browser version on http://localhost:1420.

Project background, design notes and CI details are in [ABOUT.md](ABOUT.md).
