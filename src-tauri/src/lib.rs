use crate::email_backend::accounts::commands::{login_with_google, get_accounts, remove_account};
use crate::email_backend::emails::commands::{get_emails, get_folders, refresh_folder, get_unified_counts, get_email_content, get_attachments, get_attachment_data, mark_as_read, move_to_trash, get_email_by_id, send_email, save_draft, get_drafts, delete_draft, get_draft_by_id, search_emails};
use crate::email_backend::enrichment::commands::{get_sender_info, get_domain_info, get_emails_by_sender};
use crate::db::settings::{get_settings, update_setting};
use crate::email_backend::sync::SyncEngine;
use crate::db::setup::setup_database;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

mod email_backend;
mod utils;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                window.hide().unwrap();
                api.prevent_close();
            }
            _ => {}
        })
        .setup(|app| {
            let handle = app.handle().clone();

            // Tray Icon Setup
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "show", "Show Dream Email", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => {
                        app.exit(0);
                    }
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Block on database setup to ensure it's ready before any commands run
            let pool = tauri::async_runtime::block_on(async {
                setup_database(&handle).await
            }).expect("Failed to setup database");

            app.manage(pool);

            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let sync_engine = SyncEngine::new(sync_handle);
                sync_engine.start().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login_with_google,
            get_accounts,
            remove_account,
            get_emails,
            get_folders,
            refresh_folder,
            get_unified_counts,
            get_email_content,
            get_attachments,
            get_attachment_data,
            mark_as_read,
            move_to_trash,
            get_email_by_id,
            send_email,
            save_draft,
            get_drafts,
            delete_draft,
            get_draft_by_id,
            search_emails,
            get_settings,
            update_setting,
            get_sender_info,
            get_domain_info,
            get_emails_by_sender
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
