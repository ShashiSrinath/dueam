use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Sender {
    pub address: String,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub bio: Option<String>,
    pub location: Option<String>,
    pub github_handle: Option<String>,
    pub linkedin_handle: Option<String>,
    pub twitter_handle: Option<String>,
    pub website_url: Option<String>,
    pub is_verified: bool,
    pub is_personal_email: Option<bool>,
    pub is_automated_mailer: Option<bool>,
    pub is_contact: bool,
    pub account_email: Option<String>,
    pub last_synced_at: Option<DateTime<Utc>>,
    pub ai_last_enriched_at: Option<DateTime<Utc>>,
    pub last_enriched_at: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
pub struct Domain {
    pub domain: String,
    pub name: Option<String>,
    pub logo_url: Option<String>,
    pub description: Option<String>,
    pub website_url: Option<String>,
    pub location: Option<String>,
    pub headquarters: Option<String>,
    pub last_enriched_at: Option<DateTime<Utc>>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}
