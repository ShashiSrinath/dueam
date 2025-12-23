use tauri::AppHandle;
use crate::email_backend::accounts::google::get_auth_url;

mod email_backend;
mod utils;

#[tauri::command]
async fn login_with_google(app_handle: AppHandle) -> Result<(), String> {
    get_auth_url(&app_handle).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![login_with_google])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
