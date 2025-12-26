use email::account::config::oauth2::{OAuth2Config, OAuth2Scopes::Scopes};
use email::account::Error;
use email::imap::config::ImapConfig;
use oauth::v2_0::{AuthorizationCodeGrant, Client};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleAccount {
    pub id: Option<i64>,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

pub struct GoogleOAuth2Config {
    base: OAuth2Config,
    client_secret: Option<String>,
    #[allow(dead_code)]
    imap_config: ImapConfig,
}

impl GoogleOAuth2Config {
    pub fn new() -> Result<Self, String> {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| "GOOGLE_CLIENT_ID not found in environment".to_string())?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| "GOOGLE_CLIENT_SECRET not found in environment".to_string())?;

        let mut config = OAuth2Config::default();
        config.client_id = client_id;
        config.auth_url = "https://accounts.google.com/o/oauth2/auth".into();
        config.token_url = "https://www.googleapis.com/oauth2/v3/token".into();
        config.scopes = Scopes(vec![
            "https://mail.google.com/".into(),
            "https://www.googleapis.com/auth/userinfo.email".into(),
            "https://www.googleapis.com/auth/userinfo.profile".into(),
            "https://www.googleapis.com/auth/contacts.readonly".into(),
        ]);

        Ok(GoogleOAuth2Config {
            base: config,
            client_secret: Some(client_secret),
            imap_config: ImapConfig::default(),
        })
    }

    pub async fn get_url(&self, app_handle: &AppHandle) -> Result<GoogleAccount, Error> {
        let redirect_scheme = match self.base.redirect_scheme.as_ref() {
            Some(scheme) => scheme.clone(),
            None => "http".into(),
        };

        let redirect_host = match self.base.redirect_host.as_ref() {
            Some(host) => host.clone(),
            None => OAuth2Config::LOCALHOST.to_owned(),
        };

        let redirect_port = match self.base.redirect_port {
            Some(port) => port,
            None => OAuth2Config::get_first_available_port()?,
        };


        let client = Client::new(
            self.base.client_id.clone(),
            self.client_secret.clone(),
            self.base.auth_url.clone(),
            self.base.token_url.clone(),
            redirect_scheme,
            redirect_host,
            redirect_port,
        )
            .map_err(Error::BuildOauthClientError)?;

        let mut auth_code_grant = AuthorizationCodeGrant::new();

        if self.base.pkce {
            auth_code_grant = auth_code_grant.with_pkce();
        }

        for scope in self.base.scopes.clone() {
            auth_code_grant = auth_code_grant.with_scope(scope);
        }

        let (redirect_url, csrf_token) = auth_code_grant.get_redirect_url(&client);

        app_handle.opener().open_url(redirect_url, None::<&str>).expect("Error when opening oauth url");


        let (access_token, refresh_token) = auth_code_grant
            .wait_for_redirection(&client, csrf_token)
            .await
            .map_err(Error::WaitForOauthRedirectionError)?;

        // Fetch user info from Google API
        let user_info_client = reqwest::Client::new();
        let user_info: serde_json::Value = user_info_client
            .get("https://www.googleapis.com/oauth2/v3/userinfo")
            .bearer_auth(&access_token)
            .send()
            .await
            .map_err(|e| Error::GetAccountConfigNotFoundError(e.to_string()))?
            .json()
            .await
            .map_err(|e| Error::GetAccountConfigNotFoundError(e.to_string()))?;

        let email = user_info["email"].as_str().ok_or_else(|| Error::GetAccountConfigNotFoundError("Email not found in userinfo".into()))?.to_string();
        let name = user_info["name"].as_str().map(|s| s.to_string());
        let picture = user_info["picture"].as_str().map(|s| s.to_string());

        Ok(GoogleAccount {
            id: None,
            email,
            name,
            picture,
            access_token: Some(access_token),
            refresh_token,
        })
    }
}

use crate::email_backend::accounts::manager::{Account, AccountManager};

pub async fn get_auth_url(app_handle: &AppHandle) {
    let account_config = match GoogleOAuth2Config::new() {
        Ok(config) => config,
        Err(e) => {
            let _ = app_handle.emit("google-account-error", e);
            return;
        }
    };
    let res = account_config.get_url(app_handle).await;

        match res {
            Ok(account) => {
                match AccountManager::new(app_handle).await {
                    Ok(manager) => {
                        if let Err(e) = manager.add_account(Account::Google(account.clone())).await {
                            let _ = app_handle.emit("google-account-error", e);
                        } else {
                            // Reload account to get the ID
                            let registry = manager.load().await.map_err(|e| e.to_string()).unwrap();
                            let added_account = registry.accounts.iter().find(|a| a.email() == account.email).unwrap().clone();

                            // Trigger initial sync and start IDLE
                            if let Some(sync_engine) = app_handle.try_state::<crate::email_backend::sync::SyncEngine>() {
                                sync_engine.trigger_sync_for_account(added_account);
                            }

                            let _ = app_handle.emit("emails-updated", ());

                            let mut public_account = account;
                            public_account.access_token = None;
                            public_account.refresh_token = None;
                            let _ = app_handle.emit("google-account-added", public_account);
                        }
                    }
                    Err(e) => {
                        let _ = app_handle.emit("google-account-error", e);
                    }
                }
            }
            Err(e) => {
                let _ = app_handle.emit("google-account-error", e.to_string());
            }
        }
}
