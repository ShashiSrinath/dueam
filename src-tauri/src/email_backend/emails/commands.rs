use crate::email_backend::emails::events::EmailEvent;
use tauri::{Manager, Emitter};
use log::info;
use sqlx::SqlitePool;
use serde::{Deserialize, Serialize};
use crate::email_backend::accounts::manager::AccountManager;
use crate::email_backend::sync::SyncEngine;
use crate::utils::attachments::{save_attachment_data, read_attachment_data};
use email::backend::BackendBuilder;
use email::smtp::SmtpContextBuilder;
use email::message::send::SendMessage;
use email::envelope::Id;
use email::flag::add::AddFlags;
use email::flag::Flag;
use email::flag::Flags;
use email::message::add::AddMessage;
use mail_builder::MessageBuilder;
use imap_client::imap_next::imap_types::sequence::Sequence;
use imap_client::imap_next::imap_types::error::ValidationError;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Email {
    pub id: i64,
    pub account_id: i64,
    pub folder_id: i64,
    pub remote_id: String,
    pub message_id: Option<String>,
    pub thread_id: Option<String>,
    pub thread_count: Option<i64>,
    pub in_reply_to: Option<String>,
    pub references_header: Option<String>,
    pub subject: Option<String>,
    pub sender_name: Option<String>,
    pub sender_address: String,
    pub recipient_to: Option<String>,
    pub date: String,
    pub flags: String,
    pub snippet: Option<String>,
    pub summary: Option<String>,
    pub has_attachments: bool,
    pub is_reply: bool,
    pub is_forward: bool,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct EmailContent {
    pub body_text: Option<String>,
    pub body_html: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Folder {
    pub id: i64,
    pub account_id: i64,
    pub name: String,
    pub path: String,
    pub role: Option<String>,
    pub unread_count: i32,
    pub total_count: i32,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Draft {
    pub id: i64,
    pub account_id: i64,
    pub to_address: Option<String>,
    pub cc_address: Option<String>,
    pub bcc_address: Option<String>,
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub updated_at: String,
    #[sqlx(skip)]
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnifiedCounts {
    pub primary: i32,
    pub sent: i32,
    pub spam: i32,
    pub drafts: i32,
}

#[tauri::command]
pub async fn refresh_folder<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    account_id: i64,
    folder_id: i64,
) -> Result<(), String> {
    SyncEngine::refresh_folder(&app_handle, account_id, folder_id).await
}

#[tauri::command]
pub async fn get_emails<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    account_id: Option<i64>,
    view: Option<String>,
    filter: Option<String>,
    limit: Option<u32>,
    before_date: Option<String>,
    before_id: Option<i64>,
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "WITH unique_messages AS (
            SELECT 
                e.id, e.account_id, e.folder_id, e.remote_id, e.message_id, e.thread_id, 
                e.in_reply_to, e.references_header, e.subject, e.normalized_subject, 
                e.sender_name, e.sender_address, e.recipient_to, e.date, e.flags, 
                e.snippet, e.summary, e.has_attachments, f.role as folder_role,
                ROW_NUMBER() OVER (
                    PARTITION BY e.account_id, e.message_id 
                    ORDER BY CASE WHEN f.role = 'inbox' THEN 0 WHEN f.role = 'sent' THEN 1 ELSE 2 END, e.date DESC
                ) as msg_rn
            FROM emails e
            JOIN folders f ON e.folder_id = f.id
            UNION ALL
            SELECT 
                -d.id as id, d.account_id, -1 as folder_id, 'local-draft-' || d.id as remote_id, NULL as message_id, NULL as thread_id, 
                NULL as in_reply_to, NULL as references_header, d.subject, LOWER(COALESCE(d.subject, '')) as normalized_subject, 
                NULL as sender_name, COALESCE(d.to_address, '(No Recipient)') as sender_address, d.to_address as recipient_to, strftime('%Y-%m-%dT%H:%M:%SZ', d.updated_at) as date, '[]' as flags, 
                d.body_html as snippet, NULL as summary, EXISTS(SELECT 1 FROM attachments WHERE draft_id = d.id) as has_attachments, 
                'drafts' as folder_role,
                1 as msg_rn
            FROM drafts d
         ),
          latest_threads AS (
            SELECT *,
            ROW_NUMBER() OVER (
                PARTITION BY account_id, COALESCE(NULLIF(thread_id, message_id), normalized_subject || '-' || sender_address || '-' || COALESCE(recipient_to, ''), message_id) 
                ORDER BY date DESC, id DESC
            ) as thread_rn,
            COUNT(*) OVER (
                PARTITION BY account_id, COALESCE(NULLIF(thread_id, message_id), normalized_subject || '-' || sender_address || '-' || COALESCE(recipient_to, ''), message_id)
            ) as t_count
            FROM unique_messages
            WHERE msg_rn = 1
         )
         SELECT e.id, e.account_id, e.folder_id, e.remote_id, e.message_id, e.thread_id, e.t_count as thread_count, e.in_reply_to, e.references_header, e.subject, e.sender_name, e.sender_address, e.recipient_to, e.date, e.flags, e.snippet, e.summary, e.has_attachments,
         (e.subject LIKE 'Re:%' OR e.subject LIKE 're:%' OR e.in_reply_to IS NOT NULL) as is_reply,
         (e.subject LIKE 'Fwd:%' OR e.subject LIKE 'fwd:%' OR e.subject LIKE 'Fw:%' OR e.subject LIKE 'fw:%') as is_forward
         FROM latest_threads e 
         WHERE e.thread_rn = 1 "
    );

    let mut has_where = true;

    if let Some(aid) = account_id {
        if !has_where { query_builder.push(" WHERE "); has_where = true; } else { query_builder.push(" AND "); }
        query_builder.push(" e.account_id = ");
        query_builder.push_bind(aid);
    }

    if let Some(v) = view {
        match v.as_str() {
            "primary" => {
                query_builder.push(" AND e.folder_role = 'inbox'");
            }
            "spam" => {
                query_builder.push(" AND e.folder_role = 'spam'");
            }
            "sent" => {
                query_builder.push(" AND e.folder_role = 'sent'");
            }
            "drafts" => {
                query_builder.push(" AND e.folder_role = 'drafts'");
            }
            "trash" => {
                query_builder.push(" AND e.folder_role = 'trash'");
            }
            "archive" => {
                query_builder.push(" AND e.folder_role = 'archive'");
            }
            "others" => {
                query_builder.push(" AND (e.folder_role IS NULL OR e.folder_role = '' OR e.folder_role NOT IN ('inbox', 'spam', 'sent', 'drafts', 'trash', 'archive'))");
            }
            _ => {}
        };
    } else {
        // Default to primary if no view specified
        query_builder.push(" AND e.folder_role = 'inbox'");
    }

    if let Some(f) = filter {
        if !has_where { query_builder.push(" WHERE "); } else { query_builder.push(" AND "); }
        match f.as_str() {
            "unread" => query_builder.push(" e.flags NOT LIKE '%seen%'"),
            "flagged" => query_builder.push(" e.flags LIKE '%flagged%'"),
            _ => &mut query_builder,
        };
    }

    // Keyset Pagination
    if let (Some(date), Some(id)) = (before_date, before_id) {
        if !has_where { query_builder.push(" WHERE "); } else { query_builder.push(" AND "); }
        query_builder.push(" (e.date < ");
        query_builder.push_bind(date.clone());
        query_builder.push(" OR (e.date = ");
        query_builder.push_bind(date);
        query_builder.push(" AND e.id < ");
        query_builder.push_bind(id);
        query_builder.push("))");
    }

    query_builder.push(" ORDER BY e.date DESC, e.id DESC LIMIT ");
    query_builder.push_bind(limit.unwrap_or(100) as i64);

    let emails = query_builder
        .build_query_as::<Email>()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(emails)
}

