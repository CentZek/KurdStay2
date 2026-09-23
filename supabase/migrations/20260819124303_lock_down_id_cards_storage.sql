/*
# Lock down id-cards storage bucket

1. Security Changes
   - Remove all anon/authenticated access policies from id-cards bucket.
   - Only the service_role (used by edge functions) can now read/write/delete
     files in id-cards. This means no browser client can directly access
     passport or ID card images.
   - The hotel-images bucket policies are left unchanged (public photos).

2. Important Notes
   - After this migration, the ProfilePage must use an edge function to
     upload and retrieve ID card images instead of direct Supabase storage calls.
*/

-- Remove all existing id-cards policies (they allowed anyone to read/write)
DROP POLICY IF EXISTS "id_cards_read" ON storage.objects;
DROP POLICY IF EXISTS "id_cards_insert" ON storage.objects;
DROP POLICY IF EXISTS "id_cards_update" ON storage.objects;
DROP POLICY IF EXISTS "id_cards_delete" ON storage.objects;

-- No new policies are created for id-cards.
-- The bucket still exists and RLS is enabled, but with zero policies
-- only the service_role can access it (service_role bypasses RLS).
