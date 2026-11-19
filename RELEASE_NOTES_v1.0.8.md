# GitHub Release — v1.0.8

| Field | Value |
|---|---|
| **Tag** | `v1.0.8` |
| **Target** | `main` |
| **Release title** | `Notepad MD v1.0.8` |
| **Binary to attach** | `src-tauri\target\release\NotepadMD-v1.0.8-win-x64.exe` (4.17 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description.

---

## Notepad MD v1.0.8

If you have an earlier version, open **About → About Notepad MD → Check for Updates** to install this one. It reopens with all your tabs.

### Faster
- **Typing in medium-sized files is much quicker.** In a 100 KB Markdown file in split view, a keystroke now takes about 25 ms instead of 130 ms.
  - The editor's colours are redrawn line by line, so only the lines you change are redone.
  - The preview of a bigger file waits for a short pause in typing instead of rebuilding on every key.
- **Switching back to a tab is quicker:** its preview is reused if the text hasn't changed.
- **Line numbers** are no longer rebuilt on every key in big files.
- **Saving** no longer holds up the window, even for big files.

### Fixed
- **Find now highlights every match in big files** (e.g. a large `LOG.TXT`), in Log File and Plain Text alike, and the highlights stay on their words while you type.
- **Line numbers with 5 or 6 digits** are no longer cut off.
- **Spelling suggestions** no longer include odd words with numbers in them (such as "Un02ndled" for "Unhndled"). This was a bug in the bundled spell-checker.
- **ANSI (Windows-1252) files** now show smart quotes, €, dashes and accented letters correctly. If you type something ANSI can't store (e.g. Japanese), the file is saved as UTF-8 and the status bar tells you.

### Safer
- **Saving can't leave a half-written file.** The new text is written to a temporary file next to the document and then swapped in, keeping the file's attributes and permissions.
  - If the file is read-only, open in another program or the disk is full, you get a clear message and the original is left untouched.
  - If another program changes the file at the moment you save, you're asked before it is overwritten.
- **Safe preview:** HTML inside a Markdown document can no longer run scripts, load other pages or restyle the app. It stays in your Markdown source, even when you edit in the preview. Exported HTML is cleaned the same way.
- **Updates are verified more strictly.** Notepad MD only installs updates from its own GitHub releases, and only when the download matches the SHA-256 checksum GitHub publishes for it. A failed update always leaves your current version working.
- **Unregistering file types** no longer removes the registration of another copy of Notepad MD on the same PC.

### Look
- **Windows 11 style:**
  - Segoe UI Variable font;
  - softer hover shading;
  - Windows 11-shaped right-click menus and dialog buttons;
  - a clear focus ring when you move around with the keyboard.
- **Uses your Windows accent colour** for links, selected items and buttons. Turn it off in **Settings → Use the Windows accent colour**.

### Download
**[NotepadMD-v1.0.8-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.0.8/NotepadMD-v1.0.8-win-x64.exe)** is portable, so just download it and run it. It needs Windows 10 or 11 (64-bit).

- **SHA-256:** `18FD82826733A625AE38C378CC7F8250E1B00BD1EA4F5C233C2235B58E4CF270`
