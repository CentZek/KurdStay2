BEGIN;

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'hotels', (SELECT count(*) FROM hotels),
    'bookings', (SELECT count(*) FROM bookings),
    'pending', (SELECT count(*) FROM bookings WHERE status = 'pending'),
    'confirmed', (SELECT count(*) FROM bookings WHERE status IN ('confirmed', 'completed')),
    'open_chats', (SELECT count(*) FROM chat_sessions WHERE status = 'open'),
    'pending_applications', (SELECT count(*) FROM accommodation_applications WHERE status = 'pending'),
    'commission', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'hotel_id', totals.hotel_id, 'hotel_name', totals.name, 'currency', totals.currency,
        'confirmed_count', totals.booking_count, 'total_commission', totals.total_commission
      ) ORDER BY totals.total_commission DESC, totals.hotel_id)
      FROM (
        SELECT h.id AS hotel_id, h.name, h.currency, count(b.id) AS booking_count,
          sum(b.margin_amount) AS total_commission
        FROM hotels h JOIN bookings b ON b.hotel_id = h.id AND b.status IN ('confirmed', 'completed')
        GROUP BY h.id, h.name, h.currency
      ) totals
    ), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_bookings(p_status text DEFAULT 'all', p_search text DEFAULT '',
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status text := CASE WHEN p_status IN ('pending', 'confirmed', 'cancelled', 'completed') THEN p_status ELSE 'all' END;
  v_search text := btrim(coalesce(p_search, ''));
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 25)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(page.item ORDER BY page.created_at DESC, page.id DESC) FROM (
        SELECT to_jsonb(b) || jsonb_build_object(
          'hotels', jsonb_build_object('name', h.name, 'currency', h.currency),
          'room_types', jsonb_build_object('name', r.name)
        ) AS item, b.created_at, b.id
        FROM bookings b
        LEFT JOIN hotels h ON h.id = b.hotel_id
        LEFT JOIN room_types r ON r.id = b.room_type_id
        WHERE (v_status = 'all' OR b.status = v_status)
          AND (v_search = '' OR concat_ws(' ', b.id::text, b.customer_name, b.customer_email,
            b.customer_phone, h.name) ILIKE '%' || v_search || '%')
        ORDER BY b.created_at DESC, b.id DESC LIMIT v_limit OFFSET v_offset
      ) page
    ), '[]'::jsonb),
    'total', (
      SELECT count(*) FROM bookings b LEFT JOIN hotels h ON h.id = b.hotel_id
      WHERE (v_status = 'all' OR b.status = v_status)
        AND (v_search = '' OR concat_ws(' ', b.id::text, b.customer_name, b.customer_email,
          b.customer_phone, h.name) ILIKE '%' || v_search || '%')
    ),
    'status_counts', (
      SELECT jsonb_build_object('all', count(*),
        'pending', count(*) FILTER (WHERE b.status = 'pending'),
        'confirmed', count(*) FILTER (WHERE b.status = 'confirmed'),
        'cancelled', count(*) FILTER (WHERE b.status = 'cancelled'),
        'completed', count(*) FILTER (WHERE b.status = 'completed'))
      FROM bookings b LEFT JOIN hotels h ON h.id = b.hotel_id
      WHERE v_search = '' OR concat_ws(' ', b.id::text, b.customer_name, b.customer_email,
        b.customer_phone, h.name) ILIKE '%' || v_search || '%'
    )
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_chat_sessions(p_status text DEFAULT 'open',
  p_limit integer DEFAULT 25, p_offset integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_status text := CASE WHEN p_status IN ('open', 'closed') THEN p_status ELSE 'all' END;
  v_limit integer := least(100, greatest(1, coalesce(p_limit, 25)));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(s) || jsonb_build_object(
        'last_message', COALESCE(last.content, ''), 'message_count',
        (SELECT count(*) FROM chat_messages cm WHERE cm.session_id = s.id)
      ) ORDER BY s.updated_at DESC, s.id DESC)
      FROM (
        SELECT * FROM chat_sessions cs WHERE v_status = 'all' OR cs.status = v_status
        ORDER BY cs.updated_at DESC, cs.id DESC LIMIT v_limit OFFSET v_offset
      ) s
      LEFT JOIN LATERAL (
        SELECT content FROM chat_messages latest WHERE latest.session_id = s.id
        ORDER BY latest.created_at DESC, latest.id DESC LIMIT 1
      ) last ON true
    ), '[]'::jsonb),
    'total', (SELECT count(*) FROM chat_sessions cs WHERE v_status = 'all' OR cs.status = v_status)
  );
END $$;

