use tauri::{AppHandle, Emitter, Manager};
use crate::email_backend::accounts::google::get_auth_url;
use crate::email_backend::accounts::microsoft::login_with_microsoft as microsoft_login;
use crate::email_backend::accounts::imap_smtp::ImapSmtpAccount;
use crate::email_backend::accounts::manager::{Account, AccountManager};
use crate::email_backend::sync::SyncEngine;

#[tauri::command]
pub async fn login_with_google(app_handle: AppHandle) -> Result<(), String> {
    get_auth_url(&app_handle).await;
    Ok(())
}

#[tauri::command]
pub async fn login_with_microsoft(app_handle: AppHandle) -> Result<(), String> {
    microsoft_login(&app_handle).await;
    Ok(())
}

#[tauri::command]
pub async fn add_imap_smtp_account(app_handle: AppHandle, account: ImapSmtpAccount) -> Result<(), String> {
    let manager = AccountManager::new(&app_handle).await?;
    manager.add_account(Account::ImapSmtp(account.clone())).await?;
    
    // Trigger initial sync
    if let Some(sync_engine) = app_handle.try_state::<SyncEngine>() {
        let registry = manager.load().await?;
        let added_account = registry.accounts.iter().find(|a| a.email() == account.email).unwrap().clone();
        sync_engine.trigger_sync_for_account(added_account);
    }

    let _ = app_handle.emit("emails-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn get_accounts(app_handle: AppHandle) -> Result<Vec<Account>, String> {
    let manager = AccountManager::new(&app_handle).await?;
    let mut registry = manager.load().await?;
    for account in &mut registry.accounts {
        account.strip_secrets();
    }
    Ok(registry.accounts)
}

#[tauri::command]
pub async fn remove_account(app_handle: AppHandle, index: usize) -> Result<(), String> {
    let manager = AccountManager::new(&app_handle).await?;
    manager.remove_account(index).await
}
