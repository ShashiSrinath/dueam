use std::time::Duration;

use sqlx::sqlite::{
    SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions, SqliteSynchronous,
};
use tauri::AppHandle;
use tauri::Manager;

pub async fn setup_database(app_handle: &AppHandle) -> Result<SqlitePool, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    let db_path = app_dir.join("dueam.db");

    log::info!("Database path: {:?}", db_path);

    let options = SqliteConnectOptions::new()
        .filename(&db_path)
        .create_if_missing(true)
        .busy_timeout(Duration::from_secs(10))
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .optimize_on_close(true, None);

    let pool = connect_with_retry(options).await?;

    migrate_with_retry(&pool).await?;

    Ok(pool)
}

async fn connect_with_retry(options: SqliteConnectOptions) -> Result<SqlitePool, String> {
    let mut last_error = None;

    for attempt in 1..=5 {
        match SqlitePoolOptions::new()
            .max_connections(4)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(15))
            .connect_with(options.clone())
            .await
        {
            Ok(pool) => return Ok(pool),
            Err(err) => {
                let message = err.to_string();
                last_error = Some(message.clone());

                if !is_locked_error(&message) || attempt == 5 {
                    return Err(message);
                }

                let backoff_ms = 250 * attempt as u64;
                log::warn!(
                    "SQLite database is locked during connect, retrying in {}ms (attempt {}/5)",
                    backoff_ms,
                    attempt
                );
                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Failed to connect to SQLite database".to_string()))
}

async fn migrate_with_retry(pool: &SqlitePool) -> Result<(), String> {
    let mut last_error = None;

    for attempt in 1..=5 {
        match sqlx::migrate!("./migrations").run(pool).await {
            Ok(()) => return Ok(()),
            Err(err) => {
                let message = err.to_string();
                last_error = Some(message.clone());

                if !is_locked_error(&message) || attempt == 5 {
                    return Err(message);
                }

                let backoff_ms = 250 * attempt as u64;
                log::warn!(
                    "SQLite database is locked during migration, retrying in {}ms (attempt {}/5)",
                    backoff_ms,
                    attempt
                );
                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
            }
        }
    }

    Err(last_error.unwrap_or_else(|| "Failed to run SQLite migrations".to_string()))
}

fn is_locked_error(message: &str) -> bool {
    let message = message.to_ascii_lowercase();
    message.contains("database is locked") || message.contains("database table is locked")
}
