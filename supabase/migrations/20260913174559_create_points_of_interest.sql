/*
# Create points_of_interest table

1. New Tables
  - `points_of_interest`
    - `id` (uuid, primary key)
    - `name` (text, not null) - Name of the sight or restaurant
    - `name_ar` (text) - Arabic name
    - `name_ku` (text) - Kurdish name
    - `type` (text, not null) - Either 'sight' or 'restaurant'
    - `city` (text, not null) - City name (matches hotels.city)
    - `description` (text) - English description
    - `description_ar` (text) - Arabic description
    - `description_ku` (text) - Kurdish description
    - `address` (text) - Street address
    - `image_url` (text) - Optional photo URL
    - `created_at` (timestamptz)

2. Security
  - Enable RLS on `points_of_interest`.
  - Public read for anon + authenticated (reference data).
  - Only service role can insert/update/delete (admin-seeded).

3. Notes
  - This is reference/content data, not user-owned data.
  - City column is indexed for fast filtering.
*/

CREATE TABLE IF NOT EXISTS points_of_interest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  name_ku text,
  type text NOT NULL CHECK (type IN ('sight', 'restaurant')),
  city text NOT NULL,
  description text,
  description_ar text,
  description_ku text,
  address text,
  image_url text,
  created_at timestamptz DEFAULT now()
);


CREATE INDEX IF NOT EXISTS idx_poi_city ON points_of_interest(city);

CREATE INDEX IF NOT EXISTS idx_poi_type ON points_of_interest(type);


ALTER TABLE points_of_interest ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "public_read_poi" ON points_of_interest;

CREATE POLICY "public_read_poi" ON points_of_interest FOR SELECT
  TO anon, authenticated USING (true);


DROP POLICY IF EXISTS "no_public_insert_poi" ON points_of_interest;

CREATE POLICY "no_public_insert_poi" ON points_of_interest FOR INSERT
  TO anon, authenticated WITH CHECK (false);


DROP POLICY IF EXISTS "no_public_update_poi" ON points_of_interest;

CREATE POLICY "no_public_update_poi" ON points_of_interest FOR UPDATE
  TO anon, authenticated USING (false) WITH CHECK (false);


DROP POLICY IF EXISTS "no_public_delete_poi" ON points_of_interest;

CREATE POLICY "no_public_delete_poi" ON points_of_interest FOR DELETE
  TO anon, authenticated USING (false);
