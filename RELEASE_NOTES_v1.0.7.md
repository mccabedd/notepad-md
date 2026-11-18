# GitHub Release — v1.0.7

| Field | Value |
|---|---|
| **Tag** | `v1.0.7` |
| **Target** | `main` |
| **Release title** | `Notepad MD v1.0.7` |
| **Binary to attach** | `src-tauri\target\release\NotepadMD-v1.0.7-win-x64.exe` (4.14 MB) |
| **Set as the latest release** | ✔ |

Everything below the line is the release description.

---

## Notepad MD v1.0.7

If you have an earlier version, open **About → About Notepad MD → Check for Updates** to install this one. It reopens with all your tabs.

### Fixed
- **Big files are coloured in the editor too, not just the preview.** This applies to files over about 300,000 characters and up to 4 MB, such as a large `LOG.TXT`.
  - The colouring happens in the background, so the window doesn't freeze while it's worked out.
  - While you type, the text shows plainly, and the colours return a moment after you stop.
  - Each tab remembers its colours, so switching back to it doesn't colour it again.
- **Split view with a big file:** the preview now waits for a pause in typing instead of rebuilding on every key.

### Download
**[NotepadMD-v1.0.7-win-x64.exe](https://github.com/mccabedd/notepad-md/releases/download/v1.0.7/NotepadMD-v1.0.7-win-x64.exe)** is portable, so just download it and run it. It needs Windows 10 or 11 (64-bit).

- **SHA-256:** `94D5A22712FDF97BAE2F636C88B5DEFF0C3BDF1C5FA451E172AFB7C801E7D0A0`
