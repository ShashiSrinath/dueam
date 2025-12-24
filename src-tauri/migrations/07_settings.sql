CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', '"system"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('accentColor', '"blue"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('density', '"comfortable"');
INSERT OR IGNORE INTO settings (key, value) VALUES ('fontSize', '14');
INSERT OR IGNORE INTO settings (key, value) VALUES ('fontFamily', '"Inter"');