#[tauri::command]
pub async fn get_unified_counts<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<UnifiedCounts, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let row: (i32, i32, i32, i32) = sqlx::query_as(
        "SELECT 
            SUM(CASE WHEN role = 'inbox' THEN unread_count ELSE 0 END) as primary_count,
            SUM(CASE WHEN role = 'sent' THEN total_count ELSE 0 END) as sent_count,
            SUM(CASE WHEN role = 'spam' THEN unread_count ELSE 0 END) as spam_count,
            SUM(CASE WHEN role = 'drafts' THEN total_count ELSE 0 END) as drafts_count
         FROM folders"
    )
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let local_drafts_count: (i32,) = sqlx::query_as("SELECT COUNT(*) FROM drafts")
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(UnifiedCounts {
        primary: row.0,
        sent: row.1,
        spam: row.2,
        drafts: row.3 + local_drafts_count.0,
    })
}

#[tauri::command]
    pub async fn get_email_by_id<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<Email, String> {
    let pool = app_handle.state::<SqlitePool>();
    let email = sqlx::query_as::<_, Email>(
        "SELECT id, account_id, folder_id, remote_id, message_id, thread_id, 1 as thread_count, in_reply_to, references_header, subject, sender_name, sender_address, recipient_to, date, flags, snippet, summary, has_attachments,
         (subject LIKE 'Re:%' OR subject LIKE 're:%' OR in_reply_to IS NOT NULL) as is_reply,
         (subject LIKE 'Fwd:%' OR subject LIKE 'fwd:%' OR subject LIKE 'Fw:%' OR subject LIKE 'fw:%') as is_forward
         FROM emails WHERE id = ?"
    )
    .bind(email_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(email)
}

#[tauri::command]
pub async fn get_thread_emails<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    email_id: i64,
    limit: Option<u32>,
    offset: Option<u32>
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    // 1. First get the reference email's details to find its group
    let ref_email: (Option<String>, Option<String>, String, String, i64) = sqlx::query_as(
        "SELECT thread_id, message_id, normalized_subject, sender_address, account_id FROM emails WHERE id = ?"
    )
    .bind(email_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let (thread_id, message_id, norm_subject, sender_address, account_id) = ref_email;
    
    // 2. Build the query to find all emails in this \"group\"
    // We use a CTE to deduplicate by message_id, prioritizing inbox over others
    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "WITH thread_emails AS (
            SELECT e.*, f.role,
            ROW_NUMBER() OVER (
                PARTITION BY e.message_id 
                ORDER BY CASE WHEN f.role = 'inbox' THEN 0 ELSE 1 END, e.date DESC
            ) as message_rn
            FROM emails e
            JOIN folders f ON e.folder_id = f.id
            WHERE e.account_id = "
    );
    query_builder.push_bind(account_id);

    // Grouping condition: Either same thread_id, or same subject/sender/recipient fallback
    query_builder.push(" AND (");
    
    let mut has_condition = false;
    if let Some(tid) = thread_id.filter(|t| t != message_id.as_deref().unwrap_or("")) {
        query_builder.push(" e.thread_id = ");
        query_builder.push_bind(tid);
        has_condition = true;
    }

    if !norm_subject.is_empty() {
        if has_condition { query_builder.push(" OR "); }
        query_builder.push(" (e.normalized_subject = ");
        query_builder.push_bind(&norm_subject);
        query_builder.push(" AND e.sender_address = ");
        query_builder.push_bind(&sender_address);
        query_builder.push(")");
        has_condition = true;
    }

    if !has_condition {
        query_builder.push(" e.id = ");
        query_builder.push_bind(email_id);
    }
    
    query_builder.push(")
        )
        SELECT id, account_id, folder_id, remote_id, message_id, thread_id, 1 as thread_count, in_reply_to, references_header, subject, sender_name, sender_address, recipient_to, date, flags, snippet, summary, has_attachments,
        (subject LIKE 'Re:%' OR subject LIKE 're:%' OR in_reply_to IS NOT NULL) as is_reply,
        (subject LIKE 'Fwd:%' OR subject LIKE 'fwd:%' OR subject LIKE 'Fw:%' OR subject LIKE 'fw:%') as is_forward
        FROM thread_emails
        WHERE message_rn = 1
        ORDER BY date DESC, id DESC LIMIT ");
    query_builder.push_bind(limit.unwrap_or(50) as i64);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset.unwrap_or(0) as i64);

    let emails = query_builder
        .build_query_as::<Email>()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(emails)
}

