/*
# Accounts: phone verification and personal profile

Adds the pieces needed for phone-based signup with WhatsApp verification and a
personal profile that includes an uploaded ID card.

1. Modified table `profiles`
   - `phone_verified` (boolean, default false) — true once the phone number is confirmed via WhatsApp.
   - `phone_verified_at` (timestamptz) — when the phone was confirmed.
   - `date_of_birth` (date) — personal info.
   - `gender` (text) — personal info.
   - `nationality` (text) — personal info.
   - `id_number` (text) — national ID / passport number.
   - `address` (text) — street address.
   - `city` (text) — city of residence.
   - `id_card_url` (text) — storage path of the uploaded ID card image (private bucket).

2. New table `phone_verifications`
   - Holds one-time WhatsApp verification codes. Written and read ONLY by the
     phone-verification edge function using the service role. RLS is enabled with
     no policies, so the public anon/authenticated keys cannot read codes.
   - `id` (uuid, pk)
   - `profile_id` (uuid, fk -> profiles, cascade)
   - `phone` (text) — normalized destination number.
   - `code_hash` (text) — SHA-256 hash of the 6-digit code (never store the code in clear).
   - `expires_at` (timestamptz) — code expiry.
   - `attempts` (int, default 0) — wrong-code attempts, for lockout.
   - `consumed` (boolean, default false) — set true once verified.
   - `created_at` (timestamptz, default now()).

3. New storage bucket `id-cards`
   - Private (not public) bucket for sensitive ID images. Read/write via
     anon+authenticated (the app uses custom auth), but with no public URL —
     images are shown through short-lived signed URLs only.

4. Updated function `register_user`
   - Now accepts phone and email and stores them on the new profile. Rejects a
     phone that already belongs to a verified account. Returns phone / email /
     phone_verified so the client has the full profile after signup.

## Important notes
1. Verification codes are hashed; the plaintext code is only sent over WhatsApp.
2. `phone_verifications` has RLS on and intentionally NO policies — only the
   service-role edge function can touch it.
*/

-- 1. Extend profiles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='phone_verified') THEN
    ALTER TABLE profiles ADD COLUMN phone_verified boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='phone_verified_at') THEN
    ALTER TABLE profiles ADD COLUMN phone_verified_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='date_of_birth') THEN
    ALTER TABLE profiles ADD COLUMN date_of_birth date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='gender') THEN
    ALTER TABLE profiles ADD COLUMN gender text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='nationality') THEN
    ALTER TABLE profiles ADD COLUMN nationality text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='id_number') THEN
    ALTER TABLE profiles ADD COLUMN id_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='address') THEN
    ALTER TABLE profiles ADD COLUMN address text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='city') THEN
    ALTER TABLE profiles ADD COLUMN city text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='id_card_url') THEN
    ALTER TABLE profiles ADD COLUMN id_card_url text;
  END IF;
END $$;

-- 2. Verification codes table
CREATE TABLE IF NOT EXISTS phone_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_profile ON phone_verifications(profile_id);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service-role edge function may access this table.

-- 3. Private id-cards bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'id-cards',
  'id-cards',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "id_cards_read" ON storage.objects;
CREATE POLICY "id_cards_read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'id-cards');

DROP POLICY IF EXISTS "id_cards_insert" ON storage.objects;
CREATE POLICY "id_cards_insert"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'id-cards');

DROP POLICY IF EXISTS "id_cards_update" ON storage.objects;
CREATE POLICY "id_cards_update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'id-cards')
WITH CHECK (bucket_id = 'id-cards');

DROP POLICY IF EXISTS "id_cards_delete" ON storage.objects;
CREATE POLICY "id_cards_delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'id-cards');

-- 4. Updated register_user with phone + email
CREATE OR REPLACE FUNCTION public.register_user(
  p_username TEXT,
  p_password TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'customer'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE username = p_username) THEN
    RETURN json_build_object('success', false, 'message', 'Username already taken');
  END IF;

  IF p_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE phone = p_phone AND phone_verified = true
  ) THEN
    RETURN json_build_object('success', false, 'message', 'This phone number is already registered');
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO profiles (id, name, email, role, username, password_hash, phone, phone_verified)
  VALUES (
    v_user_id,
    p_name,
    NULLIF(p_email, ''),
    p_role,
    p_username,
    crypt(p_password, gen_salt('bf')),
    NULLIF(p_phone, ''),
    false
  );

  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', v_user_id,
      'name', p_name,
      'username', p_username,
      'role', p_role,
      'phone', NULLIF(p_phone, ''),
      'email', NULLIF(p_email, ''),
      'phone_verified', false,
      'language_preference', 'en'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
