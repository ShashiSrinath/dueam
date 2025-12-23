use crate::email_backend::accounts::commands::{login_with_google, get_accounts, remove_account};

mod email_backend;
mod utils;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![login_with_google, get_accounts, remove_account])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
