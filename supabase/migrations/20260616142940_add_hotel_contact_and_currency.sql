
-- Add contact details and currency to hotels
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'IQD'));

-- Add phone to profiles for owner contact info
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone TEXT;
