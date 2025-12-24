use crate::email_backend::accounts::commands::{login_with_google, get_accounts, remove_account};
use crate::email_backend::emails::commands::{get_emails, get_folders, refresh_folder, get_unified_counts, get_email_content, get_attachments, get_attachment_data, mark_as_read, get_email_by_id, send_email, save_draft, get_drafts, delete_draft, get_draft_by_id, search_emails};
use crate::email_backend::sync::SyncEngine;
use crate::db::setup::setup_database;
use tauri::Manager;

mod email_backend;
mod utils;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();

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
            get_email_by_id,
            send_email,
            save_draft,
            get_drafts,
            delete_draft,
            get_draft_by_id,
            search_emails
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
