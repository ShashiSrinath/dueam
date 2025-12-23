use email::account::config::oauth2::{OAuth2Config, OAuth2Scopes::Scopes};
use email::account::Error;
use email::imap::config::ImapConfig;
use oauth::v2_0::{AuthorizationCodeGrant, Client};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleAccount {
    pub access_token: String,
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
        ]);

        Ok(GoogleOAuth2Config {
            base: config,
            client_secret: Some(client_secret),
            imap_config: ImapConfig::default(),
        })
    }

    pub async fn get_url(&self, app_handle: &AppHandle) -> Result<GoogleAccount, Error> {
        if let Ok(access_token) = self.base.access_token.get().await {
            let refresh_token = self.base.refresh_token.get().await.ok();
            return Ok(GoogleAccount {
                access_token,
                refresh_token,
            });
        }

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

        self.base.access_token
            .set_if_keyring(access_token.clone())
            .await
            .map_err(Error::SetAccessTokenOauthError)?;

        if let Some(refresh_token) = &refresh_token {
            self.base.refresh_token
                .set_if_keyring(refresh_token.clone())
                .await
                .map_err(Error::SetRefreshTokenOauthError)?;
        }

        Ok(GoogleAccount {
            access_token,
            refresh_token,
        })
    }
}

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
            let _ = app_handle.emit("google-account-added", account);
        }
        Err(e) => {
            let _ = app_handle.emit("google-account-error", e.to_string());
        }
    }
}
