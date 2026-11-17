# GitHub Release — v1.0.0

Fill in the GitHub "Draft a new release" form (https://github.com/mccabedd/notepad-md/releases/new) with the values below.

| Field | Value |
|---|---|
| **Choose a tag** | `v1.0.0` (type it and pick "Create new tag: v1.0.0 on publish") |
| **Target** | `main` |
| **Release title** | `Notepad MD v1.0.0` |
| **Binary to attach** | `src-tauri\target\release\NotepadMD-v1.0.0-win-x64.exe` (3.99 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description — copy/paste it into the "Describe this release" box.

---

## Notepad MD v1.0.0

The first public release of **Notepad MD**, a lightweight, Notepad-style Markdown editor for Windows. You can type straight into the rendered preview. There's no separate edit-then-render step.

It's built with Rust + [Tauri v2](https://tauri.app) on the WebView2 engine that ships with Windows, so the whole app is a **single 4.0 MB executable**. There's no installer, no bundled Chromium and no runtime to install.

### Download

**[NotepadMD-v1.0.0-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.0.0/NotepadMD-v1.0.0-win-x64.exe)** is portable, so just download it and run it.

- **Requires:** Windows 10 or 11 (64-bit). The Microsoft Edge WebView2 Runtime is already on Windows 11 and most up-to-date Windows 10 PCs.
- **SHA-256:** `3342E6AE71C5DA4383E57D62663B3173B88D1CAAA5DBA83BD7ED9833F2B8266E`

> The executable isn't code-signed, so Windows SmartScreen may show "Windows protected your PC" the first time you run it. Click **More info → Run anyway**.

### Features

**Editing**
- Edit directly in the rendered preview. Changes sync two ways with the raw Markdown source.
- **Tables in the preview** work like Obsidian's. Right-click a cell to add, move, align or delete rows and columns. `Tab` / `Shift+Tab` move between cells; `Tab` in the last cell adds a row.
- Four layouts: **Edit Only**, **Preview Only**, **Edit Left / Preview Right**, **Preview Left / Edit Right** (`Ctrl+Alt+1`–`4`, the View menu, or the right-hand sidebar). **Each tab keeps its own layout and font size** (`Ctrl`+mouse wheel, `Ctrl++` / `Ctrl+-`, `Ctrl+0` to reset).
- **Markdown or BBCode preview, per tab.** Use the sidebar's `MD` / `BB` button (`Ctrl+Alt+M` / `Ctrl+Alt+B`), or click the language in the status bar to choose any language or go back to auto-detect.
- **Word wrap** on or off (`Alt+Z`).
- **Spell checking** in English (UK) or English (US), in both the editor and the preview. Right-click a red-underlined word for suggestions, *Add to dictionary* or *Ignore*. `F7` turns it on or off.

**Find, Advanced find and bookmarks**
- The find bar sits at the bottom of the window (`Ctrl+F`, `F3` / `Shift+F3`), and every match is highlighted.
- Ticking **Advanced** (`Ctrl+Shift+F`) opens a resizable list of lines, modelled on a log Timeline:
  - **Filters:** From / To (line numbers or timestamps), Find (comma-separated terms), Hide, Match case, Whole word, Regex, and this tab or all open tabs.
  - **The list:** sortable, resizable columns. Click a row to jump to its line.
  - **Bookmarks:** Green, Orange and Red (`Ctrl+B`), with Previous / Next navigation between bookmarked blocks and an *Add Bookmarks* option that keeps bookmarked lines listed.
  - **Row menu:** right-click for copy, "Show from here" / "Show up to here" and "Filter by".
  - **Pane:** Maximize, Reset, and ✕ to close it.
- Editor bookmarks: `Ctrl+F2` toggles one, and `F2` / `Shift+F2` jump between them.

**Syntax colouring**
- XML, HTML, YAML, JSON, INI, TOML, Python, JavaScript, PowerShell, MS-DOS batch, PHP, Markdown and **BBCode**, in light and dark themes. Code files open in Edit Only with a read-only coloured preview. BBCode files get a formatted, read-only preview.
- Files keep their encoding (UTF-8, UTF-8 BOM, UTF-16, ANSI) and line endings (CRLF / LF) when saved.

**Documents and tabs**
- Open files from the Open dialog (several at once), by **dragging them onto the window**, or by passing paths on the command line.
- **Session restore**, like Notepad++: closing the app never prompts. Every tab, including unsaved edits and untitled documents, comes back on the next launch with its pin, layout, font size and bookmarks. You can turn this off in Settings, and the app then offers to save on close.
- **Everything is remembered:** window size and position, theme, toolbar, menu bar, sidebar, line numbers, word wrap, find and Advanced state, and all Settings.
- An always-visible tab bar. Unsaved tabs show a `*` before the name, and the active tab has a red bar along its top. The mouse wheel scrolls through many tabs. The tab right-click menu has Save, Save As, Pin, Close Others and Close All (pinned tabs are kept).

**Settings** (`Ctrl+,`)
- **General:** theme, reopening tabs on start, and showing the menu bar (`Alt`), toolbar (`Ctrl+T`), sidebar (`Ctrl+Shift+E`) and status bar.
- **Editor and Preview:** line numbers, word wrap and tab width, plus font, style, text colour and background, set separately for the editor and the preview.
- **New tabs:** default view and font size.
- **Spelling:** on or off, and the language.
- **Import / Export** of all settings, including your spelling dictionary.
- **Register file types:** adds Notepad MD to Windows' "Open with" list for every supported extension, with a shortcut to Windows Default Apps.

**About and updates**
- **About → About Notepad MD** shows the version, the project link and **Check for Updates**. It finds the newest GitHub release and asks before installing. It then downloads and verifies it, replaces the app, and reopens it with your tabs.

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
| Settings | `Ctrl+,` |
| Find & Replace / Advanced find | `Ctrl+F` / `Ctrl+Shift+F` |
| Next / previous match | `F3` / `Shift+F3` |
| Toggle bookmark / next / previous | `Ctrl+F2` / `F2` / `Shift+F2` |
| Edit / Preview / Edit-Preview / Preview-Edit | `Ctrl+Alt+1` … `Ctrl+Alt+4` |
| Preview as Markdown / BBCode | `Ctrl+Alt+M` / `Ctrl+Alt+B` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Close tab | `Ctrl+W` or middle-click |
| Font size up / down / reset (this tab) | `Ctrl++` / `Ctrl+-` / `Ctrl+0`, or `Ctrl`+mouse wheel |
| Word wrap | `Alt+Z` |
| Menu bar / toolbar / sidebar | `Alt` / `Ctrl+T` / `Ctrl+Shift+E` |
| Toggle theme / line numbers | `Ctrl+Shift+D` / `Ctrl+Shift+L` |
| Spell checking on / off | `F7` |
| In the Advanced list | `Ctrl+B` bookmark, `Ctrl+Shift+B` remove, `Delete` remove row, `Ctrl+C` / `Ctrl+Shift+C` copy lines / numbers, `Enter` go to line |
| In a preview table | `Tab` / `Shift+Tab` next / previous cell, `Enter` cell below |

### Building from source

You need [Rust](https://rustup.rs) (stable, MSVC) and the Visual Studio C++ Build Tools.

```bash
cd src-tauri
cargo build --release
```

The executable is written to `src-tauri\target\release\notepad-md.exe`.
