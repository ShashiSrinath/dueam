use std::collections::{BinaryHeap, HashMap, HashSet};
use std::sync::Arc;
use std::time::{Duration, Instant};

use log::{debug, error, info, warn};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use tauri::{Emitter, Manager};
use tokio::sync::{Mutex, RwLock};
use tokio::time::sleep;

use crate::email_backend::llm::client::shared_client;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AiTaskPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

#[derive(Debug, Clone)]
pub enum AiTask {
    Summarize {
        email_id: i64,
        body_text: String,
    },
    EnrichSender {
        address: String,
        snippets: Vec<String>,
    },
}

#[derive(Debug)]
struct QueuedTask {
    priority: AiTaskPriority,
    id: String,
    task: AiTask,
    created_at: Instant,
}

impl PartialEq for QueuedTask {
    fn eq(&self, other: &Self) -> bool {
        self.id == other.id
    }
}

impl Eq for QueuedTask {}

impl PartialOrd for QueuedTask {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for QueuedTask {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.priority
            .cmp(&other.priority)
            .then_with(|| other.created_at.cmp(&self.created_at))
    }
}

#[derive(Debug, Clone)]
pub struct AiConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
    pub requests_per_minute: u32,
    pub retry_count: u32,
    pub initial_backoff_ms: u64,
    pub max_backoff_ms: u64,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: "https://api.openai.com/v1".to_string(),
            model: String::new(),
            requests_per_minute: 60,
            retry_count: 3,
            initial_backoff_ms: 1000,
            max_backoff_ms: 60000,
        }
    }
}

pub struct AiController {
    queue: Arc<RwLock<BinaryHeap<QueuedTask>>>,
    in_flight: Arc<Mutex<HashSet<String>>>,
    results: Arc<RwLock<HashMap<String, Result<Value, String>>>>,
    config: Arc<RwLock<AiConfig>>,
    last_request_time: Arc<RwLock<Instant>>,
    rate_limit_until: Arc<RwLock<Option<Instant>>>,
}

