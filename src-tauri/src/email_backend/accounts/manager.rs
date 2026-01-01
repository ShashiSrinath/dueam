use serde::{Deserialize, Serialize};
use tauri::Manager;
use crate::email_backend::accounts::google::GoogleAccount;
use crate::email_backend::accounts::microsoft::MicrosoftAccount;
use crate::email_backend::accounts::imap_smtp::ImapSmtpAccount;
use crate::utils::security::EncryptedStore;
use std::path::PathBuf;
use std::sync::Arc;
use sqlx::sqlite::SqlitePool;
use email::account::config::AccountConfig;
use email::account::config::oauth2::OAuth2Config;
use email::account::config::passwd::PasswordConfig;
use email::imap::config::{ImapConfig, ImapAuthConfig};
use email::smtp::config::{SmtpConfig, SmtpAuthConfig};
use secret::Secret;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum Account {
    Google(GoogleAccount),
    Microsoft(MicrosoftAccount),
    ImapSmtp(ImapSmtpAccount),
}

impl Account {
    pub fn email(&self) -> &str {
        match self {
            Account::Google(a) => &a.email,
            Account::Microsoft(a) => &a.email,
            Account::ImapSmtp(a) => &a.email,
        }
    }

    pub fn id(&self) -> Option<i64> {
        match self {
            Account::Google(a) => a.id,
            Account::Microsoft(a) => a.id,
            Account::ImapSmtp(a) => a.id,
        }
    }

    pub fn set_id(&mut self, id: i64) {
        match self {
            Account::Google(a) => a.id = Some(id),
            Account::Microsoft(a) => a.id = Some(id),
            Account::ImapSmtp(a) => a.id = Some(id),
        }
    }

    pub fn account_type(&self) -> &str {
        match self {
            Account::Google(_) => "google",
            Account::Microsoft(_) => "microsoft",
            Account::ImapSmtp(_) => "imap_smtp",
        }
    }

    pub fn strip_secrets(&mut self) {
        match self {
            Account::Google(a) => {
                a.access_token = None;
                a.refresh_token = None;
            }
            Account::Microsoft(a) => {
                a.access_token = None;
                a.refresh_token = None;
            }
            Account::ImapSmtp(a) => {
                a.password = None;
            }
        }
    }

