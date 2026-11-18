//! Save As dialog. The dialog plugin always gives Windows a default extension (the first one in the
//! first filter), so with "All Files" chosen, `config.yml` still came back as `config.yml.md`. Here
//! the name is kept exactly as typed; the document's extension is only added when the name has no
//! extension and the document's own file type (not "All Files") is selected.

use std::path::Path;

use tauri::WebviewWindow;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
use windows::Win32::UI::Shell::{
    FileSaveDialog, IFileSaveDialog, IShellItem, SHCreateItemFromParsingName, FOS_FORCEFILESYSTEM, FOS_OVERWRITEPROMPT,
    FOS_PATHMUSTEXIST, SIGDN_FILESYSPATH,
};

#[derive(serde::Deserialize)]
pub struct Filter {
    name: String,
    extensions: Vec<String>,
}

unsafe fn show(owner: isize, filters: &[Filter], default_path: Option<&str>) -> windows::core::Result<Option<String>> {
    unsafe {
        let dlg: IFileSaveDialog = CoCreateInstance(&FileSaveDialog, None, CLSCTX_INPROC_SERVER)?;
        let opts = dlg.GetOptions()?;
        dlg.SetOptions(opts | FOS_OVERWRITEPROMPT | FOS_PATHMUSTEXIST | FOS_FORCEFILESYSTEM)?;

        let names: Vec<HSTRING> = filters.iter().map(|f| HSTRING::from(f.name.as_str())).collect();
        let specs: Vec<HSTRING> = filters
            .iter()
            .map(|f| HSTRING::from(f.extensions.iter().map(|e| format!("*.{e}")).collect::<Vec<_>>().join(";")))
            .collect();
        let list: Vec<COMDLG_FILTERSPEC> = names
            .iter()
            .zip(&specs)
            .map(|(n, s)| COMDLG_FILTERSPEC { pszName: PCWSTR(n.as_ptr()), pszSpec: PCWSTR(s.as_ptr()) })
            .collect();
        if !list.is_empty() {
            dlg.SetFileTypes(&list)?;
            dlg.SetFileTypeIndex(1)?;
        }

        if let Some(p) = default_path.filter(|p| !p.is_empty()) {
            let p = Path::new(p);
            if let Some(dir) = p.parent().filter(|d| d.is_dir()) {
                if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(dir.as_os_str()), None) {
                    let _ = dlg.SetFolder(&item);
                }
            }
            if let Some(name) = p.file_name() {
                dlg.SetFileName(&HSTRING::from(name))?;
            }
        }

        if dlg.Show(Some(HWND(owner as _))).is_err() {
            return Ok(None); // cancelled
        }
        let item = dlg.GetResult()?;
        let raw = item.GetDisplayName(SIGDN_FILESYSPATH)?;
        let mut path = raw.to_string().unwrap_or_default();
        CoTaskMemFree(Some(raw.0 as _));

        // Add the document's extension only if the name has none and its own type is selected.
        let idx = dlg.GetFileTypeIndex().unwrap_or(1) as usize;
        if let Some(f) = idx.checked_sub(1).and_then(|i| filters.get(i)) {
            let ext = f.extensions.first().map(String::as_str).unwrap_or("*");
            if ext != "*" && Path::new(&path).extension().is_none() {
                path = format!("{path}.{ext}");
            }
        }
        Ok(Some(path))
    }
}

#[tauri::command]
pub async fn cmd_save_dialog(
    window: WebviewWindow,
    filters: Vec<Filter>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let owner = window.hwnd().map(|h| h.0 as isize).unwrap_or(0);
    let (tx, rx) = std::sync::mpsc::channel();
    // The dialog gets its own STA thread so the app's main thread never blocks.
    std::thread::spawn(move || {
        let res = unsafe {
            let inited = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
            let r = show(owner, &filters, default_path.as_deref()).map_err(|e| e.to_string());
            if inited {
                CoUninitialize();
            }
            r
        };
        let _ = tx.send(res);
    });
    tauri::async_runtime::spawn_blocking(move || rx.recv().map_err(|e| e.to_string())?)
        .await
        .map_err(|e| e.to_string())?
}
