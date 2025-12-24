-- Add thread_id to emails table
ALTER TABLE emails ADD COLUMN thread_id TEXT;

-- Index for thread searching
CREATE INDEX IF NOT EXISTS idx_emails_thread_id ON emails(thread_id);

-- Try to populate thread_id based on message_id/in_reply_to for existing emails
-- This is a very basic heuristic. Real threading is better done in Rust.
UPDATE emails SET thread_id = COALESCE(in_reply_to, message_id) WHERE thread_id IS NULL AND (in_reply_to IS NOT NULL OR message_id IS NOT NULL);
