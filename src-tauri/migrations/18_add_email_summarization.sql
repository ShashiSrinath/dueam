INSERT OR IGNORE INTO settings (key, value) VALUES ('aiSummarizationEnabled', 'false');

-- Add summary column to emails table if it doesn't exist
ALTER TABLE emails ADD COLUMN summary TEXT;
