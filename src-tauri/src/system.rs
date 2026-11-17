//! Windows integration: file-type registration ("Open with") and self-update from GitHub releases.

use std::io;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use winreg::enums::*;
use winreg::RegKey;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const PROG_ID: &str = "NotepadMD.Document";
const UPDATE_API: &str = "https://api.github.com/repos/mccabedd/notepad-md/releases/latest";
const USER_AGENT: &str = "User-Agent: NotepadMD-Updater";

fn err<T>(r: io::Result<T>) -> Result<T, String> {
    r.map_err(|e| e.to_string())
}

fn exe_path() -> Result<PathBuf, String> {
    err(std::env::current_exe())
}

#[derive(serde::Serialize)]
pub struct AppInfo {
    version: String,
    exe: String,
}

#[tauri::command]
pub fn cmd_app_info() -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        exe: exe_path()?.to_string_lossy().to_string(),
    })
}

/// Deletes the previous executable left behind by an update. Right after an update the old
/// process may still be exiting (its exe stays locked until then), so keep trying for a while.
pub fn cleanup_after_update() {
    if let Ok(exe) = std::env::current_exe() {
        let old = exe.with_extension("old");
        if !old.exists() {
            return;
        }
        std::thread::spawn(move || {
            for _ in 0..40 {
                if std::fs::remove_file(&old).is_ok() || !old.exists() {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(250));
            }
        });
    }
}

/* ---------------- file types ---------------- */

/// HKCU\Software\Classes, or another HKCU path from NOTEPADMD_REG_ROOT (used by automated tests).
fn classes_root() -> Result<RegKey, String> {
    let sub = std::env::var("NOTEPADMD_REG_ROOT").unwrap_or_else(|_| "Software\\Classes".into());
    let (key, _) = err(RegKey::predef(HKEY_CURRENT_USER).create_subkey(&sub))?;
    Ok(key)
}

fn valid_ext(ext: &str) -> bool {
    !ext.is_empty() && ext.len() <= 12 && ext.chars().all(|c| c.is_ascii_alphanumeric())
}

fn open_command(exe: &str) -> String {
    format!("\"{}\" \"%1\"", exe)
}

fn exe_file_name(exe: &PathBuf) -> String {
    exe.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "notepad-md.exe".into())
}

#[link(name = "shell32")]
extern "system" {
    fn SHChangeNotify(event_id: i32, flags: u32, item1: *const core::ffi::c_void, item2: *const core::ffi::c_void);
}

fn notify_assoc_changed() {
    // SHCNE_ASSOCCHANGED: tells Explorer to refresh icons and "Open with" lists.
    unsafe { SHChangeNotify(0x0800_0000, 0, std::ptr::null(), std::ptr::null()) };
}

/// Adds Notepad MD to the "Open with" list of every extension (per user, no admin rights needed).
/// Windows does not let apps make themselves the default silently; the user confirms that once
/// in "Open with > Always" or Settings > Default apps.
#[tauri::command]
pub fn cmd_register_file_types(exts: Vec<String>) -> Result<usize, String> {
    let exe = exe_path()?;
    let exe_s = exe.to_string_lossy().to_string();
    let cmd = open_command(&exe_s);
    let root = classes_root()?;

    let (prog, _) = err(root.create_subkey(PROG_ID))?;
    err(prog.set_value("", &"Notepad MD document"))?;
    err(err(prog.create_subkey("DefaultIcon"))?.0.set_value("", &format!("\"{}\",0", exe_s)))?;
    err(err(prog.create_subkey("shell\\open\\command"))?.0.set_value("", &cmd))?;

    let (app, _) = err(root.create_subkey(format!("Applications\\{}", exe_file_name(&exe))))?;
    err(app.set_value("FriendlyAppName", &"Notepad MD"))?;
    err(err(app.create_subkey("shell\\open\\command"))?.0.set_value("", &cmd))?;
    let (types, _) = err(app.create_subkey("SupportedTypes"))?;

    let mut n = 0;
    for ext in exts.iter().map(|e| e.trim_start_matches('.').to_ascii_lowercase()) {
        if !valid_ext(&ext) {
            continue;
        }
        let dot = format!(".{}", ext);
        err(types.set_value(&dot, &""))?;
        let (k, _) = err(root.create_subkey(format!("{}\\OpenWithProgids", dot)))?;
        err(k.set_value(PROG_ID, &""))?;
        n += 1;
    }
    notify_assoc_changed();
    Ok(n)
}

