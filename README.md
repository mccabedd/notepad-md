# Notepad MD

A Notepad-like desktop app for viewing and editing Markdown, text, BBCode and code/config files, with a live, directly-editable Markdown preview.

Built with [Tauri](https://tauri.app) (Rust backend + the OS's built-in WebView2 — no bundled Chromium), so the whole app is a single ~4 MB executable instead of the 250–300 MB a Chromium-bundling framework would produce.

## Features

### Files and tabs
- New / Open / Save / Save As / **Save All** (`Ctrl+Alt+S`) / Delete File via the File menu; Open accepts several files at once. Files can also be **dragged onto the window** or passed on the command line. Files up to 100 MB open; files over 5 MB (big logs) open in Edit Only without spell checking. Files over about 300,000 characters (up to 4 MB) are coloured in the background: the text shows plainly while you type and the colours return a moment after you pause. Above 4 MB the editor shows plain text. Typing in multi-megabyte files is slow (a limit of the browser's text box).
- **Recent Files** (File menu) lists the last 10 files you opened or saved; **Reopen Closed Tab** (`Ctrl+Shift+T`) brings back tabs you closed, including any unsaved text.
- **Files changed by other programs** — Notepad MD notices when an open file is changed, deleted or moved outside it. A tab without unsaved edits simply reloads; one with unsaved edits shows a bar asking whether to reload or keep your version. Save never silently overwrites a file someone else changed: it asks first. **File > Reload from Disk** re-reads a file on demand.
- **Follow File (Tail)** (View menu) — for log files: new lines appear as the file grows, and the view stays at the end. The status bar shows *Following*; click it to stop.
- **Print** (`Ctrl+P`), **Export as PDF** and **Export as HTML** (File menu) — the rendered Markdown / BBCode (or coloured code) on a clean white page. Exported HTML is a single file with its styles built in.
- **Session restore** (like Notepad++) — closing the app never prompts; every open tab, including unsaved edits, untitled documents, pins, bookmarks, per-tab view and font size, comes back on the next launch. Files on disk only change when you save. (Can be turned off in Settings; closing then offers to save unsaved changes.)
- **Remembered state** — window size/position, theme, toolbar, menu bar, sidebar, status bar, line numbers, word wrap, spelling, the find bar / Advanced pane (filters, options, height) and all Settings survive a restart. Everything is kept in `%APPDATA%\com.notepadmd.app\session.json`, including the text of unsaved tabs (there are no separate temp files). `instance.json` next to it lets a second launch find the running window.
- **Tabs** — always shown. Unsaved tabs show a `*` before the name; the active tab has a red bar along its top. `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle, `Ctrl+W` or middle-click closes, double-click the empty tab bar for a new document. When there are many tabs, the mouse wheel steps through them exactly like the ‹ › buttons.
- **Drag tabs** to rearrange them (pinned tabs stay together at the left). The order is remembered.
- **Rename a tab** by double-clicking its name: an untitled tab just gets the new name; a saved file is renamed on disk (in the same folder; it won't overwrite another file).
- **One window** — opening a file while Notepad MD is already running (double-click, *Open with*, command line) opens it as a tab in the running window instead of starting a second copy.
- New documents are numbered like Notepad++: a new tab takes the lowest free number (*Untitled*, *Untitled 2*, …). Empty untitled tabs are kept across restarts too.
- **New tab** — the little **+** tab after the last tab (always there, even when the tabs scroll), `Ctrl+N`, or double-click the empty part of the tab bar. The caret is already in the new tab (in the editor, or in the preview in Preview Only), so you can start typing straight away.
- **Tab right-click menu** — Save, Save As, Save All, Reload from Disk, Pin/Unpin, Close, Close Others / Close All (both keep pinned tabs), Reopen Closed Tab, Copy Full Path.
- **Pinned tabs** — pin icon on the tab; pinned tabs stay at the left.
- **Responsive with bigger files** — the editor's colours are redrawn line by line, so only the lines you change are redone; previews of medium files update after a short pause in typing; switching back to a tab reuses its preview when the text hasn't changed. In big files (logs), Find highlights every hit too.
- Files keep their encoding (UTF-8, UTF-8 BOM, UTF-16, ANSI / Windows-1252) and line endings (CRLF/LF) when saved. ANSI files show smart quotes, € and accents correctly; if you type something ANSI can't store (e.g. Japanese), the file is saved as UTF-8 instead and the status bar tells you.
- **Safe saving** — a save writes to a temporary file next to the document and then swaps it in, so a crash, full disk or locked file never leaves a half-written document. If another program changed the file since you opened it (even a moment before saving), you're asked before it is overwritten.
- **Safe preview** — HTML inside a Markdown document is shown, but anything that could run code or load another page (scripts, frames, forms, `onclick`-style attributes, `javascript:` links) is left out. It stays in your Markdown source, even when you edit in the preview.

### Views
- **Per-tab layout** — Edit Only, Preview Only, Edit Left/Preview Right, Preview Left/Edit Right (`Ctrl+Alt+1`…`4`, View menu, or the right-hand **sidebar** icons). Drag the divider to resize the split.
- **Per-tab preview mode / language** — the `MD` / `BB` button in the sidebar flips a tab between a Markdown and a BBCode preview (`Ctrl+Alt+M` / `Ctrl+Alt+B`, or View > Preview as…). **View > Language** lists every language (the current one is ticked): pick one to colour the tab that way — e.g. type HTML into a new tab and choose *HTML* — or go back to *Auto-detect from File Extension*. Clicking the language in the status bar does the same. Choosing a code language while in Preview Only switches the tab to Edit Only. The choice is remembered per tab.
- **Per-tab font size** — `Ctrl`+mouse wheel, `Ctrl++` / `Ctrl+-`, `Ctrl+0` to reset (or click the % in the status bar).
- **Word wrap** on/off (`Alt+Z`, View menu).
- Show/hide the **menu bar** (tap `Alt`), **sidebar** (`Ctrl+Shift+E`), **toolbar** (`Ctrl+T`) and **status bar** (View menu).
- Light / dark theme (`Ctrl+Shift+D`) or follow Windows.
- The **View** menu shows a tick next to whatever is on (toolbar, outline, word wrap, line numbers, follow file, current layout, preview mode, spelling, dark theme). Menus: File, Edit, View, Search, About.
- Line numbers (`Ctrl+Shift+L`) beside the editor (not the preview); bookmarked lines are shown in their bookmark colour. The column widens for 5- and 6-digit line numbers.
- **Outline** (`Ctrl+Shift+O`, View menu) — a panel on the left listing the headings of a Markdown document; click one to jump to it. It follows your typing and highlights the section you are in.
- **Go to Line** (`Ctrl+G`, Edit menu).

### Editing
- Edit directly in the rendered Markdown preview — changes sync back to the Markdown source, and vice versa.
- Every new line in the source is a new line in the preview (like Obsidian), so a list of links or log lines isn't run together. Plain links stay plain links when the preview is edited.
- **Tab key** inserts a tab in the editor; with several lines selected, `Tab` / `Shift+Tab` indent / outdent them. In a preview list, `Tab` / `Shift+Tab` nest / un-nest the item. Lists are written as `- item` (no growing indents).
- **Indent guides** — faint vertical lines at each indent step in the editor (like Notepad++).
- **Bold / italic** — `Ctrl+B` / `Ctrl+I` (or Edit menu) wrap the selection in `**…**` / `_…_` (BBCode: `[b]…[/b]` / `[i]…[/i]`); press again to remove. They also work in the preview.
- **Auto-closing brackets and quotes** — typing `(`, `[`, `{`, `"`, `'` or `` ` `` adds the closing one; typing it again steps over it, and `Backspace` removes both. With text selected, it wraps the selection (in Markdown also `*`, `_`, `~`). Apostrophes (*don't*) are left alone. Can be turned off in Settings.
- **Links in the editor** are underlined; double-click (or `Ctrl`+click) opens them in your browser. Right-clicking a link adds Open link in new window, Save link as and Copy link to the top of the normal right-click menu.
- **Code blocks in the preview** — `Arrow Down` at the end, or `Enter` on an empty last line, takes you out of the block (there is always a line below it to click into).
- **Tables in the preview** (Obsidian-style) — right-click a cell: add row above/below, add column left/right, move row up/down, move column left/right, align column (left/center/right), delete row/column/table. `Tab` / `Shift+Tab` move between cells (Tab in the last cell adds a row), `Enter` moves down.
- **Syntax colouring** for XML, HTML, CSS, YAML, JSON, INI, TOML, Python, JavaScript, Java, C, C#, C++, PowerShell (`.ps1`), MS-DOS batch (`.bat` / `.cmd`), PHP, Markdown, **BBCode** (`.bbcode` / `.bb`) and **log files**. A file named `log.txt` (any upper/lower case) opens as a Log File: error/fail words in red, warnings amber, info blue, debug grey, success words green, plus timestamps, `[thread]` tags, `key=value` names, paths, numbers, IDs and stack-trace lines. Other `.txt` files stay plain text; any tab can be switched to Log File from View > Language. Code files show a read-only coloured view in the preview pane; BBCode shows a formatted, read-only preview (bold/italic/underline, links, images, quotes, lists, colours, sizes, code, tables, spoilers).
- **Spell checking** in English (UK) or English (US) in the editor and preview; right-click a red-underlined word for suggestions, *Add to dictionary* or *Ignore*. `F7` toggles it; click the language in the status bar to switch.
- **Toolbar** (off by default) with undo/redo, headings, bold/italic/strike/underline, copy/cut/paste, table, code block, checklist, lists, indent, font size, find, delete file.
- **Insert image** (toolbar) — pick a picture and it's added as `![name](path)`, relative to the document when it has been saved (spaces become `%20`), otherwise as a full path. Local images show in the preview; editing in the preview keeps the path as written.
- Code blocks in the preview have a hover copy button; `http(s)` links open in your browser.

### Find, Advanced find and bookmarks
- **Find bar at the bottom** (`Ctrl+F`): Find, Replace, ↑ / ↓ (`Shift+F3` / `F3`), Replace, Replace All, and an **Advanced** checkbox (`Ctrl+Shift+F`). All matches are highlighted in the editor and preview.
- **Advanced pane** — a resizable list of lines, modelled on the Noxturnal Monitoring Tool's Timeline:
  - Filters: **From / To** (line numbers like `120` / `#120`, or times like `14:30`, `2024-10-14 14:30:05`, `20241014`; inclusive to the precision typed; lines without a timestamp inherit the previous one), **Find** (comma-separated terms, any of them), **Hide** (comma-separated terms to exclude), Match case, Whole word, Regex, and *This tab* / *All open tabs*.
  - Columns: Line #, Time (detected timestamps), File (all-tabs mode), Text — click a header to sort, drag a header edge to resize.
  - Click a row to jump to that line (double-click / `Enter` to start editing there); `Shift`/`Ctrl`+click and arrow keys select.
  - Right-click menu: Bookmark (Green / Orange / Red, remove, clear all in file), Remove from the list, Copy cell / lines / line numbers / table, Show from here, Show up to here, Filter by (show only / hide rows containing this), Go to line, Select all.
  - Keys: `Ctrl+Shift+B` bookmark / remove bookmark, `Delete` remove from list, `Ctrl+C` / `Ctrl+Shift+C` copy lines / line numbers, `Ctrl+A` select all.
  - **Add Bookmarks** checkbox always lists bookmarked lines; **Previous / Next** move between blocks of bookmarked lines; **Reset** clears filters and brings back removed rows; **Maximize** makes the list fill the window; **✕** closes the pane.
  - Replace All in Advanced mode only changes the listed lines.
- **Bookmarks in the editor** — `Ctrl+F2` toggle, `F2` / `Shift+F2` next / previous. Bookmarks follow their text when lines are inserted or deleted above them, and are saved with the session.

### Settings (`Ctrl+,` or File > Settings)
Theme; use the Windows accent colour (on by default; links, selected items and buttons follow your Windows colour); reopen tabs on start; menu bar / toolbar / sidebar / status bar; outline panel; tab header font size; line numbers; word wrap; auto-close brackets and quotes; tab width; editor font, size, style (regular/bold/italic), text colour and background; preview font, size, style, text colour and background ("Use theme" returns a colour to the light/dark theme); default view for new tabs (each tab can still be zoomed with Ctrl+wheel; Ctrl+0 goes back to the editor and preview sizes); spell checking and language; Reset to defaults.

- **Import / Export** — save all settings (plus your spelling dictionary) to a `.json` file and load them on another PC. Importing merges the dictionary.
- **Edit in Notepad-MD** — a checkbox adds *Edit in Notepad-MD* (with the app's icon) to Explorer's right-click menu for every file (per user, no admin needed). On Windows 11 it's under *Show more options* / Shift+right-click, because the new compact menu only lists packaged (Store/MSIX) apps.
- **Register file types** — adds Notepad MD to Windows' "Open with" list for every supported extension (per user, no admin needed; *Unregister* removes it). Windows only lets you pick the *default* app yourself, so **Open Windows Default Apps** takes you there (or right-click a file > Open with > Choose another app > Notepad MD > Always).

### About and updates
**About > About Notepad MD** shows the version, the GitHub link and the author, plus **Check for Updates**. It asks GitHub for the latest release of `mccabedd/notepad-md`. If it's newer, it shows the release notes and asks first. It then downloads the `.exe` attached to the release and checks it: a valid program, the expected size, and GitHub's SHA-256 checksum. Finally it swaps it in for the running exe, restarts, and reopens every tab. If the app sits in a folder you can't write to, it says so and leaves the download in `%TEMP%\notepadmd-update`.

To publish an update: bump `version` in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, build, create a GitHub release tagged `vX.Y.Z`, and attach the `.exe`.

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

- `ui/` — static frontend loaded into the native WebView (no build step):
  - `renderer.js` — documents, tabs, layouts, editor colour layer, spelling, session, shortcuts
  - `find.js` — bottom find bar, Advanced pane, bookmarks
  - `settings.js` — Settings dialog, word wrap / sidebar / menu bar / status bar
  - `table.js` — table editing in the preview
  - `bbcode.js` — BBCode grammar and preview renderer
  - `sanitize.js` — removes unsafe HTML from the Markdown preview, printouts and HTML exports
  - `spell-worker.js` — spellchecker (runs off the UI thread)
- `ui/vendor/` — third-party libraries (see below)
- `src-tauri/` — Rust backend (`linkmenu.rs` adds the link items to the editor's right-click menu): `main.rs` (window/menu setup, file commands, session storage, menu-bar visibility), `fileio.rs` (encoding detection incl. Windows-1252, crash-safe saving) `system.rs` (file-type registration, self-update via Windows' built-in `curl.exe` / `certutil`: only from this repository's GitHub releases, and only when the download matches the SHA-256 GitHub publishes for it) and `instance.rs` (single instance, local images for the preview)

## Tests

- Rust unit tests (encoding, saving, registration in a throwaway registry key, updater checks): `cd src-tauri` then `cargo test`.
- App tests drive the real exe through WebView2's DevTools port: `powershell -ExecutionPolicy Bypass -File tests\run-all.ps1` (build the release exe first). They work in `%TEMP%\notepadmd-tests` (or `NOTEPADMD_TEST_DIR`) with their own session, WebView2 profile and registry key, so your real settings, documents and file associations are never touched. `tests\bench.ps1 -Exe <path>` measures startup, typing, rendering and saving.

## Licence

Notepad MD is released under the [MIT licence](LICENSE). The bundled third-party components keep their own licences; their full texts are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Third-party components

- [marked](https://github.com/markedjs/marked) (MIT) — Markdown rendering
- [Turndown](https://github.com/mixmark-io/turndown) + turndown-plugin-gfm (MIT) — HTML → Markdown
- [highlight.js](https://highlightjs.org) 11.9.0 (BSD-3-Clause) — syntax colouring
- [Typo.js](https://github.com/cfinke/Typo.js) 1.2.4 (BSD-3-Clause) — Hunspell-compatible spellchecker
- en-GB / en-US Hunspell dictionaries from [SCOWL / wordlist.sourceforge.net](http://wordlist.sourceforge.net), via the `dictionary-en` and `dictionary-en-gb` packages (permissive SCOWL licence)
