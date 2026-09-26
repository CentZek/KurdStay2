BEGIN;
-- Service-role-only operations for Edge Functions: hashes, throttling and
-- attempt limits are updated under a lock, not in a race-prone read/write pair.
CREATE FUNCTION public.prepare_phone_verification(p_profile uuid, p_phone text, p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE id = p_profile FOR UPDATE;
  IF NOT FOUND OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM phone_verifications WHERE profile_id = p_profile AND created_at > now() - interval '60 seconds')
    OR (SELECT count(*) FROM phone_verifications WHERE profile_id = p_profile AND created_at > now() - interval '1 hour') >= 5 THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE phone = p_phone AND phone_verified AND id <> p_profile) THEN RETURN false; END IF;
  UPDATE phone_verifications SET consumed = true WHERE profile_id = p_profile AND NOT consumed;
  UPDATE profiles SET phone = p_phone, phone_verified = false, phone_verified_at = NULL WHERE id = p_profile;
  INSERT INTO phone_verifications(profile_id,phone,code_hash,expires_at) VALUES(p_profile,p_phone,p_hash,now()+interval '10 minutes');
  RETURN true;
END $$;
CREATE FUNCTION public.consume_phone_verification(p_profile uuid, p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v phone_verifications%ROWTYPE;
BEGIN
  PERFORM 1 FROM profiles WHERE id = p_profile FOR UPDATE;
  SELECT * INTO v FROM phone_verifications WHERE profile_id = p_profile AND NOT consumed ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v.id IS NULL OR v.expires_at <= now() OR v.attempts >= 5 THEN RETURN false; END IF;
  UPDATE phone_verifications SET attempts = attempts + 1, consumed = (code_hash = p_hash OR attempts >= 4) WHERE id = v.id;
  IF v.code_hash IS DISTINCT FROM p_hash THEN RETURN false; END IF;
  UPDATE profiles SET phone_verified = true, phone_verified_at = now() WHERE id = p_profile AND phone = v.phone;
  RETURN FOUND;
END $$;
CREATE TABLE private.booking_notifications (
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  kind text CHECK (kind IN ('booking_created','booking_confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(booking_id,kind)
);
CREATE FUNCTION public.claim_booking_notification(p_booking uuid, p_kind text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO private.booking_notifications(booking_id,kind) VALUES(p_booking,p_kind) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.prepare_phone_verification(uuid,text,text), public.consume_phone_verification(uuid,text),
  public.claim_booking_notification(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_phone_verification(uuid,text,text), public.consume_phone_verification(uuid,text),
  public.claim_booking_notification(uuid,text) TO service_role;

-- Stop the known development passwords from being usable on a deployed site.
-- Replace these hashes with strong passwords via a trusted SQL connection.
UPDATE profiles SET password_hash = NULL WHERE
  (id = 'a0000000-0000-0000-0000-000000000001' AND password_hash = crypt('admin123', password_hash)) OR
  (id = 'b0000000-0000-0000-0000-000000000002' AND password_hash = crypt('hotel123', password_hash));
COMMIT;
