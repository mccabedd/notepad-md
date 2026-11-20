# GitHub Release — v1.1.2

| Field | Value |
|---|---|
| **Tag** | `v1.1.2` |
| **Target** | `main` |
| **Release title** | `NotePad-MD v1.1.2` |
| **Binary to attach** | `src-tauri\target\release\NotePad-MD-v1.1.2-win-x64.exe` (4.18 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description.

---

## NotePad-MD v1.1.2

If you have an earlier version, open **About → About NotePad-MD → Check for Updates** to install this one. It reopens with all your tabs.

### New
- **Bookmark margin** to the right of the line numbers:
  - click it to bookmark a line, or click the dot to remove the bookmark;
  - right-click it to choose **Green**, **Orange** or **Red**. The colour you choose is used for the next clicks and for `Ctrl+F2`;
  - bookmarks show in the same colour in the margin, the editor and Advanced Find, whichever way they were made;
  - click a line number to select that line.
- **Search → Bookmark** menu: Toggle Bookmark (`Ctrl+F2`), Next / Previous Bookmark (`F2` / `Shift+F2`), Clear All Bookmarks, Bookmark Colour, Cut / Copy Bookmarked Lines, Paste to (Replace) Bookmarked Lines, Remove Bookmarked Lines, Remove Non-Bookmarked Lines and Inverse Bookmarks. Each change to the text is a single undo step.
- **View → Show Hidden Characters** (`Ctrl+Shift+H`):
  - dots mark spaces and arrows mark tabs;
  - spaces and tabs at the end of a line get a red tint;
  - each line shows its ending (CRLF or LF), and a byte order mark (BOM) gets a marker;
  - characters you can't normally see, such as zero-width spaces and control characters, get a red marker with their code;
  - look-alike spaces, such as the no-break space, get an orange dot.

  Switching it on also lists in the status bar what the file contains, which helps find the stray character that breaks an API key or a script.
- **Advanced Find:**
  - double-click a **Time** cell to copy the time, or a **Text** cell to copy the whole line;
  - a new **Wildcard** option: `*` stands for any characters within a line, in both Find and Hide (for example `error*timeout`).

### Changed
- When the menu bar is switched off, **Alt** shows it until you pick a command, click in the window or press Alt again. To hide it for good, use **View → Menu Bar**.
- With word wrap on, line numbers now stay beside their line under long wrapped lines.

### Fixed
- In Advanced Find, double-clicking a row (to start editing there) sometimes did nothing.

### Download
**[NotePad-MD-v1.1.2-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.1.2/NotePad-MD-v1.1.2-win-x64.exe)** is portable, so just download it and run it. It needs Windows 10 or 11 (64-bit).

- **SHA-256:** `F06C0AA139E89452F13D386C4D3929F2CD2A46F49601ADBD2A0A65B7D57BAE05`

### Licence
NotePad-MD is open source under the [MIT licence](https://github.com/mccabedd/notepad-md/blob/main/LICENSE). Bundled components keep their own licences: see [THIRD_PARTY_NOTICES.md](https://github.com/mccabedd/notepad-md/blob/main/THIRD_PARTY_NOTICES.md).
