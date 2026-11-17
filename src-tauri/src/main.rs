#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod system;

use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, State, WindowEvent};

/// Files larger than this are refused (the editor is not built for huge files).
const MAX_FILE_BYTES: u64 = 20 * 1024 * 1024;

struct AppState {
    initial_files: Mutex<Vec<PathBuf>>,
    /// Set once the window has started closing, so a second close request goes straight through.
    closing: AtomicBool,
    /// The page confirmed it is handling the close (it may be showing a save prompt), so the
    /// safety-net timer must not destroy the window.
    close_acked: AtomicBool,
}

#[derive(serde::Serialize)]
struct FileData {
    path: String,
    content: String,
    /// One of: utf8, utf8bom, utf16le, utf16be, latin1. Used to write the file back the same way.
    encoding: String,
}

fn decode(bytes: &[u8]) -> Result<(String, &'static str), String> {
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes[3..].to_vec())
            .map(|s| (s, "utf8bom"))
            .map_err(|_| "File has a UTF-8 marker but is not valid UTF-8".into());
    }
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        let le = bytes[0] == 0xFF;
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|c| if le { u16::from_le_bytes([c[0], c[1]]) } else { u16::from_be_bytes([c[0], c[1]]) })
            .collect();
        return String::from_utf16(&units)
            .map(|s| (s, if le { "utf16le" } else { "utf16be" }))
            .map_err(|_| "File is not valid UTF-16".into());
    }
    if bytes.contains(&0) {
        return Err("This looks like a binary file, not text".into());
    }
    match String::from_utf8(bytes.to_vec()) {
        Ok(s) => Ok((s, "utf8")),
        // Not UTF-8: treat as Windows ANSI / Latin-1 (every byte maps to one character).
        Err(_) => Ok((bytes.iter().map(|&b| b as char).collect(), "latin1")),
    }
}

fn encode(content: &str, encoding: &str) -> Vec<u8> {
    match encoding {
        "utf8bom" => {
            let mut v = vec![0xEF, 0xBB, 0xBF];
            v.extend_from_slice(content.as_bytes());
            v
        }
        "utf16le" | "utf16be" => {
            let le = encoding == "utf16le";
            let mut v = if le { vec![0xFF, 0xFE] } else { vec![0xFE, 0xFF] };
            for u in content.encode_utf16() {
                v.extend_from_slice(&if le { u.to_le_bytes() } else { u.to_be_bytes() });
            }
            v
        }
        // Keep Latin-1 only while every character still fits; otherwise fall back to UTF-8.
        "latin1" if content.chars().all(|c| (c as u32) < 256) => content.chars().map(|c| c as u8).collect(),
        _ => content.as_bytes().to_vec(),
    }
}

fn read_file_data(path: &str) -> Result<FileData, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("That is a folder, not a file".into());
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err("File is too large to open (over 20 MB)".into());
    }
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    let (content, encoding) = decode(&bytes)?;
    Ok(FileData {
        path: path.to_string(),
        content,
        encoding: encoding.to_string(),
    })
}