#[tauri::command]
pub fn cmd_unregister_file_types(exts: Vec<String>) -> Result<(), String> {
    let exe = exe_path()?;
    let root = classes_root()?;
    let _ = root.delete_subkey_all(PROG_ID);
    let _ = root.delete_subkey_all(format!("Applications\\{}", exe_file_name(&exe)));
    for ext in exts.iter().map(|e| e.trim_start_matches('.').to_ascii_lowercase()) {
        if !valid_ext(&ext) {
            continue;
        }
        if let Ok(k) = root.open_subkey_with_flags(format!(".{}\\OpenWithProgids", ext), KEY_ALL_ACCESS) {
            let _ = k.delete_value(PROG_ID);
        }
    }
    notify_assoc_changed();
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileTypeStatus {
    registered: bool,
    /// Registered, but for a different copy of the exe (e.g. it was moved).
    other_exe: Option<String>,
}

#[tauri::command]
pub fn cmd_file_types_status() -> Result<FileTypeStatus, String> {
    let exe = exe_path()?.to_string_lossy().to_string();
    let root = classes_root()?;
    let current: Option<String> = root
        .open_subkey(format!("{}\\shell\\open\\command", PROG_ID))
        .ok()
        .and_then(|k| k.get_value("").ok());
    Ok(match current {
        Some(c) if c.eq_ignore_ascii_case(&open_command(&exe)) => FileTypeStatus { registered: true, other_exe: None },
        Some(c) => FileTypeStatus { registered: false, other_exe: Some(c) },
        None => FileTypeStatus { registered: false, other_exe: None },
    })
}

#[tauri::command]
pub fn cmd_open_default_apps() -> Result<(), String> {
    open::that("ms-settings:defaultapps").map_err(|e| e.to_string())
}

/* ---------------- updates ---------------- */

/// Windows 10/11 ship curl.exe, so no HTTP library is needed.
fn curl(args: &[&str]) -> Result<Vec<u8>, String> {
    let out = err(Command::new("curl.exe").args(args).creation_flags(CREATE_NO_WINDOW).output())
        .map_err(|e| format!("Could not run curl.exe: {}", e))?;
    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if msg.contains("404") {
            return Err("No release has been published on GitHub yet.".into());
        }
        return Err(if msg.is_empty() { format!("Download failed (curl exit {:?}).", out.status.code()) } else { msg });
    }
    Ok(out.stdout)
}

/// SHA-256 via Windows' built-in certutil (avoids adding a hashing library).
fn sha256_file(path: &str) -> Result<String, String> {
    let out = err(Command::new("certutil.exe").args(["-hashfile", path, "SHA256"]).creation_flags(CREATE_NO_WINDOW).output())?;
    let text = String::from_utf8_lossy(&out.stdout);
    text.lines()
        .map(|l| l.trim().replace(' ', ""))
        .find(|l| l.len() == 64 && l.chars().all(|c| c.is_ascii_hexdigit()))
        .ok_or_else(|| "Could not check the download's checksum.".to_string())
}

fn update_api() -> String {
    std::env::var("NOTEPADMD_UPDATE_URL").unwrap_or_else(|_| UPDATE_API.into())
}

fn parse_version(s: &str) -> Vec<u64> {
    s.trim()
        .trim_start_matches(['v', 'V'])
        .split('.')
        .map(|p| p.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0))
        .collect()
}

fn is_newer(latest: &str, current: &str) -> bool {
    let (a, b) = (parse_version(latest), parse_version(current));
    for i in 0..a.len().max(b.len()) {
        let (x, y) = (*a.get(i).unwrap_or(&0), *b.get(i).unwrap_or(&0));
        if x != y {
            return x > y;
        }
    }
    false
}

#[derive(serde::Serialize)]
pub struct UpdateInfo {
    current: String,
    latest: String,
    newer: bool,
    page_url: String,
    notes: String,
    asset_name: Option<String>,
    asset_url: Option<String>,
    asset_size: Option<u64>,
    digest: Option<String>,
}

