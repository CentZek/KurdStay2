BEGIN;
CREATE OR REPLACE FUNCTION public.set_hotel_images(p_hotel uuid, p_images text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.app_manages_hotel(p_hotel) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF cardinality(p_images) > 50 OR EXISTS (SELECT 1 FROM unnest(p_images) url WHERE url !~ '^https?://') THEN
    RAISE EXCEPTION 'Invalid images';
  END IF;
  UPDATE hotels SET images = coalesce(p_images, '{}') WHERE id = p_hotel;
END $$;

CREATE OR REPLACE FUNCTION public.approve_accommodation(p_application uuid, p_notes text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE app accommodation_applications%ROWTYPE; v_hotel uuid;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  SELECT * INTO app FROM accommodation_applications WHERE id = p_application FOR UPDATE;
  IF app.id IS NULL OR app.applicant_id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF app.status = 'approved' AND app.hotel_id IS NOT NULL THEN RETURN app.hotel_id; END IF;
  INSERT INTO hotels(name,city,location,description,address,country,images,amenities,status,property_type,
    phone,contact_person,currency,latitude,longitude,owner_id,profit_margin_percentage)
  VALUES(app.property_name,app.city,coalesce(nullif(app.location,''),app.city),app.description,app.address,
    coalesce(app.country,'Iraq'),app.images,app.amenities,'active',app.property_type,app.phone,
    coalesce(app.contact_person,app.applicant_name),'USD',app.latitude,app.longitude,app.applicant_id,10)
  RETURNING id INTO v_hotel;
  INSERT INTO hotel_managers(hotel_id,profile_id) VALUES(v_hotel,app.applicant_id);
  UPDATE profiles SET role = 'hotel_owner' WHERE id = app.applicant_id AND role = 'customer';
  UPDATE accommodation_applications SET status = 'approved', hotel_id = v_hotel, admin_notes = nullif(p_notes,''),
    reviewed_at = now(), reviewed_by = public.app_user_id() WHERE id = app.id;
  RETURN v_hotel;
END $$;

-- Inventory edits and reservations take the same room lock. Do not permit a
-- manager to reduce the total inventory below already accepted requests.
CREATE OR REPLACE FUNCTION public.guard_inventory_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE reserved integer;
BEGIN
  PERFORM 1 FROM room_types WHERE id = NEW.room_type_id FOR UPDATE;
  SELECT coalesce(sum(rooms),0) INTO reserved FROM bookings WHERE room_type_id = NEW.room_type_id
    AND status IN ('pending','confirmed') AND check_in_date <= NEW.date AND check_out_date > NEW.date;
  IF NEW.available_rooms < reserved THEN RAISE EXCEPTION 'Inventory cannot be lower than reserved rooms'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_update_guard ON room_availability;
CREATE TRIGGER inventory_update_guard BEFORE INSERT OR UPDATE ON room_availability FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_update();
REVOKE ALL ON FUNCTION public.set_hotel_images(uuid,text[]), public.approve_accommodation(uuid,text), public.guard_inventory_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_hotel_images(uuid,text[]), public.approve_accommodation(uuid,text) TO anon, authenticated;
COMMIT;
