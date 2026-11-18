//! File > Export as PDF. WebView2 prints the page with its print stylesheet (the page puts the
//! document it wants exported into #print-root first) straight to a PDF file, no dialog.

use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::{ICoreWebView2Environment6, ICoreWebView2_7};
use webview2_com::PrintToPdfCompletedHandler;
use windows_core::{Interface, HSTRING};

#[tauri::command]
pub async fn cmd_print_to_pdf(window: WebviewWindow, path: String) -> Result<(), String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let tx2 = tx.clone();
    window
        .with_webview(move |wv| unsafe {
            let start = || -> windows_core::Result<()> {
                let core = wv.controller().CoreWebView2()?;
                let core7 = core.cast::<ICoreWebView2_7>()?;
                let env = wv.environment().cast::<ICoreWebView2Environment6>()?;
                let settings = env.CreatePrintSettings()?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                settings.SetShouldPrintBackgrounds(true)?;
                let tx = tx.clone();
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |res, ok| {
                    let r = match res {
                        Ok(()) if ok => Ok(()),
                        Ok(()) => Err("WebView2 could not write the PDF".to_string()),
                        Err(e) => Err(e.to_string()),
                    };
                    let _ = tx.send(r);
                    Ok(())
                }));
                core7.PrintToPdf(&HSTRING::from(path.as_str()), &settings, &handler)
            };
            if let Err(e) = start() {
                let _ = tx2.send(Err(e.to_string()));
            }
        })
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(std::time::Duration::from_secs(60)).map_err(|_| "Timed out writing the PDF".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}
