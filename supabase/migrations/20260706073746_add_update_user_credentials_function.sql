/*
# Add update_user_credentials function

1. New Functions
  - `update_user_credentials(p_user_id, p_username, p_name, p_phone, p_password)`
    - Allows admin to update a user's username, name, phone, and optionally password.
    - If p_password is NULL or empty, password is not changed.
    - Returns JSON with success status and message.

2. Security
  - Function is SECURITY DEFINER to allow password_hash updates.
  - Checks for duplicate usernames before updating.
*/

CREATE OR REPLACE FUNCTION public.update_user_credentials(
  p_user_id UUID,
  p_username TEXT,
  p_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_password TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM profiles WHERE username = p_username AND id != p_user_id) THEN
    RETURN json_build_object('success', false, 'message', 'Username already taken');
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

  RETURN json_build_object('success', true, 'message', 'Updated successfully');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_user_credentials TO anon, authenticated;
