use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use crate::email_backend::accounts::google::GoogleAccount;
use crate::utils::security::EncryptedStore;
use std::path::PathBuf;
use sqlx::sqlite::SqlitePool;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum Account {
    Google(GoogleAccount),
}

impl Account {
    pub fn email(&self) -> &str {
        match self {
            Account::Google(a) => &a.email,
        }
    }

    pub fn id(&self) -> Option<i64> {
        match self {
            Account::Google(a) => a.id,
        }
    }

    pub fn set_id(&mut self, id: i64) {
        match self {
            Account::Google(a) => a.id = Some(id),
        }
    }

    pub fn account_type(&self) -> &str {
        match self {
            Account::Google(_) => "google",
        }
    }

    pub fn strip_secrets(&mut self) {
        match self {
            Account::Google(a) => {
                a.access_token = None;
                a.refresh_token = None;
            }
        }
    }
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
        let mut registry: AccountRegistry = serde_json::from_slice(&data).map_err(|e| e.to_string())?;

        let pool = self.app_handle.state::<SqlitePool>();

        for account in &mut registry.accounts {
            let row: Option<(i64, Option<String>, Option<String>)> = sqlx::query_as(
                "SELECT id, name, picture FROM accounts WHERE email = ?"
            )
            .bind(account.email())
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some((id, name, picture)) = row {
                match account {
                    Account::Google(google) => {
                        google.id = Some(id);
                        google.name = name;
                        google.picture = picture;
                    }
                }
            }
        }

        Ok(registry)
    }

    pub async fn save(&self, registry: &AccountRegistry) -> Result<(), String> {
        let path = self.get_storage_path();
        let data = serde_json::to_vec(registry).map_err(|e| e.to_string())?;
        self.store.save(path, &data)
    }

    pub async fn add_account(&self, mut account: Account) -> Result<(), String> {
        let pool = self.app_handle.state::<SqlitePool>();

        // 1. Save to Database
        let row: (i64,) = sqlx::query_as(
            "INSERT INTO accounts (email, account_type, name, picture) VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET name=excluded.name, picture=excluded.picture
             RETURNING id"
        )
        .bind(account.email())
        .bind(account.account_type())
        .bind(match &account { Account::Google(a) => a.name.as_ref() })
        .bind(match &account { Account::Google(a) => a.picture.as_ref() })
        .fetch_one(&*pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

        account.set_id(row.0);

        // 2. Save to Encrypted Store
        let mut registry = self.load().await?;
        // Remove existing account with same email if exists
        registry.accounts.retain(|a| a.email() != account.email());
        registry.accounts.push(account);
        self.save(&registry).await
    }

    pub async fn remove_account(&self, index: usize) -> Result<(), String> {
        let mut registry = self.load().await?;
        if index < registry.accounts.len() {
            let account = registry.accounts.remove(index);

            // Remove from database
            if let Some(id) = account.id() {
                let pool = self.app_handle.state::<SqlitePool>();
                sqlx::query("DELETE FROM accounts WHERE id = ?")
                    .bind(id)
                    .execute(&*pool)
                    .await
                    .map_err(|e: sqlx::Error| e.to_string())?;
            }

            self.save(&registry).await
        } else {
            Err("Account index out of bounds".to_string())
        }
    }
}
