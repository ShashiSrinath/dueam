use serde::{Deserialize, Serialize};
use tauri::command;

use crate::email_backend::llm::client::shared_client;

#[derive(Debug, Serialize, Deserialize)]
pub struct AIModel {
    pub id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIModelsResponse {
    data: Vec<AIModel>,
}

#[command]
pub async fn get_available_models(
    base_url: String,
    api_key: String,
) -> Result<Vec<AIModel>, String> {
    let url = if base_url.ends_with("/models") {
        base_url
    } else {
        format!("{}/models", base_url.trim_end_matches('/'))
    };

    let mut request = shared_client().get(url);
    if !api_key.is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key));
    }

    let response = request.send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!(
            "Failed to fetch models: {} - {}",
            status, error_text
        ));
    }

    let models_resp: OpenAIModelsResponse = response.json().await.map_err(|e| e.to_string())?;

    // Sort models by ID for better UI
    let mut models = models_resp.data;
    models.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(models)
}
