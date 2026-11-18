//! Links in the editor (a <textarea>) are plain text to WebView2, so its own right-click menu has
//! no link items there. The page tells us which link the mouse is over, and when WebView2 builds
//! its menu for the editor we put "Open link in new window", "Save link as" and "Copy link" at the
//! top, exactly like the menu on a link in the preview. Everything else in the menu stays as is.

use std::sync::Mutex;

use tauri::{Emitter, Manager, State, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    ICoreWebView2ContextMenuItem, ICoreWebView2Environment9, ICoreWebView2_11,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR,
};
use webview2_com::{ContextMenuRequestedEventHandler, CustomItemSelectedEventHandler};
use windows::Win32::System::Com::IStream;
use windows_core::{Interface, BOOL, HSTRING};

/// The link under the mouse in the editor (None when the mouse isn't over one).
pub struct HoverLink(pub Mutex<Option<String>>);

#[tauri::command]
pub fn cmd_set_hover_link(state: State<HoverLink>, url: Option<String>) {
    if let Ok(mut l) = state.0.lock() {
        *l = url.filter(|u| u.starts_with("http://") || u.starts_with("https://"));
    }
}

const ITEMS: [(&str, &str); 3] = [("Open link in new window", "open"), ("Save link as", "save"), ("Copy link", "copy")];

unsafe fn new_item(env: &ICoreWebView2Environment9, label: &str, kind: COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND) -> windows_core::Result<ICoreWebView2ContextMenuItem> {
    unsafe { env.CreateContextMenuItem(&HSTRING::from(label), None::<&IStream>, kind) }
}

pub fn install(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    let _ = window.with_webview(move |wv| unsafe {
        let Ok(core) = wv.controller().CoreWebView2() else { return };
        let Ok(core11) = core.cast::<ICoreWebView2_11>() else { return };
        let Ok(env) = wv.environment().cast::<ICoreWebView2Environment9>() else { return };
        let handler = ContextMenuRequestedEventHandler::create(Box::new(move |_sender, args| {
            let Some(args) = args else { return Ok(()) };
            let url = app.state::<HoverLink>().0.lock().ok().and_then(|l| l.clone());
            let Some(url) = url else { return Ok(()) };
            let target = args.ContextMenuTarget()?;
            let mut editable = BOOL::default();
            target.IsEditable(&mut editable)?;
            let mut has_link = BOOL::default();
            target.HasLinkUri(&mut has_link)?;
            // Only the editor: real links (the preview) already get WebView2's own link items.
            if !editable.as_bool() || has_link.as_bool() {
                return Ok(());
            }
            let items = args.MenuItems()?;
            for (i, (label, action)) in ITEMS.iter().enumerate() {
                let item = new_item(&env, label, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND)?;
                let app2 = app.clone();
                let url2 = url.clone();
                let action = action.to_string();
                let mut token = 0i64;
                item.add_CustomItemSelected(
                    &CustomItemSelectedEventHandler::create(Box::new(move |_, _| {
                        let _ = app2.emit("link-menu", (action.clone(), url2.clone()));
                        Ok(())
                    })),
                    &mut token,
                )?;
                items.InsertValueAtIndex(i as u32, &item)?;
            }
            items.InsertValueAtIndex(ITEMS.len() as u32, &new_item(&env, "", COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR)?)?;
            Ok(())
        }));
        let mut token = 0i64;
        let _ = core11.add_ContextMenuRequested(&handler, &mut token);
    });
}
