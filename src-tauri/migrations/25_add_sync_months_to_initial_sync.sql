-- Migration 25: Sync Months Setting
-- We'll keep syncLimitEnabled in DB for compatibility if needed, 
-- but the code will primarily rely on syncMonths.

INSERT OR IGNORE INTO settings (key, value) VALUES ('syncMonths', '3');
