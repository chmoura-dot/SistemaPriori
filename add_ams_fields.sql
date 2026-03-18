ALTER TABLE customers ADD COLUMN IF NOT EXISTS ams_password TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ams_password_expiry DATE;