    pub fn get_configs(&self) -> Result<(Arc<AccountConfig>, Arc<ImapConfig>, Arc<SmtpConfig>), String> {
        match self {
            Account::Google(google) => {
                let client_id = std::env::var("GOOGLE_CLIENT_ID")
                    .map_err(|_| "GOOGLE_CLIENT_ID not found in environment".to_string())?;
                let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
                    .map_err(|_| "GOOGLE_CLIENT_SECRET not found in environment".to_string())?;

                let oauth2_config = OAuth2Config {
                    client_id,
                    client_secret: Some(Secret::new_raw(client_secret)),
                    auth_url: "https://accounts.google.com/o/oauth2/auth".into(),
                    token_url: "https://www.googleapis.com/oauth2/v3/token".into(),
                    access_token: google.access_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    refresh_token: google.refresh_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    ..Default::default()
                };

                let account_config = Arc::new(AccountConfig {
                    name: google.email.clone(),
                    email: google.email.clone(),
                    ..Default::default()
                });

                let imap_config = Arc::new(ImapConfig {
                    host: "imap.gmail.com".into(),
                    port: 993,
                    login: google.email.clone(),
                    auth: ImapAuthConfig::OAuth2(oauth2_config.clone()),
                    ..Default::default()
                });

                let smtp_config = Arc::new(SmtpConfig {
                    host: "smtp.gmail.com".into(),
                    port: 587,
                    login: google.email.clone(),
                    auth: SmtpAuthConfig::OAuth2(oauth2_config),
                    encryption: Some(email::tls::Encryption::StartTls(email::tls::Tls::default())),
                    ..Default::default()
                });

                Ok((account_config, imap_config, smtp_config))
            }
            Account::Microsoft(microsoft) => {
                let client_id = std::env::var("MICROSOFT_CLIENT_ID")
                    .map_err(|_| "MICROSOFT_CLIENT_ID not found in environment".to_string())?;
                let client_secret = std::env::var("MICROSOFT_CLIENT_SECRET")
                    .map_err(|_| "MICROSOFT_CLIENT_SECRET not found in environment".to_string())?;

                let oauth2_config = OAuth2Config {
                    client_id,
                    client_secret: Some(Secret::new_raw(client_secret)),
                    auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize".into(),
                    token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token".into(),
                    access_token: microsoft.access_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    refresh_token: microsoft.refresh_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    ..Default::default()
                };

                let account_config = Arc::new(AccountConfig {
                    name: microsoft.email.clone(),
                    email: microsoft.email.clone(),
                    ..Default::default()
                });

                let imap_config = Arc::new(ImapConfig {
                    host: "outlook.office365.com".into(),
                    port: 993,
                    login: microsoft.email.clone(),
                    auth: ImapAuthConfig::OAuth2(oauth2_config.clone()),
                    ..Default::default()
                });

                let smtp_config = Arc::new(SmtpConfig {
                    host: "smtp.office365.com".into(),
                    port: 587,
                    login: microsoft.email.clone(),
                    auth: SmtpAuthConfig::OAuth2(oauth2_config),
                    encryption: Some(email::tls::Encryption::StartTls(email::tls::Tls::default())),
                    ..Default::default()
                });

                Ok((account_config, imap_config, smtp_config))
            }
            Account::ImapSmtp(imap_smtp) => {
                let account_config = Arc::new(AccountConfig {
                    name: imap_smtp.email.clone(),
                    email: imap_smtp.email.clone(),
                    ..Default::default()
                });

                let imap_encryption = match imap_smtp.imap_encryption.as_str() {
                    "tls" => Some(email::tls::Encryption::Tls(email::tls::Tls::default())),
                    "starttls" => Some(email::tls::Encryption::StartTls(email::tls::Tls::default())),
                    _ => None,
                };

                let imap_config = Arc::new(ImapConfig {
                    host: imap_smtp.imap_host.clone(),
                    port: imap_smtp.imap_port,
                    login: imap_smtp.email.clone(),
                    encryption: imap_encryption,
                    auth: ImapAuthConfig::Password(PasswordConfig(Secret::new_raw(imap_smtp.password.clone().unwrap_or_default()))),
                    ..Default::default()
                });

                let smtp_encryption = match imap_smtp.smtp_encryption.as_str() {
                    "tls" => Some(email::tls::Encryption::Tls(email::tls::Tls::default())),
                    "starttls" => Some(email::tls::Encryption::StartTls(email::tls::Tls::default())),
                    _ => None,
                };

                let smtp_config = Arc::new(SmtpConfig {
                    host: imap_smtp.smtp_host.clone(),
                    port: imap_smtp.smtp_port,
                    login: imap_smtp.email.clone(),
                    encryption: smtp_encryption,
                    auth: SmtpAuthConfig::Password(PasswordConfig(Secret::new_raw(imap_smtp.password.clone().unwrap_or_default()))),
                    ..Default::default()
                });

                Ok((account_config, imap_config, smtp_config))
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AccountRegistry {
    pub accounts: Vec<Account>,
}

pub struct AccountManager<R: tauri::Runtime = tauri::Wry> {
    app_handle: tauri::AppHandle<R>,
    store: EncryptedStore,
    #[cfg(test)]
    storage_path_override: Option<PathBuf>,
}

impl<R: tauri::Runtime> AccountManager<R> {
    pub async fn new(app_handle: &tauri::AppHandle<R>) -> Result<Self, String> {
        let store = EncryptedStore::new().await?;
        Ok(Self {
            app_handle: app_handle.clone(),
            store,
            #[cfg(test)]
            storage_path_override: None,
        })
    }

    fn get_storage_path(&self) -> PathBuf {
        #[cfg(test)]
        if let Some(path) = &self.storage_path_override {
            return path.clone();
        }

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
                    Account::Microsoft(microsoft) => {
                        microsoft.id = Some(id);
                        microsoft.name = name;
                        microsoft.picture = picture;
                    }
                    Account::ImapSmtp(imap_smtp) => {
                        imap_smtp.id = Some(id);
                        imap_smtp.name = name;
                    }
                }
            }
        }

        Ok(registry)
    }

    pub async fn get_account_by_id(&self, id: i64) -> Result<Account, String> {
        let registry = self.load().await?;
        registry.accounts.into_iter()
            .find(|a| a.id() == Some(id))
            .ok_or_else(|| format!("Account with ID {} not found", id))
    }

    pub async fn save(&self, registry: &AccountRegistry) -> Result<(), String> {
        let path = self.get_storage_path();
        let data = serde_json::to_vec(registry).map_err(|e| e.to_string())?;
        self.store.save(path, &data)
    }

    pub async fn refresh_access_token(&self, email: &str) -> Result<String, String> {
        let mut registry = self.load().await?;
        let account = registry.accounts.iter_mut()
            .find(|a| a.email() == email)
            .ok_or_else(|| format!("Account {} not found", email))?;
            
        match account {
            Account::Google(google) => {
                let client_id = std::env::var("GOOGLE_CLIENT_ID")
                    .map_err(|_| "GOOGLE_CLIENT_ID not found in environment".to_string())?;
                let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
                    .map_err(|_| "GOOGLE_CLIENT_SECRET not found in environment".to_string())?;

                let oauth2_config = OAuth2Config {
                    client_id,
                    client_secret: Some(Secret::new_raw(client_secret)),
                    auth_url: "https://accounts.google.com/o/oauth2/auth".into(),
                    token_url: "https://www.googleapis.com/oauth2/v3/token".into(),
                    access_token: google.access_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    refresh_token: google.refresh_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    ..Default::default()
                };

                let (access_token, new_refresh_token) = oauth2_config.refresh_access_token().await.map_err(|e| e.to_string())?;
                
                google.access_token = Some(access_token.clone());
                if let Some(new_refresh) = new_refresh_token {
                    google.refresh_token = Some(new_refresh);
                }
                
                let access_token_val = access_token;
                
                self.save(&registry).await?;
                
                Ok(access_token_val)
            }
            Account::Microsoft(microsoft) => {
                let client_id = std::env::var("MICROSOFT_CLIENT_ID")
                    .map_err(|_| "MICROSOFT_CLIENT_ID not found in environment".to_string())?;
                let client_secret = std::env::var("MICROSOFT_CLIENT_SECRET")
                    .map_err(|_| "MICROSOFT_CLIENT_SECRET not found in environment".to_string())?;

                let oauth2_config = OAuth2Config {
                    client_id,
                    client_secret: Some(Secret::new_raw(client_secret)),
                    auth_url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize".into(),
                    token_url: "https://login.microsoftonline.com/common/oauth2/v2.0/token".into(),
                    access_token: microsoft.access_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    refresh_token: microsoft.refresh_token.as_ref().map(|t| Secret::new_raw(t.clone())).unwrap_or_default(),
                    ..Default::default()
                };

                let (access_token, new_refresh_token) = oauth2_config.refresh_access_token().await.map_err(|e| e.to_string())?;
                
                microsoft.access_token = Some(access_token.clone());
                if let Some(new_refresh) = new_refresh_token {
                    microsoft.refresh_token = Some(new_refresh);
                }
                
                let access_token_val = access_token;
                
                self.save(&registry).await?;
                
                Ok(access_token_val)
            }
            Account::ImapSmtp(_) => Err("IMAP/SMTP accounts do not support token refresh".into()),
        }
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
        .bind(match &account {
            Account::Google(a) => a.name.as_deref(),
            Account::Microsoft(a) => a.name.as_deref(),
            Account::ImapSmtp(a) => a.name.as_deref(),
        })
        .bind(match &account {
            Account::Google(a) => a.picture.as_deref(),
            Account::Microsoft(a) => a.picture.as_deref(),
            Account::ImapSmtp(_) => None,
        })
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

    #[cfg(test)]
    pub fn new_test(app_handle: tauri::AppHandle<R>, store: EncryptedStore, storage_path: Option<PathBuf>) -> Self {
        Self { app_handle, store, storage_path_override: storage_path }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::email_backend::accounts::google::GoogleAccount;
    use crate::utils::security::EncryptedStore;
    use crate::utils::test_utils::setup_test_db;
    use tauri::test::mock_builder;
    use tempfile::tempdir;

    #[test]
    fn test_strip_secrets() {
        let mut account = Account::Google(GoogleAccount {
            id: Some(1),
            email: "test@gmail.com".to_string(),
            name: Some("Test User".to_string()),
            picture: None,
            access_token: Some("secret_access".to_string()),
            refresh_token: Some("secret_refresh".to_string()),
        });

        account.strip_secrets();

        match account {
            Account::Google(a) => {
                assert!(a.access_token.is_none());
                assert!(a.refresh_token.is_none());
                assert_eq!(a.email, "test@gmail.com");
            }
        }
    }

    #[tokio::test]
    async fn test_add_account_integration() {
        let pool = setup_test_db().await;
        let app = mock_builder().build(tauri::generate_context!()).unwrap();
        app.manage(pool);

        let dir = tempdir().unwrap();
        let storage_path = dir.path().join("accounts.json.enc");

        let key = [0u8; 32];
        let store = EncryptedStore::new_test(key);
        let manager = AccountManager::new_test(app.handle().clone(), store, Some(storage_path));

        let account = Account::Google(GoogleAccount {
            id: None,
            email: "test@gmail.com".to_string(),
            name: Some("Test User".to_string()),
            picture: None,
            access_token: Some("access".to_string()),
            refresh_token: Some("refresh".to_string()),
        });

        manager.add_account(account).await.expect("Failed to add account");

        let registry = manager.load().await.expect("Failed to load accounts");
        assert_eq!(registry.accounts.len(), 1);
        assert_eq!(registry.accounts[0].email(), "test@gmail.com");
        assert!(registry.accounts[0].id().is_some());

        // Verify it was saved to the database too
        let db_pool = app.state::<SqlitePool>();
        let count: (i64,) = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM accounts")
            .fetch_one(&*db_pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
    }
}