impl AiController {
    pub fn new() -> Self {
        Self {
            queue: Arc::new(RwLock::new(BinaryHeap::new())),
            in_flight: Arc::new(Mutex::new(HashSet::new())),
            results: Arc::new(RwLock::new(HashMap::new())),
            config: Arc::new(RwLock::new(AiConfig::default())),
            last_request_time: Arc::new(RwLock::new(Instant::now())),
            rate_limit_until: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn initialize(&self, pool: &sqlx::Pool<sqlx::Sqlite>) {
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT key, value FROM settings WHERE key IN ('aiApiKey', 'aiBaseUrl', 'aiModel')",
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let mut config = AiConfig::default();
        for (key, value) in rows {
            let unquoted = serde_json::from_str::<String>(&value).unwrap_or(value);
            match key.as_str() {
                "aiApiKey" => config.api_key = unquoted,
                "aiBaseUrl" => config.base_url = unquoted,
                "aiModel" => config.model = unquoted,
                _ => {}
            }
        }

        *self.config.write().await = config;
    }

    pub async fn update_config(&self, pool: &sqlx::Pool<sqlx::Sqlite>) {
        let rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT key, value FROM settings WHERE key IN ('aiApiKey', 'aiBaseUrl', 'aiModel')",
        )
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let mut config = self.config.write().await;
        for (key, value) in rows {
            let unquoted = serde_json::from_str::<String>(&value).unwrap_or(value);
            match key.as_str() {
                "aiApiKey" => config.api_key = unquoted,
                "aiBaseUrl" => config.base_url = unquoted,
                "aiModel" => config.model = unquoted,
                _ => {}
            }
        }
    }

    pub fn task_id_from_summarize(email_id: i64) -> String {
        format!("summarize:{}", email_id)
    }

    pub fn task_id_from_enrich(address: &str) -> String {
        format!("enrich:{}", address.to_lowercase())
    }

    pub async fn enqueue(&self, task_id: String, task: AiTask, priority: AiTaskPriority) -> bool {
        {
            let in_flight = self.in_flight.lock().await;
            if in_flight.contains(&task_id) {
                debug!("Task {} already in flight, skipping", task_id);
                return false;
            }
        }

        {
            let results = self.results.read().await;
            if results.contains_key(&task_id) {
                debug!("Task {} already completed, skipping", task_id);
                return false;
            }
        }

        let queued = QueuedTask {
            priority,
            id: task_id.clone(),
            task,
            created_at: Instant::now(),
        };

        self.queue.write().await.push(queued);
        debug!("Enqueued task: {}", task_id);
        true
    }

    pub async fn get_result(&self, task_id: &str) -> Option<Result<Value, String>> {
        let results = self.results.read().await;
        results.get(task_id).cloned()
    }

    pub async fn clear_result(&self, task_id: &str) {
        let mut results = self.results.write().await;
        results.remove(task_id);
    }

    pub async fn wait_for_result(&self, task_id: &str, timeout_secs: u64) -> Option<Result<Value, String>> {
        let start = Instant::now();
        let timeout = Duration::from_secs(timeout_secs);

        while start.elapsed() < timeout {
            if let Some(result) = self.get_result(task_id).await {
                return Some(result);
            }
            sleep(Duration::from_millis(200)).await;
        }
        None
    }

    pub async fn process_task_sync<R: tauri::Runtime>(
        &self,
        app_handle: &tauri::AppHandle<R>,
        pool: &sqlx::Pool<sqlx::Sqlite>,
        task_id: String,
        task: AiTask,
    ) -> Result<Value, String> {
        let config = self.config.read().await.clone();

        if config.api_key.is_empty() || config.model.is_empty() {
            return Err("AI not configured".to_string());
        }

        self.wait_for_rate_limit_internal(&config).await;

        let result = match task {
            AiTask::Summarize { email_id, body_text } => {
                Self::call_summarize_api(&config, email_id, &body_text).await
            }
            AiTask::EnrichSender { address, snippets } => {
                Self::call_enrich_api(&config, &address, snippets).await
            }
        };

        let mut last_request = self.last_request_time.write().await;
        *last_request = Instant::now();

        result
    }

    async fn wait_for_rate_limit_internal(&self, config: &AiConfig) {
        loop {
            let rate_limit_until = *self.rate_limit_until.read().await;
            if let Some(until) = rate_limit_until {
                if Instant::now() < until {
                    let wait = until.duration_since(Instant::now());
                    debug!("Waiting for rate limit to reset: {:?}", wait);
                    sleep(wait).await;
                    continue;
                }
            }

            let last_request = *self.last_request_time.read().await;
            let min_interval = Duration::from_secs_f64(60.0 / config.requests_per_minute.max(1) as f64);

            if last_request.elapsed() < min_interval {
                let wait = min_interval - last_request.elapsed();
                debug!("Rate limiting: waiting {:?}", wait);
                sleep(wait).await;
            }
            break;
        }
    }

    pub async fn start_processor<R: tauri::Runtime>(
        self: Arc<Self>,
        app_handle: tauri::AppHandle<R>,
        pool: sqlx::Pool<sqlx::Sqlite>,
    ) {
        let queue = self.queue.clone();
        let in_flight = self.in_flight.clone();
        let results = self.results.clone();
        let config = self.config.clone();
        let last_request_time = self.last_request_time.clone();
        let rate_limit_until = self.rate_limit_until.clone();

        tokio::spawn(async move {
            loop {
                sleep(Duration::from_millis(100)).await;

                let task = {
                    let mut q = queue.write().await;
                    q.pop()
                };

                let Some(task) = task else {
                    continue;
                };

                let task_id = task.id.clone();

                {
                    let mut ifl = in_flight.lock().await;
                    if ifl.contains(&task_id) {
                        continue;
                    }
                    ifl.insert(task_id.clone());
                }

                Self::process_task(
                    &app_handle,
                    &pool,
                    task,
                    &queue,
                    &in_flight,
                    &results,
                    &config,
                    &last_request_time,
                    &rate_limit_until,
                )
                .await;

                {
                    let mut ifl = in_flight.lock().await;
                    ifl.remove(&task_id);
                }
            }
        });
    }

    async fn process_task<R: tauri::Runtime>(
        app_handle: &tauri::AppHandle<R>,
        pool: &sqlx::Pool<sqlx::Sqlite>,
        task: QueuedTask,
        queue: &Arc<RwLock<BinaryHeap<QueuedTask>>>,
        in_flight: &Arc<Mutex<HashSet<String>>>,
        results: &Arc<RwLock<HashMap<String, Result<Value, String>>>>,
        config: &Arc<RwLock<AiConfig>>,
        last_request_time: &Arc<RwLock<Instant>>,
        rate_limit_until: &Arc<RwLock<Option<Instant>>>,
    ) {
        let task_id = task.id.clone();

        Self::wait_for_rate_limit(config, last_request_time, rate_limit_until).await;

        let cfg = config.read().await.clone();

        if cfg.api_key.is_empty() || cfg.model.is_empty() {
            error!("AI not configured, cannot process task: {}", task_id);
            let mut r = results.write().await;
            r.insert(task_id, Err("AI not configured".to_string()));
            return;
        }

        let result = match &task.task {
            AiTask::Summarize { email_id, body_text } => {
                Self::call_summarize_api(&cfg, *email_id, body_text).await
            }
            AiTask::EnrichSender { address, snippets } => {
                Self::call_enrich_api(&cfg, address, snippets.clone()).await
            }
        };

        match result {
            Ok(response) => {
                debug!("AI task {} completed successfully", task_id);

                if let AiTask::Summarize { email_id, .. } = &task.task {
                    if let Some(summary) = response.get("summary").and_then(|s| s.as_str()) {
                        let _ = sqlx::query("UPDATE emails SET summary = ? WHERE id = ?")
                            .bind(summary)
                            .bind(email_id)
                            .execute(pool)
                            .await;

                        let sender_address: Option<String> =
                            sqlx::query_scalar("SELECT sender_address FROM emails WHERE id = ?")
                                .bind(email_id)
                                .fetch_optional(pool)
                                .await
                                .ok()
                                .flatten();

                        let _ = app_handle.emit(
                            "emails-updated",
                            serde_json::json!({
                                "type": "email-updated",
                                "payload": {
                                    "id": email_id,
                                    "address": sender_address,
                                    "summary": summary
                                }
                            }),
                        );

                        info!("Summary for email {} saved and event emitted", email_id);
                    }
                }

                let mut r = results.write().await;
                r.insert(task_id.clone(), Ok(response));
            }
            Err(e) => {
                if e.contains("429") || e.contains("rate limit") {
                    warn!("Rate limited on task {}, will retry", task_id);
                    let queued = QueuedTask {
                        priority: task.priority,
                        id: task_id.clone(),
                        task: task.task,
                        created_at: Instant::now(),
                    };
                    queue.write().await.push(queued);
                    let mut rlu = rate_limit_until.write().await;
                    *rlu = Some(Instant::now() + Duration::from_secs(30));
                } else {
                    error!("AI task {} failed: {}", task_id, e);
                    let mut r = results.write().await;
                    r.insert(task_id, Err(e));
                }
            }
        }

        let mut lrt = last_request_time.write().await;
        *lrt = Instant::now();
    }

    async fn wait_for_rate_limit(
        config: &Arc<RwLock<AiConfig>>,
        last_request_time: &Arc<RwLock<Instant>>,
        rate_limit_until: &Arc<RwLock<Option<Instant>>>,
    ) {
        loop {
            let rlu = *rate_limit_until.read().await;
            if let Some(until) = rlu {
                if Instant::now() < until {
                    let wait = until.duration_since(Instant::now());
                    debug!("Waiting for rate limit to reset: {:?}", wait);
                    sleep(wait).await;
                    continue;
                }
            }

            let cfg = config.read().await.clone();
            let lrt = *last_request_time.read().await;
            let min_interval = Duration::from_secs_f64(60.0 / cfg.requests_per_minute.max(1) as f64);

            if lrt.elapsed() < min_interval {
                let wait = min_interval - lrt.elapsed();
                debug!("Rate limiting: waiting {:?}", wait);
                sleep(wait).await;
            }
            break;
        }
    }

    async fn call_summarize_api(
        config: &AiConfig,
        email_id: i64,
        body_text: &str,
    ) -> Result<Value, String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

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
            "model": config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": format!("Email Content:\n{}", truncated_body)}
            ],
            "temperature": 0.3,
            "stream": false
        });

        let resp = shared_client()
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 429 {
                return Err(format!("Rate limited (429): {}", err_text));
            }
            return Err(format!("AI API error ({}): {}", status, err_text));
        }

        let response_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

        let summary = response_json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| format!("Unexpected AI response structure: {:?}", response_json))?
            .trim()
            .to_string();

        if !is_valid_summary(&summary) {
            warn!("AI produced an invalid summary for email {}: {}", email_id, summary);
            return Err("AI produced an invalid or low-quality summary".to_string());
        }

        Ok(json!({ "summary": summary, "email_id": email_id }))
    }

    async fn call_enrich_api(
        config: &AiConfig,
        address: &str,
        snippets: Vec<String>,
    ) -> Result<Value, String> {
        let url = format!("{}/chat/completions", config.base_url.trim_end_matches('/'));

        let system_prompt = r#"You are an expert at analyzing email sender information.
Based on the email snippets provided, extract the sender's information.
Return a JSON object with these fields:
- name: The sender's name if discoverable
- job_title: The sender's job title if discoverable
- company: The company they work for if discoverable
- bio: A brief description if available
- location: Geographic location if mentioned
- is_personal_email: true if this appears to be a personal email, false if business
- is_automated_mailer: true if this is an automated mailing system

Only include fields you are confident about. Use null for unknown fields."#;

        let body = json!({
            "model": config.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": format!("Sender email: {}\n\nEmail snippets:\n{}", address, snippets.join("\n---\n"))}
            ],
            "temperature": 0.3,
            "stream": false
        });

        let resp = shared_client()
            .post(&url)
            .header("Authorization", format!("Bearer {}", config.api_key))
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = resp.status();
        if !status.is_success() {
            let err_text = resp.text().await.unwrap_or_default();
            if status.as_u16() == 429 {
                return Err(format!("Rate limited (429): {}", err_text));
            }
            return Err(format!("AI API error ({}): {}", status, err_text));
        }

        let response_json: Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

        let content = response_json["choices"][0]["message"]["content"]
            .as_str()
            .ok_or_else(|| format!("Unexpected AI response structure: {:?}", response_json))?
            .trim()
            .to_string();

        let data: Value = serde_json::from_str(&content)
            .unwrap_or_else(|_| {
                let cleaned = content
                    .trim_start_matches("```json")
                    .trim_start_matches("```")
                    .trim_end_matches("```")
                    .trim();
                serde_json::from_str(cleaned).unwrap_or(json!({}))
            });

        Ok(json!({ "data": data, "address": address }))
    }
}

impl Default for AiController {
    fn default() -> Self {
        Self::new()
    }
}

fn is_valid_summary(summary: &str) -> bool {
    let s = summary.trim();
    if s.is_empty() || s.len() < 10 || s.ends_with('?') {
        return false;
    }

    let lower = s.to_lowercase();
    let failure_patterns = [
        "i cannot summarize",
        "i'm sorry",
        "i am sorry",
        "as an ai",
        "the provided text",
        "does not contain",
        "is too long",
        "the email is about",
        "this email discusses",
        "please provide",
        "certainly!",
        "here is a summary",
    ];

    for pattern in &failure_patterns {
        if lower.contains(pattern) {
            return false;
        }
    }

    s.lines().count() <= 2
}
