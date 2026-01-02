use std::collections::HashMap;
use std::time::Duration;
use std::sync::Arc;
use std::num::NonZeroU32;
use tauri::{Manager, Emitter};
use crate::email_backend::accounts::manager::{AccountManager, Account};
use tokio::time::sleep;
use tokio::sync::{oneshot, Mutex};
use log::{info, error};
use email::imap::{ImapContext, ImapContextBuilder, ImapClient};
use email::backend::{Backend, context::BackendContextBuilder};
use email::folder::list::ListFolders;
use email::envelope::Envelopes;
use imap_client::tasks::tasks::select::SelectDataUnvalidated;
use sqlx::SqlitePool;

pub struct SyncEngine<R: tauri::Runtime = tauri::Wry> {
    app_handle: tauri::AppHandle<R>,
    idle_senders: Arc<Mutex<HashMap<i64, oneshot::Sender<()>>>>,
    contexts: Arc<Mutex<HashMap<i64, ImapContext>>>,
}

impl<R: tauri::Runtime> Clone for SyncEngine<R> {
    fn clone(&self) -> Self {
        Self {
            app_handle: self.app_handle.clone(),
            idle_senders: self.idle_senders.clone(),
            contexts: self.contexts.clone(),
        }
    }
}

const SYNC_BATCH_SIZE: u32 = 100;
const MAX_SYNC_MESSAGES_PER_FOLDER: u32 = 500;

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
            contexts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn get_context(&self, account_id: i64) -> Result<ImapContext, String> {
        let mut contexts = self.contexts.lock().await;
        if let Some(ctx) = contexts.get(&account_id) {
            return Ok(ctx.clone());
        }

        let manager = AccountManager::new(&self.app_handle).await?;
        let account = manager.get_account_by_id(account_id).await?;
        let (account_config, imap_config, _) = account.get_configs()?;

        // Use pool size 2 to allow IDLE and one concurrent request
        let ctx_builder = ImapContextBuilder::new(account_config.clone(), imap_config)
            .with_pool_size(2);

        let context: ImapContext = match BackendContextBuilder::build(ctx_builder).await {
            Ok(ctx) => ctx,
            Err(e) => {
                let err_str = e.to_string();
                if err_str.contains("auth") || err_str.contains("Unauthorized") || err_str.contains("token") || err_str.contains("credentials") {
                    info!("Refreshing token for account {} due to context build error: {}", account.email(), err_str);
                    manager.refresh_access_token(account.email()).await?;

                    // Reload account and configs
                    let account = manager.get_account_by_id(account_id).await?;
                    let (account_config, imap_config, _) = account.get_configs()?;
                    let ctx_builder = ImapContextBuilder::new(account_config, imap_config)
                        .with_pool_size(2);

                    BackendContextBuilder::build(ctx_builder)
                        .await
                        .map_err(|e| e.to_string())?
                } else {
                    return Err(err_str);
                }
            }
        };

        contexts.insert(account_id, context.clone());
        Ok(context)
    }

    pub async fn get_backend(&self, account_id: i64) -> Result<Backend<ImapContext>, String> {
        let context = self.get_context(account_id).await?;
        let manager = AccountManager::new(&self.app_handle).await?;
        let account = manager.get_account_by_id(account_id).await?;
        let (account_config, imap_config, _) = account.get_configs()?;

        let ctx_builder = ImapContextBuilder::new(account_config.clone(), imap_config);

        Ok(Backend {
            account_config,
            context: Arc::new(context),
            add_folder: ctx_builder.add_folder(),
            list_folders: ctx_builder.list_folders(),
            expunge_folder: ctx_builder.expunge_folder(),
            purge_folder: ctx_builder.purge_folder(),
            delete_folder: ctx_builder.delete_folder(),
            get_envelope: ctx_builder.get_envelope(),
            list_envelopes: ctx_builder.list_envelopes(),
            thread_envelopes: ctx_builder.thread_envelopes(),
            watch_envelopes: ctx_builder.watch_envelopes(),
            add_flags: ctx_builder.add_flags(),
            set_flags: ctx_builder.set_flags(),
            remove_flags: ctx_builder.remove_flags(),
            add_message: ctx_builder.add_message(),
            send_message: None,
            peek_messages: ctx_builder.peek_messages(),
            get_messages: ctx_builder.get_messages(),
            copy_messages: ctx_builder.copy_messages(),
            move_messages: ctx_builder.move_messages(),
            delete_messages: ctx_builder.delete_messages(),
            remove_messages: ctx_builder.remove_messages(),
        })
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

        // Start IDLE for all accounts
        if let Ok(manager) = AccountManager::new(&app_handle).await {
            if let Ok(registry) = manager.load().await {
                for account in registry.accounts {
                    let engine = self.clone();
                    tauri::async_runtime::spawn(async move {
                        engine.start_idle_for_account(account).await;
                    });
                }
            }
        }
    }

    pub fn trigger_sync_for_account(&self, account: Account) {
        let engine = self.clone();

        tauri::async_runtime::spawn(async move {
            // 1. Initial sync
            if let Err(e) = Self::sync_account(&engine.app_handle, &account).await {
                error!("Initial sync failed for {}: {}", account.email(), e);
            }

            // 2. Start IDLE
            engine.start_idle_for_account(account).await;
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

        let engine = app_handle.state::<SyncEngine<R>>();
        let context = engine.get_context(account_id).await?;
        let account = AccountManager::new(app_handle).await?.get_account_by_id(account_id).await?;

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

    async fn is_ai_summary_enabled(app_handle: &tauri::AppHandle<R>) -> bool {
        let pool = app_handle.state::<SqlitePool>();
        let ai_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiEnabled'")
            .fetch_one(&*pool)
            .await
            .unwrap_or(("false".to_string(),));

        let ai_summarization_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiSummarizationEnabled'")
            .fetch_one(&*pool)
            .await
            .unwrap_or(("false".to_string(),));

        ai_enabled.0 == "true" && ai_summarization_enabled.0 == "true"
    }

    async fn is_notifications_enabled(app_handle: &tauri::AppHandle<R>) -> bool {
        let pool = app_handle.state::<SqlitePool>();
        let notifications_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'notificationsEnabled'")
            .fetch_one(&*pool)
            .await
            .unwrap_or(("true".to_string(),));

        notifications_enabled.0 == "true"
    }

    async fn handle_notification(
        app_handle: tauri::AppHandle<R>,
        email_id: i64,
        subject: String,
        sender: String,
    ) {
        if !Self::is_notifications_enabled(&app_handle).await {
            return;
        }

        if !Self::is_ai_summary_enabled(&app_handle).await {
            let _ = app_handle.notification()
                .builder()
                .title(format!("New Email: {}", subject))
                .body(format!("From: {}", sender))
                .show();
            return;
        }

        // AI Summary enabled, try to get it within 10 seconds
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(10);

        // Trigger indexing and summarization immediately for this email
        let app_handle_worker = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            use crate::email_backend::sync::worker::SyncWorker;
            if let Err(e) = SyncWorker::index_specific_email(&app_handle_worker, email_id).await {
                error!("Failed to index email {} for notification: {}", email_id, e);
                return;
            }
            if let Err(e) = SyncWorker::summarize_specific_email(&app_handle_worker, email_id).await {
                error!("Failed to summarize email {} for notification: {}", email_id, e);
            }
        });

        while start.elapsed() < timeout {
             let pool = app_handle.state::<SqlitePool>();
             let summary: Option<Option<String>> = sqlx::query_scalar("SELECT summary FROM emails WHERE id = ?")
                 .bind(email_id)
                 .fetch_optional(&*pool)
                 .await
                 .unwrap_or(None);

             if let Some(Some(s)) = summary {
                 let _ = app_handle.notification()
                     .builder()
                     .title(format!("New Email: {}", subject))
                     .body(format!("{}", s))
                     .show();
                 return;
             }

             tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }

        // Timeout reached, send default notification
        let _ = app_handle.notification()
            .builder()
            .title(format!("New Email: {}", subject))
            .body(format!("From: {}", sender))
            .show();
    }

    async fn save_envelopes(
        app_handle: &tauri::AppHandle<R>,
        account_id: i64,
        folder_id: i64,
        envelopes: Envelopes,
        notify: bool,
    ) -> Result<Vec<i64>, String> {
        let pool = app_handle.state::<SqlitePool>();
        let mut saved_ids = Vec::new();
        let mut success_count = 0;
        let mut failure_count = 0;
        let mut last_error = None;
        let total = envelopes.len();

        for env in envelopes {
            let flags: Vec<String> = env.flags.clone().into();
            let date_str = env.date.with_timezone(&chrono::Utc).to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            let norm_subject = normalize_subject(&env.subject);
            let recipient_to = Some(env.to.addr.clone());

            let res: Result<(i64,), sqlx::Error> = sqlx::query_as(
                "INSERT INTO emails (account_id, folder_id, remote_id, message_id, thread_id, in_reply_to, references_header, subject, normalized_subject, sender_name, sender_address, recipient_to, date, flags, has_attachments)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(folder_id, remote_id) DO UPDATE SET
                    flags=excluded.flags,
                    recipient_to=COALESCE(emails.recipient_to, excluded.recipient_to),
                    has_attachments=excluded.has_attachments
                 RETURNING id"
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
            .bind(recipient_to)
            .bind(&date_str)
            .bind(serde_json::to_string(&flags).unwrap_or_default())
            .bind(env.has_attachment)
            .fetch_one(&*pool)
            .await;

            match res {
                Ok((email_id,)) => {
                    success_count += 1;
                    saved_ids.push(email_id);
                    if notify && !flags.contains(&"seen".to_string()) {
                        info!("Scheduling notification for email: {}", env.subject);
                        let app_handle_clone = app_handle.clone();
                        let subject = env.subject.clone();
                        let sender = env.from.name.as_deref().unwrap_or(&env.from.addr).to_string();

                        tauri::async_runtime::spawn(async move {
                            Self::handle_notification(app_handle_clone, email_id, subject, sender).await;
                        });
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

        Ok(saved_ids)
    }

    pub async fn start_idle_for_account(&self, account: Account) {
        let account_id = match account.id() {
            Some(id) => id,
            None => return,
        };

        info!("Starting IDLE for account: {}", account.email());

        let (tx, mut rx) = oneshot::channel();
        self.idle_senders.lock().await.insert(account_id, tx);

        loop {
            let res = tokio::select! {
                _ = &mut rx => {
                    info!("Stopping IDLE for account: {}", account.email());
                    break;
                }
                res = self.run_idle_loop(&account) => res,
            };

            if let Err(e) = res {
                error!("IDLE loop error for {}: {}. Retrying in 30s...", account.email(), e);
                sleep(Duration::from_secs(30)).await;
            }
        }
    }

    async fn run_idle_loop(&self, account: &Account) -> Result<(), String> {
        let account_id = account.id().ok_or("Account ID missing")?;
        let context = self.get_context(account_id).await?;

        let mut client = context.client().await;

        loop {
            info!("IDLE waiting for updates for {}...", account.email());

            // Select INBOX and get current state
            let folder_data = client.select_mailbox("INBOX").await.map_err(|e| e.to_string())?;

            // Sync current state
            Self::sync_folder(&self.app_handle, &mut *client, account, "INBOX", Some("inbox".to_string()), &folder_data).await?;

            let (shutdown_tx, mut shutdown_rx) = oneshot::channel();

            // Start a timer to stop IDLE after 29 minutes (IMAP IDLE should be refreshed every 29 mins)
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

        let sync_months_setting: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'syncMonths'")
            .fetch_one(&*pool)
            .await
            .unwrap_or(("3".to_string(),));
        let sync_months = sync_months_setting.0.parse::<i32>().unwrap_or(3);

        info!("Syncing folder {} for {}. Role: {:?}. SyncMonths: {}", folder_name, account.email(), role, sync_months);

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
            let mut synced_count = 0;

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

                let batch_len = envelopes.len() as u32;
                info!("Fetched {} envelopes for sequence {}:{} in folder {}", batch_len, start, end, folder_name);

                let is_initial = stored_uid_next == 0;
                let _saved_ids = match Self::save_envelopes(app_handle, account_id, folder_id, envelopes, !is_initial).await {
                    Ok(ids) => ids,
                    Err(e) => {
                        error!("Critical failure saving envelopes for {}: {}. Aborting folder sync.", folder_name, e);
                        return Err(e);
                    }
                };

                synced_count += batch_len;
                // Signal that new emails are available without spamming granular events
                let _ = app_handle.emit("emails-updated", "bulk-add");

                end = if start > 1 { start - 1 } else { 0 };
            }
        } else if (stored_uid_next as u32) < (current_uid_next as u32) {
            info!("Performing incremental sync for folder {} of {} (UID {}:*)", folder_name, account.email(), stored_uid_next);

            let start_uid = NonZeroU32::new(stored_uid_next as u32).unwrap_or(NonZeroU32::new(1).unwrap());
            let uids = (start_uid..).into();
            let mut envelopes = client.fetch_envelopes(uids).await.map_err(|e| {
                error!("Failed to fetch envelopes incremental UID {}:* for {}: {}", stored_uid_next, folder_name, e);
                e.to_string()
            })?;

            if !envelopes.is_empty() {
                info!("Fetched {} new envelopes incrementally for folder {}", envelopes.len(), folder_name);
                let _saved_ids = match Self::save_envelopes(app_handle, account_id, folder_id, envelopes, true).await {
                    Ok(ids) => ids,
                    Err(e) => {
                        error!("Critical failure saving incremental envelopes for {}: {}. Aborting folder sync.", folder_name, e);
                        return Err(e);
                    }
                };

                let _ = app_handle.emit("emails-updated", "bulk-add");
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

        Self::sync_imap_account(app_handle, &account).await
    }

    async fn sync_imap_account(app_handle: &tauri::AppHandle<R>, account: &Account) -> Result<(), String> {
        info!("Syncing IMAP account: {}", account.email());
        let account_id = account.id().ok_or("Account ID missing")?;

        let engine = app_handle.state::<SyncEngine<R>>();
        let backend = engine.get_backend(account_id).await?;
        let folders = backend.list_folders().await.map_err(|e| e.to_string())?;

        let context = (*backend.context).clone();

        for folder in folders {
            let name_lower = folder.name.to_lowercase();
            let role = if folder.is_inbox() {
                Some("inbox".to_string())
            } else if folder.is_sent() {
                Some("sent".to_string())
            } else if folder.is_drafts() || name_lower.contains("drafts") {
                Some("drafts".to_string())
            } else if name_lower.contains("spam") || name_lower.contains("junk") {
                Some("spam".to_string())
            } else if name_lower.contains("trash") || name_lower.contains("bin") || name_lower.contains("deleted") {
                Some("trash".to_string())
            } else if name_lower.contains("archive") || name_lower.contains("all mail") {
                Some("archive".to_string())
            } else {
                // Ignore all other folders for the revamped inbox
                continue;
            };

            let mut client = context.client().await;
            info!("Syncing revamped folder: {} as {:?} for {}", folder.name, role, account.email());
            let folder_data = client.select_mailbox(&folder.name).await.map_err(|e| {
                error!("Failed to select mailbox {}: {}", folder.name, e);
                e.to_string()
            })?;
            Self::sync_folder(app_handle, &mut *client, account, &folder.name, role, &folder_data).await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_utils::setup_test_db;
    use tauri::test::mock_builder;
    use email::envelope::{Envelope, Envelopes, Address};
    use chrono::Utc;
    use tauri::Manager;

    #[tokio::test]
    async fn test_save_envelopes_saves_has_attachments() {
        let pool = setup_test_db().await;

        let row: (i64,) = sqlx::query_as("INSERT INTO accounts (email, account_type) VALUES (?, ?) RETURNING id")
            .bind("test@example.com")
            .bind("google")
            .fetch_one(&pool)
            .await
            .unwrap();
        let account_id = row.0;

        let row: (i64,) = sqlx::query_as("INSERT INTO folders (account_id, name, path, role) VALUES (?, ?, ?, ?) RETURNING id")
            .bind(account_id)
            .bind("Inbox")
            .bind("INBOX")
            .bind("inbox")
            .fetch_one(&pool)
            .await
            .unwrap();
        let folder_id = row.0;

        let mut envelope = Envelope::default();
        envelope.id = "1".to_string();
        envelope.message_id = "<msg1@example.com>".to_string();
        envelope.subject = "Test Subject".to_string();
        envelope.from = Address::new(Some("Sender".to_string()), "sender@example.com".to_string());
        envelope.to = Address::new(Some("Me".to_string()), "test@example.com".to_string());
        envelope.date = Utc::now().with_timezone(&chrono::FixedOffset::east_opt(0).unwrap());
        envelope.has_attachment = true;

        let envelopes: Envelopes = vec![envelope].into_iter().collect();

        let app = mock_builder().build(tauri::generate_context!()).unwrap();
        app.manage(pool.clone());

        SyncEngine::save_envelopes(&app.handle(), account_id, folder_id, envelopes, false)
            .await
            .expect("Failed to save envelopes");

        let has_attachments: bool = sqlx::query_scalar("SELECT has_attachments FROM emails WHERE remote_id = '1'")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(has_attachments, "has_attachments should be true");
    }
}
