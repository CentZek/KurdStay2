
-- Update admin user email to valid email format
UPDATE auth.users SET email = 'admin@stayhub.com' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE auth.identities SET identity_data = jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'email', 'admin@stayhub.com')
WHERE user_id = 'a0000000-0000-0000-0000-000000000001';

-- Update hotel user email to valid email format
UPDATE auth.users SET email = 'hotel@stayhub.com' WHERE id = 'b0000000-0000-0000-0000-000000000002';
UPDATE auth.identities SET identity_data = jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000002', 'email', 'hotel@stayhub.com')
WHERE user_id = 'b0000000-0000-0000-0000-000000000002';

-- Update profiles to match
UPDATE profiles SET email = 'admin@stayhub.com' WHERE id = 'a0000000-0000-0000-0000-000000000001';
UPDATE profiles SET email = 'hotel@stayhub.com' WHERE id = 'b0000000-0000-0000-0000-000000000002';
