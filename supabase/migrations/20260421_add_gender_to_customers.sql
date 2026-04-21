ALTER TABLE customers ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('M', 'F'));