CREATE TABLE private.hotel_import_requests (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL, payload_hash text NOT NULL,
  owner_password_hash text, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.hotel_import_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_import_hotel(p_hotel jsonb, p_rooms jsonb,
  p_owner jsonb DEFAULT NULL, p_rooms_only boolean DEFAULT false, p_request_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_hotel_id uuid;
  v_owner_id uuid;
  v_registration json;
  v_room jsonb;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
  v_hash text;
  v_previous private.hotel_import_requests%ROWTYPE;
  v_result jsonb;
BEGIN
  IF NOT public.app_is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
  IF p_hotel IS NULL OR jsonb_typeof(p_hotel) <> 'object' OR p_rooms IS NULL OR jsonb_typeof(p_rooms) <> 'array' THEN
    RAISE EXCEPTION 'Invalid hotel import payload';
  END IF;

  -- Serialize duplicate submissions, without storing plaintext owner credentials.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_request_id::text, 0));
  v_hash := encode(digest(jsonb_build_array(p_hotel, p_rooms, p_owner - 'password', p_rooms_only)::text, 'sha256'), 'hex');
  SELECT * INTO v_previous FROM private.hotel_import_requests WHERE id = v_request_id;
  IF FOUND THEN
    IF v_previous.actor_id IS DISTINCT FROM public.app_user_id() OR v_previous.payload_hash <> v_hash
      OR (p_owner IS NOT NULL AND v_previous.owner_password_hash IS DISTINCT FROM crypt(p_owner->>'password', v_previous.owner_password_hash)) THEN
      RAISE EXCEPTION 'Import request was already used with different details';
    END IF;
    RETURN v_previous.result || jsonb_build_object('credentials', p_owner - 'phone');
  END IF;

  IF p_rooms_only THEN
    v_hotel_id := (p_hotel->>'id')::uuid;
    IF v_hotel_id IS NULL OR NOT EXISTS (SELECT 1 FROM hotels WHERE id = v_hotel_id) THEN
      RAISE EXCEPTION 'Hotel not found';
    END IF;
    IF jsonb_array_length(p_rooms) = 0 THEN RAISE EXCEPTION 'At least one room is required'; END IF;
  ELSE
    IF length(btrim(coalesce(p_hotel->>'name', ''))) = 0 OR length(btrim(coalesce(p_hotel->>'city', ''))) = 0
      OR coalesce((p_hotel->>'profit_margin_percentage')::numeric, -1) < 0 THEN
      RAISE EXCEPTION 'Invalid hotel details';
    END IF;
    v_owner_id := nullif(p_hotel->>'owner_id', '')::uuid;
    IF p_owner IS NOT NULL THEN
      v_registration := public.register_user(p_owner->>'username', p_owner->>'password', p_owner->>'name',
        nullif(btrim(coalesce(p_owner->>'phone', '')), ''), NULL, 'hotel_owner', 'en');
      IF NOT coalesce((v_registration->>'success')::boolean, false) THEN
        RAISE EXCEPTION '%', coalesce(v_registration->>'message', 'Owner registration failed');
      END IF;
      v_owner_id := (v_registration->'user'->>'id')::uuid;
    END IF;

    INSERT INTO hotels(id, name, city, location, description, address, country, images, amenities,
      profit_margin_percentage, owner_id, status, property_type, phone, contact_person, currency, latitude, longitude)
    VALUES (
      coalesce(nullif(p_hotel->>'id', '')::uuid, gen_random_uuid()), btrim(p_hotel->>'name'), btrim(p_hotel->>'city'),
      coalesce(p_hotel->>'location', ''), nullif(p_hotel->>'description', ''), nullif(p_hotel->>'address', ''),
      coalesce(nullif(p_hotel->>'country', ''), 'Iraq'),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_hotel->'images', '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(p_hotel->'amenities', '[]'::jsonb))),
      coalesce((p_hotel->>'profit_margin_percentage')::numeric, 0), v_owner_id,
      coalesce(nullif(p_hotel->>'status', ''), 'active'), coalesce(nullif(p_hotel->>'property_type', ''), 'hotel'),
      nullif(p_hotel->>'phone', ''), nullif(p_hotel->>'contact_person', ''), coalesce(nullif(p_hotel->>'currency', ''), 'USD'),
      nullif(p_hotel->>'latitude', '')::double precision, nullif(p_hotel->>'longitude', '')::double precision
    ) RETURNING id INTO v_hotel_id;

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO hotel_managers(hotel_id, profile_id) VALUES(v_hotel_id, v_owner_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  FOR v_room IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
    IF length(btrim(coalesce(v_room->>'name', ''))) = 0 OR coalesce((v_room->>'base_price')::numeric, 0) <= 0
      OR coalesce((v_room->>'max_guests')::integer, 0) < 1 THEN
      RAISE EXCEPTION 'Invalid room details';
    END IF;
    INSERT INTO room_types(id, hotel_id, name, description, max_guests, base_price, images, amenities)
    VALUES (
      coalesce(nullif(v_room->>'id', '')::uuid, gen_random_uuid()), v_hotel_id, btrim(v_room->>'name'),
      nullif(v_room->>'description', ''), coalesce((v_room->>'max_guests')::integer, 2), (v_room->>'base_price')::numeric,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_room->'images', '[]'::jsonb))),
      ARRAY(SELECT jsonb_array_elements_text(coalesce(v_room->'amenities', '[]'::jsonb)))
    );
  END LOOP;

  v_result := jsonb_build_object('success', true, 'hotel_id', v_hotel_id, 'owner_id', v_owner_id);
  INSERT INTO private.hotel_import_requests(id, actor_id, payload_hash, owner_password_hash, result)
  VALUES(v_request_id, public.app_user_id(), v_hash, CASE WHEN p_owner IS NOT NULL THEN crypt(p_owner->>'password', gen_salt('bf', 10)) END, v_result);
  RETURN v_result || jsonb_build_object(
    'credentials', CASE WHEN p_owner IS NOT NULL THEN jsonb_build_object(
      'username', p_owner->>'username', 'password', p_owner->>'password', 'name', p_owner->>'name'
    ) ELSE NULL END);
