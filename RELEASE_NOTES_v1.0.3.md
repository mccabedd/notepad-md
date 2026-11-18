# GitHub Release — v1.0.3

| Field | Value |
|---|---|
| **Tag** | `v1.0.3` |
| **Target** | `main` |
| **Release title** | `Notepad MD v1.0.3` |
| **Binary to attach** | `src-tauri\target\release\NotepadMD-v1.0.3-win-x64.exe` (4.05 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description.

---

## Notepad MD v1.0.3

If you have an earlier version, open **About → About Notepad MD → Check for Updates** to install this one. It reopens with all your tabs.

### Fixed
- **Right-click menus work again**: spelling suggestions on red-underlined words, and Save / Save As / Pin / Close on a tab (broken in v1.0.2).
- **Tab key** now indents instead of moving between buttons. In the editor it inserts a tab; with several lines selected, `Tab` / `Shift+Tab` indent / outdent them. In a preview list it nests / un-nests the item.
- **List indents no longer grow** when you edit in the preview (lists are written as `- item`).
- **New lines show as new lines in the preview**, so a page of links or log lines isn't run together. Plain links also stay plain links when you edit in the preview.
- **Getting out of a code block in the preview**: `Arrow Down` at the end, or `Enter` on an empty last line, moves below it, and there is always a line below a code block to click into.

### New
- **Rename a tab** by double-clicking its name. An untitled tab simply gets the new name; a saved file is renamed on disk.
- **Links in the editor** are underlined. Double-click (or `Ctrl`+click) opens them in your browser; right-clicking a link adds **Open link in new window**, **Save link as** and **Copy link** to the top of the normal right-click menu (the same as in the preview). Words inside links are no longer spell-checked.
- **Indent guides** in the editor, like Notepad++.
- **Tab header font size** in Settings → General.
- **Ticks in the View menu** show what's on (word wrap, toolbar, line numbers, layout, preview mode, spelling, dark theme).
- Menus are now **File, Edit, View, Search, About**.
- Dark scrollbars everywhere in the dark theme, and a new light-blue icon.

### Download
**[NotepadMD-v1.0.3-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.0.3/NotepadMD-v1.0.3-win-x64.exe)** is portable, so just download it and run it. It needs Windows 10 or 11 (64-bit).

- **SHA-256:** `8D79F5CEC30413C0492959C456EAB876149F875CA9F9B81A361198BD2A6BB38F`
