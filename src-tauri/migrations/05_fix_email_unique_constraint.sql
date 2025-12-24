-- Fix unique constraint on emails table to be per-folder instead of per-account.
-- IMAP UIDs are only unique within a folder.

-- 1. Create a temporary table with the correct schema
CREATE TABLE emails_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    folder_id INTEGER NOT NULL,
    remote_id TEXT NOT NULL,
    message_id TEXT,
    in_reply_to TEXT,
    subject TEXT,
    sender_name TEXT,
    sender_address TEXT NOT NULL,
    recipient_to TEXT,
    recipient_cc TEXT,
    recipient_bcc TEXT,
    date DATETIME NOT NULL,
    body_text TEXT,
    body_html TEXT,
    snippet TEXT,
    has_attachments BOOLEAN DEFAULT FALSE,
    flags TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE,
    UNIQUE(folder_id, remote_id)
);

-- 2. Copy data from the old table
-- Note: We might have existing duplicates for (folder_id, remote_id) if something went really wrong,
-- but the previous constraint was (account_id, remote_id), which is stricter than (folder_id, remote_id)
-- because account_id + remote_id implies folder_id + remote_id is also unique if one email only exists in one folder.
INSERT INTO emails_new (id, account_id, folder_id, remote_id, message_id, in_reply_to, subject, sender_name, sender_address, recipient_to, recipient_cc, recipient_bcc, date, body_text, body_html, snippet, has_attachments, flags, created_at)
SELECT id, account_id, folder_id, remote_id, message_id, in_reply_to, subject, sender_name, sender_address, recipient_to, recipient_cc, recipient_bcc, date, body_text, body_html, snippet, has_attachments, flags, created_at FROM emails;

-- 3. Drop the old table and rename the new one
DROP TABLE emails;
ALTER TABLE emails_new RENAME TO emails;

-- 4. Re-create indexes
CREATE INDEX idx_emails_account_id ON emails(account_id);
CREATE INDEX idx_emails_folder_id ON emails(folder_id);
CREATE INDEX idx_emails_date ON emails(date DESC);

-- 5. Re-create triggers for FTS (as they are dropped with the table)
CREATE TRIGGER emails_ai AFTER INSERT ON emails BEGIN
  INSERT INTO emails_fts(rowid, subject, sender_name, sender_address, body_text)
  VALUES (new.id, new.subject, new.sender_name, new.sender_address, new.body_text);
END;

CREATE TRIGGER emails_ad AFTER DELETE ON emails BEGIN
  INSERT INTO emails_fts(emails_fts, rowid, subject, sender_name, sender_address, body_text)
  VALUES('delete', old.id, old.subject, old.sender_name, old.sender_address, old.body_text);
END;

CREATE TRIGGER emails_au AFTER UPDATE ON emails BEGIN
  INSERT INTO emails_fts(emails_fts, rowid, subject, sender_name, sender_address, body_text)
  VALUES('delete', old.id, old.subject, old.sender_name, old.sender_address, old.body_text);
  INSERT INTO emails_fts(rowid, subject, sender_name, sender_address, body_text)
  VALUES (new.id, new.subject, new.sender_name, new.sender_address, new.body_text);
END;
