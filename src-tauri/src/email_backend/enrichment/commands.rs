use tauri::Manager;
use sqlx::SqlitePool;
use chrono::Utc;
use crate::email_backend::enrichment::types::{Sender, Domain};
use crate::email_backend::enrichment::providers::*;
use crate::email_backend::emails::commands::Email;

#[tauri::command]
pub async fn get_emails_by_sender<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    address: String,
    limit: u32,
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let emails = sqlx::query_as::<_, Email>(
        "SELECT id, account_id, folder_id, remote_id, message_id, subject, sender_name, sender_address, date, flags, snippet, has_attachments 
         FROM emails 
         WHERE sender_address = ? 
         ORDER BY date DESC 
         LIMIT ?"
    )
    .bind(&address)
    .bind(limit as i64)
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(emails)
}

#[tauri::command]
pub async fn get_sender_info<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    address: String,
) -> Result<Option<Sender>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let sender = sqlx::query_as::<_, Sender>("SELECT * FROM senders WHERE address = ?")
        .bind(&address)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(s) = sender {
        // If we have an avatar and it's not super old, return it
        // Otherwise, if avatar is missing or it's been more than 30 days, re-enrich
        let is_stale = match s.last_enriched_at {
            Some(last) => (Utc::now() - last).num_days() > 30,
            None => true,
        };

        if s.avatar_url.is_some() && !is_stale {
            return Ok(Some(s));
        }
    }

    // If not found or needs update, try enrichment
    let enriched = enrich_sender_internal(&app_handle, address).await?;
    Ok(Some(enriched))
}

#[tauri::command]
pub async fn get_domain_info<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    domain: String,
) -> Result<Option<Domain>, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let domain_info = sqlx::query_as::<_, Domain>("SELECT * FROM domains WHERE domain = ?")
        .bind(&domain)
        .fetch_optional(&*pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(domain_info)
}

