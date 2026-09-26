/*
# Secure sessions and access control

1. New Schema
   - `private` schema (revoked from public/anon/authenticated)

2. New Tables
   - `private.app_sessions` — server-side session tokens (token_hash PK, profile_id, expires_at 7 days)
   - `private.login_attempts` — rate limiting (username PK, attempts, window_start)

3. New Functions
   - `request_token_hash(text)` — extracts and hashes session header
   - `app_user_id()` — resolves current session to profile_id
   - `app_is_admin()` — checks if session user is admin
   - `app_manages_hotel(uuid)` — checks ownership or manager assignment
   - `current_profile()` — returns safe profile JSON for session user
   - `logout()` — revokes current session
   - `guard_profile_changes()` — trigger preventing role escalation and resetting phone_verified on phone change

4. Modified Functions
   - `login()` — now creates server session token, rate-limits attempts (10 per 15 min)
   - `register_user()` — restricts non-customer roles to admins, validates input lengths, auto-logs-in customers
   - `update_user_credentials()` — admin-only, invalidates sessions on password change

5. Security
   - Drops ALL legacy permissive policies on core tables
   - Revokes password_hash and plain_password from SELECT grants
   - Adds proper RLS: profile_read/edit, hotel_read/admin, room_read/manage, availability_read/manage,
     destination_read/admin, manager_read/admin, application_read/create/admin, support_admin
   - Booking ownership via visitor_hash and customer_id; direct INSERT/DELETE revoked
   - Chat session ownership via visitor_hash
   - Storage: removes direct upload policies (Edge Function handles uploads)
   - Clears plain_password column and adds CHECK constraint preventing future storage
   - Adds bookings columns: visitor_hash, customer_id, request_id (unique)
   - Adds chat_sessions column: visitor_hash
*/

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_sessions (
  token_hash text PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX IF NOT EXISTS app_sessions_profile_id_idx ON private.app_sessions(profile_id);
CREATE TABLE IF NOT EXISTS private.login_attempts (
  username text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.request_token_hash(header_name text) RETURNS text
LANGUAGE sql STABLE SET search_path = public, extensions, pg_temp AS $$
  SELECT CASE WHEN length(token) >= 32 THEN encode(digest(token, 'sha256'), 'hex') END
  FROM (SELECT nullif(current_setting('request.headers', true), '')::jsonb ->> header_name AS token) h;
$$;
CREATE OR REPLACE FUNCTION public.app_user_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
  SELECT profile_id FROM private.app_sessions
  WHERE token_hash = public.request_token_hash('x-stay-session') AND expires_at > now();
$$;
CREATE OR REPLACE FUNCTION public.app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = public.app_user_id() AND role = 'admin');
$$;
CREATE OR REPLACE FUNCTION public.app_manages_hotel(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.app_is_admin() OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = public.app_user_id() AND p.role = 'hotel_owner'
    AND (EXISTS (SELECT 1 FROM hotels h WHERE h.id = target AND h.owner_id = p.id)
      OR EXISTS (SELECT 1 FROM hotel_managers m WHERE m.hotel_id = target AND m.profile_id = p.id))
  );
$$;
CREATE OR REPLACE FUNCTION public.current_profile() RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT row_to_json(p) FROM (SELECT id, name, username, role, language_preference,
    phone, email, phone_verified FROM profiles WHERE id = public.app_user_id()) p;
$$;
CREATE OR REPLACE FUNCTION public.logout() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM private.app_sessions WHERE token_hash = public.request_token_hash('x-stay-session');
$$;

CREATE OR REPLACE FUNCTION public.login(p_username text, p_password text) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v profiles%ROWTYPE; token text; attempts private.login_attempts%ROWTYPE;
BEGIN
  p_username := btrim(p_username);
  IF p_username IS NULL OR length(p_username) > 100 OR p_password IS NULL OR octet_length(p_password) > 72 THEN
    RETURN json_build_object('success', false, 'message', 'Invalid username or password');
  END IF;
  INSERT INTO private.login_attempts(username) VALUES(p_username) ON CONFLICT DO NOTHING;
  SELECT * INTO attempts FROM private.login_attempts WHERE username = p_username FOR UPDATE;
  IF attempts.window_start < now() - interval '15 minutes' THEN
    UPDATE private.login_attempts SET attempts = 0, window_start = now() WHERE username = p_username;
  ELSIF attempts.attempts >= 10 THEN
    RETURN json_build_object('success', false, 'message', 'Too many attempts. Try again in 15 minutes.');
  END IF;
  SELECT * INTO v FROM profiles WHERE username = p_username AND password_hash = crypt(p_password, password_hash);
  IF v.id IS NULL THEN
    UPDATE private.login_attempts SET attempts = private.login_attempts.attempts + 1 WHERE username = p_username;
    RETURN json_build_object('success', false, 'message', 'Invalid username or password');
  END IF;
  DELETE FROM private.login_attempts WHERE username = p_username;
  DELETE FROM private.app_sessions WHERE expires_at <= now();
  token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO private.app_sessions(token_hash, profile_id) VALUES(encode(digest(token, 'sha256'), 'hex'), v.id);
  RETURN json_build_object('success', true, 'session_token', token, 'user', json_build_object(
    'id', v.id, 'name', v.name, 'username', v.username, 'role', v.role,
    'language_preference', v.language_preference, 'phone', v.phone, 'email', v.email, 'phone_verified', v.phone_verified));
END;
$$;

CREATE OR REPLACE FUNCTION public.register_user(p_username text, p_password text, p_name text,
  p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_role text DEFAULT 'customer', p_language text DEFAULT 'en')
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('customer', 'hotel_owner') OR (p_role <> 'customer' AND NOT public.app_is_admin()) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_username IS NULL OR length(btrim(p_username)) NOT BETWEEN 3 AND 100 OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200
    OR p_password IS NULL OR length(p_password) < 6 OR octet_length(p_password) > 72 THEN
    RETURN json_build_object('success', false, 'message', 'Provide a name, username and password of at least 6 characters (up to 72 bytes).');
  END IF;
  INSERT INTO profiles(id, username, password_hash, name, phone, email, role, language_preference)
    VALUES(gen_random_uuid(), btrim(p_username), crypt(p_password, gen_salt('bf', 10)), btrim(p_name),
      nullif(btrim(p_phone), ''), nullif(btrim(p_email), ''), p_role,
      CASE WHEN p_language IN ('en', 'ckb', 'kmr', 'ar') THEN p_language ELSE 'en' END)
    RETURNING id INTO v_id;
  IF p_role = 'customer' THEN RETURN public.login(btrim(p_username), p_password); END IF;
  RETURN json_build_object('success', true, 'user', json_build_object('id', v_id, 'username', btrim(p_username), 'name', btrim(p_name), 'role', p_role));
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object('success', false, 'message', 'Username or contact already registered');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_credentials(p_user_id uuid, p_username text, p_name text,
  p_phone text DEFAULT NULL, p_password text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF length(btrim(p_username)) NOT BETWEEN 3 AND 100 OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid name or username';
  END IF;
  IF nullif(p_password, '') IS NOT NULL AND (length(p_password) < 6 OR octet_length(p_password) > 72) THEN
    RAISE EXCEPTION 'Password must have at least 6 characters and at most 72 bytes';
  END IF;
  UPDATE profiles SET username = btrim(p_username), name = btrim(p_name), phone = nullif(btrim(p_phone), ''),
    phone_verified = CASE WHEN phone IS DISTINCT FROM nullif(btrim(p_phone), '') THEN false ELSE phone_verified END,
    password_hash = CASE WHEN nullif(p_password, '') IS NOT NULL THEN crypt(p_password, gen_salt('bf', 10)) ELSE password_hash END
    WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF nullif(p_password, '') IS NOT NULL THEN DELETE FROM private.app_sessions WHERE profile_id = p_user_id; END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('profiles','hotels','room_types','room_availability',
      'bookings','destinations','hotel_managers','accommodation_applications','chat_sessions','chat_messages','support_requests')
  LOOP EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename); END LOOP;
END $$;

REVOKE ALL ON profiles FROM PUBLIC, anon, authenticated;
DO $$ DECLARE columns text; BEGIN
  SELECT string_agg(quote_ident(column_name), ', ') INTO columns FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name NOT IN ('password_hash', 'plain_password');
  EXECUTE format('GRANT SELECT (%s) ON profiles TO anon, authenticated', columns);
END $$;
GRANT UPDATE(name, phone, email, date_of_birth, gender, nationality, id_number, address, city, language_preference, role) ON profiles TO anon, authenticated;
DROP POLICY IF EXISTS profile_read ON profiles;
CREATE POLICY profile_read ON profiles FOR SELECT USING (id = public.app_user_id() OR public.app_is_admin());
DROP POLICY IF EXISTS profile_edit ON profiles;
CREATE POLICY profile_edit ON profiles FOR UPDATE USING (id = public.app_user_id() OR public.app_is_admin()) WITH CHECK (id = public.app_user_id() OR public.app_is_admin());
CREATE OR REPLACE FUNCTION public.guard_profile_changes() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NEW.role IS DISTINCT FROM OLD.role AND NOT public.app_is_admin() THEN
    RAISE EXCEPTION 'Cannot change role' USING ERRCODE = '42501';
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN NEW.phone_verified := false; NEW.phone_verified_at := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_profile ON profiles;
CREATE TRIGGER protect_profile BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_changes();
UPDATE profiles SET plain_password = NULL;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS no_readable_password;
ALTER TABLE profiles ADD CONSTRAINT no_readable_password CHECK (plain_password IS NULL);

DROP POLICY IF EXISTS hotel_read ON hotels;
CREATE POLICY hotel_read ON hotels FOR SELECT USING (status = 'active' OR public.app_manages_hotel(id));
DROP POLICY IF EXISTS hotel_admin ON hotels;
CREATE POLICY hotel_admin ON hotels FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
DROP POLICY IF EXISTS room_read ON room_types;
CREATE POLICY room_read ON room_types FOR SELECT USING (EXISTS (SELECT 1 FROM hotels WHERE id = hotel_id));
DROP POLICY IF EXISTS room_manage ON room_types;
CREATE POLICY room_manage ON room_types FOR ALL USING (public.app_manages_hotel(hotel_id)) WITH CHECK (public.app_manages_hotel(hotel_id));
DROP POLICY IF EXISTS availability_read ON room_availability;
CREATE POLICY availability_read ON room_availability FOR SELECT USING (EXISTS (SELECT 1 FROM room_types WHERE id = room_type_id));
DROP POLICY IF EXISTS availability_manage ON room_availability;
CREATE POLICY availability_manage ON room_availability FOR ALL USING (EXISTS (SELECT 1 FROM room_types WHERE id = room_type_id AND public.app_manages_hotel(hotel_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM room_types WHERE id = room_type_id AND public.app_manages_hotel(hotel_id)));
DROP POLICY IF EXISTS destination_read ON destinations;
CREATE POLICY destination_read ON destinations FOR SELECT USING (true);
DROP POLICY IF EXISTS destination_admin ON destinations;
CREATE POLICY destination_admin ON destinations FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
DROP POLICY IF EXISTS manager_read ON hotel_managers;
CREATE POLICY manager_read ON hotel_managers FOR SELECT USING (profile_id = public.app_user_id() OR public.app_is_admin());
DROP POLICY IF EXISTS manager_admin ON hotel_managers;
CREATE POLICY manager_admin ON hotel_managers FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
DROP POLICY IF EXISTS application_read ON accommodation_applications;
CREATE POLICY application_read ON accommodation_applications FOR SELECT USING (applicant_id = public.app_user_id() OR public.app_is_admin());
DROP POLICY IF EXISTS application_create ON accommodation_applications;
CREATE POLICY application_create ON accommodation_applications FOR INSERT WITH CHECK
  (applicant_id = public.app_user_id() AND status = 'pending' AND hotel_id IS NULL AND reviewed_by IS NULL AND reviewed_at IS NULL AND admin_notes IS NULL);
DROP POLICY IF EXISTS application_admin ON accommodation_applications;
CREATE POLICY application_admin ON accommodation_applications FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
DROP POLICY IF EXISTS support_admin ON support_requests;
CREATE POLICY support_admin ON support_requests FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='visitor_hash') THEN
    ALTER TABLE bookings ADD COLUMN visitor_hash text DEFAULT public.request_token_hash('x-stay-visitor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='customer_id') THEN
    ALTER TABLE bookings ADD COLUMN customer_id uuid REFERENCES profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='request_id') THEN
    ALTER TABLE bookings ADD COLUMN request_id uuid UNIQUE;
  END IF;
END $$;
DROP POLICY IF EXISTS booking_read ON bookings;
CREATE POLICY booking_read ON bookings FOR SELECT USING (public.app_manages_hotel(hotel_id) OR customer_id = public.app_user_id()
  OR visitor_hash = public.request_token_hash('x-stay-visitor'));
DROP POLICY IF EXISTS booking_manage ON bookings;
CREATE POLICY booking_manage ON bookings FOR UPDATE USING (public.app_manages_hotel(hotel_id)) WITH CHECK (public.app_manages_hotel(hotel_id));
REVOKE INSERT, UPDATE, DELETE ON bookings FROM PUBLIC, anon, authenticated;
GRANT UPDATE(status) ON bookings TO anon, authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='chat_sessions' AND column_name='visitor_hash') THEN
    ALTER TABLE chat_sessions ADD COLUMN visitor_hash text DEFAULT public.request_token_hash('x-stay-visitor');
  END IF;
