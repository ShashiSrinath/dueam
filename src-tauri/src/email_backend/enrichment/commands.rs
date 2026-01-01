use tauri::{Manager, Emitter};
use sqlx::SqlitePool;
use chrono::Utc;
use std::collections::HashMap;
use crate::email_backend::enrichment::types::{Sender, Domain};
use crate::email_backend::enrichment::providers::*;
use crate::email_backend::enrichment::people::*;
use crate::email_backend::accounts::manager::AccountManager;
use crate::email_backend::emails::commands::Email;

#[tauri::command]
pub async fn get_emails_by_sender<R: tauri::Runtime>(
    app_handle: tauri::AppHandle<R>,
    address: String,
    limit: u32,
) -> Result<Vec<Email>, String> {
    let pool = app_handle.state::<SqlitePool>();

    let emails = sqlx::query_as::<_, Email>(
        "SELECT id, account_id, folder_id, remote_id, message_id, thread_id, 1 as thread_count, in_reply_to, references_header, subject, sender_name, sender_address, recipient_to, date, flags, snippet, has_attachments,
         (subject LIKE 'Re:%' OR subject LIKE 're:%' OR in_reply_to IS NOT NULL) as is_reply,
         (subject LIKE 'Fwd:%' OR subject LIKE 'fwd:%' OR subject LIKE 'Fw:%' OR subject LIKE 'fw:%') as is_forward
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
    manual_trigger: Option<bool>,
) -> Result<Option<Sender>, String> {
    log::info!("get_sender_info called for {} (manual={:?})", address, manual_trigger);
    let pool = app_handle.state::<SqlitePool>();
    let manual = manual_trigger.unwrap_or(false);
    
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

        // If manual trigger is on, we check if AI enrichment has EVER been done
        let needs_manual_ai = manual && s.ai_last_enriched_at.is_none();

        if s.avatar_url.is_some() && !is_stale && !needs_manual_ai {
            log::info!("Returning cached sender info for {}", address);
            return Ok(Some(s));
        }
        log::info!("Sender info for {} needs update (stale={}, manual_ai={})", address, is_stale, needs_manual_ai);
    } else {
        log::info!("Sender {} not found in DB, enriching", address);
    }

    // If not found or needs update, try enrichment
    let enriched = enrich_sender_internal(&app_handle, address, manual).await?;
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
    manual_trigger: bool,
) -> Result<Sender, String> {
    log::info!("Starting enrichment for {} (manual={})", address, manual_trigger);
    let pool = app_handle.state::<SqlitePool>();

    let domain_name = extract_domain(&address);
    let mut avatar_url = None;
    let mut company = None;

    // 0. Preliminary Domain Intelligence for system addresses
    // If it's a corporate system address (e.g. noreply@linkedin.com),
    // we should prioritize the domain logo.
    if let Some(d) = &domain_name {
        if !is_common_provider(d) && is_system_address(&address) {
            let root_domain = get_root_domain(d);
            avatar_url = Some(get_favicon_url(&root_domain));
        }
    }
    let mut name = None;
    let mut bio = None;
    let mut location = None;
    let mut job_title = None;
    let mut ai_last_enriched_at = None;
    let mut github_handle = None;
    let mut twitter_handle = None;
    let mut linkedin_handle = None;
    let mut website_url = None;
    let mut is_personal_email: Option<bool> = None;
    let mut is_automated_mailer: Option<bool> = None;

    // 0. Collect tokens and info for People API enrichment
    let mut google_accounts = Vec::new();
    let mut own_info = std::collections::HashMap::new(); // email -> (name, picture)
    if let Ok(manager) = AccountManager::new(app_handle).await {
        if let Ok(registry) = manager.load().await {
            for a in &registry.accounts {
                match a {
                    crate::email_backend::accounts::manager::Account::Google(g) => {
                        if let Some(t) = &g.access_token {
                            google_accounts.push((g.email.clone(), t.clone()));
                        }
                        own_info.insert(g.email.to_lowercase(), (g.name.clone(), g.picture.clone()));
                    }
                    crate::email_backend::accounts::manager::Account::Microsoft(m) => {
                        // Microsoft also uses access tokens, could be used for People API in future
                        own_info.insert(m.email.to_lowercase(), (m.name.clone(), m.picture.clone()));
                    }
                    crate::email_backend::accounts::manager::Account::ImapSmtp(i) => {
                        own_info.insert(i.email.to_lowercase(), (i.name.clone(), None));
                    }
                }
            }
        }
    }

    // 0a. Use own account info if available
    if let Some((own_name, own_picture)) = own_info.get(&address.to_lowercase()) {
        if name.is_none() { name = own_name.clone(); }
        if avatar_url.is_none() { avatar_url = own_picture.clone(); }
        is_personal_email = Some(true);
    }

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

    // 1. People API Enrichment (Google, Microsoft, etc.)
    // We try this first because it's highly accurate for people we actually interact with.
    if !is_system_address(&address) && !google_accounts.is_empty() {
        let google_provider = GooglePeopleProvider { accounts: google_accounts.clone() };
        match google_provider.enrich(&address).await {
            Ok(Some(people_data)) => {
                log::info!("Enriched {} using Google People API", address);
                if let Some(n) = people_data.name { name = Some(n); }
                if let Some(av) = people_data.avatar_url { avatar_url = Some(av); }
                if let Some(jt) = people_data.job_title { job_title = Some(jt); }
                if let Some(c) = people_data.company { company = Some(c); }
                if let Some(b) = people_data.bio { bio = Some(b); }
                if let Some(loc) = people_data.location { location = Some(loc); }
                is_personal_email = Some(true);
            }
            Ok(None) => {
                log::info!("Google People API returned no results for {}", address);
            }
            Err(e) => {
                log::error!("Google People API enrichment failed for {}: {}", address, e);
            }
        }
    }

    // 1b. Google-specific profile photo fallback for Gmail addresses
    if avatar_url.is_none() {
        if let Some(d) = &domain_name {
            if (d == "gmail.com" || d == "googlemail.com") && !google_accounts.is_empty() {
                log::info!("Using Google People API photo fallback for {}", address);
                avatar_url = get_google_avatar_url(&address, &google_accounts).await;
            }
        }
    }

    // 2. Fetch Gravatar Profile for advanced metadata
    let client = reqwest::Client::builder()
        .user_agent("Dueam/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    if let Ok(resp) = client.get(get_gravatar_profile_url(&address)).send().await {
        if resp.status().is_success() {
            if let Ok(profile) = resp.json::<GravatarProfile>().await {
                if let Some(entry) = profile.entry.first() {
                    if name.is_none() {
                        name = entry.display_name.clone();
                    }
                    if bio.is_none() {
                        bio = entry.about_me.clone();
                    }
                    if location.is_none() {
                        location = entry.current_location.clone();
                    }

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

    // 3. Domain Intelligence
    if let Some(d) = &domain_name {
        if !is_common_provider(d) {
            let root_domain = get_root_domain(d);
            company = Some(root_domain.clone());

            // Heuristic: Always update/insert domain info to ensure we use the latest provider (e.g. Google instead of Clearbit)
            let logo_url = get_favicon_url(&root_domain);
            let _ = sqlx::query(
                "INSERT INTO domains (domain, logo_url, last_enriched_at)
                 VALUES (?, ?, ?)
                 ON CONFLICT(domain) DO UPDATE SET
                    logo_url = excluded.logo_url,
                    last_enriched_at = excluded.last_enriched_at"
            )
            .bind(&root_domain)
            .bind(logo_url)
            .bind(Utc::now())
            .execute(&*pool)
            .await;
        }
    }

    // 4. AI Enrichment (optional and sparing)
    let settings: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM settings WHERE key IN ('aiEnabled', 'aiSenderEnrichmentEnabled')")
        .fetch_all(&*pool)
        .await
        .unwrap_or_default();

    let settings_map: HashMap<String, String> = settings.into_iter().collect();
    let ai_enabled = settings_map.get("aiEnabled").map(|v| v.as_str()).unwrap_or("false") == "true";
    let ai_sender_enrichment_enabled = settings_map.get("aiSenderEnrichmentEnabled").map(|v| v.as_str()).unwrap_or("true") == "true";

    // Check if we already have AI data to avoid redundant calls
    let existing_ai_data: Option<(Option<String>, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
        "SELECT job_title, ai_last_enriched_at FROM senders WHERE address = ?"
    )
    .bind(&address)
    .fetch_optional(&*pool)
    .await
    .unwrap_or(None);

    log::info!("AI enrichment status - global: {}, sender: {}", ai_enabled, ai_sender_enrichment_enabled);

    if ai_enabled && ai_sender_enrichment_enabled {
        let (existing_job, last_ai_run) = existing_ai_data.unwrap_or((None, None));

        // Sparsity logic:
        // Run AI enrichment ONLY if:
        // 1. We have no job title yet
        // 2. OR the last AI run was more than 90 days ago (LLM data changes slowly)
        let mut needs_ai = existing_job.is_none() || match last_ai_run {
            Some(last) => (Utc::now() - last).num_days() > 90,
            None => true,
        };

        // Date-based optimization for automatic triggers
        if !manual_trigger && needs_ai {
            // Check if this sender has any emails newer than account_creation - 14 days
            let is_recent: (bool,) = sqlx::query_as(
                "SELECT EXISTS(
                    SELECT 1 FROM emails e
                    JOIN accounts a ON e.account_id = a.id
                    WHERE e.sender_address = ?
                      AND datetime(e.date) > datetime(a.created_at, '-14 days')
                 )"
            )
            .bind(&address)
            .fetch_one(&*pool)
            .await
            .unwrap_or((false,));

            if !is_recent.0 {
                log::info!("Skipping automatic AI enrichment for {} - no recent emails", address);
                needs_ai = false;
            }
        }

        log::info!("Need ai running ai for : {} (needs_ai={}, manual={})", &address, needs_ai, manual_trigger);

        if needs_ai || (manual_trigger && last_ai_run.is_none()) {
            // Fetch last 5 email snippets for this sender
            let snippets: Vec<String> = sqlx::query_scalar(
                "SELECT snippet FROM emails WHERE sender_address = ? AND snippet IS NOT NULL ORDER BY date DESC LIMIT 5"
            )
            .bind(&address)
            .fetch_all(&*pool)
            .await
            .unwrap_or_default();

            if !snippets.is_empty() {
                log::info!("Sparingly triggering AI enrichment for {}", address);
                if let Ok(ai_data) = crate::email_backend::llm::enrichment::enrich_sender_with_ai(app_handle, &address, snippets).await {
                    if name.is_none() {
                        if let Some(n) = ai_data["name"].as_str() {
                            name = Some(n.to_string());
                        }
                    }
                    if job_title.is_none() {
                        if let Some(jt) = ai_data["job_title"].as_str() {
                            job_title = Some(jt.to_string());
                        }
                    }
                    if let Some(c) = ai_data["company"].as_str() {
                        if company.is_none() {
                            company = Some(c.to_string());
                        }
                    }
                    if let Some(b) = ai_data["bio"].as_str() {
                        if bio.is_none() {
                            bio = Some(b.to_string());
                        }
                    }
                    if location.is_none() {
                        if let Some(loc) = ai_data["location"].as_str() {
                            location = Some(loc.to_string());
                        }
                    }
                    if is_personal_email.is_none() {
                        if let Some(is_personal) = ai_data["is_personal_email"].as_bool() {
                            is_personal_email = Some(is_personal);
                        }
                    }
                    if let Some(is_automated) = ai_data["is_automated_mailer"].as_bool() {
                        is_automated_mailer = Some(is_automated);
                    }
                    ai_last_enriched_at = Some(Utc::now());
                }
            }
        } else {
            job_title = existing_job;
            ai_last_enriched_at = last_ai_run;
        }
    }

    // 5. Final Fallback: Gravatar if still no avatar found
    if avatar_url.is_none() {
        avatar_url = Some(get_gravatar_url(&address));
    }

    let now = Utc::now();
    let is_verified = github_handle.is_some() || twitter_handle.is_some() || linkedin_handle.is_some();

    let sender = Sender {
        address: address.clone(),
        name,
        avatar_url,
        job_title,
        company,
        bio,
        location,
        github_handle,
        linkedin_handle,
        twitter_handle,
        website_url,
        is_verified,
        is_personal_email,
        is_automated_mailer,
        ai_last_enriched_at,
        last_enriched_at: Some(now),
        created_at: Some(now),
        updated_at: Some(now),
    };

    sqlx::query(
        "INSERT INTO senders (
            address, name, avatar_url, job_title, company, bio, location,
            github_handle, twitter_handle, linkedin_handle, website_url,
            is_verified, is_personal_email, is_automated_mailer, ai_last_enriched_at, last_enriched_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(address) DO UPDATE SET
            name = COALESCE(excluded.name, senders.name),
            avatar_url = excluded.avatar_url,
            job_title = COALESCE(excluded.job_title, senders.job_title),
            company = COALESCE(excluded.company, senders.company),
            bio = COALESCE(excluded.bio, senders.bio),
            location = excluded.location,
            github_handle = excluded.github_handle,
            twitter_handle = excluded.twitter_handle,
            linkedin_handle = excluded.linkedin_handle,
            website_url = excluded.website_url,
            is_verified = excluded.is_verified,
            is_personal_email = COALESCE(excluded.is_personal_email, senders.is_personal_email),
            is_automated_mailer = COALESCE(excluded.is_automated_mailer, senders.is_automated_mailer),
            ai_last_enriched_at = COALESCE(excluded.ai_last_enriched_at, senders.ai_last_enriched_at),
            last_enriched_at = excluded.last_enriched_at,
            updated_at = CURRENT_TIMESTAMP"
    )
    .bind(&sender.address)
    .bind(&sender.name)
    .bind(&sender.avatar_url)
    .bind(&sender.job_title)
    .bind(&sender.company)
    .bind(&sender.bio)
    .bind(&sender.location)
    .bind(&sender.github_handle)
    .bind(&sender.twitter_handle)
    .bind(&sender.linkedin_handle)
    .bind(&sender.website_url)
    .bind(sender.is_verified)
    .bind(sender.is_personal_email)
    .bind(sender.is_automated_mailer)
    .bind(sender.ai_last_enriched_at)
    .bind(sender.last_enriched_at)
    .execute(&*pool)
    .await
    .map_err(|e| e.to_string())?;

    // Emit event so the frontend can refresh
    let _ = app_handle.emit("sender-updated", &sender.address);

    Ok(sender)
}

pub async fn proactive_enrichment<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) -> Result<(), String> {
    let pool = app_handle.state::<SqlitePool>();

    // Find unique senders from emails that are NOT in senders table OR have no avatar OR use the old Clearbit provider
    // AND have at least one email newer than account_creation - 14 days
    let addresses: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT e.sender_address
         FROM emails e
         JOIN accounts a ON e.account_id = a.id
         LEFT JOIN senders s ON e.sender_address = s.address
         WHERE (s.address IS NULL
            OR s.avatar_url IS NULL
            OR s.avatar_url LIKE '%clearbit.com%')
           AND datetime(e.date) > datetime(a.created_at, '-14 days')
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
        let _ = enrich_sender_internal(app_handle, address, false).await;
        // Small delay to be polite to APIs
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    Ok(())
}
