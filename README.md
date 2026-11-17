# Notepad MD

A Notepad-like desktop app for viewing and editing Markdown (`.md`) files, with a live, directly-editable preview pane.

Built with [Tauri](https://tauri.app) (Rust backend + the OS's built-in WebView2 — no bundled Chromium), so the whole app is a single ~3–4 MB executable instead of the 250–300 MB a Chromium-bundling framework would produce.

## Features

- New / Open / Save / Save As / Delete File via the File menu, with unsaved-changes prompts
- Edit directly in the rendered preview pane — changes sync back to the raw Markdown source, and vice versa
- **Tabs** — open more than one document and a tab bar appears automatically (a single open document stays tab-free); each tab shows a dirty dot and has its own close (✕) button. `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle tabs, `Ctrl+W` closes the active one.
- **Layout modes** (View menu): Preview Only (default), Edit Only, Preview Left/Edit Right, Edit Left/Preview Right — `Ctrl+Alt+1`...`4`. In the two split modes, drag the divider between the panes to resize them.
- **Toolbar** — off by default, enable it from View > Toolbar or `Ctrl+T`. Includes undo/redo, line numbers, heading levels (H1–H4), bold/italic/strikethrough/underline, copy/cut/paste, insert table, code block, checklist items, numbered/bullet lists, indent/outdent, font size, find & replace, and delete file. Every command works whether you're typing in the raw editor or the live preview.
- Code blocks in the preview show a copy button on hover (top-right) to copy the block's contents
- Find & replace (`Ctrl+F` or the toolbar) with next/previous match and replace-one/replace-all — works in every layout mode, including Preview Only
- Line numbers gutter (View menu or the toolbar), available for both the editor and the preview pane, scroll-synced to whichever is visible
- Font size zoom (`Ctrl++` / `Ctrl+-`, or the toolbar)
- Light / dark theme toggle (View menu or `Ctrl+Shift+D`) — defaults to your OS theme and remembers your choice
- Thin, theme-colored scrollbars and text cursor
- Open `.md`, `.markdown`, or `.txt` files from the Open dialog, or directly by passing a path as a command-line argument

## Prerequisites (build only)

Running the built `.exe` needs nothing extra on a modern Windows install (WebView2 ships with Windows 10/11). To build it yourself you need:

- [Rust](https://rustup.rs) (stable, MSVC toolchain)
- MSVC Build Tools (via Visual Studio Build Tools or Visual Studio, "Desktop development with C++")

## Build and run

```bash
cd src-tauri
cargo build --release
```

The resulting executable is at `src-tauri\target\release\notepad-md.exe` — a single standalone file, no installer or extra DLLs required.

For development with faster incremental builds (unoptimized, includes debug info):

```bash
cd src-tauri
cargo run
```

## Project layout

- `ui/` — static frontend (HTML/CSS/JS), loaded into the native WebView
- `src-tauri/` — Rust backend: window/menu setup and file I/O commands
