use crate::email_backend::emails::events::EmailEvent;
use log::{debug, error, info};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::time::{interval, sleep, MissedTickBehavior};

use crate::email_backend::sync::SyncEngine;
use email::envelope::Id;
use email::message::get::GetMessages;

pub struct SyncWorker<R: tauri::Runtime> {
    app_handle: tauri::AppHandle<R>,
}

impl<R: tauri::Runtime> SyncWorker<R> {
    pub fn new(app_handle: tauri::AppHandle<R>) -> Self {
        Self { app_handle }
    }

    pub async fn start(&self) {
        info!("Starting Sync Worker...");

        let indexing_handle = self.app_handle.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(10));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            loop {
                ticker.tick().await;

                if let Err(e) = Self::index_pending_emails(&indexing_handle).await {
                    error!("Error during background indexing: {}", e);
                }
            }
        });

        let threading_handle = self.app_handle.clone();
        tokio::spawn(async move {
            loop {
                let pool = threading_handle.state::<SqlitePool>();
                let backlog_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM emails WHERE thread_id = message_id AND normalized_subject IS NOT NULL AND normalized_subject != ''")
                    .fetch_one(&*pool)
                    .await
                    .unwrap_or(0);

                let sleep_time = if backlog_count > 1000 { 5 } else { 30 };
                let batch_size = if backlog_count > 1000 { 2000 } else { 100 };

                if let Err(e) = Self::resolve_threads(&threading_handle, batch_size).await {
                    error!("Error during background threading: {}", e);
                }

                sleep(Duration::from_secs(sleep_time)).await;
            }
        });

        let enrichment_handle = self.app_handle.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(120));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            loop {
                ticker.tick().await;

                if let Err(e) = crate::email_backend::enrichment::commands::proactive_enrichment(
                    &enrichment_handle,
                )
                .await
                {
                    error!("Error during background enrichment: {}", e);
                }
            }
        });

        let contacts_handle = self.app_handle.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(1800));
            ticker.set_missed_tick_behavior(MissedTickBehavior::Skip);

            loop {
                ticker.tick().await;

                if let Err(e) = crate::email_backend::enrichment::commands::sync_contacts_internal(
                    &contacts_handle,
                )
                .await
                {
                    error!("Error during background contact sync: {}", e);
                }
            }
        });
    }

    pub async fn summarize_visible_emails(
        app_handle: &tauri::AppHandle<R>,
        email_ids: Vec<i64>,
    ) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();

        let ai_enabled: (String,) =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'aiEnabled'")
                .fetch_one(&*pool)
                .await
                .unwrap_or(("false".to_string(),));

        let ai_summarization_enabled: (String,) =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'aiSummarizationEnabled'")
                .fetch_one(&*pool)
                .await
                .unwrap_or(("false".to_string(),));

        if ai_enabled.0 != "true" || ai_summarization_enabled.0 != "true" {
            return Ok(());
        }

        for email_id in email_ids {
            let body_text: Option<String> =
                sqlx::query_scalar("SELECT body_text FROM emails WHERE id = ?")
                    .bind(email_id)
                    .fetch_one(&*pool)
                    .await
                    .ok();

            let Some(text) = body_text else {
                continue;
            };

            let current_summary: Option<String> =
                sqlx::query_scalar("SELECT summary FROM emails WHERE id = ?")
                    .bind(email_id)
                    .fetch_optional(&*pool)
                    .await
                    .ok()
                    .flatten();

            if current_summary
                .as_deref()
                .is_some_and(|s| !s.is_empty())
            {
                continue;
            }

            let role: Option<String> = sqlx::query_scalar(
                "SELECT f.role FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?",
            )
            .bind(email_id)
            .fetch_optional(&*pool)
            .await
            .ok()
            .flatten();

            if matches!(role.as_deref(), Some("spam") | Some("trash")) {
                continue;
            }

            if let Err(e) = crate::email_backend::llm::summarization::enqueue_summarization(
                app_handle,
                email_id,
                &text,
                crate::email_backend::llm::AiTaskPriority::High,
            )
            .await
            {
                debug!("Failed to enqueue summarization for email {}: {}", email_id, e);
            }
        }

        Ok(())
    }

    pub async fn summarize_specific_email(
        app_handle: &tauri::AppHandle<R>,
        email_id: i64,
    ) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        let body_text: Option<String> =
            sqlx::query_scalar("SELECT body_text FROM emails WHERE id = ?")
                .bind(email_id)
                .fetch_one(&*pool)
                .await
                .map_err(|e| e.to_string())?;

        if let Some(text) = body_text {
            if let Err(e) = crate::email_backend::llm::summarization::enqueue_summarization(
                app_handle,
                email_id,
                &text,
                crate::email_backend::llm::AiTaskPriority::High,
            )
            .await
            {
                return Err(e);
            }
            return Ok(());
        }
        Err("No body text found for summarization".to_string())
    }

    async fn index_pending_emails(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();

        let sync_months_setting: (String,) =
            sqlx::query_as("SELECT value FROM settings WHERE key = 'syncMonths'")
                .fetch_one(&*pool)
                .await
                .unwrap_or(("3".to_string(),));
        let sync_months = sync_months_setting.0.parse::<i32>().unwrap_or(3);

        let mut query = "SELECT e.id, e.account_id, e.remote_id, f.path
             FROM emails e
             JOIN folders f ON e.folder_id = f.id
             WHERE e.body_text IS NULL AND f.role != 'trash' AND f.role != 'spam'"
            .to_string();

        if sync_months > 0 {
            query.push_str(&format!(
                " AND datetime(e.date) > datetime('now', '-{} months')",
                sync_months
            ));
        }

        query.push_str(" ORDER BY e.date DESC LIMIT 20");

        let pending_emails: Vec<(i64, i64, String, String)> = sqlx::query_as(&query)
            .fetch_all(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        if pending_emails.is_empty() {
            return Ok(());
        }

        info!("Background indexing {} emails...", pending_emails.len());

        let mut by_account: HashMap<i64, Vec<(i64, String, String)>> = HashMap::new();
        for (id, account_id, remote_id, folder_path) in pending_emails {
            by_account
                .entry(account_id)
                .or_default()
                .push((id, remote_id, folder_path));
        }

        for (account_id, emails) in by_account {
            let engine = app_handle.state::<SyncEngine<R>>();
            let backend = match engine.get_backend(account_id).await {
                Ok(b) => b,
                Err(e) => {
                    error!("Failed to build backend for account {}: {}", account_id, e);
                    continue;
                }
            };

            for (email_id, remote_id, folder_path) in emails {
                let uids = Id::single(remote_id.clone());

                match backend.get_messages(&folder_path, &uids).await {
                    Ok(messages) => {
                        for message in messages.to_vec() {
                            Self::save_message_parts(app_handle, email_id, message).await?;
                        }
                    }
                    Err(e) => {
                        error!(
                            "Failed to fetch message uid {} for indexing: {}",
                            remote_id, e
                        );
                    }
                }
                sleep(Duration::from_millis(100)).await;
            }
        }

        Ok(())
    }

    pub async fn index_specific_email(
        app_handle: &tauri::AppHandle<R>,
        email_id: i64,
    ) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        let email_info: Option<(i64, String, String)> = sqlx::query_as(
            "SELECT e.account_id, e.remote_id, f.path 
             FROM emails e 
             JOIN folders f ON e.folder_id = f.id 
             WHERE e.id = ?",
        )
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some((account_id, remote_id, folder_path)) = email_info {
            let engine = app_handle.state::<SyncEngine<R>>();
            let backend = engine.get_backend(account_id).await?;
            let uids = Id::single(remote_id.clone());

            match backend.get_messages(&folder_path, &uids).await {
                Ok(messages) => {
                    for message in messages.to_vec() {
                        Self::save_message_parts(app_handle, email_id, message).await?;
                    }
                }
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    }

    async fn save_message_parts(
        app_handle: &tauri::AppHandle<R>,
        email_id: i64,
        message: &email::message::Message<'_>,
    ) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();

        // Save attachments if any
        if let Ok(attachments) = message.attachments() {
            for att in attachments {
                let _ = sqlx::query(
                    "INSERT INTO attachments (email_id, filename, mime_type, size)
                     VALUES (?, ?, ?, ?)",
                )
                .bind(email_id)
                .bind(&att.filename)
                .bind(&att.mime)
                .bind(att.body.len() as i64)
                .execute(&*pool)
                .await
                .map_err(|e| error!("Failed to save attachment for email {}: {}", email_id, e));
            }
        }

        if let Ok(parsed) = message.parsed() {
            let parsed: &mail_parser::Message = parsed;
            let body_text: Option<String> = parsed.body_text(0).map(|b| b.to_string());
            let body_html: Option<String> = parsed.body_html(0).map(|b| b.to_string());
            let snippet = body_text.as_ref().map(|t: &String| {
                let s = t.chars().take(200).collect::<String>();
                s.replace('\n', " ").replace('\r', "")
            });

            let _ = sqlx::query(
                "UPDATE emails SET body_text = ?, body_html = ?, snippet = ? WHERE id = ?",
            )
            .bind(body_text)
            .bind(body_html)
            .bind(snippet)
            .bind(email_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    async fn resolve_threads(app_handle: &tauri::AppHandle<R>, limit: i64) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();

        let unlinked_replies: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT id, message_id, in_reply_to FROM emails 
             WHERE in_reply_to IS NOT NULL AND thread_id = message_id 
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        for (id, _message_id, in_reply_to) in unlinked_replies {
            let parent: Option<(String,)> =
                sqlx::query_as("SELECT thread_id FROM emails WHERE message_id = ? LIMIT 1")
                    .bind(&in_reply_to)
                    .fetch_optional(&*pool)
                    .await
                    .map_err(|e| e.to_string())?;

            if let Some((parent_thread_id,)) = parent {
                let _ = sqlx::query("UPDATE emails SET thread_id = ? WHERE id = ?")
                    .bind(parent_thread_id)
                    .bind(id)
                    .execute(&*pool)
                    .await
                    .map_err(|e| e.to_string());
            }
        }

        let unlinked_refs: Vec<(i64, String, String)> = sqlx::query_as(
            "SELECT id, message_id, references_header FROM emails 
             WHERE references_header IS NOT NULL AND thread_id = message_id 
             LIMIT ?",
        )
        .bind(limit)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        for (id, _message_id, refs) in unlinked_refs {
            let ref_ids: Vec<&str> = refs
                .split(|c| c == ' ' || c == ',')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            for ref_id in ref_ids.iter().rev() {
                let parent: Option<(String,)> =
                    sqlx::query_as("SELECT thread_id FROM emails WHERE message_id = ? LIMIT 1")
                        .bind(ref_id)
                        .fetch_optional(&*pool)
                        .await
                        .map_err(|e| e.to_string())?;

                if let Some((parent_thread_id,)) = parent {
                    let _ = sqlx::query("UPDATE emails SET thread_id = ? WHERE id = ?")
                        .bind(parent_thread_id)
                        .bind(id)
                        .execute(&*pool)
                        .await
                        .map_err(|e| e.to_string());
                    break;
                }
            }
        }

        let _ = sqlx::query(
            "UPDATE emails 
             SET thread_id = (
                SELECT MIN(e2.message_id) 
                FROM emails e2 
                WHERE e2.account_id = emails.account_id 
                  AND e2.sender_address = emails.sender_address 
                  AND COALESCE(e2.recipient_to, '') = COALESCE(emails.recipient_to, '')
                  AND e2.normalized_subject = emails.normalized_subject
                  AND e2.normalized_subject IS NOT NULL 
                  AND e2.normalized_subject != ''
             )
             WHERE thread_id = message_id 
               AND normalized_subject IS NOT NULL 
               AND normalized_subject != ''
               AND id IN (SELECT id FROM emails WHERE thread_id = message_id LIMIT ?)",
        )
        .bind(limit)
        .execute(&*pool)
        .await;

        Ok(())
    }
}

#[tauri::command]
pub async fn summarize_visible_emails<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    email_ids: Vec<i64>,
) -> Result<(), String> {
    SyncWorker::summarize_visible_emails(&app_handle, email_ids).await
}
