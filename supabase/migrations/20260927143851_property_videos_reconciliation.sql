/*
# Reconcile property video schema

Reconciles the earlier Bolt-applied 20260927135620 video migration with the GitHub
20260927170000 version. Uses IF NOT EXISTS / IF EXISTS throughout so this is safe
to re-run regardless of which earlier migration was applied first.

1. Storage
   - Upserts the property-videos bucket (50 MiB, MP4/WebM/JPEG)

2. Tables (created if not present)
   - property_video_uploads: id, owner_id, path, url, poster_url, size_bytes, ready, created_at
   - RLS enabled, access revoked from anon/authenticated, granted to service_role

3. Modified Tables
   - hotels: adds video_url and video_poster_url if missing
   - accommodation_applications: adds video_url and video_poster_url if missing

4. Functions (CREATE OR REPLACE)
   - reserve_property_video: serialized per-user 10/24h quota, service_role only
   - guard_property_video: trigger validating video readiness and ownership
   - set_hotel_video: owner/manager RPC to attach/remove uploaded video
   - approve_accommodation: updated to copy video fields from application to hotel

5. Triggers (idempotent DROP IF EXISTS + CREATE)
   - hotels_video_guard, applications_video_guard
*/

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-videos', 'property-videos', true, 52428800, ARRAY['video/mp4','video/webm','image/jpeg'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4','video/webm','image/jpeg'];

CREATE TABLE IF NOT EXISTS public.property_video_uploads (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  path text NOT NULL UNIQUE,
  url text NOT NULL UNIQUE,
  poster_url text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 52428800),
  ready boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_video_uploads_owner_created ON public.property_video_uploads(owner_id, created_at);
ALTER TABLE public.property_video_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.property_video_uploads FROM anon, authenticated;
GRANT ALL ON public.property_video_uploads TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_property_video(p_id uuid, p_owner uuid, p_path text, p_url text, p_poster text, p_size integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM profiles WHERE id = p_owner FOR UPDATE;
  IF (SELECT count(*) FROM property_video_uploads WHERE owner_id = p_owner AND created_at > now() - interval '24 hours') >= 10 THEN
    RAISE EXCEPTION 'VIDEO_UPLOAD_LIMIT';
  END IF;
  INSERT INTO property_video_uploads(id,owner_id,path,url,poster_url,size_bytes)
  VALUES(p_id,p_owner,p_path,p_url,p_poster,p_size);
END $$;
REVOKE ALL ON FUNCTION public.reserve_property_video(uuid,uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_property_video(uuid,uuid,text,text,text,integer) TO service_role;

ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS video_url text REFERENCES public.property_video_uploads(url), ADD COLUMN IF NOT EXISTS video_poster_url text;
ALTER TABLE public.accommodation_applications ADD COLUMN IF NOT EXISTS video_url text REFERENCES public.property_video_uploads(url), ADD COLUMN IF NOT EXISTS video_poster_url text;

CREATE OR REPLACE FUNCTION public.guard_property_video() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE media property_video_uploads%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.video_url IS NOT DISTINCT FROM OLD.video_url
    AND NEW.video_poster_url IS NOT DISTINCT FROM OLD.video_poster_url THEN RETURN NEW; END IF;
  IF NEW.video_url IS NULL THEN NEW.video_poster_url := NULL; RETURN NEW; END IF;
  SELECT * INTO media FROM property_video_uploads WHERE url = NEW.video_url AND ready;
  IF media.id IS NULL OR NEW.video_poster_url IS DISTINCT FROM media.poster_url THEN
    RAISE EXCEPTION 'VIDEO_NOT_READY';
  END IF;
  IF NOT public.app_is_admin() AND media.owner_id IS DISTINCT FROM public.app_user_id() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_property_video() FROM PUBLIC;
DROP TRIGGER IF EXISTS hotels_video_guard ON public.hotels;
CREATE TRIGGER hotels_video_guard BEFORE INSERT OR UPDATE ON public.hotels
FOR EACH ROW EXECUTE FUNCTION public.guard_property_video();
DROP TRIGGER IF EXISTS applications_video_guard ON public.accommodation_applications;
CREATE TRIGGER applications_video_guard BEFORE INSERT OR UPDATE ON public.accommodation_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_property_video();

CREATE OR REPLACE FUNCTION public.set_hotel_video(p_hotel uuid, p_url text DEFAULT NULL, p_poster text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.app_manages_hotel(p_hotel) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  UPDATE hotels SET video_url = p_url, video_poster_url = p_poster,
    images = CASE WHEN p_url IS NOT NULL AND (coalesce(cardinality(images),0) = 0 OR images = ARRAY[video_poster_url])
      THEN ARRAY[p_poster] ELSE images END
  WHERE id = p_hotel;
END $$;
REVOKE ALL ON FUNCTION public.set_hotel_video(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hotel_video(uuid,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.approve_accommodation(p_application uuid, p_notes text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app accommodation_applications%ROWTYPE; v_hotel uuid;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO app FROM accommodation_applications WHERE id = p_application FOR UPDATE;
  IF app.id IS NULL OR app.applicant_id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF app.status = 'approved' AND app.hotel_id IS NOT NULL THEN RETURN app.hotel_id; END IF;
  INSERT INTO hotels(name,city,location,description,address,country,images,amenities,status,property_type,
    phone,contact_person,currency,latitude,longitude,owner_id,profit_margin_percentage,video_url,video_poster_url)
  VALUES(app.property_name,app.city,coalesce(nullif(app.location,''),app.city),app.description,app.address,
    coalesce(app.country,'Iraq'),CASE WHEN coalesce(cardinality(app.images),0)=0 AND app.video_url IS NOT NULL
      THEN ARRAY[app.video_poster_url] ELSE app.images END,
    app.amenities,'active',app.property_type,app.phone,
    coalesce(app.contact_person,app.applicant_name),'USD',app.latitude,app.longitude,app.applicant_id,10,app.video_url,app.video_poster_url)
  RETURNING id INTO v_hotel;
  INSERT INTO hotel_managers(hotel_id,profile_id) VALUES(v_hotel,app.applicant_id);
  UPDATE profiles SET role = 'hotel_owner' WHERE id = app.applicant_id AND role = 'customer';
  UPDATE accommodation_applications SET status = 'approved', hotel_id = v_hotel, admin_notes = nullif(p_notes,''),
    reviewed_at = now(), reviewed_by = public.app_user_id() WHERE id = app.id;
  RETURN v_hotel;
END $$;