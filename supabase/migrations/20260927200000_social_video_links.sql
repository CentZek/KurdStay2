BEGIN;
ALTER TABLE hotels ADD COLUMN social_video_url text;
ALTER TABLE accommodation_applications ADD COLUMN social_video_url text;

CREATE FUNCTION public.valid_social_video_url(url text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT url IS NULL OR length(url) <= 500 AND (
    url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$' OR
    url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/$' OR
    url ~ '^https://www\.facebook\.com/watch/\?v=[0-9]+$' OR
    url ~ '^https://www\.facebook\.com/share/(v|r)/[A-Za-z0-9_-]+/$' OR
    url ~ '^https://fb\.watch/[A-Za-z0-9_-]+/$'
  );
$$;
ALTER TABLE hotels ADD CONSTRAINT hotel_social_video_valid CHECK (public.valid_social_video_url(social_video_url) AND (social_video_url IS NULL OR video_url IS NULL));
ALTER TABLE accommodation_applications ADD CONSTRAINT application_social_video_valid CHECK (public.valid_social_video_url(social_video_url) AND (social_video_url IS NULL OR video_url IS NULL));

CREATE FUNCTION public.set_hotel_social_video(p_hotel uuid, p_url text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.app_manages_hotel(p_hotel) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE hotels SET social_video_url = p_url, video_url = NULL, video_poster_url = NULL WHERE id = p_hotel;
END $$;
REVOKE ALL ON FUNCTION public.set_hotel_social_video(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hotel_social_video(uuid,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.set_hotel_video(p_hotel uuid, p_url text DEFAULT NULL, p_poster text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.app_manages_hotel(p_hotel) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE hotels SET video_url = p_url, video_poster_url = p_poster, social_video_url = NULL,
    images = CASE WHEN p_url IS NOT NULL AND (coalesce(cardinality(images),0) = 0 OR images = ARRAY[video_poster_url])
      THEN ARRAY[p_poster] ELSE images END WHERE id = p_hotel;
END $$;

-- Keep the approved external link in the same transaction as property creation.
CREATE FUNCTION public.copy_approved_social_video() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.hotel_id IS NOT NULL AND NEW.social_video_url IS NOT NULL
    AND (OLD.status IS DISTINCT FROM 'approved' OR OLD.hotel_id IS DISTINCT FROM NEW.hotel_id) THEN
    UPDATE hotels SET social_video_url = NEW.social_video_url, video_url = NULL, video_poster_url = NULL WHERE id = NEW.hotel_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.copy_approved_social_video() FROM PUBLIC;
CREATE TRIGGER application_social_video_approval AFTER UPDATE ON accommodation_applications
FOR EACH ROW EXECUTE FUNCTION public.copy_approved_social_video();
COMMIT;
