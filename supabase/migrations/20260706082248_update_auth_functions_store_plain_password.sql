/*
# Update auth functions to store plain_password

1. Modified Functions
   - `register_user` - now also stores plain_password in profiles
   - `update_user_credentials` - now also updates plain_password when password changes

2. Purpose
   - Admin can view credentials for hotel manager accounts they create
*/

DROP FUNCTION IF EXISTS register_user(text, text, text, text);

CREATE FUNCTION register_user(p_username text, p_password text, p_name text, p_role text DEFAULT 'user')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM profiles WHERE username = p_username;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username already exists');
  END IF;

  INSERT INTO profiles (id, username, password_hash, plain_password, name, role)
  VALUES (gen_random_uuid(), p_username, crypt(p_password, gen_salt('bf')), p_password, p_name, p_role)
  RETURNING id INTO v_user_id;

  RETURN jsonb_build_object('success', true, 'user', jsonb_build_object('id', v_user_id, 'username', p_username, 'name', p_name, 'role', p_role));
END;
$$;

DROP FUNCTION IF EXISTS update_user_credentials(uuid, text, text, text, text);

CREATE FUNCTION update_user_credentials(p_user_id uuid, p_username text, p_name text, p_phone text DEFAULT NULL, p_password text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT id INTO v_existing FROM profiles WHERE username = p_username AND id != p_user_id;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username already taken');
  END IF;

  IF p_password IS NOT NULL AND p_password != '' THEN
    UPDATE profiles SET username = p_username, name = p_name, phone = p_phone, password_hash = crypt(p_password, gen_salt('bf')), plain_password = p_password WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET username = p_username, name = p_name, phone = p_phone WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Updated successfully');
END;
$$;
