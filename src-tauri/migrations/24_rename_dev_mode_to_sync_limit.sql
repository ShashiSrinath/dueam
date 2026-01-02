-- Rename devMode to syncLimitEnabled
INSERT OR IGNORE INTO settings (key, value)
SELECT 'syncLimitEnabled', value FROM settings WHERE key = 'devMode';

DELETE FROM settings WHERE key = 'devMode';

-- Ensure syncLimitEnabled has a default if it didn't exist for some reason
INSERT OR IGNORE INTO settings (key, value) VALUES ('syncLimitEnabled', 'false');

-- Add syncMonths setting
INSERT OR IGNORE INTO settings (key, value) VALUES ('syncMonths', '3');
