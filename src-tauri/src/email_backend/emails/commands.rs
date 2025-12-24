use tauri::{Manager, Emitter};
use sqlx::SqlitePool;
use serde::{Deserialize, Serialize};
use crate::email_backend::accounts::manager::AccountManager;
use crate::email_backend::sync::SyncEngine;
use email::backend::BackendBuilder;
use email::imap::ImapContextBuilder;
use email::smtp::SmtpContextBuilder;
use email::message::get::GetMessages;
use email::message::send::SendMessage;
use email::envelope::Id;
use email::flag::add::AddFlags;
use email::flag::Flag;

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Email {
    pub id: i64,
    pub account_id: i64,
    pub folder_id: i64,
    pub remote_id: String,
    pub message_id: Option<String>,
    pub subject: Option<String>,
    pub sender_name: Option<String>,
    pub sender_address: String,
    pub date: String,
    pub flags: String,
    pub snippet: Option<String>,
    pub has_attachments: bool,
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
    pub subject: Option<String>,
    pub body_html: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UnifiedCounts {
    pub primary: i32,
    pub others: i32,
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
    offset: Option<u32>
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "SELECT e.id, e.account_id, e.folder_id, e.remote_id, e.message_id, e.subject, e.sender_name, e.sender_address, e.date, e.flags, e.snippet, e.has_attachments 
         FROM emails e 
         JOIN folders f ON e.folder_id = f.id "
    );

    let mut has_where = false;

    if let Some(aid) = account_id {
        query_builder.push(" WHERE e.account_id = ");
        query_builder.push_bind(aid);
        has_where = true;
    }

    if let Some(v) = view {
        if !has_where { query_builder.push(" WHERE "); has_where = true; } else { query_builder.push(" AND "); }
        match v.as_str() {
            "primary" => query_builder.push(" f.role = 'inbox'"),
            "spam" => query_builder.push(" f.role = 'spam'"),
            "sent" => query_builder.push(" f.role = 'sent'"),
            "drafts" => query_builder.push(" f.role = 'drafts'"),
            "trash" => query_builder.push(" f.role = 'trash'"),
            "archive" => query_builder.push(" f.role = 'archive'"),
            "others" => query_builder.push(" (f.role IS NULL OR f.role = '' OR f.role NOT IN ('inbox', 'spam', 'sent', 'drafts', 'trash', 'archive'))"),
            _ => &mut query_builder,
        };
    } else {
        // Default to primary if no view specified
        if !has_where { query_builder.push(" WHERE "); has_where = true; } else { query_builder.push(" AND "); }
        query_builder.push(" f.role = 'inbox'");
    }

    if let Some(f) = filter {
        if !has_where { query_builder.push(" WHERE "); } else { query_builder.push(" AND "); }
        match f.as_str() {
            "unread" => query_builder.push(" e.flags NOT LIKE '%seen%'"),
            "flagged" => query_builder.push(" e.flags LIKE '%flagged%'"),
            _ => &mut query_builder,
        };
    }

    query_builder.push(" GROUP BY e.account_id, COALESCE(e.message_id, e.folder_id || '-' || e.remote_id)");
    query_builder.push(" ORDER BY e.date DESC LIMIT ");
    query_builder.push_bind(limit.unwrap_or(100) as i64);
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
pub async fn get_unified_counts<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>) -> Result<UnifiedCounts, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let row: (i32, i32, i32, i32) = sqlx::query_as(
        "SELECT 
            SUM(CASE WHEN role = 'inbox' THEN unread_count ELSE 0 END) as primary_count,
            SUM(CASE WHEN (role IS NULL OR role = '' OR role NOT IN ('inbox', 'spam', 'sent', 'drafts', 'trash', 'archive')) THEN unread_count ELSE 0 END) as others,
            SUM(CASE WHEN role = 'spam' THEN unread_count ELSE 0 END) as spam,
            SUM(CASE WHEN role = 'drafts' THEN total_count ELSE 0 END) as drafts
         FROM folders"
    )
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(UnifiedCounts {
        primary: row.0,
        others: row.1,
        spam: row.2,
        drafts: row.3,
    })
}

