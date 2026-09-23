/*
# Fix update_user_credentials function - return JSONB

1. Modified Functions
  - `update_user_credentials` - Changed return type from JSON to JSONB for
    consistent parsing by supabase-js PostgREST client.
  - Function updates owner's username, name, phone, and optionally password.
  - SECURITY DEFINER to allow password_hash writes.

2. Important Notes
  - DROP + CREATE OR REPLACE needed because changing return type requires it.
  - Grants re-applied to anon and authenticated roles.
*/

DROP FUNCTION IF EXISTS public.update_user_credentials(UUID, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_user_credentials(
  p_user_id UUID,
  p_username TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE username = p_username AND id != p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Username already taken');
  END IF;

  IF p_password IS NOT NULL AND p_password != '' THEN
    UPDATE profiles
    SET username = p_username, name = p_name, phone = p_phone, password_hash = crypt(p_password, gen_salt('bf'))
    WHERE id = p_user_id;
  ELSE
    UPDATE profiles
    SET username = p_username, name = p_name, phone = p_phone
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Updated successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_credentials TO anon, authenticated;
