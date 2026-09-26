BEGIN;
-- A CURRENT_DATE CHECK also blocks updating the status of historical bookings.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_checkin_not_past;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_positive_quantities;
ALTER TABLE bookings ADD CONSTRAINT booking_positive_quantities CHECK (guests > 0 AND rooms BETWEEN 1 AND 5) NOT VALID;
ALTER TABLE room_availability DROP CONSTRAINT IF EXISTS availability_nonnegative;
ALTER TABLE room_availability ADD CONSTRAINT availability_nonnegative CHECK
  (available_rooms >= 0 AND (base_price_override IS NULL OR base_price_override >= 0)) NOT VALID;
CREATE INDEX IF NOT EXISTS bookings_room_dates ON bookings(room_type_id, check_in_date, check_out_date) WHERE status IN ('pending','confirmed');

CREATE OR REPLACE FUNCTION public.booking_quote(p_hotel_id uuid, p_room_type_id uuid, p_check_in date,
  p_check_out date, p_guests integer, p_rooms integer, p_exclude uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE room room_types%ROWTYPE; hotel hotels%ROWTYPE; nightly record;
  base numeric := 0; margin numeric; remaining integer := 2147483647; reserved integer;
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_in < (now() AT TIME ZONE 'Asia/Baghdad')::date
    OR p_check_out <= p_check_in OR p_check_out - p_check_in > 365 THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;
  SELECT * INTO hotel FROM hotels WHERE id = p_hotel_id AND status = 'active';
  SELECT * INTO room FROM room_types WHERE id = p_room_type_id AND hotel_id = p_hotel_id;
  IF hotel.id IS NULL OR room.id IS NULL THEN RAISE EXCEPTION 'PROPERTY_UNAVAILABLE'; END IF;
  IF p_rooms IS NULL OR p_rooms NOT BETWEEN 1 AND 5 OR p_guests IS NULL OR p_guests < 1 OR p_guests > room.max_guests * p_rooms THEN
    RAISE EXCEPTION 'INVALID_CAPACITY';
  END IF;
  FOR nightly IN SELECT (p_check_in + n)::date AS stay_date, a.available_rooms, a.is_closed,
      coalesce(a.base_price_override, room.base_price) AS price
    FROM generate_series(0, p_check_out - p_check_in - 1) n
    LEFT JOIN room_availability a ON a.room_type_id = room.id AND a.date = p_check_in + n
  LOOP
    -- Missing inventory is unavailable, rather than an unlimited number of rooms.
    IF nightly.available_rooms IS NULL OR nightly.is_closed IS TRUE OR nightly.price < 0 THEN RAISE EXCEPTION 'ROOM_UNAVAILABLE'; END IF;
    SELECT coalesce(sum(b.rooms), 0) INTO reserved FROM bookings b WHERE b.room_type_id = room.id
      AND b.status IN ('pending','confirmed') AND b.check_in_date <= nightly.stay_date AND b.check_out_date > nightly.stay_date
      AND (p_exclude IS NULL OR b.id <> p_exclude);
    remaining := least(remaining, nightly.available_rooms - reserved);
    IF remaining < p_rooms THEN RAISE EXCEPTION 'ROOM_UNAVAILABLE'; END IF;
    base := base + nightly.price * p_rooms;
  END LOOP;
  base := round(base, 2);
  margin := round(base * coalesce(hotel.profit_margin_percentage, 0) / 100, 2);
  RETURN jsonb_build_object('nights', p_check_out - p_check_in, 'basePriceTotal', base,
    'marginPercentage', coalesce(hotel.profit_margin_percentage, 0), 'marginAmount', margin,
    'finalPriceTotal', base + margin, 'availableRooms', remaining);
END $$;

-- Excluding an existing booking is internal only: a public wrapper cannot let
-- callers manipulate stock calculations or probe other guests' reservations.
REVOKE ALL ON FUNCTION public.booking_quote(uuid,uuid,date,date,integer,integer,uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.get_booking_quote(p_hotel_id uuid, p_room_type_id uuid, p_check_in date,
  p_check_out date, p_guests integer, p_rooms integer) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.booking_quote(p_hotel_id,p_room_type_id,p_check_in,p_check_out,p_guests,p_rooms);
$$;

CREATE OR REPLACE FUNCTION public.create_booking(p_request_id uuid, p_hotel_id uuid, p_room_type_id uuid,
  p_check_in date, p_check_out date, p_guests integer, p_rooms integer, p_name text,
  p_email text, p_phone text, p_notes text, p_expected_total numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE quote jsonb; existing bookings%ROWTYPE; booking_id uuid; visitor text;
BEGIN
  visitor := public.request_token_hash('x-stay-visitor');
  IF visitor IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
  -- Serializes retries of the same request as well as competing reservations.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  SELECT * INTO existing FROM bookings WHERE request_id = p_request_id;
  IF existing.id IS NOT NULL THEN
    IF existing.visitor_hash IS DISTINCT FROM visitor THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    RETURN existing.id;
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 200 OR p_email IS NULL
    OR length(p_email) > 254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR coalesce(length(p_phone), 0) > 40 OR coalesce(length(p_notes), 0) > 2000 THEN RAISE EXCEPTION 'INVALID_CONTACT'; END IF;
  PERFORM 1 FROM room_types WHERE id = p_room_type_id FOR UPDATE;
  quote := public.booking_quote(p_hotel_id,p_room_type_id,p_check_in,p_check_out,p_guests,p_rooms);
  IF p_expected_total IS DISTINCT FROM (quote->>'finalPriceTotal')::numeric THEN RAISE EXCEPTION 'PRICE_CHANGED'; END IF;
  INSERT INTO bookings(hotel_id,room_type_id,customer_name,customer_email,customer_phone,
    check_in_date,check_out_date,guests,rooms,base_price_total,margin_percentage,margin_amount,final_price_total,
    status,notes,visitor_hash,customer_id,request_id)
  VALUES(p_hotel_id,p_room_type_id,btrim(p_name),btrim(p_email),nullif(btrim(p_phone),''),p_check_in,p_check_out,
    p_guests,p_rooms,(quote->>'basePriceTotal')::numeric,(quote->>'marginPercentage')::numeric,
    (quote->>'marginAmount')::numeric,(quote->>'finalPriceTotal')::numeric,'pending',nullif(btrim(p_notes),''),
    visitor,public.app_user_id(),p_request_id) RETURNING id INTO booking_id;
  RETURN booking_id;
END $$;

CREATE OR REPLACE FUNCTION public.guard_booking_update() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.check_in_date IS DISTINCT FROM OLD.check_in_date OR NEW.check_out_date IS DISTINCT FROM OLD.check_out_date THEN
    IF NEW.check_in_date < (now() AT TIME ZONE 'Asia/Baghdad')::date THEN RAISE EXCEPTION 'INVALID_DATES'; END IF;
  END IF;
  -- Reopening a cancelled/completed reservation must reacquire inventory.
  IF NEW.status IN ('pending','confirmed') AND OLD.status NOT IN ('pending','confirmed') THEN
    PERFORM 1 FROM room_types WHERE id = NEW.room_type_id FOR UPDATE;
    PERFORM public.booking_quote(NEW.hotel_id,NEW.room_type_id,NEW.check_in_date,NEW.check_out_date,NEW.guests,NEW.rooms,OLD.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_update_guard ON bookings;
CREATE TRIGGER booking_update_guard BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION public.guard_booking_update();
REVOKE ALL ON FUNCTION public.get_booking_quote(uuid,uuid,date,date,integer,integer),
  public.create_booking(uuid,uuid,uuid,date,date,integer,integer,text,text,text,text,numeric), public.guard_booking_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booking_quote(uuid,uuid,date,date,integer,integer),
  public.create_booking(uuid,uuid,uuid,date,date,integer,integer,text,text,text,text,numeric) TO anon, authenticated;
COMMIT;
