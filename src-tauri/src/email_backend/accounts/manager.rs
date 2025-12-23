use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use crate::email_backend::accounts::google::GoogleAccount;
use crate::utils::security::EncryptedStore;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum Account {
    Google(GoogleAccount),
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AccountRegistry {
    pub accounts: Vec<Account>,
}

pub struct AccountManager {
    app_handle: AppHandle,
    store: EncryptedStore,
}

impl AccountManager {
    pub async fn new(app_handle: &AppHandle) -> Result<Self, String> {
        let store = EncryptedStore::new().await?;
        Ok(Self {
            app_handle: app_handle.clone(),
            store,
        })
    }

    fn get_storage_path(&self) -> PathBuf {
        self.app_handle.path().app_data_dir()
            .expect("Failed to get app data dir")
            .join("accounts.json.enc")
    }

    pub async fn load(&self) -> Result<AccountRegistry, String> {
        let path = self.get_storage_path();
        if !path.exists() {
            return Ok(AccountRegistry::default());
        }

        let data = self.store.load(path)?;
        serde_json::from_slice(&data).map_err(|e| e.to_string())
    }

    pub async fn save(&self, registry: &AccountRegistry) -> Result<(), String> {
        let path = self.get_storage_path();
        let data = serde_json::to_vec(registry).map_err(|e| e.to_string())?;
        self.store.save(path, &data)
    }

    pub async fn add_account(&self, account: Account) -> Result<(), String> {
        let mut registry = self.load().await?;
        registry.accounts.push(account);
        self.save(&registry).await
    }

    pub async fn remove_account(&self, index: usize) -> Result<(), String> {
        let mut registry = self.load().await?;
        if index < registry.accounts.len() {
            registry.accounts.remove(index);
            self.save(&registry).await
        } else {
            Err("Account index out of bounds".to_string())
        }
    }
}
