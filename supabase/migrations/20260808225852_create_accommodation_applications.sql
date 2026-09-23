/*
# Accommodation applications from users

Lets a signed-in user apply to list their own accommodation. The submission is
held for admin review; the admin can approve it (which turns it into a live
property) or send the applicant a note asking for more information.

1. New table `accommodation_applications`
   - `id` (uuid, pk)
   - `applicant_id` (uuid -> profiles) — the user who applied.
   - `applicant_name` (text) — name captured at submission time.
   - `applicant_phone` (text) — applicant contact captured at submission time.
   - `property_name` (text, not null)
   - `property_type` (text, not null, default 'hotel')
   - `description` (text)
   - `city` (text, not null)
   - `address` (text)
   - `location` (text)
   - `country` (text, default 'Iraq')
   - `phone` (text) — property contact phone.
   - `contact_person` (text)
   - `latitude` / `longitude` (double precision) — optional map pin.
   - `amenities` (text[]) — selected amenities.
   - `images` (text[]) — uploaded photo URLs (hotel-images bucket).
   - `status` (text, not null, default 'pending') — pending | info_requested | approved | rejected.
   - `admin_notes` (text) — message from the admin back to the applicant.
   - `hotel_id` (uuid -> hotels) — set once approved and the property is created.
   - `created_at`, `updated_at`, `reviewed_at` (timestamptz), `reviewed_by` (uuid -> profiles).

2. Security
   - RLS enabled. Policies match this app's existing model (custom auth on the
     anon key), so access is granted `TO anon, authenticated`. Per-user
     filtering (an applicant sees only their own applications) is done in the
     app query; the admin screens read all rows.

## Notes
1. Approval is performed by the admin UI, which also creates the hotel row,
   links the applicant as a manager, and promotes them to hotel_owner.
*/

CREATE TABLE IF NOT EXISTS accommodation_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  applicant_name text,
  applicant_phone text,
  property_name text NOT NULL,
  property_type text NOT NULL DEFAULT 'hotel',
  description text,
  city text NOT NULL,
  address text,
  location text,
  country text DEFAULT 'Iraq',
  phone text,
  contact_person text,
  latitude double precision,
  longitude double precision,
  amenities text[] DEFAULT '{}',
  images text[] DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  hotel_id uuid REFERENCES hotels(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_accommodation_applications_applicant ON accommodation_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_accommodation_applications_status ON accommodation_applications(status);

ALTER TABLE accommodation_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "applications_select_all" ON accommodation_applications;
CREATE POLICY "applications_select_all" ON accommodation_applications FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "applications_insert_all" ON accommodation_applications;
CREATE POLICY "applications_insert_all" ON accommodation_applications FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "applications_update_all" ON accommodation_applications;
CREATE POLICY "applications_update_all" ON accommodation_applications FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "applications_delete_all" ON accommodation_applications;
CREATE POLICY "applications_delete_all" ON accommodation_applications FOR DELETE
  TO anon, authenticated USING (true);
