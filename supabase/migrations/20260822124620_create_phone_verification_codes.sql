/*
# Create phone_verification_codes table

1. New Tables
  - `phone_verification_codes`
    - `id` (uuid, primary key)
    - `profile_id` (uuid, not null) - the profile requesting verification
    - `phone` (text, not null) - normalized phone number
    - `code` (text, not null) - 6-digit verification code
    - `expires_at` (timestamptz, not null) - code expiration time
    - `verified` (boolean, default false) - whether code was used
    - `created_at` (timestamptz)

2. Security
  - Enable RLS on `phone_verification_codes`.
  - Service role only (edge function uses service role key).
  - No anon/authenticated access needed.

3. Notes
  - Codes expire after 10 minutes.
  - Old codes are invalidated when a new one is requested.
*/

CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  phone text NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE phone_verification_codes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_phone_verification_codes_lookup
  ON phone_verification_codes (profile_id, phone, verified);
