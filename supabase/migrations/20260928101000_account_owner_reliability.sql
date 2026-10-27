BEGIN;

DROP POLICY IF EXISTS application_resubmit ON accommodation_applications;
CREATE POLICY application_resubmit ON accommodation_applications FOR UPDATE
TO anon, authenticated
USING (
  applicant_id = public.app_user_id()
  AND status = 'info_requested'
  AND hotel_id IS NULL
)
WITH CHECK (
  applicant_id = public.app_user_id()
  AND status = 'pending'
  AND hotel_id IS NULL
);

CREATE OR REPLACE FUNCTION public.guard_application_resubmission() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT public.app_is_admin() THEN
    IF OLD.status <> 'info_requested' OR NEW.status <> 'pending'
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.applicant_id IS DISTINCT FROM OLD.applicant_id
      OR NEW.applicant_id IS DISTINCT FROM public.app_user_id()
      OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
      OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
      OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
      OR NEW.admin_notes IS DISTINCT FROM OLD.admin_notes
      OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Invalid application resubmission' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS application_resubmission_guard ON accommodation_applications;
CREATE TRIGGER application_resubmission_guard
BEFORE UPDATE ON accommodation_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_application_resubmission();

COMMIT;
