use log::debug;
use std::sync::Arc;
use tauri::Manager;

use crate::email_backend::llm::controller::{AiController, AiTask, AiTaskPriority};

pub async fn enqueue_summarization<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    email_id: i64,
    body_text: &str,
    priority: AiTaskPriority,
) -> Result<(), String> {
    let trimmed_body = body_text.trim();

    if trimmed_body.len() < 30 {
        debug!(
            "Skipping summarization for email {}: body text too small ({} chars)",
            email_id,
            trimmed_body.len()
        );
        return Ok(());
    }

    if trimmed_body.len() < 800 {
        let lower_body = trimmed_body.to_lowercase();
        let image_indicators = [
            "view this email in your browser",
            "having trouble viewing this email",
            "view as a web page",
            "click here if you are unable to see the images",
            "images not displaying",
            "displaying correctly? view it in your browser",
            "viewing this email as a webpage",
            "enable images to see this email",
        ];

        if image_indicators.iter().any(|&ind| lower_body.contains(ind)) {
            let pool = app_handle.state::<sqlx::SqlitePool>();
            let has_images: bool = sqlx::query_scalar::<_, i32>(
                "SELECT 1 FROM attachments WHERE email_id = ? AND mime_type LIKE 'image/%' LIMIT 1",
            )
            .bind(email_id)
            .fetch_optional(&*pool)
            .await
            .unwrap_or(None)
            .is_some();

            if has_images {
                debug!(
                    "Skipping summarization for email {}: detected as image-only content",
                    email_id
                );
                return Ok(());
            }
        }
    }

    let controller = app_handle.state::<Arc<AiController>>();
    let task_id = AiController::task_id_from_summarize(email_id);

    let task = AiTask::Summarize {
        email_id,
        body_text: body_text.to_string(),
    };

    controller.enqueue(task_id, task, priority).await;

    Ok(())
}

pub async fn get_summarization_result<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    email_id: i64,
) -> Option<String> {
    let controller = app_handle.state::<Arc<AiController>>();
    let task_id = AiController::task_id_from_summarize(email_id);

    let result = controller.get_result(&task_id).await?;
    match result {
        Ok(value) => value.get("summary")?.as_str().map(|s| s.to_string()),
        Err(_) => None,
    }
}
