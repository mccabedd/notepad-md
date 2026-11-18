# GitHub Release — v1.0.5

| Field | Value |
|---|---|
| **Tag** | `v1.0.5` |
| **Target** | `main` |
| **Release title** | `Notepad MD v1.0.5` |
| **Binary to attach** | `src-tauri\target\release\NotepadMD-v1.0.5-win-x64.exe` (4.13 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description.

---

## Notepad MD v1.0.5

If you have an earlier version, open **About → About Notepad MD → Check for Updates** to install this one. It reopens with all your tabs.

### New
- **Notices when a file changes outside Notepad MD.** If another program changes, deletes or moves a file you have open:
  - A tab with no unsaved edits simply reloads.
  - A tab with unsaved edits shows a bar where you choose to reload or keep your version.
  - **Save** asks before it overwrites a file that someone else changed.
  - **File → Reload from Disk** re-reads a file whenever you want.
- **Follow File (Tail)** in the View menu, for log files. New lines appear as the file grows, and the view stays at the end.
- **Recent Files** in the File menu, with your last 10 files.
- **Reopen Closed Tab** with `Ctrl+Shift+T`. It brings back tabs you closed, including any unsaved text.
- **Save All** with `Ctrl+Alt+S`.
- **Print** with `Ctrl+P`, plus **Export as PDF** and **Export as HTML**. They give the rendered document on a clean white page.
- **Go to Line** with `Ctrl+G`.
- **Outline** with `Ctrl+Shift+O`: a panel listing the headings of a Markdown document. Click one to jump to it.
- **Bold / italic** with `Ctrl+B` / `Ctrl+I` in the editor (`**…**` / `_…_`, or `[b]` / `[i]` in BBCode). Press again to remove.
- **Auto-closing brackets and quotes** in the editor. Typing `(` adds the `)`, and selected text gets wrapped. Apostrophes are left alone. You can turn it off in Settings.
- **Bigger files** now open, up to 100 MB (was 20 MB). Files over 5 MB open in Edit Only, without colouring, so they stay quick.

### Changed
- In the Advanced find list, bookmarking a row is now **`Ctrl+Shift+B`** (press again to remove the bookmark). `Ctrl+B` now means bold.

### Download
**[NotepadMD-v1.0.5-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.0.5/NotepadMD-v1.0.5-win-x64.exe)** is portable, so just download it and run it. It needs Windows 10 or 11 (64-bit).

- **SHA-256:** `1F2BD5962EB816AFB2E36009B8080999704814EC6065E2B7CE4C969D0540E649`
