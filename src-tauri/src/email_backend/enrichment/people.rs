use serde::{Deserialize, Serialize};
use async_trait::async_trait;
use reqwest::Client;

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
    pub access_tokens: Vec<String>,
}

#[derive(Deserialize)]
struct GooglePeopleSearchResponse {
    results: Option<Vec<GooglePeopleSearchResult>>,
}

#[derive(Deserialize)]
struct GooglePeopleSearchResult {
    person: GooglePerson,
}

#[derive(Deserialize)]
struct GooglePerson {
    names: Option<Vec<GooglePersonName>>,
    photos: Option<Vec<GooglePersonPhoto>>,
    organizations: Option<Vec<GooglePersonOrganization>>,
    biographies: Option<Vec<GooglePersonBiography>>,
    #[serde(rename = "emailAddresses")]
    email_addresses: Option<Vec<GooglePersonEmailAddress>>,
}

#[derive(Deserialize)]
struct GooglePersonName {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct GooglePersonPhoto {
    url: Option<String>,
}

#[derive(Deserialize)]
struct GooglePersonOrganization {
    title: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct GooglePersonBiography {
    value: Option<String>,
}

#[derive(Deserialize)]
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

        for token in &self.access_tokens {
            // https://developers.google.com/people/api/rest/v1/people/searchContacts
            let url = "https://people.googleapis.com/v1/people:searchContacts";

            let resp = client
                .get(url)
                .query(&[
                    ("query", address),
                    ("readMask", "names,photos,organizations,biographies,emailAddresses"),
                ])
                .bearer_auth(token)
                .send()
                .await;

            match resp {
                Ok(resp) if resp.status().is_success() => {
                    let search_resp: GooglePeopleSearchResponse = resp.json().await.map_err(|e| e.to_string())?;
                    if let Some(results) = search_resp.results {
                        // Find the result that matches the email address exactly if possible
                        let best_match = results.into_iter().find(|r| {
                            r.person.email_addresses.as_ref().map_or(false, |emails| {
                                emails.iter().any(|e| e.value.as_ref().map_or(false, |v| v.to_lowercase() == address.to_lowercase()))
                            })
                        });

                        if let Some(result) = best_match {
                            let person = result.person;
                            let mut data = PeopleEnrichmentData::default();
                            
                            data.name = person.names.and_then(|mut n| if n.is_empty() { None } else { Some(n.remove(0)) }).and_then(|n| n.display_name);
                            data.avatar_url = person.photos.and_then(|mut p| if p.is_empty() { None } else { Some(p.remove(0)) }).and_then(|p| p.url);
                            
                            if let Some(org) = person.organizations.and_then(|mut o| if o.is_empty() { None } else { Some(o.remove(0)) }) {
                                data.job_title = org.title;
                                data.company = org.name;
                            }
                            
                            data.bio = person.biographies.and_then(|mut b| if b.is_empty() { None } else { Some(b.remove(0)) }).and_then(|b| b.value);
                            
                            return Ok(Some(data));
                        }
                    }
                }
                _ => continue, // Try next token if this one fails (e.g. 401)
            }
        }

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
