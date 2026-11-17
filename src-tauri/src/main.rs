#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, State, WindowEvent};

struct AppState {
    initial_file: Mutex<Option<PathBuf>>,
    is_dirty: Mutex<bool>,
}

#[derive(serde::Serialize)]
struct FileData {
    path: String,
    content: String,
}

fn read_file_data(path: &str) -> Result<FileData, String> {
    fs::read_to_string(path)
        .map(|content| FileData {
            path: path.to_string(),
            content,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_read_file(path: String) -> Result<FileData, String> {
    read_file_data(&path)
}

#[tauri::command]
fn cmd_write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn cmd_get_initial_file(state: State<AppState>) -> Option<FileData> {
    let mut guard = state.initial_file.lock().unwrap();
    let path = guard.take()?;
    read_file_data(path.to_str()?).ok()
}

#[tauri::command]
fn cmd_set_dirty(state: State<AppState>, dirty: bool) {
    *state.is_dirty.lock().unwrap() = dirty;
}

#[tauri::command]
fn cmd_force_close(window: tauri::Window) {
    let _ = window.destroy();
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

fn main() {
    let initial_file = std::env::args()
        .skip(1)
        .find(|a| a.ends_with(".md") || a.ends_with(".markdown") || a.ends_with(".txt"))
        .map(PathBuf::from)
        .filter(|p| p.exists());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            initial_file: Mutex::new(initial_file),
            is_dirty: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            cmd_read_file,
            cmd_write_file,
            cmd_get_initial_file,
            cmd_set_dirty,
            cmd_force_close,
            cmd_delete_file,
            cmd_open_url,
        ])
        .setup(|app| {
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
                    &MenuItem::with_id(app, "delete_file", "Delete File", true, None::<&str>)?,
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

            let view_submenu = Submenu::with_items(
                app,
                "View",
                true,
                &[
                    &MenuItem::with_id(app, "toolbar", "Toolbar", true, Some("CmdOrCtrl+T"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        "layout_preview_only",
                        "Preview Only",
                        true,
                        Some("CmdOrCtrl+Alt+1"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "layout_edit_only",
                        "Edit Only",
                        true,
                        Some("CmdOrCtrl+Alt+2"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "layout_preview_left",
                        "Preview Left / Edit Right",
                        true,
                        Some("CmdOrCtrl+Alt+3"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "layout_edit_left",
                        "Edit Left / Preview Right",
                        true,
                        Some("CmdOrCtrl+Alt+4"),
                    )?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(
                        app,
                        "toggle_line_numbers",
                        "Toggle Line Numbers",
                        true,
                        Some("CmdOrCtrl+Shift+L"),
                    )?,
                    &MenuItem::with_id(
                        app,
                        "find_replace",
                        "Find && Replace...",
                        true,
                        Some("CmdOrCtrl+F"),
                    )?,
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

            let menu = Menu::with_items(app, &[&file_submenu, &edit_submenu, &view_submenu])?;
            app.set_menu(menu)?;

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
                let dirty = *state.is_dirty.lock().unwrap();
                if dirty {
                    api.prevent_close();
                    let _ = window.emit("close-requested", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
