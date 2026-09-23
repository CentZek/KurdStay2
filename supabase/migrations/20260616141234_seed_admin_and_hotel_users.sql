
-- Create admin user in auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'admin',
  crypt('admin123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Admin"}',
  'authenticated',
  'authenticated',
  NOW(),
  NOW(),
  '',
  ''
);

-- Create admin identity
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'email', 'admin'),
  'email',
  'a0000000-0000-0000-0000-000000000001',
  NOW(),
  NOW(),
  NOW()
);

-- Create admin profile
INSERT INTO profiles (id, name, email, role, language_preference)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin', 'admin', 'en');

-- Create hotel manager user in auth.users
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  role,
  aud,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'hotel',
  crypt('hotel123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Hotel Manager"}',
  'authenticated',
  'authenticated',
  NOW(),
  NOW(),
  '',
  ''
);

-- Create hotel manager identity
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000002',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'email', 'hotel'),
  'email',
  'b0000000-0000-0000-0000-000000000002',
  NOW(),
  NOW(),
  NOW()
);

-- Create hotel manager profile
INSERT INTO profiles (id, name, email, role, language_preference)
VALUES ('b0000000-0000-0000-0000-000000000002', 'Hotel Manager', 'hotel', 'hotel_owner', 'en');

-- Assign first hotel to the hotel manager
UPDATE hotels SET owner_id = 'b0000000-0000-0000-0000-000000000002'
WHERE id = (SELECT id FROM hotels ORDER BY created_at LIMIT 1);
