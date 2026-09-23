/*
# Include phone/email/verification in login response

Updates the `login` function so a successful sign-in returns the account's
phone number, email, and phone_verified flag, matching register_user. No schema
or data changes.
*/

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
      'phone', v_user.phone,
      'email', v_user.email,
      'phone_verified', v_user.phone_verified,
      'language_preference', v_user.language_preference
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.login(TEXT, TEXT) TO anon, authenticated;