END $$;

ALTER TABLE private.booking_notifications ADD COLUMN status text;
UPDATE private.booking_notifications SET status = 'sent' WHERE status IS NULL;
ALTER TABLE private.booking_notifications ALTER COLUMN status SET DEFAULT 'sent';
ALTER TABLE private.booking_notifications ALTER COLUMN status SET NOT NULL;
ALTER TABLE private.booking_notifications ADD CONSTRAINT booking_notifications_status_check
  CHECK (status IN ('pending', 'sending', 'sent', 'failed'));
ALTER TABLE private.booking_notifications ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE private.booking_notifications ADD COLUMN max_attempts integer NOT NULL DEFAULT 5;
ALTER TABLE private.booking_notifications ADD COLUMN next_retry_at timestamptz;
ALTER TABLE private.booking_notifications ADD COLUMN claimed_at timestamptz;
ALTER TABLE private.booking_notifications ADD COLUMN sent_at timestamptz;
ALTER TABLE private.booking_notifications ADD COLUMN last_error text;

CREATE OR REPLACE FUNCTION public.claim_booking_notification_v2(p_booking uuid, p_kind text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO private.booking_notifications(booking_id, kind, status, attempts, claimed_at)
  VALUES(p_booking, p_kind, 'sending', 1, now())
  ON CONFLICT (booking_id, kind) DO UPDATE SET
    status = 'sending', attempts = private.booking_notifications.attempts + 1,
    claimed_at = now(), last_error = NULL
  WHERE (private.booking_notifications.status = 'failed'
      AND private.booking_notifications.attempts < private.booking_notifications.max_attempts
      AND private.booking_notifications.next_retry_at <= now())
;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.complete_booking_notification_v2(p_booking uuid, p_kind text,
  p_success boolean, p_error text DEFAULT NULL, p_retryable boolean DEFAULT true) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE private.booking_notifications n SET
    status = CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
    sent_at = CASE WHEN p_success THEN now() ELSE NULL END,
    next_retry_at = CASE WHEN NOT p_success AND p_retryable AND n.attempts < n.max_attempts
      THEN now() + least(interval '1 hour', interval '5 seconds' * power(2, greatest(n.attempts - 1, 0))) ELSE NULL END,
    last_error = CASE WHEN p_success THEN NULL ELSE left(coalesce(p_error, 'Notification failed'), 4000) END,
    claimed_at = NULL
  WHERE n.booking_id = p_booking AND n.kind = p_kind AND n.status = 'sending';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.booking_notification_status_v2(p_booking uuid, p_kind text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('status', status, 'attempts', attempts, 'max_attempts', max_attempts,
    'next_retry_at', next_retry_at, 'last_error', last_error)
  FROM private.booking_notifications WHERE booking_id = p_booking AND kind = p_kind;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats(), public.admin_list_bookings(text,text,integer,integer),
  public.admin_list_chat_sessions(text,integer,integer), public.admin_import_hotel(jsonb,jsonb,jsonb,boolean,uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(), public.admin_list_bookings(text,text,integer,integer),
  public.admin_list_chat_sessions(text,integer,integer), public.admin_import_hotel(jsonb,jsonb,jsonb,boolean,uuid)
  TO anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_booking_notification_v2(uuid,text),
  public.complete_booking_notification_v2(uuid,text,boolean,text,boolean), public.booking_notification_status_v2(uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_notification_v2(uuid,text),
  public.complete_booking_notification_v2(uuid,text,boolean,text,boolean), public.booking_notification_status_v2(uuid,text)
  TO service_role;

-- Published only once all three reliability migrations are installed.
CREATE OR REPLACE FUNCTION public.app_capabilities() RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT '{"bookingSearch":true,"adminReliability":true,"applicationResubmit":true}'::jsonb;
$$;
REVOKE ALL ON FUNCTION public.app_capabilities() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_capabilities() TO anon, authenticated;

COMMIT;
