use serde_json::{Value, json};
use log::{info, error, debug, warn};
use sqlx::SqlitePool;
use tauri::Manager;

pub async fn summarize_email_with_ai<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    email_id: i64,
    body_text: &str,
) -> Result<String, String> {
    debug!("Starting AI summarization for email: {}", email_id);
    
    let pool = app_handle.state::<SqlitePool>();
    
    let rows: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>("SELECT key, value FROM settings WHERE key IN ('aiApiKey', 'aiBaseUrl', 'aiModel')")
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;
        
    let mut api_key = String::new();
    let mut base_url = String::from("https://api.openai.com/v1");
    let mut model = String::new();

    for (key, value) in rows {
        let unquoted = serde_json::from_str::<String>(&value).unwrap_or(value);
        match key.as_str() {
            "aiApiKey" => api_key = unquoted,
            "aiBaseUrl" => base_url = unquoted,
            "aiModel" => model = unquoted,
            _ => {} // Ignore other keys
        }
    }

    if api_key.is_empty() || model.is_empty() {
        return Err("AI API Key or Model not configured".to_string());
    }

    let client = reqwest::Client::new();
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    // Truncate body_text if too long (e.g., to ~4000 chars) to avoid token limits
    let truncated_body = if body_text.len() > 4000 {
        format!("{}...", &body_text[..4000])
    } else {
        body_text.to_string()
    };

    let system_prompt = r#"You are an expert at summarizing emails.
Your task is to provide a concise, one-sentence summary of the email content.
Focus on the main point or action item.
Do not include any introductory phrases like "The email is about..." or "This email...".
Just the summary."#;

    let body = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": format!("Email Content:\n{}", truncated_body)
            }
        ],
        "temperature": 0.3,
        "stream": false
    });

    let resp = client.post(&url)
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("AI API error ({}): {}", status, err_text));
    }

    let response_json: Value = resp.json().await.map_err(|e| format!("Failed to parse response JSON: {}", e))?;
    
    let summary = response_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| format!("Unexpected AI response structure: {:?}", response_json))?;

    info!("Successfully summarized email: {} -> {}", email_id, summary.trim());
    Ok(summary.trim().to_string())
}
