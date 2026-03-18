use log::{debug, error, info, warn};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tauri::Manager;

use crate::email_backend::llm::client::shared_client;

pub async fn enrich_sender_with_ai<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    sender_address: &str,
    email_snippets: Vec<String>,
) -> Result<Value, String> {
    debug!("Starting AI enrichment for sender: {}", sender_address);

    let mut last_error = String::new();
    let max_retries = 2;

    for attempt in 1..=max_retries {
        match try_enrich_sender_direct(app_handle, sender_address, &email_snippets).await {
            Ok(json_val) => {
                info!(
                    "Successfully enriched sender: {} (attempt {})",
                    sender_address, attempt
                );
                return Ok(json_val);
            }
            Err(e) => {
                warn!(
                    "AI enrichment attempt {} failed for {}: {}",
                    attempt, sender_address, e
                );
                last_error = e;
                // Small delay before retry
                if attempt < max_retries {
                    tokio::time::sleep(std::time::Duration::from_millis(1000 * attempt as u64))
                        .await;
                }
            }
        }
    }

    error!(
        "AI enrichment failed for {} after {} attempts. Last error: {}",
        sender_address, max_retries, last_error
    );
    Err(last_error)
}

async fn try_enrich_sender_direct<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    sender_address: &str,
    email_snippets: &[String],
) -> Result<Value, String> {
    let pool = app_handle.state::<SqlitePool>();

    let rows: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT key, value FROM settings WHERE key IN ('aiApiKey', 'aiBaseUrl', 'aiModel')",
    )
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
            _ => {}
        }
    }

    if api_key.is_empty() || model.is_empty() {
        return Err("AI API Key or Model not configured".to_string());
    }

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let emails_combined = email_snippets.join("\n---\n");
    let system_prompt = format!(
        r#"You are an expert at extracting professional information from email snippets.
Your task is to extract information about the sender '{sender_address}' based ONLY on the provided email snippets.

Information to extract:
- name: Full Name
- job_title: Job Title (e.g., Software Engineer, CEO, Sales Manager)
- company: Company name
- bio: A brief professional bio (max 2 sentences)
- location: City and/or Country if identifiable
- is_personal_email: true if this looks like an individual's personal account, false otherwise.
- is_automated_mailer: true if this is an automated service, notification system, or newsletter.

OUTPUT INSTRUCTIONS:
- Respond ONLY with a valid JSON object.
- DO NOT include markdown code blocks.
- If a piece of information is missing, use null.
- Ensure all keys are present in the JSON.

JSON Structure:
{{
  "name": "string or null",
  "job_title": "string or null",
  "company": "string or null",
  "bio": "string or null",
  "location": "string or null",
  "is_personal_email": boolean,
  "is_automated_mailer": boolean
}}"#,
        sender_address = sender_address
    );

    let body = json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user",
                "content": format!("Emails:\n{}", emails_combined)
            }
        ],
        "temperature": 0.1,
        "stream": false
    });

    let resp = shared_client()
        .post(&url)
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

    let response_json: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    let ai_content = response_json["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| format!("Unexpected AI response structure: {:?}", response_json))?;

    debug!(
        "Received AI enrichment response for {} ({} chars)",
        sender_address,
        ai_content.len()
    );

    let cleaned_response = extract_json(ai_content);

    match serde_json::from_str::<Value>(&cleaned_response) {
        Ok(json_val) => {
            let required_keys = [
                "name",
                "job_title",
                "company",
                "is_personal_email",
                "is_automated_mailer",
            ];
            for key in required_keys {
                if json_val.get(key).is_none() {
                    return Err(format!("Missing required key '{}' in AI response", key));
                }
            }
            Ok(json_val)
        }
        Err(e) => Err(format!(
            "Failed to parse JSON: {}. Cleaned response: {}",
            e, cleaned_response
        )),
    }
}

fn extract_json(s: &str) -> String {
    let s = s.trim();
    if let (Some(start), Some(end)) = (s.find('{'), s.rfind('}')) {
        s[start..=end].to_string()
    } else {
        s.trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
            .to_string()
    }
}
