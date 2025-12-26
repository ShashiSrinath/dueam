use std::collections::HashMap;
use std::time::Duration;
use tauri::{Manager, Emitter};
use log::{info, error};
use sqlx::SqlitePool;
use tokio::time::sleep;

use crate::email_backend::sync::SyncEngine;
use email::envelope::Id;
use email::message::get::GetMessages;

pub struct SyncWorker<R: tauri::Runtime> {
    app_handle: tauri::AppHandle<R>,
    pool: SqlitePool,
}

impl<R: tauri::Runtime> SyncWorker<R> {
    pub fn new(app_handle: tauri::AppHandle<R>) -> Self {
        let pool = app_handle.state::<SqlitePool>().inner().clone();
        Self { app_handle, pool }
    }

    pub async fn start(&self) {
        info!("Starting Sync Worker...");

        let app_handle = self.app_handle.clone();
        tokio::spawn(async move {
            loop {
                // Indexing
                if let Err(e) = Self::index_pending_emails(&app_handle).await {
                    error!("Error during background indexing: {}", e);
                }
                sleep(Duration::from_secs(10)).await;

                // Thread Resolution
                let app_handle_threading = app_handle.clone();
                tokio::spawn(async move {
                    let pool = app_handle_threading.state::<SqlitePool>();
                    let backlog_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM emails WHERE thread_id = message_id AND normalized_subject IS NOT NULL AND normalized_subject != ''")
                        .fetch_one(&*pool)
                        .await
                        .unwrap_or(0);

                    let sleep_time = if backlog_count > 1000 { 5 } else { 30 };
                    let batch_size = if backlog_count > 1000 { 2000 } else { 100 };

                    if let Err(e) = Self::resolve_threads(&app_handle_threading, batch_size).await {
                        error!("Error during background threading: {}", e);
                    }
                    sleep(Duration::from_secs(sleep_time)).await;
                });

                // Proactive Enrichment
                let app_handle_enrichment = app_handle.clone();
                tokio::spawn(async move {
                    if let Err(e) = crate::email_backend::enrichment::commands::proactive_enrichment(&app_handle_enrichment).await {
                        error!("Error during background enrichment: {}", e);
                    }
                    sleep(Duration::from_secs(120)).await;
                });

                // Proactive Summarization
                let app_handle_summarization = app_handle.clone();
                tokio::spawn(async move {
                    if let Err(e) = Self::proactive_summarization(&app_handle_summarization).await {
                        error!("Error during background summarization: {}", e);
                    }
                    sleep(Duration::from_secs(120)).await;
                });
            }
        });
    }

    async fn proactive_summarization(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();

        // Check if enabled
        let ai_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiEnabled'")
            .fetch_one(&*pool)
            .await
            .unwrap_or(("false".to_string(),));
        
        let ai_summarization_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiSummarizationEnabled'")
            .fetch_one(&*pool)
            .await
            .unwrap_or(("false".to_string(),));

        if ai_enabled.0 != "true" || ai_summarization_enabled.0 != "true" {
            return Ok(());
        }

        // Find emails that:
        // 1. Have no summary
        // 2. Have body_text
        // 3. Are NOT in spam or trash
        // 4. Are newer than account_creation - 14 days
        let pending_summaries: Vec<(i64, String)> = sqlx::query_as(
            "SELECT e.id, e.body_text
             FROM emails e
             JOIN accounts a ON e.account_id = a.id
             JOIN folders f ON e.folder_id = f.id
             WHERE e.summary IS NULL 
               AND e.body_text IS NOT NULL
               AND f.role != 'spam'
               AND f.role != 'trash'
               AND datetime(e.date) > datetime(a.created_at, '-14 days')
             ORDER BY e.date DESC
             LIMIT 10" // Process in small batches
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if pending_summaries.is_empty() {
            return Ok(());
        }

        info!("Proactively summarizing {} emails", pending_summaries.len());

        let mut updated = false;
        for (id, body_text) in pending_summaries {
            match crate::email_backend::llm::summarization::summarize_email_with_ai(app_handle, id, &body_text).await {
                Ok(summary) => {
                    let _ = sqlx::query("UPDATE emails SET summary = ? WHERE id = ?")
                        .bind(summary)
                        .bind(id)
                        .execute(&*pool)
                        .await;
                    updated = true;
                }
                Err(e) => {
                    error!("Failed to summarize email {}: {}", id, e);
                }
            }
            // Polite delay
            sleep(Duration::from_millis(500)).await;
        }

        if updated {
            let _ = app_handle.emit("emails-updated", ());
        }

        Ok(())
    }

    async fn index_pending_emails(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        
        let pending_emails: Vec<(i64, i64, String, String)> = sqlx::query_as(
            "SELECT e.id, e.account_id, e.remote_id, f.path 
             FROM emails e 
             JOIN folders f ON e.folder_id = f.id 
             WHERE e.body_text IS NULL AND f.role != 'trash' AND f.role != 'spam'\n             ORDER BY e.date DESC LIMIT 20"
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        if pending_emails.is_empty() {
            return Ok(());
        }

        info!("Background indexing {} emails...", pending_emails.len());

        let mut by_account: HashMap<i64, Vec<(i64, String, String)>> = HashMap::new();
        for (id, account_id, remote_id, folder_path) in pending_emails {
            by_account.entry(account_id).or_default().push((id, remote_id, folder_path));
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
                            if let Ok(parsed) = message.parsed() {
                                let parsed: &mail_parser::Message = parsed;
                                let body_text: Option<String> = parsed.body_text(0).map(|b| b.to_string());
                                let body_html: Option<String> = parsed.body_html(0).map(|b| b.to_string());
                                let snippet = body_text.as_ref().map(|t: &String| {
                                    let s = t.chars().take(200).collect::<String>();
                                    s.replace('\n', " ").replace('\r', "")
                                });

                                let _ = sqlx::query("UPDATE emails SET body_text = ?, body_html = ?, snippet = ? WHERE id = ?")
                                    .bind(body_text)
                                    .bind(body_html)
                                    .bind(snippet)
                                    .bind(email_id)
                                    .execute(&*pool)
                                    .await
                                    .map_err(|e| e.to_string());
                            }
                        }
                    }
                    Err(e) => {
                        error!("Failed to fetch message uid {} for indexing: {}", remote_id, e);
                    }
                }
                sleep(Duration::from_millis(100)).await;
            }
        }

        Ok(())
    }

    async fn resolve_threads(app_handle: &tauri::AppHandle<R>, limit: i64) -> Result<(), String> {
        let pool = app_handle.state::<SqlitePool>();
        
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
               AND id IN (SELECT id FROM emails WHERE thread_id = message_id LIMIT ?)"
        )
        .bind(limit)
        .execute(&*pool)
        .await;
        
        Ok(())
    }
}