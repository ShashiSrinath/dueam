use tauri::AppHandle;
use crate::email_backend::accounts::google::get_auth_url;
use crate::email_backend::accounts::manager::{Account, AccountManager};

#[tauri::command]
pub async fn login_with_google(app_handle: AppHandle) -> Result<(), String> {
    get_auth_url(&app_handle).await;
    Ok(())
}

#[tauri::command]
pub async fn get_accounts(app_handle: AppHandle) -> Result<Vec<Account>, String> {
    let manager = AccountManager::new(&app_handle).await?;
    let registry = manager.load().await?;
    Ok(registry.accounts)
}

#[tauri::command]
pub async fn remove_account(app_handle: AppHandle, index: usize) -> Result<(), String> {
    let manager = AccountManager::new(&app_handle).await?;
    manager.remove_account(index).await
}