#[tauri::command]
pub async fn cmd_check_update() -> Result<UpdateInfo, String> {
    let url = update_api();
    let body = curl(&["-sSL", "--fail", "--max-time", "20", "-H", USER_AGENT, "-H", "Accept: application/vnd.github+json", &url])?;
    let v: serde_json::Value = serde_json::from_slice(&body).map_err(|_| "GitHub sent an unexpected reply.".to_string())?;
    let tag = v["tag_name"].as_str().unwrap_or("").to_string();
    if tag.is_empty() {
        return Err("No release has been published on GitHub yet.".into());
    }
    let current = env!("CARGO_PKG_VERSION").to_string();
    let assets = v["assets"].as_array().cloned().unwrap_or_default();
    let exe_asset = assets.iter().find(|a| a["name"].as_str().map(|n| n.to_ascii_lowercase().ends_with(".exe")).unwrap_or(false));
    Ok(UpdateInfo {
        newer: is_newer(&tag, &current),
        latest: tag.trim_start_matches(['v', 'V']).to_string(),
        current,
        page_url: v["html_url"].as_str().unwrap_or("").to_string(),
        notes: v["body"].as_str().unwrap_or("").chars().take(1500).collect(),
        asset_name: exe_asset.and_then(|a| a["name"].as_str().map(String::from)),
        asset_url: exe_asset.and_then(|a| a["browser_download_url"].as_str().map(String::from)),
        asset_size: exe_asset.and_then(|a| a["size"].as_u64()),
        digest: exe_asset.and_then(|a| a["digest"].as_str().map(String::from)),
    })
}

/// Downloads the new exe, verifies it, swaps it in for the running one (a running exe can be
/// renamed on Windows, just not overwritten), starts it and exits. The page saves the session
/// first, so the new version reopens every tab.
#[tauri::command]
pub async fn cmd_install_update(app: tauri::AppHandle, asset_url: String, digest: Option<String>, size: Option<u64>) -> Result<(), String> {
    let test_mode = std::env::var("NOTEPADMD_UPDATE_URL").is_ok();
    if !(asset_url.starts_with("https://") || (test_mode && asset_url.starts_with("file:"))) {
        return Err("Refusing to download an update from a non-https address.".into());
    }
    let dir = std::env::temp_dir().join("notepadmd-update");
    err(std::fs::create_dir_all(&dir))?;
    let tmp = dir.join("NotepadMD-update.exe");
    let _ = std::fs::remove_file(&tmp);
    let tmp_s = tmp.to_string_lossy().to_string();
    curl(&["-sSL", "--fail", "--max-time", "600", "-H", USER_AGENT, "-o", &tmp_s, &asset_url])?;

    let bytes = err(std::fs::read(&tmp))?;
    if bytes.len() < 500_000 || !bytes.starts_with(b"MZ") {
        return Err("The download is not a valid Windows program.".into());
    }
    if let Some(expected) = size {
        if bytes.len() as u64 != expected {
            return Err("The download is incomplete (size does not match the release).".into());
        }
    }
    if let Some(hex) = digest.as_deref().and_then(|d| d.strip_prefix("sha256:")) {
        let actual = sha256_file(&tmp_s)?;
        if !actual.eq_ignore_ascii_case(hex) {
            return Err("The download failed its checksum test, so it was not installed.".into());
        }
    }

    let exe = exe_path()?;
    let old = exe.with_extension("old");
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).map_err(|e| {
        format!("Could not replace {} ({}). The new version was downloaded to {}.", exe.display(), e, tmp.display())
    })?;
    if std::fs::rename(&tmp, &exe).is_err() {
        if let Err(e) = std::fs::copy(&tmp, &exe) {
            let _ = std::fs::rename(&old, &exe); // put the running version back
            return Err(format!("Could not install the update: {}", e));
        }
    }
    err(Command::new(&exe).arg("--after-update").spawn()).map_err(|e| format!("Updated, but could not restart: {}", e))?;
    // Give the reply a moment to reach the page, then quit; the new version takes over.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(0);
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions() {
        assert!(is_newer("v1.0.1", "1.0.0"));
        assert!(is_newer("1.10.0", "1.9.9"));
        assert!(!is_newer("v1.0.0", "1.0.0"));
        assert!(!is_newer("0.9", "1.0.0"));
        assert!(is_newer("2", "1.9.9"));
    }
}
