-- Migration: Sender Enrichment & Domain Metadata
CREATE TABLE IF NOT EXISTS senders (
    address TEXT PRIMARY KEY,
    name TEXT,
    avatar_url TEXT,
    job_title TEXT,
    company TEXT,
    bio TEXT,
    location TEXT,
    github_handle TEXT,
    linkedin_handle TEXT,
    twitter_handle TEXT,
    website_url TEXT,
    is_verified BOOLEAN DEFAULT 0,
    last_enriched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS domains (
    domain TEXT PRIMARY KEY,
    name TEXT,
    logo_url TEXT,
    description TEXT,
    website_url TEXT,
    location TEXT,
    last_enriched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_senders_company ON senders(company);
