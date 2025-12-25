use std::collections::HashMap;
use std::time::Duration;
use std::sync::Arc;
use std::num::NonZeroU32;
use tauri::{Manager, Emitter};
use crate::email_backend::accounts::manager::{AccountManager, Account};
use crate::email_backend::accounts::google::GoogleAccount;
use tokio::time::sleep;
use tokio::sync::{oneshot, Mutex};
use log::{info, error};
use email::imap::{ImapContext, ImapContextBuilder, ImapClient};
use email::backend::context::BackendContextBuilder;
use email::backend::BackendBuilder;
use email::folder::list::ListFolders;
use email::envelope::Envelopes;
use email::message::get::GetMessages;
use imap_client::tasks::tasks::select::SelectDataUnvalidated;
use sqlx::SqlitePool;

pub struct SyncEngine<R: tauri::Runtime = tauri::Wry> {
    app_handle: tauri::AppHandle<R>,
    idle_senders: Arc<Mutex<HashMap<i64, oneshot::Sender<()>>>>,
}

impl<R: tauri::Runtime> Clone for SyncEngine<R> {
    fn clone(&self) -> Self {
        Self {
            app_handle: self.app_handle.clone(),
            idle_senders: self.idle_senders.clone(),
        }
    }
}

const SYNC_BATCH_SIZE: u32 = 100;

use tauri_plugin_notification::NotificationExt;

fn normalize_subject(subject: &str) -> String {
    let mut s = subject.trim().to_lowercase();
    
    loop {
        let prev = s.clone();
        
        // Strip common email prefixes
        if s.starts_with("re:") {
            s = s[3..].trim().to_string();
        } else if s.starts_with("fwd:") {
            s = s[4..].trim().to_string();
        } else if s.starts_with("fw:") {
            s = s[3..].trim().to_string();
        } 
        // Strip common notification prefixes
        else if s.starts_with("status changed:") {
            s = s[15..].trim().to_string();
        } else if s.starts_with("new comment:") {
            s = s[12..].trim().to_string();
        } else if s.starts_with("new task:") {
            s = s[9..].trim().to_string();
        } else if s.starts_with("task deleted:") {
            s = s[13..].trim().to_string();
        } else if s.starts_with("overdue:") {
            s = s[8..].trim().to_string();
        } else if s.starts_with("reminder:") {
            s = s[9..].trim().to_string();
        }
        // Strip bracketed prefixes like [Project-Name] or [Overdue]
        else if s.starts_with("[") {
            if let Some(end_bracket) = s.find(']') {
                let prefix = &s[1..end_bracket];
                // Only strip if it's a short prefix or common one
                if prefix.len() < 20 || prefix == "overdue" || prefix == "clickup" {
                    s = s[end_bracket + 1..].trim().to_string();
                } else {
                    break;
                }
            } else {
                break;
            }
        } else {
            break;
        }
        
        if s == prev {
            break;
        }
    }
    s
}

impl<R: tauri::Runtime> SyncEngine<R> {
    pub fn new(app_handle: tauri::AppHandle<R>) -> Self {
        Self { 
            app_handle,
            idle_senders: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn start(&self) {
        info!("Starting Sync Engine...");
        let app_handle = self.app_handle.clone();
        
        // Initial sync of all accounts
        if let Err(e) = Self::sync_all_accounts(&app_handle).await {
            error!("Initial sync failed: {}", e);
        }

        // Start background periodic sync
        let app_handle_periodic = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                sleep(Duration::from_secs(300)).await;
                if let Err(e) = Self::sync_all_accounts(&app_handle_periodic).await {
                    error!("Error during periodic sync: {}", e);
                }
            }
        });

