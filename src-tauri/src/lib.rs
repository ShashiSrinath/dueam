use crate::email_backend::accounts::commands::{login_with_google, get_accounts, remove_account};
use crate::email_backend::emails::commands::{get_emails, get_folders, get_email_content, get_attachments, get_attachment_data, mark_as_read, get_email_by_id};
use crate::email_backend::sync::SyncEngine;
use sqlx::sqlite::{SqlitePool, SqliteConnectOptions};
use tauri::{AppHandle, Manager};

mod email_backend;
mod utils;

async fn setup_database(app_handle: &AppHandle) -> Result<SqlitePool, String> {
    let app_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join("dream-email.db");

    log::info!("Database path: {:?}", db_path);

    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await.map_err(|e| e.to_string())?;

    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(pool)
}

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
            get_email_content,
            get_attachments,
            get_attachment_data,
            mark_as_read,
            get_email_by_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
