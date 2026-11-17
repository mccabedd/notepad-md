# GitHub Release — v1.0.0

Fill in the GitHub "Draft a new release" form (https://github.com/mccabedd/notepad-md/releases/new) with the values below.

| Field | Value |
|---|---|
| **Choose a tag** | `v1.0.0` (type it and pick "Create new tag: v1.0.0 on publish") |
| **Target** | `main` |
| **Release title** | `Notepad MD v1.0.0` |
| **Binary to attach** | `src-tauri\target\release\NotepadMD-v1.0.0-win-x64.exe` (3.47 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description — copy/paste it into the "Describe this release" box.

---

## Notepad MD v1.0.0

The first public release of **Notepad MD**, a lightweight, Notepad-style Markdown editor for Windows. You can type straight into the rendered preview. There's no separate edit-then-render step.

It's built with Rust + [Tauri v2](https://tauri.app) on the WebView2 engine that ships with Windows, so the whole app is a **single 3.5 MB executable**. There's no installer, no bundled Chromium and no runtime to install.

### Download

**[NotepadMD-v1.0.0-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.0.0/NotepadMD-v1.0.0-win-x64.exe)** is portable, so just download it and run it.

- **Requires:** Windows 10 or 11 (64-bit). The Microsoft Edge WebView2 Runtime is already on Windows 11 and most up-to-date Windows 10 PCs.
- **SHA-256:** `81DD06AAF8A33E5C39803CEB2D69023437CC1BCAC933E85E4056F126C875AF37`

> The executable isn't code-signed, so Windows SmartScreen may show "Windows protected your PC" the first time you run it. Click **More info → Run anyway**.

### Features

**Editing**
- Edit directly in the rendered preview. Changes sync two ways with the raw Markdown source.
- Four layouts: **Preview Only** (default), **Edit Only**, **Preview Left / Edit Right**, **Edit Left / Preview Right** (`Ctrl+Alt+1`–`4`). The split divider can be dragged.
- Find & Replace (`Ctrl+F`) with next/previous match, replace one and replace all. It works in every layout, including Preview Only.
- Undo / redo, and font-size zoom (`Ctrl++` / `Ctrl+-`).

**Documents**
- Open `.md`, `.markdown` and `.txt` files from the Open dialog, or pass a file path on the command line.
- New / Open / Save / Save As / Delete File, with prompts before you lose unsaved changes.
- **Tabs** appear automatically when more than one document is open. Each tab has a dirty-dot indicator and a close button. `Ctrl+Tab` / `Ctrl+Shift+Tab` switch tabs and `Ctrl+W` closes one.

**Formatting toolbar** (hidden by default, toggle with `Ctrl+T` or View → Toolbar)
- Headings H1–H4, bold, italic, strikethrough, underline
- Bullet lists, numbered lists, checklists, indent / outdent
- Insert table, insert code block
- Cut / copy / paste, line numbers, font size, find & replace, delete file

**Preview**
- Code blocks have a hover **copy** button that stays fixed at the top-right while long code scrolls sideways.
- `http(s)` links open in your default browser.
- Optional line-number gutter (`Ctrl+Shift+L`) for both the editor and the preview, scroll-synced.

**Look & feel**
- Light / dark theme (`Ctrl+Shift+D`). It follows your OS theme by default and remembers your choice.
- Thin, theme-colored scrollbars and caret; monochrome toolbar icons that adapt to the theme.

### Keyboard shortcuts

| Action | Shortcut |
|---|---|
| New / Open / Save / Save As | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` |
| Find & Replace | `Ctrl+F` |
| Toggle toolbar | `Ctrl+T` |
| Layout modes | `Ctrl+Alt+1` … `Ctrl+Alt+4` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Close tab | `Ctrl+W` |
| Font size up / down | `Ctrl++` / `Ctrl+-` |
| Toggle theme | `Ctrl+Shift+D` |
| Toggle line numbers | `Ctrl+Shift+L` |

### Building from source

You need [Rust](https://rustup.rs) (stable, MSVC) and the Visual Studio C++ Build Tools.

```bash
cd src-tauri
cargo build --release
```

The executable is written to `src-tauri\target\release\notepad-md.exe`.