        // Start background indexing
        let app_handle_indexing = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                sleep(Duration::from_secs(60)).await;
                if let Err(e) = Self::index_pending_emails(&app_handle_indexing).await {
                    error!("Error during background indexing: {}", e);
                }
            }
        });

        // Start background thread resolution
        let app_handle_threading = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                let pool = app_handle_threading.state::<SqlitePool>();
                let backlog_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM emails WHERE thread_id = message_id AND normalized_subject IS NOT NULL AND normalized_subject != ''")
                    .fetch_one(&*pool)
                    .await
                    .unwrap_or(0);
                
                // If we have a large backlog, run more aggressively
                let sleep_time = if backlog_count > 1000 { 5 } else { 30 };
                let batch_size = if backlog_count > 1000 { 2000 } else { 100 };

                if let Err(e) = Self::resolve_threads(&app_handle_threading, batch_size).await {
                    error!("Error during background threading: {}", e);
                }
                sleep(Duration::from_secs(sleep_time)).await;
            }
        });

        // Start background identity enrichment
        let app_handle_enrichment = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                // Run enrichment every 2 minutes
                sleep(Duration::from_secs(120)).await;
                if let Err(e) = crate::email_backend::enrichment::commands::proactive_enrichment(&app_handle_enrichment).await {
                    error!("Error during background enrichment: {}", e);
                }
            }
        });

        // Start IDLE for all accounts
        if let Ok(manager) = AccountManager::new(&app_handle).await {
            if let Ok(registry) = manager.load().await {
                for account in registry.accounts {
                    let app_handle = app_handle.clone();
                    let idle_senders = self.idle_senders.clone();
                    tauri::async_runtime::spawn(async move {
                        Self::start_idle_for_account(app_handle, account, idle_senders).await;
                    });
                }
            }
        }
    }

    pub fn trigger_sync_for_account(&self, account: Account) {
        let app_handle = self.app_handle.clone();
        let idle_senders = self.idle_senders.clone();
        
        tauri::async_runtime::spawn(async move {
            // 1. Initial sync
            if let Err(e) = Self::sync_account(&app_handle, &account).await {
                error!("Initial sync failed for {}: {}", account.email(), e);
            }
            
            // 2. Start IDLE
            Self::start_idle_for_account(app_handle, account, idle_senders).await;
        });
    }

    pub async fn refresh_folder(app_handle: &tauri::AppHandle<R>, account_id: i64, folder_id: i64) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        let folder_info: (String, Option<String>) = sqlx::query_as("SELECT path, role FROM folders WHERE id = ?")
            .bind(folder_id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        let (folder_path, folder_role) = folder_info;

        let manager = AccountManager::new(app_handle).await?;
        let account = manager.get_account_by_id(account_id).await?;
        let (account_config, imap_config, _) = account.get_configs()?;

        let backend_builder = BackendBuilder::new(
            account_config.clone(),
            ImapContextBuilder::new(account_config, imap_config),
        );

        let backend = backend_builder.build().await.map_err(|e| e.to_string())?;
        let context = (*backend.context).clone();
        let mut client = context.client().await;
        
        let folder_data = match client.examine_mailbox(&folder_path).await {
            Ok(data) => data,
            Err(e) => {
                error!("Failed to examine mailbox {}: {}", folder_path, e);
                // If it's a "cannot examine" error, we might want to try to list folders again
                // or just return the error. For now, let's return a more descriptive error.
                return Err(format!("cannot examine IMAP mailbox {}: {}", folder_path, e));
            }
        };
        
        Self::sync_folder(app_handle, &mut *client, &account, &folder_path, folder_role, &folder_data).await?;
        
        let _ = app_handle.emit("emails-updated", account_id);
        
        Ok(())
    }

    async fn save_envelopes(
        app_handle: &tauri::AppHandle<R>,
        account_id: i64,
        folder_id: i64,
        envelopes: Envelopes,
        notify: bool,
    ) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        let mut success_count = 0;
        let mut failure_count = 0;
        let mut last_error = None;
        let total = envelopes.len();

        for env in envelopes {
            let flags: Vec<String> = env.flags.clone().into();
            let date_str = env.date.with_timezone(&chrono::Utc).to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            let norm_subject = normalize_subject(&env.subject);
            
            let res = sqlx::query(
                "INSERT INTO emails (account_id, folder_id, remote_id, message_id, thread_id, in_reply_to, references_header, subject, normalized_subject, sender_name, sender_address, date, flags)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(folder_id, remote_id) DO UPDATE SET 
                    flags=excluded.flags"
            )
            .bind(account_id)
            .bind(folder_id)
            .bind(&env.id)
            .bind(&env.message_id)
            .bind(&env.message_id) // Default thread_id to message_id
            .bind(&env.in_reply_to)
            .bind(&env.references)
            .bind(&env.subject)
            .bind(norm_subject)
            .bind(&env.from.name)
            .bind(&env.from.addr)
            .bind(&date_str)
            .bind(serde_json::to_string(&flags).unwrap_or_default())
            .execute(&*pool)
            .await;

            match res {
                Ok(r) => {
                    success_count += 1;
                    if notify && r.rows_affected() > 0 && !flags.contains(&"seen".to_string()) {
                        info!("Sending notification for new email: {}", env.subject);
                        let _ = app_handle.notification()
                            .builder()
                            .title(format!("New Email: {}", env.subject))
                            .body(format!("From: {}", env.from.name.as_deref().unwrap_or(&env.from.addr)))
                            .show();
                    }
                }
                Err(e) => {
                    failure_count += 1;
                    last_error = Some(e.to_string());
                    error!("Failed to save email {} in folder {}: {}", env.id, folder_id, e);
                }
            }
        }
        
        info!("Saved {}/{} envelopes for folder {}", success_count, total, folder_id);
        
        // Update unread count for the folder based on actual emails in DB
        let _ = sqlx::query(
            "UPDATE folders SET unread_count = (
                SELECT COUNT(*) FROM emails 
                WHERE folder_id = ? AND (flags NOT LIKE '%seen%' AND flags NOT LIKE '%\"seen\"%')
            ) WHERE id = ?"
        )
        .bind(folder_id)
        .bind(folder_id)
        .execute(&*pool)
        .await;

        if failure_count > 0 && success_count == 0 {
            return Err(format!("Failed to save any emails in batch. Last error: {}", last_error.unwrap_or_default()));
        }
        
        Ok(())
    }

    pub async fn start_idle_for_account(app_handle: tauri::AppHandle<R>, account: Account, idle_senders: Arc<Mutex<HashMap<i64, oneshot::Sender<()>>>>) {
        let account_id = match account.id() {
            Some(id) => id,
            None => return,
        };

        info!("Starting IDLE for account: {}", account.email());

        let (tx, mut rx) = oneshot::channel();
        idle_senders.lock().await.insert(account_id, tx);

        loop {
            let res = tokio::select! {
                _ = &mut rx => {
                    info!("Stopping IDLE for account: {}", account.email());
                    break;
                }
                res = Self::run_idle_loop(&app_handle, &account) => res,
            };

            if let Err(e) = res {
                error!("IDLE loop error for {}: {}. Retrying in 30s...", account.email(), e);
                sleep(Duration::from_secs(30)).await;
            }
        }
    }

    async fn run_idle_loop(app_handle: &tauri::AppHandle<R>, account: &Account) -> Result<(), String> {
        let (account_config, imap_config, _) = account.get_configs()?;
        let ctx_builder = ImapContextBuilder::new(account_config.clone(), imap_config);

        let context: ImapContext = BackendContextBuilder::build(ctx_builder)
            .await
            .map_err(|e| e.to_string())?;

        let mut client = context.client().await;
        
        loop {
            info!("IDLE waiting for updates for {}...", account.email());
            
            // Select INBOX and get current state
            let folder_data = client.select_mailbox("INBOX").await.map_err(|e| e.to_string())?;
            
            // Sync current state
            Self::sync_folder(app_handle, &mut *client, account, "INBOX", Some("inbox".to_string()), &folder_data).await?;
            let _ = app_handle.emit("emails-updated", account.id());

            let (shutdown_tx, mut shutdown_rx) = oneshot::channel();
            
            // Start a timer to stop IDLE after 29 minutes (IMAP IDLE should be refreshed every 29 mins)
            let _app_handle_timer = app_handle.clone();
            let account_email = account.email().to_string();
            tauri::async_runtime::spawn(async move {
                sleep(Duration::from_secs(29 * 60)).await;
                let _ = shutdown_tx.send(());
                info!("Refreshing IDLE for {} after timeout", account_email);
            });

            client.idle(&mut shutdown_rx).await.map_err(|e| e.to_string())?;
            info!("IDLE notification received or timeout for {}", account.email());
        }
    }

    async fn sync_folder(
        app_handle: &tauri::AppHandle<R>, 
        client: &mut ImapClient, 
        account: &Account, 
        folder_name: &str,
        role: Option<String>,
        folder_data: &SelectDataUnvalidated
    ) -> Result<(), String> {
        let account_id = account.id().ok_or("Account ID missing")?;
        let pool = app_handle.state::<SqlitePool>();

        info!("Syncing folder {} for {}. Role: {:?}", folder_name, account.email(), role);

        let current_uid_validity = folder_data.uid_validity.map(|u: NonZeroU32| u.get() as i64).unwrap_or(0);
        let current_uid_next = folder_data.uid_next.map(|u: NonZeroU32| u.get() as i64).unwrap_or(0);
        let total_count = folder_data.exists.unwrap_or(0) as i64;

        info!("Folder {} state: UIDValidity={}, UIDNext={}, Exists={}", folder_name, current_uid_validity, current_uid_next, total_count);

        // 1. Get stored folder info
        let stored_folder: Option<(i64, i64, i64, Option<String>)> = sqlx::query_as(
            "SELECT id, uid_validity, uid_next, role FROM folders WHERE account_id = ? AND path = ?"
        )
        .bind(account_id)
        .bind(folder_name)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (folder_id, stored_uid_validity, stored_uid_next) = match stored_folder {
            Some((id, uv, un, stored_role)) => {
                info!("Found stored folder {} (id={}). Stored UIDValidity={}, UIDNext={}", folder_name, id, uv, un);
                // If role changed or was empty, update it
                if let Some(ref new_role) = role {
                    if stored_role.as_ref() != Some(new_role) {
                        sqlx::query("UPDATE folders SET role = ? WHERE id = ?")
                            .bind(new_role)
                            .bind(id)
                            .execute(&*pool)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
                (id, uv, un)
            },
            None => {
                info!("Folder {} not in DB, creating entry", folder_name);
                // Folder not in DB yet, insert it
                let row: (i64,) = sqlx::query_as(
                    "INSERT INTO folders (account_id, name, path, role, uid_validity, uid_next, total_count)
                     VALUES (?, ?, ?, ?, ?, ?, ?)
                     RETURNING id"
                )
                .bind(account_id)
                .bind(folder_name)
                .bind(folder_name)
                .bind(role.clone().unwrap_or_default())
                .bind(current_uid_validity)
                .bind(current_uid_next)
                .bind(total_count)
                .fetch_one(&*pool)
                .await
                .map_err(|e| e.to_string())?;
                info!("Created folder entry {} with id {}", folder_name, row.0);
                (row.0, 0, 0) // Treat as full sync
            }
        };

        // Handle UID validity change: clear local cache as UIDs are no longer valid
        if stored_uid_validity != 0 && stored_uid_validity != current_uid_validity {
            info!("UID validity changed for folder {} of {}, clearing local cache", folder_name, account.email());
            sqlx::query("DELETE FROM emails WHERE folder_id = ?")
                .bind(folder_id)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        }

        if stored_uid_validity != current_uid_validity || stored_uid_next == 0 {
            info!("Performing full sync for folder {} of {} (total={})", folder_name, account.email(), total_count);
            let mut end = total_count as u32;
            while end > 0 {
                let start = if end > SYNC_BATCH_SIZE { end - SYNC_BATCH_SIZE + 1 } else { 1 };
                info!("Fetching envelopes sequence {}:{} for folder {}", start, end, folder_name);
                
                let start_nz = NonZeroU32::new(start).unwrap_or(NonZeroU32::new(1).unwrap());
                let end_nz = NonZeroU32::new(end).unwrap_or(NonZeroU32::new(1).unwrap());
                let seq = (start_nz..=end_nz).into();

                let envelopes = client.fetch_envelopes_by_sequence(seq).await.map_err(|e| {
                    error!("Failed to fetch envelopes batch {}:{} for {}: {}", start, end, folder_name, e);
                    e.to_string()
                })?;
                
                if envelopes.is_empty() { 
                    info!("No envelopes returned for sequence {}:{} in folder {}", start, end, folder_name);
                    break; 
                }
                
                info!("Fetched {} envelopes for sequence {}:{} in folder {}", envelopes.len(), start, end, folder_name);
                
                let is_initial = stored_uid_next == 0;
                if let Err(e) = Self::save_envelopes(app_handle, account_id, folder_id, envelopes, !is_initial).await {
                    error!("Critical failure saving envelopes for {}: {}. Aborting folder sync.", folder_name, e);
                    return Err(e);
                }
                let _ = app_handle.emit("emails-updated", account_id);
                
                end = if start > 1 { start - 1 } else { 0 };
            }
        } else if (stored_uid_next as u32) < (current_uid_next as u32) {
            info!("Performing incremental sync for folder {} of {} (UID {}:*)", folder_name, account.email(), stored_uid_next);
            
            let start_uid = NonZeroU32::new(stored_uid_next as u32).unwrap_or(NonZeroU32::new(1).unwrap());
            let uids = (start_uid..).into();
            let envelopes = client.fetch_envelopes(uids).await.map_err(|e| {
                error!("Failed to fetch envelopes incremental UID {}:* for {}: {}", stored_uid_next, folder_name, e);
                e.to_string()
            })?;
            
            if !envelopes.is_empty() {
                info!("Fetched {} new envelopes incrementally for folder {}", envelopes.len(), folder_name);
                if let Err(e) = Self::save_envelopes(app_handle, account_id, folder_id, envelopes, true).await {
                    error!("Critical failure saving incremental envelopes for {}: {}. Aborting folder sync.", folder_name, e);
                    return Err(e);
                }
                let _ = app_handle.emit("emails-updated", account_id);
            }
        } else {
            info!("Folder {} of {} is up to date", folder_name, account.email());
        }

        // Update folder info with latest state from server
        info!("Updating folder {} entry with new UIDNext={}", folder_name, current_uid_next);
        sqlx::query(
            "UPDATE folders SET uid_validity = ?, uid_next = ?, total_count = ? WHERE id = ?"
        )
        .bind(current_uid_validity)
        .bind(current_uid_next)
        .bind(total_count)
        .bind(folder_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    async fn resolve_threads(app_handle: &tauri::AppHandle<R>, limit: i64) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        
        // 1. Link by in_reply_to (High confidence)
        let unlinked_replies: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT id, message_id, in_reply_to FROM emails 
             WHERE in_reply_to IS NOT NULL AND thread_id = message_id 
             LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        for (id, _message_id, in_reply_to) in unlinked_replies {
            let parent: Option<(String,)> = sqlx::query_as(
                "SELECT thread_id FROM emails WHERE message_id = ? LIMIT 1"
            )
            .bind(&in_reply_to)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

            if let Some((parent_thread_id,)) = parent {
                sqlx::query("UPDATE emails SET thread_id = ? WHERE id = ?")
                    .bind(parent_thread_id)
                    .bind(id)
                    .execute(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }

        // 2. Link by references_header (High confidence)
        let unlinked_refs: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT id, message_id, references_header FROM emails 
             WHERE references_header IS NOT NULL AND thread_id = message_id 
             LIMIT ?"
        )
        .bind(limit)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        for (id, _message_id, refs) in unlinked_refs {
            let ref_ids: Vec<&str> = refs.split(|c| c == ' ' || c == ',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            for ref_id in ref_ids.iter().rev() {
                let parent: Option<(String,)> = sqlx::query_as(
                    "SELECT thread_id FROM emails WHERE message_id = ? LIMIT 1"
                )
                .bind(ref_id)
                .fetch_optional(&*pool)
                .await
                .map_err(|e| e.to_string())?;

                if let Some((parent_thread_id,)) = parent {
                    sqlx::query("UPDATE emails SET thread_id = ? WHERE id = ?")
                        .bind(parent_thread_id)
                        .bind(id)
                        .execute(&*pool)
                        .await
                        .map_err(|e| e.to_string())?;
                    break;
                }
            }
        }

        // 3. Heuristic Bulk Threading (Subject + Sender) as fallback
        // This sets the thread_id to the earliest message_id in the group
        let _ = sqlx::query(
            "UPDATE emails 
             SET thread_id = (
                SELECT MIN(e2.message_id) 
                FROM emails e2 
                WHERE e2.account_id = emails.account_id 
                  AND e2.sender_address = emails.sender_address 
                  AND e2.normalized_subject = emails.normalized_subject
                  AND e2.normalized_subject IS NOT NULL 
                  AND e2.normalized_subject != ''
             )
             WHERE thread_id = message_id 
               AND normalized_subject IS NOT NULL 
               AND normalized_subject != ''
               AND id IN (SELECT id FROM emails WHERE thread_id = message_id LIMIT ?)"
        )
        .bind(limit)
        .execute(&*pool)
        .await;
        
        Ok(())
    }

    pub async fn sync_all_accounts(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
        let manager = AccountManager::new(app_handle).await?;
        let registry = manager.load().await?;
        
        for account in registry.accounts {
            if let Err(e) = Self::sync_account(app_handle, &account).await {
                error!("Failed to sync account {}: {}", account.email(), e);
            }
        }
        
        Ok(())
    }

    pub async fn sync_account(app_handle: &tauri::AppHandle<R>, account: &Account) -> Result<(), String> {
        // Ensure we have the latest account info with ID from DB
        let manager = AccountManager::new(app_handle).await?;
        let account = manager.get_account_by_id(account.id().ok_or("Account ID missing before sync")?).await?;
        
        match account {
            Account::Google(google) => {
                Self::sync_google_account(app_handle, &google).await?;
            }
        }
        Ok(())
    }

    async fn sync_google_account(app_handle: &tauri::AppHandle<R>, google: &GoogleAccount) -> Result<(), String> {
        info!("Syncing Google account: {}", google.email);
        let account = Account::Google(google.clone());
        let (account_config, imap_config, _) = account.get_configs()?;

        let backend_builder = BackendBuilder::new(
            account_config.clone(),
            ImapContextBuilder::new(account_config, imap_config),
        );

        let backend = backend_builder.build().await.map_err(|e| e.to_string())?;
        let folders = backend.list_folders().await.map_err(|e| e.to_string())?;
        
        let context = (*backend.context).clone();

        for folder in folders {
            let name_lower = folder.name.to_lowercase();
            let role = if folder.is_inbox() {
                Some("inbox".to_string())
            } else if folder.is_sent() {
                Some("sent".to_string())
            } else if name_lower.contains("spam") || name_lower.contains("junk") {
                Some("spam".to_string())
            } else {
                // Ignore all other folders for the revamped inbox
                continue;
            };

            let mut client = context.client().await;
            info!("Syncing revamped folder: {} as {:?} for {}", folder.name, role, google.email);
            let folder_data = client.select_mailbox(&folder.name).await.map_err(|e| {
                error!("Failed to select mailbox {}: {}", folder.name, e);
                e.to_string()
            })?;
            Self::sync_folder(app_handle, &mut *client, &account, &folder.name, role, &folder_data).await?;
        }

        Ok(())
    }

    async fn index_pending_emails(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        
        // Find a batch of emails missing body content, prioritized by date
        let pending_emails: Vec<(i64, i64, String, String)> = sqlx::query_as(
            "SELECT e.id, e.account_id, e.remote_id, f.path 
             FROM emails e 
             JOIN folders f ON e.folder_id = f.id 
             WHERE e.body_text IS NULL AND f.role != 'trash' AND f.role != 'spam'
             ORDER BY e.date DESC LIMIT 20"
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if pending_emails.is_empty() {
            return Ok(());
        }

        info!("Background indexing {} emails...", pending_emails.len());

        let manager = AccountManager::new(app_handle).await?;
        
        // Group by account to reuse connections
        let mut by_account: HashMap<i64, Vec<(i64, String, String)>> = HashMap::new();
        for (id, account_id, remote_id, folder_path) in pending_emails {
            by_account.entry(account_id).or_default().push((id, remote_id, folder_path));
        }

        for (account_id, emails) in by_account {
            let account = match manager.get_account_by_id(account_id).await {
                Ok(a) => a,
                Err(_) => continue,
            };

            let (account_config, imap_config, _) = account.get_configs()?;
            let backend_builder = BackendBuilder::new(
                account_config.clone(),
                ImapContextBuilder::new(account_config, imap_config),
            );

            let backend = match backend_builder.build().await {
                Ok(b) => b,
                Err(e) => {
                    error!("Failed to build backend for account {}: {}", account_id, e);
                    continue;
                }
            };

            for (email_id, remote_id, folder_path) in emails {
                let id = email::envelope::Id::single(remote_id);
                match backend.get_messages(&folder_path, &id).await {
                    Ok(messages) => {
                        if let Some(message) = messages.first() {
                            if let Ok(parsed) = message.parsed() {
                                let body_text: Option<String> = parsed.body_text(0).map(|b| b.to_string());
                                let body_html: Option<String> = parsed.body_html(0).map(|b| b.to_string());
                                let snippet = body_text.as_ref().map(|t: &String| {
                                    let s = t.chars().take(200).collect::<String>();
                                    s.replace('\n', " ").replace('\r', "")
                                });

                                sqlx::query("UPDATE emails SET body_text = ?, body_html = ?, snippet = ? WHERE id = ?")
                                    .bind(body_text)
                                    .bind(body_html)
                                    .bind(snippet)
                                    .bind(email_id)
                                    .execute(&*pool)
                                    .await
                                    .map_err(|e| e.to_string())?;
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to fetch message {} for indexing: {}", email_id, e);
                    }
                }
                // Small sleep to be nice to the server
                sleep(Duration::from_millis(100)).await;
            }
        }

        Ok(())
    }
}