-- Run in the project's SQL Editor as postgres AFTER applying migrations.
-- Read-only checks: no credentials are returned and no application data is changed.
BEGIN;
SET TRANSACTION READ ONLY;
SET LOCAL request.headers = '{}';

DO $$
DECLARE signature text; relation_name text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.login(text,text)', 'public.current_profile()', 'public.app_capabilities()',
    'public.search_hotels(text,text,date,date,integer,integer,text,integer,integer)',
    'public.get_booking_quote(uuid,uuid,date,date,integer,integer)',
    'public.admin_dashboard_stats()', 'public.admin_list_bookings(text,text,integer,integer)',
    'public.admin_list_chat_sessions(text,integer,integer)',
    'public.admin_import_hotel(jsonb,jsonb,jsonb,boolean,uuid)',
    'public.claim_booking_notification_v2(uuid,text)',
    'public.complete_booking_notification_v2(uuid,text,boolean,text,boolean)'
  ] LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Missing function: %; review the migration history.', signature;
    END IF;
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'profiles', 'hotels', 'room_types', 'room_availability', 'bookings',
    'hotel_managers', 'chat_sessions', 'chat_messages', 'accommodation_applications'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=relation_name AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'Missing table or disabled RLS: public.%', relation_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='id-cards' AND NOT public)
    OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='hotel-images' AND public)
    OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='property-videos' AND public) THEN
    RAISE EXCEPTION 'Storage buckets are missing or have incorrect visibility.';
  END IF;
  IF has_column_privilege('anon','public.profiles','password_hash','SELECT')
    OR has_column_privilege('anon','public.profiles','plain_password','SELECT') THEN
    RAISE EXCEPTION 'Anonymous callers can read password columns.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE username='admin' AND role='admin'
    AND password_hash IS NOT NULL AND plain_password IS NULL) THEN
    RAISE EXCEPTION 'The admin profile is missing or its credential storage needs review.';
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF public.current_profile() IS NOT NULL THEN RAISE EXCEPTION 'Unexpected anonymous identity.'; END IF;
  IF EXISTS (SELECT id FROM public.profiles) OR EXISTS (SELECT id FROM public.bookings) THEN
    RAISE EXCEPTION 'Anonymous callers can read private profiles or bookings.';
  END IF;
  BEGIN
    PERFORM public.admin_dashboard_stats();
    RAISE EXCEPTION 'Anonymous callers can access the admin dashboard.';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT (public.app_capabilities() @> '{"bookingSearch":true,"adminReliability":true,"applicationResubmit":true}'::jsonb) THEN
    RAISE EXCEPTION 'The reliability capability flags are incomplete.';
  END IF;
END $$;

SELECT 'PASS: required schema, storage visibility and anonymous access checks' AS result;
ROLLBACK;