#[tauri::command]
pub async fn get_email_by_id<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<Email, String> {
    let pool = app_handle.state::<SqlitePool>();
    let email = sqlx::query_as::<_, Email>(
        "SELECT id, account_id, folder_id, remote_id, message_id, subject, sender_name, sender_address, date, flags, snippet, has_attachments FROM emails WHERE id = ?"
    )
    .bind(email_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(email)
}

#[tauri::command]
pub async fn get_email_content<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<EmailContent, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let content: Option<EmailContent> = sqlx::query_as::<_, EmailContent>("SELECT body_text, body_html FROM emails WHERE id = ?")
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(c) = content {
        if c.body_text.is_some() || c.body_html.is_some() {
            return Ok(c);
        }
    }

    let email_info: (i64, String, String) = sqlx::query_as(
        "SELECT e.account_id, e.remote_id, f.path FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
    )
    .bind(email_id)
    .fetch_one(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    let (account_id, remote_id, folder_path) = email_info;
    let manager = AccountManager::new(&app_handle).await?;
    let account = manager.get_account_by_id(account_id).await?;
    let (account_config, imap_config, _) = account.get_configs()?;

    let backend_builder = BackendBuilder::new(
        account_config.clone(),
        ImapContextBuilder::new(account_config, imap_config),
    );

    let backend = backend_builder.build().await.map_err(|e| e.to_string())?;
    
    let id = Id::single(remote_id);
    let messages = backend.get_messages(&folder_path, &id).await.map_err(|e| e.to_string())?;
    let message = messages.first().ok_or("Email not found on server")?;

    let parsed = message.parsed().map_err(|e| e.to_string())?;
    let body_text = parsed.body_text(0).map(|b| b.to_string());
    let body_html = parsed.body_html(0).map(|b| b.to_string());

    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE emails SET body_text = ?, body_html = ? WHERE id = ?")
        .bind(&body_text)
        .bind(&body_html)
        .bind(email_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    if let Ok(attachments) = message.attachments() {
        for att in attachments {
            sqlx::query(
                "INSERT INTO attachments (email_id, filename, mime_type, size, data)
                 VALUES (?, ?, ?, ?, ?)"
            )
            .bind(email_id)
            .bind(&att.filename)
            .bind(&att.mime)
            .bind(att.body.len() as i64)
            .bind(&att.body)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(EmailContent {
        body_text,
        body_html,
    })
}

#[tauri::command]
pub async fn save_draft<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    id: Option<i64>,
    account_id: i64,
    to: Option<String>,
    subject: Option<String>,
    body_html: Option<String>,
) -> Result<i64, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    if let Some(draft_id) = id {
        sqlx::query("UPDATE drafts SET to_address = ?, subject = ?, body_html = ? WHERE id = ?")
            .bind(to)
            .bind(subject)
            .bind(body_html)
            .bind(draft_id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(draft_id)
    } else {
        let row: (i64,) = sqlx::query_as("INSERT INTO drafts (account_id, to_address, subject, body_html) VALUES (?, ?, ?, ?) RETURNING id")
            .bind(account_id)
            .bind(to)
            .bind(subject)
            .bind(body_html)
            .fetch_one(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(row.0)
    }
}

#[tauri::command]
pub async fn get_drafts<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, account_id: i64) -> Result<Vec<Draft>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let drafts = sqlx::query_as::<_, Draft>("SELECT * FROM drafts WHERE account_id = ? ORDER BY updated_at DESC")
        .bind(account_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(drafts)
}

#[tauri::command]
pub async fn get_draft_by_id<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, id: i64) -> Result<Draft, String> {
    let pool = app_handle.state::<SqlitePool>();
    let draft = sqlx::query_as::<_, Draft>("SELECT * FROM drafts WHERE id = ?")
        .bind(id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(draft)
}

#[tauri::command]
pub async fn delete_draft<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, id: i64) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    sqlx::query("DELETE FROM drafts WHERE id = ?")
        .bind(id)
        .execute(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn mark_as_read<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_ids: Vec<i64>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    
    for email_id in email_ids {
        let email_info: Option<(i64, String, String, String)> = sqlx::query_as(
            "SELECT e.account_id, e.remote_id, f.path, e.flags FROM emails e JOIN folders f ON e.folder_id = f.id WHERE e.id = ?"
        )
        .bind(email_id)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        let (account_id, remote_id, folder_path, current_flags) = match email_info {
            Some(info) => info,
            None => continue,
        };

        if current_flags.contains("\"seen\"") || current_flags.contains("seen") {
            continue;
        }

        let manager = AccountManager::new(&app_handle).await?;
        if let Ok(account) = manager.get_account_by_id(account_id).await {
            if let Ok((account_config, imap_config, _)) = account.get_configs() {
                let backend_builder = BackendBuilder::new(
                    account_config.clone(),
                    ImapContextBuilder::new(account_config, imap_config),
                );

                if let Ok(backend) = backend_builder.build().await {
                    let id = Id::single(remote_id);
                    let _ = backend.add_flag(&folder_path, &id, Flag::Seen).await;
                }
            }
        }

        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        let mut flags: Vec<String> = serde_json::from_str(&current_flags).unwrap_or_default();
        if !flags.contains(&"seen".to_string()) {
            flags.push("seen".to_string());
        }

        sqlx::query("UPDATE emails SET flags = ? WHERE id = ?")
            .bind(serde_json::to_string(&flags).unwrap_or_default())
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
    }

    let _ = app_handle.emit("emails-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn move_to_trash<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_ids: Vec<i64>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    let manager = AccountManager::new(&app_handle).await?;

    for email_id in email_ids {
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
        if let Ok(account) = manager.get_account_by_id(account_id).await {
            if let Ok((account_config, imap_config, _)) = account.get_configs() {
                let backend_builder = BackendBuilder::new(
                    account_config.clone(),
                    ImapContextBuilder::new(account_config, imap_config),
                );

                if let Ok(backend) = backend_builder.build().await {
                    let id = email::envelope::Id::single(remote_id);
                    use email::message::r#move::MoveMessages;
                    let _ = backend.move_messages(&source_folder_path, &trash_folder_path, &id).await.map_err(|e| e.to_string())?;
                }
            }
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

    let _ = app_handle.emit("emails-updated", ());
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct Attachment {
    pub id: i64,
    pub email_id: i64,
    pub filename: Option<String>,
    pub mime_type: Option<String>,
    pub size: i64,
}

#[tauri::command]
pub async fn get_attachments<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, email_id: i64) -> Result<Vec<Attachment>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let attachments = sqlx::query_as::<_, Attachment>("SELECT id, email_id, filename, mime_type, size FROM attachments WHERE email_id = ?")
        .bind(email_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(attachments)
}

#[tauri::command]
pub async fn get_attachment_data<R: tauri::Runtime>(app_handle: tauri::AppHandle<R>, attachment_id: i64) -> Result<Vec<u8>, String> {
    let pool = app_handle.state::<SqlitePool>();
    let row: (Vec<u8>,) = sqlx::query_as("SELECT data FROM attachments WHERE id = ?")
        .bind(attachment_id)
        .fetch_one(&*pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.0)
}

#[tauri::command]
pub async fn send_email<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    account_id: i64,
    to: String,
    subject: String,
    body: String,
) -> Result<(), String> {
    let manager = AccountManager::new(&app_handle).await?;
    let account = manager.get_account_by_id(account_id).await?;
    let (account_config, _, smtp_config) = account.get_configs()?;

    let message = format!(
        "From: {}\r\nTo: {}\r\nSubject: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{}",
        account.email(),
        to,
        subject,
        body
    );

    let backend_builder = BackendBuilder::new(
        account_config.clone(),
        SmtpContextBuilder::new(account_config, smtp_config),
    );

    let backend = backend_builder.build().await.map_err(|e| e.to_string())?;
    backend.send_message(message.as_bytes()).await.map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn search_emails<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    query_text: String,
    account_id: Option<i64>,
    view: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    if query_text.trim().is_empty() {
        return Ok(Vec::new());
    }

    // FTS5 works better with a '*' for prefix matching if the user is typing
    // We wrap the term in double quotes for phrase matching and add * for prefix matching
    // Example: "query"*
    let fts_query = query_text.trim().replace("\"", "\"\"");
    let fts_query = if fts_query.contains(' ') {
        format!("\"{}\"", fts_query)
    } else {
        format!("{}*", fts_query)
    };

    let mut query_builder: sqlx::QueryBuilder<sqlx::Sqlite> = sqlx::QueryBuilder::new(
        "SELECT e.id, e.account_id, e.folder_id, e.remote_id, e.message_id, e.subject, e.sender_name, e.sender_address, e.date, e.flags, e.snippet, e.has_attachments 
         FROM emails e 
         JOIN folders f ON e.folder_id = f.id 
         JOIN emails_fts fts ON e.id = fts.rowid 
         WHERE emails_fts MATCH "
    );
    
    query_builder.push_bind(fts_query);

    if let Some(aid) = account_id {
        query_builder.push(" AND e.account_id = ");
        query_builder.push_bind(aid);
    }

    if let Some(v) = view {
        match v.as_str() {
            "primary" => query_builder.push(" AND f.role = 'inbox'"),
            "spam" => query_builder.push(" AND f.role = 'spam'"),
            "sent" => query_builder.push(" AND f.role = 'sent'"),
            "drafts" => query_builder.push(" AND f.role = 'drafts'"),
            "trash" => query_builder.push(" AND f.role = 'trash'"),
            "archive" => query_builder.push(" AND f.role = 'archive'"),
            "others" => query_builder.push(" AND (f.role IS NULL OR f.role = '' OR f.role NOT IN ('inbox', 'spam', 'sent', 'drafts', 'trash', 'archive'))"),
            _ => &mut query_builder,
        };
    }

    query_builder.push(" GROUP BY e.account_id, COALESCE(e.message_id, e.folder_id || '-' || e.remote_id)");
    query_builder.push(" ORDER BY e.date DESC LIMIT ");
    query_builder.push_bind(limit.unwrap_or(100) as i64);
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
            "INSERT INTO emails (account_id, folder_id, remote_id, subject, sender_address, date, flags, body_text)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id"
        )
        .bind(account_id)
        .bind(folder_id)
        .bind("remote-1")
        .bind("Test Subject")
        .bind("sender@example.com")
        .bind(Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
        .bind("[\"seen\"]")
        .bind("Hello content")
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