/// Write via a temp file + rename so a crash mid-write never leaves a half-written file.
fn write_atomic(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let tmp = path.with_extension("notepadmd-tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
}

#[tauri::command]
fn cmd_read_file(path: String) -> Result<FileData, String> {
    read_file_data(&path)
}

#[tauri::command]
fn cmd_write_file(path: String, content: String, encoding: Option<String>) -> Result<(), String> {
    let bytes = encode(&content, encoding.as_deref().unwrap_or("utf8"));
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_initial_files(state: State<AppState>) -> Vec<String> {
    let mut guard = state.initial_files.lock().unwrap();
    guard.drain(..).filter_map(|p| p.to_str().map(String::from)).collect()
}

#[tauri::command]
fn cmd_force_close(window: tauri::Window) {
    let _ = window.destroy();
}

#[tauri::command]
fn cmd_close_ack(state: State<AppState>) {
    state.close_acked.store(true, Ordering::SeqCst);
}

/// The user cancelled closing (e.g. in a save prompt): the next close request starts afresh.
#[tauri::command]
fn cmd_close_cancelled(state: State<AppState>) {
    state.close_acked.store(false, Ordering::SeqCst);
    state.closing.store(false, Ordering::SeqCst);
}

#[tauri::command]
fn cmd_set_menu_visible(window: tauri::Window, visible: bool) -> Result<(), String> {
    let r = if visible { window.show_menu() } else { window.hide_menu() };
    r.map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_delete_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("Only http/https URLs can be opened".into());
    }
    open::that(url).map_err(|e| e.to_string())
}

fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // NOTEPADMD_DATA_DIR lets automated tests use a throwaway folder instead of the real session.
    let dir = match std::env::var_os("NOTEPADMD_DATA_DIR") {
        Some(d) => PathBuf::from(d),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

#[tauri::command]
fn cmd_session_load(app: tauri::AppHandle) -> Option<String> {
    let path = session_path(&app).ok()?;
    fs::read_to_string(path).ok()
}

#[tauri::command]
fn cmd_session_save(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let path = session_path(&app)?;
    write_atomic(&path, json.as_bytes())
}

fn main() {
    system::cleanup_after_update();
    let initial_files: Vec<PathBuf> = std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .collect();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            initial_files: Mutex::new(initial_files),
            closing: AtomicBool::new(false),
            close_acked: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            cmd_read_file,
            cmd_write_file,
            cmd_get_initial_files,
            cmd_force_close,
            cmd_delete_file,
            cmd_open_url,
            cmd_session_load,
            cmd_session_save,
            cmd_close_ack,
            cmd_close_cancelled,
            cmd_set_menu_visible,
            system::cmd_app_info,
            system::cmd_register_file_types,
            system::cmd_unregister_file_types,
            system::cmd_file_types_status,
            system::cmd_open_default_apps,
            system::cmd_check_update,
            system::cmd_install_update,
        ])
        .setup(|app| {
            // Accelerator strings below are display-only hint text: every shortcut is actually
            // handled by the JS keydown handler in ui/renderer.js.
            let file_submenu = Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &MenuItem::with_id(app, "new", "New", true, Some("CmdOrCtrl+N"))?,
                    &MenuItem::with_id(app, "open", "Open...", true, Some("CmdOrCtrl+O"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "save", "Save", true, Some("CmdOrCtrl+S"))?,
                    &MenuItem::with_id(
                        app,
                        "save_as",
                        "Save As...",
                        true,
                        Some("CmdOrCtrl+Shift+S"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "close_tab", "Close Tab", true, Some("CmdOrCtrl+W"))?,
                    &MenuItem::with_id(app, "delete_file", "Delete File", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "settings", "Settings...\tCtrl+,", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "exit", "Exit", true, Some("Alt+F4"))?,
                ],
            )?;

            let edit_submenu = Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?;

            let spelling_submenu = Submenu::with_items(
                app,
                "Spelling",
                true,
                &[
                    &MenuItem::with_id(app, "spell_toggle", "Spell Check On/Off", true, Some("F7"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "spell_en_gb", "English (UK)", true, None::<&str>)?,
                    &MenuItem::with_id(app, "spell_en_us", "English (US)", true, None::<&str>)?,
                ],
            )?;

            let search_submenu = Submenu::with_items(
                app,
                "Search",
                true,
                &[
                    &MenuItem::with_id(
                        app,
                        "find_replace",
                        "Find && Replace...",
                        true,
                        Some("CmdOrCtrl+F"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "find_advanced",
                        "Advanced Find...",
                        true,
                        Some("CmdOrCtrl+Shift+F"),
                    )?,
                    &MenuItem::with_id(app, "find_next", "Find Next", true, Some("F3"))?,
                    &MenuItem::with_id(app, "find_prev", "Find Previous", true, Some("Shift+F3"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "bookmark_toggle", "Toggle Bookmark", true, Some("CmdOrCtrl+F2"))?,
                    &MenuItem::with_id(app, "bookmark_next", "Next Bookmark", true, Some("F2"))?,
                    &MenuItem::with_id(app, "bookmark_prev", "Previous Bookmark", true, Some("Shift+F2"))?,
                    &MenuItem::with_id(app, "bookmark_clear", "Clear Bookmarks in This Tab...", true, None::<&str>)?,
                ],
            )?;

            let view_submenu = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &MenuItem::with_id(app, "toolbar", "Toolbar", true, Some("CmdOrCtrl+T"))?,
                    &MenuItem::with_id(app, "sidebar", "Sidebar", true, Some("CmdOrCtrl+Shift+E"))?,
                    // "Alt" alone is not a valid accelerator, so the hint is part of the title.
                    &MenuItem::with_id(app, "menu_bar", "Menu Bar\tAlt", true, None::<&str>)?,
                    &MenuItem::with_id(app, "status_bar", "Status Bar", true, None::<&str>)?,
                    &MenuItem::with_id(app, "word_wrap", "Word Wrap", true, Some("Alt+Z"))?,
                    &PredefinedMenuItem::separator(app)?,
                    // Order (and Ctrl+Alt+1..4): Edit, Preview, Edit/Preview, Preview/Edit.
                    &MenuItem::with_id(app, "layout_edit_only", "Edit Only", true, Some("CmdOrCtrl+Alt+1"))?,
                    &MenuItem::with_id(app, "layout_preview_only", "Preview Only", true, Some("CmdOrCtrl+Alt+2"))?,
                    &MenuItem::with_id(
                        app,
                        "layout_edit_left",
                        "Edit Left / Preview Right",
                        true,
                        Some("CmdOrCtrl+Alt+3"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "layout_preview_left",
                        "Preview Left / Edit Right",
                        true,
                        Some("CmdOrCtrl+Alt+4"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "preview_markdown", "Preview as Markdown", true, Some("CmdOrCtrl+Alt+M"))?,
                    &MenuItem::with_id(app, "preview_bbcode", "Preview as BBCode", true, Some("CmdOrCtrl+Alt+B"))?,
                    &MenuItem::with_id(app, "language_menu", "Language...", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        "toggle_line_numbers",
                        "Toggle Line Numbers",
                        true,
                        Some("CmdOrCtrl+Shift+L"),
                    )?,
                    &spelling_submenu,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        "font_increase",
                        "Increase Font Size\tCtrl++",
                        true,
                        None::<&str>,
                    )?,
                    &MenuItem::with_id(
                        app,
                        "font_decrease",
                        "Decrease Font Size",
                        true,
                        Some("CmdOrCtrl+-"),
                    )?,
                    &MenuItem::with_id(app, "font_reset", "Reset Font Size", true, Some("CmdOrCtrl+0"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        "toggle_theme",
                        "Toggle Dark/Light Theme",
                        true,
                        Some("CmdOrCtrl+Shift+D"),
                    )?,
                ],
            )?;

            let about_submenu = Submenu::with_items(
                app,
                "About",
                true,
                &[&MenuItem::with_id(app, "about", "About Notepad MD...", true, None::<&str>)?],
            )?;

            let menu = Menu::with_items(app, &[&file_submenu, &edit_submenu, &search_submenu, &view_submenu, &about_submenu])?;
            app.set_menu(menu)?;

            // The window starts hidden so the page can restore its saved size/position first and then
            // show it. Safety net: show it anyway after a few seconds if the page never does.
            if let Some(w) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                });
            }

            app.on_menu_event(move |app_handle, event| {
                let id = event.id().0.as_str();
                match id {
                    "exit" => {
                        if let Some(w) = app_handle.get_webview_window("main") {
                            let _ = w.close();
                        }
                    }
                    _ => {
                        let _ = app_handle.emit(&format!("menu-{}", id.replace('_', "-")), ());
                    }
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                // First close request: let the page snapshot the session (all tabs, including
                // unsaved edits) and then call cmd_force_close. A watchdog closes the window
                // anyway after a few seconds so a broken page can never block quitting.
                if !state.closing.swap(true, Ordering::SeqCst) {
                    api.prevent_close();
                    state.close_acked.store(false, Ordering::SeqCst);
                    let _ = window.emit("close-requested", ());
                    let w = window.clone();
                    std::thread::spawn(move || {
                        std::thread::sleep(Duration::from_secs(4));
                        let acked = w.state::<AppState>().close_acked.load(Ordering::SeqCst);
                        if !acked {
                            let _ = w.destroy();
                        }
                    });
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
