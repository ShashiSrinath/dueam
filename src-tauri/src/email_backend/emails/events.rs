use crate::email_backend::emails::commands::Email;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum EmailEvent {
    #[serde(rename = "email-added")]
    Added(Email),
    #[serde(rename = "email-updated")]
    Updated {
        id: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        address: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        flags: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        summary: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        thread_count: Option<i64>,
    },
    #[serde(rename = "emails-updated-bulk")]
    UpdatedBulk {
        ids: Vec<i64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        flags: Option<String>,
    },
    #[serde(rename = "email-removed")]
    Removed { id: i64 },
    #[serde(rename = "emails-removed-bulk")]
    RemovedBulk { ids: Vec<i64> },
}
