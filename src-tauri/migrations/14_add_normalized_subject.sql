-- Add normalized_subject for better grouping
ALTER TABLE emails ADD COLUMN normalized_subject TEXT;

-- Create an index for faster grouping
CREATE INDEX IF NOT EXISTS idx_emails_normalized_subject ON emails(normalized_subject);
CREATE INDEX IF NOT EXISTS idx_emails_sender_address ON emails(sender_address);

-- Heuristic to populate normalized_subject for existing emails
-- We can't do complex regex in SQLite easily, but we can do some basic ones
-- This will be supplemented by Rust code
UPDATE emails SET normalized_subject = 
    LOWER(
        TRIM(
            REPLACE(
                REPLACE(
                    REPLACE(subject, 'Re: ', ''),
                    're: ', ''
                ),
                'Fwd: ', ''
            )
        )
    )
WHERE subject IS NOT NULL;
