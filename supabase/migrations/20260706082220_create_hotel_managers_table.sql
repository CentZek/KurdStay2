/*
# Create hotel_managers join table

1. New Tables
   - `hotel_managers` - links hotels to their manager profiles (many-to-many)
     - `id` (uuid, primary key)
     - `hotel_id` (uuid, references hotels)
     - `profile_id` (uuid, references profiles)
     - `created_at` (timestamptz)
   - Unique constraint on (hotel_id, profile_id) to prevent duplicates

2. Schema Changes
   - Adds `plain_password` column to profiles for admin credential visibility

3. Data Migration
   - Copies existing owner_id associations from hotels into hotel_managers

4. Security
   - RLS enabled with permissive policies (matches existing app pattern)
*/

-- Create the join table
CREATE TABLE IF NOT EXISTS hotel_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, profile_id)
);

ALTER TABLE hotel_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_hotel_managers" ON hotel_managers;
CREATE POLICY "allow_select_hotel_managers" ON hotel_managers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "allow_insert_hotel_managers" ON hotel_managers;
CREATE POLICY "allow_insert_hotel_managers" ON hotel_managers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "allow_update_hotel_managers" ON hotel_managers;
CREATE POLICY "allow_update_hotel_managers" ON hotel_managers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_delete_hotel_managers" ON hotel_managers;
CREATE POLICY "allow_delete_hotel_managers" ON hotel_managers FOR DELETE
  TO anon, authenticated USING (true);

-- Add plain_password column to profiles for admin visibility
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'plain_password') THEN
    ALTER TABLE profiles ADD COLUMN plain_password text;
  END IF;
END $$;

-- Migrate existing owner_id associations into hotel_managers
INSERT INTO hotel_managers (hotel_id, profile_id)
SELECT id, owner_id FROM hotels WHERE owner_id IS NOT NULL
ON CONFLICT (hotel_id, profile_id) DO NOTHING;

-- Update existing hotel owner's plain_password (so admin can see it)
UPDATE profiles SET plain_password = 'hotel123' WHERE username = 'hotel' AND plain_password IS NULL;
