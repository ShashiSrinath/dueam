use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImapSmtpAccount {
    pub id: Option<i64>,
    pub email: String,
    pub name: Option<String>,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_encryption: String, // "tls", "starttls", "none"
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_encryption: String, // "tls", "starttls", "none"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
}