END $$;
DROP POLICY IF EXISTS chat_read ON chat_sessions;
CREATE POLICY chat_read ON chat_sessions FOR SELECT USING (public.app_is_admin() OR visitor_hash = public.request_token_hash('x-stay-visitor'));
DROP POLICY IF EXISTS chat_create ON chat_sessions;
CREATE POLICY chat_create ON chat_sessions FOR INSERT WITH CHECK (visitor_hash = public.request_token_hash('x-stay-visitor') AND status = 'open');
DROP POLICY IF EXISTS chat_admin ON chat_sessions;
CREATE POLICY chat_admin ON chat_sessions FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());
DROP POLICY IF EXISTS message_read ON chat_messages;
CREATE POLICY message_read ON chat_messages FOR SELECT USING (EXISTS (SELECT 1 FROM chat_sessions WHERE id = session_id));
DROP POLICY IF EXISTS message_create ON chat_messages;
CREATE POLICY message_create ON chat_messages FOR INSERT WITH CHECK (public.app_is_admin() OR
  (role IN ('customer','bot') AND EXISTS (SELECT 1 FROM chat_sessions WHERE id = session_id AND status = 'open')));
DROP POLICY IF EXISTS message_admin ON chat_messages;
CREATE POLICY message_admin ON chat_messages FOR ALL USING (public.app_is_admin()) WITH CHECK (public.app_is_admin());

DROP POLICY IF EXISTS "Allow upload hotel images" ON storage.objects;
DROP POLICY IF EXISTS "Allow update hotel images" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete hotel images" ON storage.objects;

REVOKE ALL ON FUNCTION public.request_token_hash(text), public.app_user_id(), public.app_is_admin(), public.app_manages_hotel(uuid),
  public.current_profile(), public.logout(), public.login(text,text), public.register_user(text,text,text,text,text,text,text),
  public.update_user_credentials(uuid,text,text,text,text), public.guard_profile_changes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_token_hash(text), public.app_user_id(), public.app_is_admin(), public.app_manages_hotel(uuid),
  public.current_profile(), public.logout(), public.login(text,text), public.register_user(text,text,text,text,text,text,text),
  public.update_user_credentials(uuid,text,text,text,text) TO anon, authenticated;