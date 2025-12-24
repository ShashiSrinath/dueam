use md5;
use sha2::{Sha256, Digest};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct GravatarProfile {
    pub entry: Vec<GravatarEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GravatarEntry {
    #[serde(rename = "preferredUsername")]
    pub preferred_username: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    pub about_me: Option<String>,
    #[serde(rename = "currentLocation")]
    pub current_location: Option<String>,
    #[serde(rename = "profileBackground")]
    pub profile_background: Option<serde_json::Value>,
    pub urls: Option<Vec<GravatarUrl>>,
    pub photos: Option<Vec<GravatarPhoto>>,
    pub accounts: Option<Vec<GravatarAccount>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GravatarAccount {
    pub domain: String,
    pub display: Option<String>,
    pub url: String,
    pub userid: Option<String>,
    pub shortname: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GravatarUrl {
    pub value: String,
    pub title: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct GravatarPhoto {
    pub value: String,
    pub r#type: String,
}

pub fn get_email_hash(email: &str) -> String {
    let email = email.trim().to_lowercase();
    let hash = md5::compute(email.as_bytes());
    format!("{:x}", hash)
}

pub fn get_gravatar_url(email: &str) -> String {
    format!("https://www.gravatar.com/avatar/{}?d=404", get_email_hash(email))
}

pub fn get_gravatar_profile_url(email: &str) -> String {
    format!("https://www.gravatar.com/{}.json", get_email_hash(email))
}

pub fn get_favicon_url(domain: &str) -> String {
    format!("https://logo.clearbit.com/{}?size=128", domain)
}

pub fn extract_domain(email: &str) -> Option<String> {
    email.split('@').nth(1).map(|d| d.to_lowercase())
}

pub fn is_common_provider(domain: &str) -> bool {
    let common = [
        "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com", 
        "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com", "proton.me",
        "mail.com", "zoho.com", "gmx.com", "yandex.com", "mail.ru", "live.com",
        "msn.com", "qq.com", "163.com", "126.com"
    ];
    common.contains(&domain)
}

pub fn is_system_address(address: &str) -> bool {
    let local_part = address.split('@').next().unwrap_or("").to_lowercase();
    let bots = [
        "noreply", "no-reply", "notification", "notifications", "support", 
        "info", "hello", "alert", "alerts", "news", "newsletter", "bot", 
        "system", "security", "billing"
    ];
    bots.iter().any(|&b| local_part.contains(b))
}

pub fn get_github_user_url(username: &str) -> String {
    format!("https://api.github.com/users/{}", username)
}