async fn enrich_sender_internal<R: tauri::Runtime>(
    app_handle: &tauri::AppHandle<R>,
    address: String,
) -> Result<Sender, String> {
    let pool = app_handle.state::<SqlitePool>();
    
    let domain_name = extract_domain(&address);
    let mut avatar_url = Some(get_gravatar_url(&address));
    let mut company = None;
    
    // If it's a corporate system address (e.g. noreply@linkedin.com), 
    // we should prioritize the domain logo over a potentially missing gravatar.
    if let Some(d) = &domain_name {
        if !is_common_provider(d) && is_system_address(&address) {
            avatar_url = Some(get_favicon_url(d));
        }
    }
    let mut name = None;
    let mut bio = None;
    let mut location = None;
    let mut github_handle = None;
    let mut twitter_handle = None;
    let mut linkedin_handle = None;
    let mut website_url = None;

    // 0. Try to find a name from existing emails in the DB
    let existing_name: Option<(Option<String>,)> = sqlx::query_as(
        "SELECT sender_name FROM emails WHERE sender_address = ? AND sender_name IS NOT NULL LIMIT 1"
    )
    .bind(&address)
    .fetch_optional(&*pool)
    .await
    .unwrap_or(None);

    if let Some((n,)) = existing_name {
        name = n;
    }

    // 1. Fetch Gravatar Profile for advanced metadata
    let client = reqwest::Client::builder()
        .user_agent("DreamEmail/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(resp) = client.get(get_gravatar_profile_url(&address)).send().await {
        if resp.status().is_success() {
            if let Ok(profile) = resp.json::<GravatarProfile>().await {
                if let Some(entry) = profile.entry.first() {
                    if name.is_none() {
                        name = entry.display_name.clone();
                    }
                    bio = entry.about_me.clone();
                    location = entry.current_location.clone();
                    
                    // Helper to extract handle from URL
                    let extract_handle = |u: &str| -> Option<String> {
                        u.trim_end_matches('/')
                         .split('/')
                         .last()
                         .map(|s| s.to_string())
                    };

                    // Process dedicated accounts first (more reliable)
                    if let Some(accounts) = &entry.accounts {
                        for acc in accounts {
                            match acc.shortname.as_str() {
                                "github" => github_handle = extract_handle(&acc.url),
                                "twitter" => twitter_handle = extract_handle(&acc.url),
                                "linkedin" => linkedin_handle = extract_handle(&acc.url),
                                _ => {}
                            }
                        }
                    }

                    // Fallback to URLs if still missing
                    if let Some(urls) = &entry.urls {
                        for url in urls {
                            let val = url.value.to_lowercase();
                            if github_handle.is_none() && val.contains("github.com/") {
                                github_handle = extract_handle(&url.value);
                            } else if twitter_handle.is_none() && (val.contains("twitter.com/") || val.contains("x.com/")) {
                                twitter_handle = extract_handle(&url.value);
                            } else if linkedin_handle.is_none() && val.contains("linkedin.com/in/") {
                                linkedin_handle = extract_handle(&url.value);
                            } else if website_url.is_none() {
                                website_url = Some(url.value.clone());
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Domain Intelligence
    if let Some(d) = &domain_name {
        if !is_common_provider(d) {
            company = Some(d.clone());
            
            // Try to enrich domain if not exists
            let domain_data: Option<Domain> = sqlx::query_as("SELECT * FROM domains WHERE domain = ?")
                .bind(d)
                .fetch_optional(&*pool)
                .await
                .unwrap_or(None);

            if domain_data.is_none() {
                // Heuristic: Use clearbit favicon and set up placeholder
                let logo_url = get_favicon_url(d);
                let _ = sqlx::query(
                    "INSERT INTO domains (domain, logo_url, last_enriched_at) VALUES (?, ?, ?)"
                )
                .bind(d)
                .bind(logo_url)
                .bind(Utc::now())
                .execute(&*pool)
                .await;
            }
        }
    }

    let now = Utc::now();
    let is_verified = github_handle.is_some() || twitter_handle.is_some() || linkedin_handle.is_some();
    
    let sender = Sender {
        address: address.clone(),
        name,
        avatar_url,
        job_title: None,
        company,
        bio,
        location,
        github_handle,
        linkedin_handle,
        twitter_handle,
        website_url,
        is_verified,
        last_enriched_at: Some(now),
        created_at: Some(now),
        updated_at: Some(now),
    };

    sqlx::query(
        "INSERT INTO senders (
            address, name, avatar_url, company, bio, location, 
            github_handle, twitter_handle, linkedin_handle, website_url, 
            is_verified, last_enriched_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
            name = COALESCE(excluded.name, senders.name),
            avatar_url = excluded.avatar_url,
            company = COALESCE(excluded.company, senders.company),
            bio = excluded.bio,
            location = excluded.location,
            github_handle = excluded.github_handle,
            twitter_handle = excluded.twitter_handle,
            linkedin_handle = excluded.linkedin_handle,
            website_url = excluded.website_url,
            is_verified = excluded.is_verified,
            last_enriched_at = excluded.last_enriched_at,
            updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&sender.address)
    .bind(&sender.name)
    .bind(&sender.avatar_url)
    .bind(&sender.company)
    .bind(&sender.bio)
    .bind(&sender.location)
    .bind(&sender.github_handle)
    .bind(&sender.twitter_handle)
    .bind(&sender.linkedin_handle)
    .bind(&sender.website_url)
    .bind(sender.is_verified)
    .bind(sender.last_enriched_at)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(sender)
}

pub async fn proactive_enrichment<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();
    
    // Find unique senders from emails that are NOT in senders table OR have no avatar
    let addresses: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT e.sender_address 
         FROM emails e 
         LEFT JOIN senders s ON e.sender_address = s.address 
         WHERE s.address IS NULL OR s.avatar_url IS NULL
         LIMIT 100" // Process in batches to avoid overwhelming APIs
    )
    .fetch_all(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    if addresses.is_empty() {
        return Ok(());
    }

    log::info!("Proactively enriching {} senders", addresses.len());

    for address in addresses {
        // We ignore errors for individual senders to keep the loop going
        let _ = enrich_sender_internal(app_handle, address).await;
        // Small delay to be polite to APIs
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    Ok(())
}
