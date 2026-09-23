
-- Clear hotel owner references first
UPDATE hotels SET owner_id = NULL WHERE owner_id IN ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');

-- Remove auth.users foreign key from profiles and add username/password columns
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Drop the old seeded users from auth
DELETE FROM auth.identities WHERE user_id IN ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
DELETE FROM auth.users WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');

-- Remove old profiles
DELETE FROM profiles WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');

-- Insert admin account
INSERT INTO profiles (id, name, email, role, username, password_hash)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Admin',
  'admin',
  'admin',
  'admin',
  crypt('admin123', gen_salt('bf'))
);

-- Insert hotel manager account
INSERT INTO profiles (id, name, email, role, username, password_hash)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'Hotel Manager',
  'hotel',
  'hotel_owner',
  'hotel',
  crypt('hotel123', gen_salt('bf'))
);

-- Assign first hotel to hotel manager
UPDATE hotels SET owner_id = 'b0000000-0000-0000-0000-000000000002'
WHERE id = (SELECT id FROM hotels ORDER BY created_at LIMIT 1);

-- Create login function
CREATE OR REPLACE FUNCTION public.login(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_user FROM profiles
  WHERE username = p_username AND password_hash = crypt(p_password, password_hash);
  
  IF v_user.id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Invalid username or password');
  END IF;
  
  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', v_user.id,
      'name', v_user.name,
      'username', v_user.username,
      'role', v_user.role,
      'language_preference', v_user.language_preference
    )
  );
END;
$$;

-- Create register function
CREATE OR REPLACE FUNCTION public.register_user(p_username TEXT, p_password TEXT, p_name TEXT, p_role TEXT DEFAULT 'customer')
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
  
  v_user_id := gen_random_uuid();
  
  INSERT INTO profiles (id, name, email, role, username, password_hash)
  VALUES (v_user_id, p_name, p_username, p_role, p_username, crypt(p_password, gen_salt('bf')));
  
  RETURN json_build_object(
    'success', true,
    'user', json_build_object(
      'id', v_user_id,
      'name', p_name,
      'username', p_username,
      'role', p_role,
      'language_preference', 'en'
    )
  );
END;
$$;

-- Drop all existing RLS policies and replace with permissive ones
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_select" ON profiles;

CREATE POLICY "profiles_select_all" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_all" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update_all" ON profiles FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "hotels_public_select" ON hotels;
DROP POLICY IF EXISTS "hotels_admin_select" ON hotels;
DROP POLICY IF EXISTS "hotels_admin_insert" ON hotels;
DROP POLICY IF EXISTS "hotels_admin_update" ON hotels;
DROP POLICY IF EXISTS "hotels_owner_select" ON hotels;
DROP POLICY IF EXISTS "hotels_owner_update" ON hotels;

CREATE POLICY "hotels_select_all" ON hotels FOR SELECT USING (true);
CREATE POLICY "hotels_insert_all" ON hotels FOR INSERT WITH CHECK (true);
CREATE POLICY "hotels_update_all" ON hotels FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "hotels_delete_all" ON hotels FOR DELETE USING (true);

DROP POLICY IF EXISTS "room_types_public_select" ON room_types;
DROP POLICY IF EXISTS "room_types_admin_all" ON room_types;
DROP POLICY IF EXISTS "room_types_owner_select" ON room_types;
DROP POLICY IF EXISTS "room_types_owner_insert" ON room_types;
DROP POLICY IF EXISTS "room_types_owner_update" ON room_types;
DROP POLICY IF EXISTS "room_types_owner_delete" ON room_types;

CREATE POLICY "room_types_select_all" ON room_types FOR SELECT USING (true);
CREATE POLICY "room_types_insert_all" ON room_types FOR INSERT WITH CHECK (true);
CREATE POLICY "room_types_update_all" ON room_types FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "room_types_delete_all" ON room_types FOR DELETE USING (true);

DROP POLICY IF EXISTS "room_availability_public_select" ON room_availability;
DROP POLICY IF EXISTS "room_availability_owner_all" ON room_availability;
DROP POLICY IF EXISTS "room_availability_admin_all" ON room_availability;

CREATE POLICY "room_availability_select_all" ON room_availability FOR SELECT USING (true);
CREATE POLICY "room_availability_insert_all" ON room_availability FOR INSERT WITH CHECK (true);
CREATE POLICY "room_availability_update_all" ON room_availability FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "room_availability_delete_all" ON room_availability FOR DELETE USING (true);

DROP POLICY IF EXISTS "bookings_public_insert" ON bookings;
DROP POLICY IF EXISTS "bookings_admin_select" ON bookings;
DROP POLICY IF EXISTS "bookings_admin_update" ON bookings;
DROP POLICY IF EXISTS "bookings_owner_select" ON bookings;
DROP POLICY IF EXISTS "bookings_public_select" ON bookings;

CREATE POLICY "bookings_select_all" ON bookings FOR SELECT USING (true);
CREATE POLICY "bookings_insert_all" ON bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "bookings_update_all" ON bookings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "bookings_delete_all" ON bookings FOR DELETE USING (true);

DROP POLICY IF EXISTS "destinations_public_select" ON destinations;
DROP POLICY IF EXISTS "destinations_admin_insert" ON destinations;
DROP POLICY IF EXISTS "destinations_admin_update" ON destinations;
DROP POLICY IF EXISTS "destinations_admin_delete" ON destinations;

CREATE POLICY "destinations_select_all" ON destinations FOR SELECT USING (true);
CREATE POLICY "destinations_insert_all" ON destinations FOR INSERT WITH CHECK (true);
CREATE POLICY "destinations_update_all" ON destinations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "destinations_delete_all" ON destinations FOR DELETE USING (true);

-- Grant execute on functions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.login TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_user TO anon, authenticated;
