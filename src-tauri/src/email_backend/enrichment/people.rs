use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct PeopleEnrichmentData {
    pub name: Option<String>,
    pub avatar_url: Option<String>,
    pub job_title: Option<String>,
    pub company: Option<String>,
    pub bio: Option<String>,
    pub location: Option<String>,
}

#[async_trait]
pub trait PeopleProvider: Send + Sync {
    async fn enrich(&self, address: &str) -> Result<Option<PeopleEnrichmentData>, String>;
    fn name(&self) -> &str;
}

pub struct GooglePeopleProvider {
    pub accounts: Vec<(String, String)>, // (email, access_token)
}

pub async fn get_google_avatar_url(address: &str, tokens: &[(String, String)]) -> Option<String> {
    let client = Client::new();
    for (account_email, token) in tokens {
        log::debug!(
            "Attempting get_google_avatar_url for {} using account {}",
            address,
            account_email
        );
        // We try to search for the contact to get their photo
        let url = "https://people.googleapis.com/v1/people:searchContacts";
        let resp = client
            .get(url)
            .query(&[
                ("query", address),
                ("readMask", "photos"),
                (
                    "sources",
                    "SEARCH_SOURCE_TYPE_CONTACT,SEARCH_SOURCE_TYPE_DIRECTORY",
                ),
            ])
            .bearer_auth(token)
            .send()
            .await;

        match resp {
            Ok(resp) => {
                if resp.status().is_success() {
                    match resp.json::<GooglePeopleSearchResponse>().await {
                        Ok(search_resp) => {
                            if let Some(results) = search_resp.results {
                                if let Some(result) = results.first() {
                                    if let Some(photo) =
                                        result.person.photos.as_ref().and_then(|p| p.first())
                                    {
                                        if let Some(url) = &photo.url {
                                            log::debug!(
                                                "Found avatar URL for {} in Google Contacts: {}",
                                                address,
                                                url
                                            );
                                            return Some(url.clone());
                                        }
                                    }
                                }
                            }
                        }
                        Err(e) => log::error!(
                            "Failed to parse Google People search response for avatar fallback: {}",
                            e
                        ),
                    }
                } else {
                    log::warn!(
                        "Google People search for avatar fallback failed with status {}: {}",
                        resp.status(),
                        account_email
                    );
                }
            }
            Err(e) => log::error!(
                "Google People search request failed for avatar fallback: {}",
                e
            ),
        }
    }
    None
}

#[derive(Deserialize, Debug)]
struct GooglePerson {
    names: Option<Vec<GooglePersonName>>,
    photos: Option<Vec<GooglePersonPhoto>>,
    organizations: Option<Vec<GooglePersonOrganization>>,
    biographies: Option<Vec<GooglePersonBiography>>,
    #[serde(rename = "emailAddresses")]
    email_addresses: Option<Vec<GooglePersonEmailAddress>>,
}

#[derive(Deserialize)]
struct GooglePeopleSearchResponse {
    results: Option<Vec<GooglePeopleSearchResult>>,
}

#[derive(Deserialize)]
struct GooglePeopleSearchResult {
    person: GooglePerson,
}

