-- Add p_language to register_user so the app can store the language chosen at signup.
-- The 6-arg overload is replaced (Postgres cannot add a parameter via CREATE OR REPLACE).

DROP FUNCTION IF EXISTS public.register_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.register_user(
  p_username TEXT,
  p_password TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'customer',
  p_language TEXT DEFAULT 'en'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF p_language NOT IN ('en', 'ckb', 'kmr', 'ar') THEN
    p_language := 'en';
  END IF;

  IF EXISTS (SELECT 1 FROM profiles WHERE username = p_username) THEN
    RETURN json_build_object('success', false, 'message', 'Username already taken');
  END IF;

  IF p_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE phone = p_phone AND phone_verified = true
  ) THEN
    RETURN json_build_object('success', false, 'message', 'This phone number is already registered');
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO profiles (id, name, email, role, username, password_hash, phone, phone_verified, language_preference)
  VALUES (
    v_user_id,
    p_name,
    NULLIF(p_email, ''),
    p_role,
    p_username,
    crypt(p_password, gen_salt('bf')),
    NULLIF(p_phone, ''),
    false,
    p_language
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
      'language_preference', p_language
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
