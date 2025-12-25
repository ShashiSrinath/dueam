-- Optimize existing threading backlog - Simplified to avoid locking UI
-- We just ensure indices are present for the background task to work fast
CREATE INDEX IF NOT EXISTS idx_emails_normalized_subject ON emails(normalized_subject);
CREATE INDEX IF NOT EXISTS idx_emails_sender_address ON emails(sender_address);