#[derive(Deserialize, Debug)]
struct GooglePersonName {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GooglePersonPhoto {
    url: Option<String>,
    metadata: Option<GooglePhotoMetadata>,
}

#[derive(Deserialize, Debug)]
struct GooglePhotoMetadata {
    primary: Option<bool>,
    source: Option<GoogleSource>,
}

#[derive(Deserialize, Debug)]
struct GoogleSource {
    #[serde(rename = "type")]
    source_type: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GooglePersonOrganization {
    title: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GooglePersonBiography {
    value: Option<String>,
}

#[derive(Deserialize, Debug)]
struct GooglePersonEmailAddress {
    value: Option<String>,
}

#[async_trait]
impl PeopleProvider for GooglePeopleProvider {
    fn name(&self) -> &str {
        "Google People API"
    }

    async fn enrich(&self, address: &str) -> Result<Option<PeopleEnrichmentData>, String> {
        let client = Client::new();
        log::info!(
            "Attempting Google People API enrichment for {} with {} accounts",
            address,
            self.accounts.len()
        );

        for (account_email, token) in &self.accounts {
            // If the address matches the account email, we can use people/me
            if address.to_lowercase() == account_email.to_lowercase() {
                log::info!(
                    "Address {} matches account email {}, trying people/me",
                    address,
                    account_email
                );
                let url = "https://people.googleapis.com/v1/people/me";
                let resp = client
                    .get(url)
                    .query(&[(
                        "personFields",
                        "names,photos,organizations,biographies,emailAddresses",
                    )])
                    .bearer_auth(token)
                    .send()
                    .await;

                match resp {
                    Ok(resp) => {
                        let status = resp.status();
                        if status.is_success() {
                            match resp.json::<GooglePerson>().await {
                                Ok(person) => {
                                    log::debug!(
                                        "Successfully fetched people/me for {}: {:?}",
                                        address,
                                        person
                                    );
                                    let mut data = PeopleEnrichmentData::default();
                                    data.name = person
                                        .names
                                        .as_ref()
                                        .and_then(|n| n.first())
                                        .and_then(|n| n.display_name.clone());
                                    data.avatar_url = person
                                        .photos
                                        .as_ref()
                                        .and_then(|p| p.first())
                                        .and_then(|p| p.url.clone());
                                    if let Some(org) =
                                        person.organizations.as_ref().and_then(|o| o.first())
                                    {
                                        data.job_title = org.title.clone();
                                        data.company = org.name.clone();
                                    }
                                    data.bio = person
                                        .biographies
                                        .as_ref()
                                        .and_then(|b| b.first())
                                        .and_then(|b| b.value.clone());
                                    log::info!("Successfully enriched {} using people/me. Avatar found: {}", address, data.avatar_url.is_some());
                                    return Ok(Some(data));
                                }
                                Err(e) => log::error!(
                                    "Failed to parse Google people/me response for {}: {}",
                                    address,
                                    e
                                ),
                            }
                        } else {
                            log::warn!("Google people/me request for {} failed with status {} for account {}", address, status, account_email);
                        }
                    }
                    Err(e) => log::error!("Google people/me request failed for {}: {}", address, e),
                }
            }

            // Fallback to searching contacts
            let url = "https://people.googleapis.com/v1/people:searchContacts";

            let resp = client
                .get(url)
                .query(&[
                    ("query", address),
                    (
                        "readMask",
                        "names,photos,organizations,biographies,emailAddresses",
                    ),
                    (
                        "sources",
                        "SEARCH_SOURCE_TYPE_CONTACT,SEARCH_SOURCE_TYPE_DIRECTORY",
                    ),
                ])
                .bearer_auth(token)
                .send()
                .await;

            match resp {
                Ok(resp) => {
                    let status = resp.status();
                    if status.is_success() {
                        let text = resp.text().await.map_err(|e| e.to_string())?;
                        log::debug!(
                            "Google People API search response for {}: {}",
                            address,
                            text
                        );
                        let search_resp: GooglePeopleSearchResponse = serde_json::from_str(&text)
                            .map_err(|e| {
                            log::error!(
                                "Failed to parse Google People API response: {}. Text: {}",
                                e,
                                text
                            );
                            e.to_string()
                        })?;

                        if let Some(results) = search_resp.results {
                            log::info!("Found {} results for {} in Google Contacts/Directory using account {}", results.len(), address, account_email);
                            // Find the result that matches the email address exactly if possible
                            let best_match = results
                                .iter()
                                .find(|r| {
                                    r.person.email_addresses.as_ref().map_or(false, |emails| {
                                        emails.iter().any(|e| {
                                            e.value.as_ref().map_or(false, |v| {
                                                v.to_lowercase() == address.to_lowercase()
                                            })
                                        })
                                    })
                                })
                                .or_else(|| results.first());

                            if let Some(result) = best_match {
                                let person = &result.person;
                                let mut data = PeopleEnrichmentData::default();

                                data.name = person
                                    .names
                                    .as_ref()
                                    .and_then(|n| n.first())
                                    .and_then(|n| n.display_name.clone());
                                data.avatar_url = person
                                    .photos
                                    .as_ref()
                                    .and_then(|p| p.first())
                                    .and_then(|p| p.url.clone());

                                if let Some(org) =
                                    person.organizations.as_ref().and_then(|o| o.first())
                                {
                                    data.job_title = org.title.clone();
                                    data.company = org.name.clone();
                                }

                                data.bio = person
                                    .biographies
                                    .as_ref()
                                    .and_then(|b| b.first())
                                    .and_then(|b| b.value.clone());

                                log::info!("Successfully enriched {} from Google Contacts/Directory search. Avatar found: {}", address, data.avatar_url.is_some());
                                return Ok(Some(data));
                            }
                        } else {
                            log::info!(
                                "No results returned from searchContacts for {} using account {}",
                                address,
                                account_email
                            );
                        }
                    } else if status.as_u16() == 401 {
                        log::warn!(
                            "Google People API token for {} failed with 401",
                            account_email
                        );
                    } else {
                        log::warn!(
                            "Google People API search for {} failed with status {} for account {}",
                            address,
                            status,
                            account_email
                        );
                    }
                }
                Err(e) => {
                    log::error!(
                        "Google People API search request failed for {} using account {}: {}",
                        address,
                        account_email,
                        e
                    );
                    continue;
                }
            }
        }

        log::info!(
            "Google People API enrichment returned no data for {}",
            address
        );
        Ok(None)
    }
}

pub struct MicrosoftPeopleProvider {
    pub access_tokens: Vec<String>,
}

#[async_trait]
impl PeopleProvider for MicrosoftPeopleProvider {
    fn name(&self) -> &str {
        "Microsoft People API"
    }

    async fn enrich(&self, _address: &str) -> Result<Option<PeopleEnrichmentData>, String> {
        // Placeholder for future implementation
        Ok(None)
    }
}
