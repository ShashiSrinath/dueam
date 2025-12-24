use tauri::{AppHandle, Manager};
use sqlx::sqlite::SqlitePool;
use std::collections::HashMap;

#[tauri::command]
pub async fn get_settings(app_handle: AppHandle) -> Result<HashMap<String, String>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM settings")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rows.into_iter().collect())
}

#[tauri::command]
pub async fn update_setting(app_handle: AppHandle, key: String, value: String) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    sqlx::query("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(key)
        .bind(value)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}
