-- Normalize existing email dates to UTC RFC3339 format for consistent sorting
UPDATE emails SET date = strftime('%Y-%m-%dT%H:%M:%SZ', date) WHERE date NOT LIKE '%Z';
