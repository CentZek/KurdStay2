/*
# Create hotel-images storage bucket

1. New Storage Bucket
   - `hotel-images` — public bucket for storing hotel photos uploaded by admins
   
2. Security
   - Public read access (anyone can view hotel images)
   - Insert/Update/Delete restricted to anon+authenticated (since app uses custom auth, not Supabase Auth)
   
3. Notes
   - Images stored at path: hotel-images/{hotel_id}/{filename}
   - Public URL accessible without auth for display on frontend
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hotel-images',
  'hotel-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read hotel images" ON storage.objects;
CREATE POLICY "Public read hotel images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'hotel-images');

DROP POLICY IF EXISTS "Allow upload hotel images" ON storage.objects;
CREATE POLICY "Allow upload hotel images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'hotel-images');

DROP POLICY IF EXISTS "Allow update hotel images" ON storage.objects;
CREATE POLICY "Allow update hotel images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'hotel-images')
WITH CHECK (bucket_id = 'hotel-images');

DROP POLICY IF EXISTS "Allow delete hotel images" ON storage.objects;
CREATE POLICY "Allow delete hotel images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'hotel-images');