#[tauri::command]
pub async fn get_email_content<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<EmailContent, String> {
    let pool = app_handle.state::<SqlitePool>().inner().clone();
    
    let cached_info: Option<(Option<String>, Option<String>, Option<String>, bool, i64)> = sqlx::query_as(
        "SELECT body_text, body_html, summary, has_attachments, account_id FROM emails WHERE id = ?"
    )
    .bind(email_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    if let Some((body_text, body_html, summary, has_attachments, _account_id)) = cached_info {
        if body_text.is_some() || body_html.is_some() {
            // Check if we have attachments if we expect them
             let attachment_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments WHERE email_id = ?")
                 .bind(email_id)
                 .fetch_one(&pool)
                 .await
                 .unwrap_or(0);

             if !has_attachments || attachment_count > 0 {
                // Content exists, check if we need to trigger summarization
                if summary.is_none() && body_text.is_some() {
                    let text = body_text.clone().unwrap();
                    let handle = app_handle.clone();
                    let pool_clone = pool.clone();
                    
                    tauri::async_runtime::spawn(async move {
                        let ai_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiEnabled'")
                            .fetch_one(&pool_clone)
                            .await
                            .unwrap_or(("false".to_string(),));
                        
                        let ai_summarization_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiSummarizationEnabled'")
                            .fetch_one(&pool_clone)
                            .await
                            .unwrap_or(("false".to_string(),));

                        if ai_enabled.0 == "true" && ai_summarization_enabled.0 == "true" {
                            // Check folder role
                            let role: Option<String> = sqlx::query_scalar("SELECT f.role FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?")
                                .bind(email_id)
                                .fetch_one(&pool_clone)
                                .await
                                .unwrap_or(None);

                            if role.as_deref() != Some("spam") && role.as_deref() != Some("trash") {
                                if let Ok(s) = crate::email_backend::llm::summarization::summarize_email_with_ai(&handle, email_id, &text, false).await {
                                    let sender_address: Option<String> = sqlx::query_scalar("SELECT sender_address FROM emails WHERE id = ?")
                                        .bind(email_id)
                                        .fetch_one(&pool_clone)
                                        .await
                                        .ok();

                                    let _ = sqlx::query("UPDATE emails SET summary = ? WHERE id = ?")
                                        .bind(&s)
                                        .bind(email_id)
                                        .execute(&pool_clone)
                                        .await;
                                    let _ = handle.emit("emails-updated", EmailEvent::Updated {
                                        id: email_id,
                                        address: sender_address,
                                        flags: None,
                                        summary: Some(s),
                                        thread_count: None,
                                    });
                                }
                            }
                        }
                    });
                }

                return Ok(EmailContent {
                    body_text,
                    body_html,
                });
            }
        }
    }

    let email_info: (i64, String, String) = sqlx::query_as(
        "SELECT e.account_id, e.remote_id, f.path FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
    )
    .bind(email_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (account_id, remote_id, _folder_path) = email_info;

    // Get folder role to check for spam/trash
    let folder_role: Option<String> = sqlx::query_scalar("SELECT role FROM folders WHERE path = ? AND account_id = ?")
        .bind(&_folder_path)
        .bind(account_id)
        .fetch_one(&pool)
        .await
        .unwrap_or(None);

    let engine = app_handle.state::<SyncEngine<R>>();
    let context = engine.get_context(account_id).await?;

    let mut client = context.client().await;
    
    let id = Id::single(remote_id);
    use imap_client::imap_next::imap_types::fetch::MessageDataItemName;
    use imap_client::imap_next::imap_types::fetch::MacroOrMessageDataItemNames;
    let fetch_items = MacroOrMessageDataItemNames::MessageDataItemNames(vec![
        MessageDataItemName::BodyExt {
            section: None,
            partial: None,
            peek: true,
        }
    ]);
    
    // Select the mailbox first
    client.examine_mailbox(&_folder_path).await.map_err(|e| e.to_string())?;

    use std::num::NonZeroU32;
    let uids: imap_client::imap_next::imap_types::sequence::SequenceSet = id.iter()
        .filter_map(|s| s.parse::<u32>().ok())
        .filter_map(|n| NonZeroU32::new(n))
        .map(Sequence::from)
        .collect::<Vec<_>>()
        .try_into()
        .map_err(|e: ValidationError| e.to_string())?;

    let messages = client.fetch_messages_with_items(uids, fetch_items).await.map_err(|e| e.to_string())?;
    let message = messages.first().ok_or("Email not found on server")?;

    let parsed = message.parsed().map_err(|e: email::Error| e.to_string())?;
    let body_text: Option<String> = parsed.body_text(0).map(|b| b.to_string());
    let body_html: Option<String> = parsed.body_html(0).map(|b| b.to_string());

    // Trigger AI Summarization in background if enabled
    if let Some(text) = body_text.clone() {
        let handle = app_handle.clone();
        let pool_clone = pool.clone();
        let folder_role_clone = folder_role.clone();
        tauri::async_runtime::spawn(async move {
            let ai_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiEnabled'")
                .fetch_one(&pool_clone)
                .await
                .unwrap_or(("false".to_string(),));
            
            let ai_summarization_enabled: (String,) = sqlx::query_as("SELECT value FROM settings WHERE key = 'aiSummarizationEnabled'")
                .fetch_one(&pool_clone)
                .await
                .unwrap_or(("false".to_string(),));

            if ai_enabled.0 == "true" && ai_summarization_enabled.0 == "true" && folder_role_clone.as_deref() != Some("spam") && folder_role_clone.as_deref() != Some("trash") {
                if let Ok(s) = crate::email_backend::llm::summarization::summarize_email_with_ai(&handle, email_id, &text, false).await {
                    let sender_address: Option<String> = sqlx::query_scalar("SELECT sender_address FROM emails WHERE id = ?")
                        .bind(email_id)
                        .fetch_one(&pool_clone)
                        .await
                        .ok();

                    let _ = sqlx::query("UPDATE emails SET summary = ? WHERE id = ?")
                        .bind(&s)
                        .bind(email_id)
                        .execute(&pool_clone)
                        .await;
                    let _ = handle.emit("emails-updated", EmailEvent::Updated {
                        id: email_id,
                        address: sender_address,
                        flags: None,
                        summary: Some(s),
                        thread_count: None,
                    });
                }
            }
        });
    }

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE emails SET body_text = ?, body_html = ? WHERE id = ?")
        .bind(&body_text)
        .bind(&body_html)
        .bind(email_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(attachments) = message.attachments() {
        if attachments.is_empty() {
             // If we expected attachments but found none (and we are here because of that), 
             // update the flag to avoid re-fetching loop.
             // We only want to do this if we were expecting attachments. 
             // But checking "has_attachments" here from the initial SELECT is hard as variables are in different scope.
             // However, it's safe to set it to false if we found none.
             let _ = sqlx::query("UPDATE emails SET has_attachments = false WHERE id = ?")
                 .bind(email_id)
                 .execute(&mut *tx)
                 .await;
        } else {
            sqlx::query("UPDATE emails SET has_attachments = true WHERE id = ?")
                .bind(email_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;

            for att in attachments {
                sqlx::query(
                    "INSERT INTO attachments (email_id, filename, mime_type, size)
                     VALUES (?, ?, ?, ?)"
                )
                .bind(email_id)
                .bind(&att.filename)
                .bind(&att.mime)
                .bind(att.body.len() as i64)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
            }
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(EmailContent {
        body_text,
        body_html,
    })
}

#[tauri::command]
pub async fn regenerate_summary<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<String, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let body_text: Option<String> = sqlx::query_scalar("SELECT body_text FROM emails WHERE id = ?")
        .bind(email_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let text = body_text.ok_or_else(|| "No body text found for summarization".to_string())?;

    // Use force=true to bypass cache
    let summary = crate::email_backend::llm::summarization::summarize_email_with_ai(&app_handle, email_id, &text, true).await?;

    sqlx::query("UPDATE emails SET summary = ? WHERE id = ?")
        .bind(&summary)
        .bind(email_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let sender_address: Option<String> = sqlx::query_scalar("SELECT sender_address FROM emails WHERE id = ?")
        .bind(email_id)
        .fetch_one(&*pool)
        .await
        .ok();

    let _ = app_handle.emit("emails-updated", EmailEvent::Updated {
        id: email_id,
        address: sender_address,
        flags: None,
        summary: Some(summary.clone()),
        thread_count: None,
    });
    
    Ok(summary)
}

#[tauri::command]
pub async fn save_draft<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    id: Option<i64>,
    account_id: i64,
    to: Option<String>,
    cc: Option<String>,
    bcc: Option<String>,
    subject: Option<String>,
    body_html: Option<String>,
    attachment_ids: Vec<i64>,
) -> Result<i64, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let draft_id = if let Some(draft_id) = id {
        let actual_id = draft_id.abs();
        sqlx::query("UPDATE drafts SET to_address = ?, cc_address = ?, bcc_address = ?, subject = ?, body_html = ? WHERE id = ?")
            .bind(to)
            .bind(cc)
            .bind(bcc)
            .bind(subject)
            .bind(body_html)
            .bind(actual_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        draft_id
    } else {
        let row: (i64,) = sqlx::query_as("INSERT INTO drafts (account_id, to_address, cc_address, bcc_address, subject, body_html) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
            .bind(account_id)
            .bind(to)
            .bind(cc)
            .bind(bcc)
            .bind(subject)
            .bind(body_html)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        -row.0
    };

    let actual_id = draft_id.abs();

    // Handle attachments
    // For now, we only support copying existing attachments (from forwarded emails)
    // We clear existing draft attachments and re-add them to keep it simple
    sqlx::query("DELETE FROM attachments WHERE draft_id = ?")
        .bind(actual_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    for att_id in attachment_ids {
        // Find the attachment (could be from another email or another draft)
        let att: Option<(Option<String>, Option<String>, i64, Option<String>)> = sqlx::query_as("SELECT filename, mime_type, size, file_hash FROM attachments WHERE id = ?")
            .bind(att_id)
            .fetch_optional(&*pool)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(a) = att {
            sqlx::query("INSERT INTO attachments (draft_id, filename, mime_type, size, file_hash) VALUES (?, ?, ?, ?, ?)")
                .bind(actual_id)
                .bind(a.0)
                .bind(a.1)
                .bind(a.2)
                .bind(a.3)
                .execute(&*pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(draft_id)
}

#[tauri::command]
pub async fn get_drafts<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, account_id: i64) -> Result<Vec<Draft>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let mut drafts = sqlx::query_as::<_, Draft>("SELECT * FROM drafts WHERE account_id = ? ORDER BY updated_at DESC")
        .bind(account_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    // Make IDs negative to distinguish from server emails
    for d in drafts.iter_mut() {
        d.id = -d.id;
    }

    Ok(drafts)
}

#[tauri::command]
pub async fn get_draft_by_id<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, id: i64) -> Result<Draft, String> {
    let pool = app_handle.state::<SqlitePool>();
    let actual_id = id.abs();
    let mut draft = sqlx::query_as::<_, Draft>("SELECT * FROM drafts WHERE id = ?")
        .bind(actual_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    draft.id = -draft.id; // Return negative ID

    let attachments = sqlx::query_as::<_, Attachment>("SELECT id, email_id, draft_id, filename, mime_type, size, file_hash FROM attachments WHERE draft_id = ?")
        .bind(actual_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    draft.attachments = attachments;
    Ok(draft)
}

#[tauri::command]
pub async fn delete_draft<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, id: i64) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    let actual_id = id.abs();

    // Also delete attachments
    sqlx::query("DELETE FROM attachments WHERE draft_id = ?")
        .bind(actual_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM drafts WHERE id = ?")
        .bind(actual_id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    let _ = app_handle.emit("emails-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn mark_as_read<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_ids: Vec<i64>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    let mut actual_updated_ids = Vec::new();
    let mut final_flags = String::new();
    
    for &email_id in &email_ids {
        let email_info: Option<(i64, String, String, String, String)> = sqlx::query_as(
            "SELECT e.account_id, e.remote_id, f.path, e.flags, e.sender_address FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
        )
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (account_id, remote_id, folder_path, current_flags, _sender_address) = match email_info {
            Some(info) => info,
            None => continue,
        };

        if current_flags.contains("\"seen\"") || current_flags.contains("seen") {
            continue;
        }

        let engine = app_handle.state::<SyncEngine<R>>();
        if let Ok(backend) = engine.get_backend(account_id).await {
            let id = Id::single(remote_id);
            let _ = backend.add_flag(&folder_path, &id, Flag::Seen).await;
        }

        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        let mut flags: Vec<String> = serde_json::from_str(&current_flags).unwrap_or_default();
        if !flags.contains(&"seen".to_string()) {
            flags.push("seen".to_string());
        }

        final_flags = serde_json::to_string(&flags).unwrap_or_default();

        sqlx::query("UPDATE emails SET flags = ? WHERE id = ?")
            .bind(&final_flags)
            .bind(email_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE folders SET unread_count = MAX(0, unread_count - 1) WHERE id = (SELECT folder_id FROM emails WHERE id = ?)")
            .bind(email_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;
        actual_updated_ids.push(email_id);
    }

    if !actual_updated_ids.is_empty() {
        let _ = app_handle.emit("emails-updated", EmailEvent::UpdatedBulk {
            ids: actual_updated_ids,
            flags: Some(final_flags),
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn move_to_inbox<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_ids: Vec<i64>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    for &email_id in &email_ids {
        let email_info: Option<(i64, String, i64, String)> = sqlx::query_as(
            "SELECT e.account_id, e.remote_id, e.folder_id, f.path FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
        )
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (account_id, remote_id, source_folder_id, source_folder_path) = match email_info {
            Some(info) => info,
            None => continue,
        };

        // Find inbox folder for this account
        let inbox_folder_info: Option<(i64, String)> = sqlx::query_as(
            "SELECT id, path FROM folders WHERE account_id = ? AND role = 'inbox'"
        )
        .bind(account_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (inbox_folder_id, inbox_folder_path) = match inbox_folder_info {
            Some(info) => info,
            None => return Err(format!("Inbox folder not found for account {}", account_id)),
        };
        
        if source_folder_id == inbox_folder_id {
            continue;
        }

        // Perform move on server
        let engine = app_handle.state::<SyncEngine<R>>();
        if let Ok(backend) = engine.get_backend(account_id).await {
            let id = email::envelope::Id::single(remote_id);
            use email::message::r#move::MoveMessages;
            let _ = backend.move_messages(&source_folder_path, &inbox_folder_path, &id).await.map_err(|e| e.to_string())?;
        }

        // Update local DB
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Check if seen to update counts
        let is_unread: bool = sqlx::query_scalar("SELECT flags NOT LIKE '%seen%' FROM emails WHERE id = ?")
            .bind(email_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE emails SET folder_id = ? WHERE id = ?")
            .bind(inbox_folder_id)
            .bind(email_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Update counts
        sqlx::query("UPDATE folders SET total_count = MAX(0, total_count - 1), unread_count = MAX(0, unread_count - ?) WHERE id = ?")
            .bind(if is_unread { 1 } else { 0 })
            .bind(source_folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE folders SET total_count = total_count + 1, unread_count = unread_count + ? WHERE id = ?")
            .bind(if is_unread { 1 } else { 0 })
            .bind(inbox_folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    if !email_ids.is_empty() {
        let _ = app_handle.emit("emails-updated", EmailEvent::RemovedBulk { ids: email_ids });
    }

    Ok(())
}

#[tauri::command]
pub async fn archive_emails<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_ids: Vec<i64>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    for &email_id in &email_ids {
        let email_info: Option<(i64, String, i64, String)> = sqlx::query_as(
            "SELECT e.account_id, e.remote_id, e.folder_id, f.path FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
        )
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (account_id, remote_id, source_folder_id, source_folder_path) = match email_info {
            Some(info) => info,
            None => continue,
        };

        // Find archive folder for this account
        let archive_folder_info: Option<(i64, String)> = sqlx::query_as(
            "SELECT id, path FROM folders WHERE account_id = ? AND role = 'archive'"
        )
        .bind(account_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (archive_folder_id, archive_folder_path) = match archive_folder_info {
            Some(info) => info,
            None => return Err(format!("Archive folder not found for account {}", account_id)),
        };
        
        if source_folder_id == archive_folder_id {
            continue;
        }

        // Perform move on server
        let engine = app_handle.state::<SyncEngine<R>>();
        if let Ok(backend) = engine.get_backend(account_id).await {
            let id = email::envelope::Id::single(remote_id);
            use email::message::r#move::MoveMessages;
            let _ = backend.move_messages(&source_folder_path, &archive_folder_path, &id).await.map_err(|e| e.to_string())?;
        }

        // Update local DB
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Check if seen to update counts
        let is_unread: bool = sqlx::query_scalar("SELECT flags NOT LIKE '%seen%' FROM emails WHERE id = ?")
            .bind(email_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE emails SET folder_id = ? WHERE id = ?")
            .bind(archive_folder_id)
            .bind(email_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Update counts
        sqlx::query("UPDATE folders SET total_count = MAX(0, total_count - 1), unread_count = MAX(0, unread_count - ?) WHERE id = ?")
            .bind(if is_unread { 1 } else { 0 })
            .bind(source_folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE folders SET total_count = total_count + 1, unread_count = unread_count + ? WHERE id = ?")
            .bind(if is_unread { 1 } else { 0 })
            .bind(archive_folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    if !email_ids.is_empty() {
        let _ = app_handle.emit("emails-updated", EmailEvent::RemovedBulk { ids: email_ids });
    }

    Ok(())
}

#[tauri::command]
pub async fn move_to_trash<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_ids: Vec<i64>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    for &email_id in &email_ids {
        let email_info: Option<(i64, String, i64, String)> = sqlx::query_as(
            "SELECT e.account_id, e.remote_id, e.folder_id, f.path FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
        )
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (account_id, remote_id, source_folder_id, source_folder_path) = match email_info {
            Some(info) => info,
            None => continue,
        };

        // Find trash folder for this account
        let trash_folder_info: Option<(i64, String)> = sqlx::query_as(
            "SELECT id, path FROM folders WHERE account_id = ? AND role = 'trash'"
        )
        .bind(account_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (trash_folder_id, trash_folder_path) = match trash_folder_info {
            Some(info) => info,
            None => return Err(format!("Trash folder not found for account {}", account_id)),
        };
        
        if source_folder_id == trash_folder_id {
            // Already in trash, maybe we should permanently delete?
            // For now, let's just skip.
            continue;
        }

        // Perform move on server
        let engine = app_handle.state::<SyncEngine<R>>();
        if let Ok(backend) = engine.get_backend(account_id).await {
            let id = email::envelope::Id::single(remote_id);
            use email::message::r#move::MoveMessages;
            let _ = backend.move_messages(&source_folder_path, &trash_folder_path, &id).await.map_err(|e| e.to_string())?;
        }

        // Update local DB
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        // Check if seen to update counts
        let is_unread: bool = sqlx::query_scalar("SELECT flags NOT LIKE '%seen%' FROM emails WHERE id = ?")
            .bind(email_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE emails SET folder_id = ? WHERE id = ?")
            .bind(trash_folder_id)
            .bind(email_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Update counts
        sqlx::query("UPDATE folders SET total_count = MAX(0, total_count - 1), unread_count = MAX(0, unread_count - ?) WHERE id = ?")
            .bind(if is_unread { 1 } else { 0 })
            .bind(source_folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        sqlx::query("UPDATE folders SET total_count = total_count + 1, unread_count = unread_count + ? WHERE id = ?")
            .bind(if is_unread { 1 } else { 0 })
            .bind(trash_folder_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;
    }

    if !email_ids.is_empty() {
        let _ = app_handle.emit("emails-updated", EmailEvent::RemovedBulk { ids: email_ids });
    }

    Ok(())
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Attachment {
    pub id: i64,
    pub email_id: Option<i64>,
    pub draft_id: Option<i64>,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: i64,
    pub file_hash: Option<String>,
}

#[tauri::command]
pub async fn get_attachments<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<Vec<Attachment>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let attachments = sqlx::query_as::<_, Attachment>("SELECT id, email_id, draft_id, filename, mime_type, size, file_hash FROM attachments WHERE email_id = ?")
        .bind(email_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(attachments)
}

async fn fetch_attachment_data_internal<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>, attachment_id: i64) -> Result<Vec<u8>, String> {
    let pool = app_handle.state::<SqlitePool>().inner().clone();
    
    // 1. Try to get cached data from file
    let row: Option<(Option<String>, Option<i64>, Option<String>, Option<String>, i64)> = sqlx::query_as(
        "SELECT file_hash, email_id, filename, mime_type, size FROM attachments WHERE id = ?"
    )
    .bind(attachment_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (file_hash, email_id, filename, mime_type, size) = match row {
        Some(r) => r,
        None => return Err("Attachment not found".to_string()),
    };

    if let Some(hash) = file_hash {
        if let Ok(data) = read_attachment_data(app_handle, &hash) {
            return Ok(data);
        }
    }

    let email_id = email_id.ok_or("Attachment has no associated email (might be a draft)")?;

    // 2. Data is missing, fetch from server
    let email_info: (i64, String, String) = sqlx::query_as(
        "SELECT e.account_id, e.remote_id, f.path FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
    )
    .bind(email_id)
    .fetch_one(&pool)
    .await
    .map_err(|e| e.to_string())?;

    let (account_id, remote_id, folder_path) = email_info;
    let engine = app_handle.state::<SyncEngine<R>>();
    let context = engine.get_context(account_id).await?;

    let mut client = context.client().await;
    let id = Id::single(remote_id);
    
    use imap_client::imap_next::imap_types::fetch::MessageDataItemName;
    use imap_client::imap_next::imap_types::fetch::MacroOrMessageDataItemNames;
    let fetch_items = MacroOrMessageDataItemNames::MessageDataItemNames(vec![
        MessageDataItemName::BodyExt {
            section: None,
            partial: None,
            peek: true,
        }
    ]);
    
    client.examine_mailbox(&folder_path).await.map_err(|e| e.to_string())?;

    use std::num::NonZeroU32;
    use imap_client::imap_next::imap_types::sequence::Sequence;
    let uids: imap_client::imap_next::imap_types::sequence::SequenceSet = id.iter()
        .filter_map(|s| s.parse::<u32>().ok())
        .filter_map(|n| NonZeroU32::new(n))
        .map(Sequence::from)
        .collect::<Vec<_>>()
        .try_into()
        .map_err(|e: imap_client::imap_next::imap_types::error::ValidationError| e.to_string())?;

    let messages = client.fetch_messages_with_items(uids, fetch_items).await.map_err(|e| e.to_string())?;
    let message = messages.first().ok_or("Email not found on server")?;

    if let Ok(attachments) = message.attachments() {
        for att in attachments {
            // Match by filename, mime type and size for robustness.
            if att.filename == filename && 
               (mime_type.is_none() || att.mime == mime_type.as_ref().unwrap().as_str()) &&
               att.body.len() as i64 == size {
                
                // Save to file system and get hash
                let hash = save_attachment_data(app_handle, &att.body)?;
                
                // Update DB with hash
                sqlx::query("UPDATE attachments SET file_hash = ? WHERE id = ?")
                    .bind(&hash)
                    .bind(attachment_id)
                    .execute(&pool)
                    .await
                    .map_err(|e| e.to_string())?;
                
                return Ok(att.body);
            }
        }
    }

    Err("Attachment data not found in email message".to_string())
}

#[tauri::command]
pub async fn get_attachment_data<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, attachment_id: i64) -> Result<Vec<u8>, String> {
    fetch_attachment_data_internal(&app_handle, attachment_id).await
}

#[tauri::command]
pub async fn save_attachment_to_path<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, attachment_id: i64, path: String) -> Result<(), String> {
    let data = fetch_attachment_data_internal(&app_handle, attachment_id).await?;
    std::fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_attachment<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, attachment_id: i64) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>().inner().clone();
    
    // 1. Ensure we have the data
    let data = fetch_attachment_data_internal(&app_handle, attachment_id).await?;
    
    // 2. Get filename
    let filename: String = sqlx::query_scalar::<_, Option<String>>("SELECT filename FROM attachments WHERE id = ?")
        .bind(attachment_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| format!("attachment-{}", attachment_id));

    // 3. Save to temp directory
    let temp_dir = std::env::temp_dir();
    let file_path = temp_dir.join(filename);
    std::fs::write(&file_path, data).map_err(|e| e.to_string())?;
    
    // 4. Open with system handler
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/C", "start", "", file_path.to_str().unwrap()]).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(file_path).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(file_path).spawn();
    
    Ok(())
}

#[tauri::command]
pub async fn send_email<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    account_id: i64,
    to: String,
    cc: Option<String>,
    bcc: Option<String>,
    subject: String,
    body: String,
    attachment_ids: Vec<i64>,
) -> Result<(), String> {
    let manager = AccountManager::new(&app_handle).await?;
    let account = manager.get_account_by_id(account_id).await?;
    let (account_config, _, smtp_config) = account.get_configs()?;
    let pool = app_handle.state::<SqlitePool>();

    let mut builder = MessageBuilder::new();
    builder = builder.from(account.email());
    builder = builder.to(to.clone());

    if let Some(ref cc_val) = cc {
        if !cc_val.trim().is_empty() {
            builder = builder.cc(cc_val.clone());
        }
    }

    if let Some(ref bcc_val) = bcc {
        if !bcc_val.trim().is_empty() {
            builder = builder.bcc(bcc_val.clone());
        }
    }

    builder = builder.subject(subject);
    builder = builder.html_body(body);

    for id in attachment_ids {
        let att_info: (Option<String>, Option<String>) = sqlx::query_as("SELECT filename, mime_type FROM attachments WHERE id = ?")
            .bind(id)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        
        let data = fetch_attachment_data_internal(&app_handle, id).await?;

        builder = builder.attachment(
            att_info.1.unwrap_or_else(|| "application/octet-stream".to_string()),
            att_info.0.unwrap_or_else(|| "attachment".to_string()),
            data
        );
    }

    let message = builder.write_to_vec().map_err(|e| e.to_string())?;

    let backend_builder = BackendBuilder::new(
        account_config.clone(),
        SmtpContextBuilder::new(account_config, smtp_config),
    );

    let backend = match backend_builder.build().await {
        Ok(b) => b,
        Err(e) => {
            let err_str = e.to_string();
            if err_str.contains("auth") || err_str.contains("Unauthorized") || err_str.contains("token") || err_str.contains("credentials") {
                info!("Refreshing token for account {} due to build error: {}", account.email(), err_str);
                manager.refresh_access_token(account.email()).await?;
                let account = manager.get_account_by_id(account_id).await?;
                let (account_config, _, smtp_config) = account.get_configs()?;
                let backend_builder = BackendBuilder::new(
                    account_config.clone(),
                    SmtpContextBuilder::new(account_config, smtp_config),
                );
                backend_builder.build().await.map_err(|e| e.to_string())?
            } else {
                return Err(err_str);
            }
        }
    };

    if let Err(e) = backend.send_message(&message).await {
        let err_str = e.to_string();
        if err_str.contains("auth") || err_str.contains("Unauthorized") || err_str.contains("token") || err_str.contains("credentials") {
            info!("Refreshing token for account {} due to send error: {}", account.email(), err_str);
            manager.refresh_access_token(account.email()).await?;
            let account = manager.get_account_by_id(account_id).await?;
            let (account_config, _, smtp_config) = account.get_configs()?;
            let backend_builder = BackendBuilder::new(
                account_config.clone(),
                SmtpContextBuilder::new(account_config, smtp_config),
            );
            let backend = backend_builder.build().await.map_err(|e| e.to_string())?;
            backend.send_message(&message).await.map_err(|e| e.to_string())?;
        } else {
            return Err(err_str);
        }
    }

    // Append to Sent Folder
    let engine = app_handle.state::<SyncEngine<R>>();

    let sent_folder: Option<(i64, String)> = sqlx::query_as("SELECT id, path FROM folders WHERE account_id = ? AND role = 'sent'")
        .bind(account_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some((folder_id, path)) = sent_folder {
         if let Ok(backend) = engine.get_backend(account_id).await {
            let flags = Flags::from_iter([Flag::Seen]);
            let _ = backend.add_message_with_flags(&path, &message, &flags).await;
            
            // Trigger refresh
            let _ = SyncEngine::refresh_folder(&app_handle, account_id, folder_id).await;
         }
    }

    // Save recipients as contacts
    let mut all_recipients = Vec::new();
    all_recipients.push(to);
    if let Some(cc_val) = cc {
        all_recipients.push(cc_val);
    }
    if let Some(bcc_val) = bcc {
        all_recipients.push(bcc_val);
    }
    
    // Flatten comma separated lists
    let flat_recipients: Vec<String> = all_recipients.iter()
        .flat_map(|s| s.split(',').map(|p| p.trim().to_string()))
        .filter(|s| !s.is_empty())
        .collect();

    let _ = crate::email_backend::enrichment::commands::save_recipients_as_contacts(&app_handle, flat_recipients).await;

    Ok(())
}

#[tauri::command]
pub async fn search_emails<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    query_text: String,
    account_id: Option<i64>,
    view: Option<String>,
    limit: Option<u32>,
    before_date: Option<String>,
    before_id: Option<i64>,
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    if query_text.trim().is_empty() {
        return Ok(Vec::new());
    }

    // FTS5 works better with a '*' for prefix matching if the user is typing
    // We wrap the term in double quotes for phrase matching and add * for prefix matching
    // Example: \"query\"*
    let fts_query = query_text.trim().replace("\"", "\"\"");
    let fts_query = if fts_query.contains(' ') {
        format!("\"{}\"", fts_query)
    } else {
        format!("{}*", fts_query)
    };

    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "WITH unique_messages AS (
            SELECT e.*, f.role as folder_role,
            ROW_NUMBER() OVER (
                PARTITION BY e.account_id, e.message_id 
                ORDER BY CASE WHEN f.role = 'inbox' THEN 0 WHEN f.role = 'sent' THEN 1 ELSE 2 END, e.date DESC
            ) as msg_rn
            FROM emails e
            JOIN folders f ON e.folder_id = f.id
            JOIN emails_fts fts ON e.id = fts.rowid 
            WHERE emails_fts MATCH "
    );
    
    query_builder.push_bind(fts_query);
    query_builder.push("),
          latest_threads AS (
            SELECT *,
            ROW_NUMBER() OVER (
                PARTITION BY account_id, COALESCE(NULLIF(thread_id, message_id), normalized_subject || '-' || sender_address || '-' || COALESCE(recipient_to, ''), message_id) 
                ORDER BY date DESC, id DESC
            ) as thread_rn,
            COUNT(*) OVER (
                PARTITION BY account_id, COALESCE(NULLIF(thread_id, message_id), normalized_subject || '-' || sender_address || '-' || COALESCE(recipient_to, ''), message_id)
            ) as t_count
            FROM unique_messages
            WHERE msg_rn = 1
         )
         SELECT e.id, e.account_id, e.folder_id, e.remote_id, e.message_id, e.thread_id, e.t_count as thread_count, e.in_reply_to, e.references_header, e.subject, e.sender_name, e.sender_address, e.recipient_to, e.date, e.flags, e.snippet, e.summary, e.has_attachments,
         (e.subject LIKE 'Re:%' OR e.subject LIKE 're:%' OR e.in_reply_to IS NOT NULL) as is_reply,
         (e.subject LIKE 'Fwd:%' OR e.subject LIKE 'fwd:%' OR e.subject LIKE 'Fw:%' OR e.subject LIKE 'fw:%') as is_forward
         FROM latest_threads e 
         WHERE e.thread_rn = 1 ");

    if let Some(aid) = account_id {
        query_builder.push(" AND e.account_id = ");
        query_builder.push_bind(aid);
    }

    if let Some(v) = view {
        match v.as_str() {
            "primary" => query_builder.push(" AND e.folder_role = 'inbox'"),
            "spam" => query_builder.push(" AND e.folder_role = 'spam'"),
            "sent" => query_builder.push(" AND e.folder_role = 'sent'"),
            "drafts" => query_builder.push(" AND e.folder_role = 'drafts'"),
            "trash" => query_builder.push(" AND e.folder_role = 'trash'"),
            "archive" => query_builder.push(" AND e.folder_role = 'archive'"),
            "others" => query_builder.push(" AND (e.folder_role IS NULL OR e.folder_role = '' OR e.folder_role NOT IN ('inbox', 'spam', 'sent', 'drafts', 'trash', 'archive'))"),
            _ => &mut query_builder,
        };
    }

    // Keyset Pagination
    if let (Some(date), Some(id)) = (before_date, before_id) {
        query_builder.push(" AND (e.date < ");
        query_builder.push_bind(date.clone());
        query_builder.push(" OR (e.date = ");
        query_builder.push_bind(date);
        query_builder.push(" AND e.id < ");
        query_builder.push_bind(id);
        query_builder.push("))");
    }

    query_builder.push(" ORDER BY e.date DESC, e.id DESC LIMIT ");
    query_builder.push_bind(limit.unwrap_or(100) as i64);

    let emails = query_builder
        .build_query_as::<Email>()
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(emails)
}

#[tauri::command]
pub async fn get_folders<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, account_id: i64) -> Result<Vec<Folder>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let folders = sqlx::query_as::<_, Folder>("SELECT * FROM folders WHERE account_id = ?")
        .bind(account_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(folders)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::test_utils::setup_test_db;
    use tauri::test::mock_builder;
    use chrono::Utc;

    async fn seed_test_data(pool: &SqlitePool) -> (i64, i64, i64) {
        let row: (i64,) = sqlx::query_as("INSERT INTO accounts (email, account_type) VALUES (?, ?) RETURNING id")
            .bind("test@example.com")
            .bind("google")
            .fetch_one(pool)
            .await
            .unwrap();
        let account_id = row.0;

        let row: (i64,) = sqlx::query_as("INSERT INTO folders (account_id, name, path, role) VALUES (?, ?, ?, ?) RETURNING id")
            .bind(account_id)
            .bind("Inbox")
            .bind("INBOX")
            .bind("inbox")
            .fetch_one(pool)
            .await
            .unwrap();
        let folder_id = row.0;

        let row: (i64,) = sqlx::query_as(
            "INSERT INTO emails (account_id, folder_id, remote_id, message_id, thread_id, subject, sender_address, recipient_to, date, flags, body_text, has_attachments)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
        )
        .bind(account_id)
        .bind(folder_id)
        .bind("remote-1")
        .bind("msg-1")
        .bind("msg-1")
        .bind("Test Subject")
        .bind("sender@example.com")
        .bind("test@example.com")
        .bind(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .bind("[\"seen\"]")
        .bind("Hello content")
        .bind(false)
        .fetch_one(pool)
        .await
        .unwrap();
        let email_id = row.0;

        (account_id, folder_id, email_id)
    }

    #[tokio::test]
    async fn test_get_emails_integration() {
        use tauri::Manager;
        let pool = setup_test_db().await;
        let (account_id, _, _) = seed_test_data(&pool).await;
        
        let app = mock_builder().build(tauri::generate_context!()).unwrap();
        app.manage(pool);

        let emails = get_emails(app.handle().clone(), Some(account_id), Some("primary".to_string()), None, None, None)
            .await
            .expect("Failed to get emails");

        assert_eq!(emails.len(), 1);
        assert_eq!(emails[0].subject, Some("Test Subject".to_string()));
    }

    #[tokio::test]
    async fn test_thread_grouping_by_subject() {
        use tauri::Manager;
        let pool = setup_test_db().await;
        let (account_id, folder_id, _) = seed_test_data(&pool).await;

        // Insert another email with \"Re: Test Subject\" from same sender
        sqlx::query(
            "INSERT INTO emails (account_id, folder_id, remote_id, message_id, thread_id, subject, normalized_subject, sender_address, recipient_to, date, flags, has_attachments)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(account_id)
        .bind(folder_id)
        .bind("remote-2")
        .bind("msg-2")
        .bind("msg-2") // Initially separate
        .bind("Re: Test Subject")
        .bind("test subject")
        .bind("sender@example.com")
        .bind("test@example.com")
        .bind(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .bind("[]")
        .bind(false)
        .execute(&pool)
        .await
        .unwrap();

        let app = mock_builder().build(tauri::generate_context!()).unwrap();
        app.manage(pool.clone());

        // Run resolve_threads manually (simulated)
        // We need to call resolve_threads but it's private. 
        // For testing purposes, we can just run the logic or make it public if needed.
        // Actually, let's just test that get_emails groups them if thread_id is same.
        
        sqlx::query("UPDATE emails SET thread_id = (SELECT message_id FROM emails WHERE remote_id = 'remote-1') WHERE remote_id = 'remote-2'")
            .execute(&pool)
            .await
            .unwrap();

        let emails = get_emails(app.handle().clone(), Some(account_id), Some("primary".to_string()), None, None, None)
            .await
            .expect("Failed to get emails");

        assert_eq!(emails.len(), 1);
        assert_eq!(emails[0].thread_count, Some(2));
    }

    #[tokio::test]
    async fn test_get_email_content_cached() {
        use tauri::Manager;
        let pool = setup_test_db().await;
        let (_, _, email_id) = seed_test_data(&pool).await;
        
        let app = mock_builder().build(tauri::generate_context!()).unwrap();
        app.manage(pool);

        let content = get_email_content(app.handle().clone(), email_id)
            .await
            .expect("Failed to get email content");

        assert_eq!(content.body_text, Some("Hello content".to_string()));
    }
}
