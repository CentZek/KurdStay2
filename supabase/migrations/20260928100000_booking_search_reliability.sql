BEGIN;

CREATE OR REPLACE FUNCTION public.booking_quote(p_hotel_id uuid, p_room_type_id uuid, p_check_in date,
  p_check_out date, p_guests integer, p_rooms integer, p_exclude uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE room room_types%ROWTYPE; hotel hotels%ROWTYPE;
  base numeric; margin numeric; remaining integer; complete boolean;
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

  WITH nightly AS (
    SELECT (p_check_in + nights.n)::date AS stay_date, a.available_rooms, a.is_closed,
      coalesce(a.base_price_override, room.base_price) AS price
    FROM generate_series(0, p_check_out - p_check_in - 1) nights(n)
    LEFT JOIN room_availability a ON a.room_type_id = room.id AND a.date = p_check_in + nights.n
  ), aggregated AS (
    SELECT n.price, n.available_rooms, n.is_closed, coalesce(sum(b.rooms), 0)::integer AS reserved
    FROM nightly n
    LEFT JOIN bookings b ON b.room_type_id = room.id AND b.status IN ('pending','confirmed')
      AND b.check_in_date <= n.stay_date AND b.check_out_date > n.stay_date
      AND (p_exclude IS NULL OR b.id <> p_exclude)
    GROUP BY n.stay_date, n.price, n.available_rooms, n.is_closed
  )
  SELECT round(sum(price * p_rooms), 2),
    min(coalesce(available_rooms - reserved, -1)),
    bool_and(available_rooms IS NOT NULL AND is_closed IS NOT TRUE AND price >= 0)
  INTO base, remaining, complete
  FROM aggregated;

  IF NOT complete OR remaining < p_rooms THEN RAISE EXCEPTION 'ROOM_UNAVAILABLE'; END IF;
  margin := round(base * coalesce(hotel.profit_margin_percentage, 0) / 100, 2);
  RETURN jsonb_build_object('nights', p_check_out - p_check_in, 'basePriceTotal', base,
    'marginPercentage', coalesce(hotel.profit_margin_percentage, 0), 'marginAmount', margin,
    'finalPriceTotal', base + margin, 'availableRooms', remaining);
END $$;

REVOKE ALL ON FUNCTION public.booking_quote(uuid,uuid,date,date,integer,integer,uuid) FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS hotels_search_filters ON hotels(status, property_type, city);

CREATE OR REPLACE FUNCTION public.search_hotels(
  p_location text DEFAULT NULL,
  p_property_type text DEFAULT NULL,
  p_check_in date DEFAULT NULL,
  p_check_out date DEFAULT NULL,
  p_guests integer DEFAULT 1,
  p_rooms integer DEFAULT 1,
  p_sort text DEFAULT 'popular',
  p_limit integer DEFAULT 12,
  p_offset integer DEFAULT 0
) RETURNS TABLE (
  id uuid,
  name text,
  location text,
  city text,
  images text[],
  amenities text[],
  property_type text,
  currency text,
  min_price numeric,
  max_guests integer,
  popularity_score numeric,
  booking_count bigint,
  total_count bigint
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE normalized_location text := nullif(lower(btrim(p_location)), '');
BEGIN
  IF (p_check_in IS NULL) <> (p_check_out IS NULL)
    OR (p_check_in IS NOT NULL AND (p_check_in < (now() AT TIME ZONE 'Asia/Baghdad')::date
      OR p_check_out <= p_check_in OR p_check_out - p_check_in > 365)) THEN
    RAISE EXCEPTION 'INVALID_DATES';
  END IF;
  IF p_guests IS NULL OR p_guests NOT BETWEEN 1 AND 100 OR p_rooms IS NULL OR p_rooms NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY';
  END IF;
  IF length(coalesce(p_location, '')) > 100
    OR (p_property_type IS NOT NULL AND p_property_type NOT IN ('hotel','farm','motel','apartment','villa'))
    OR p_sort IS NULL OR p_sort NOT IN ('popular','most_booked','price_low','price_high')
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'INVALID_FILTERS';
  END IF;

  RETURN QUERY
  WITH filtered_rooms AS (
    SELECT h.id AS hotel_id, h.name AS hotel_name, h.location AS hotel_location, h.city AS hotel_city,
      h.images AS hotel_images, h.amenities AS hotel_amenities, h.property_type AS hotel_property_type,
      h.currency AS hotel_currency, h.profit_margin_percentage, r.id AS room_id, r.max_guests, r.base_price
    FROM hotels h
    JOIN room_types r ON r.hotel_id = h.id
    WHERE h.status = 'active'
      AND r.max_guests * p_rooms >= p_guests
      AND (p_property_type IS NULL OR h.property_type = p_property_type)
      AND (normalized_location IS NULL OR strpos(lower(h.city), normalized_location) > 0
        OR (normalized_location IN ('duhok','dohuk','dahuk') AND lower(h.city) IN ('duhok','dohuk','dahuk'))
        OR (normalized_location IN ('erbil','arbil','hawler','hewler','hewlêr') AND lower(h.city) IN ('erbil','arbil','hawler','hewler','hewlêr'))
        OR (normalized_location IN ('sulaymaniya','sulaymaniyah','suleimaniyah','sulaimaniyya','slemani','slêmanî')
          AND lower(h.city) IN ('sulaymaniya','sulaymaniyah','suleimaniyah','sulaimaniyya','slemani','slêmanî'))
        OR (normalized_location IN ('zakho','zaxo') AND lower(h.city) IN ('zakho','zaxo')))
  ), nightly AS (
    SELECT fr.hotel_id, fr.room_id, (p_check_in + nights.n)::date AS stay_date, a.available_rooms, a.is_closed,
      coalesce(a.base_price_override, fr.base_price) AS price
    FROM filtered_rooms fr
    CROSS JOIN LATERAL generate_series(0, p_check_out - p_check_in - 1) AS nights(n)
    LEFT JOIN room_availability a ON a.room_type_id = fr.room_id AND a.date = p_check_in + nights.n
    WHERE p_check_in IS NOT NULL
  ), aggregated_nights AS (
    SELECT n.hotel_id, n.room_id, n.stay_date, n.price, n.available_rooms, n.is_closed,
      coalesce(sum(b.rooms), 0)::integer AS reserved
    FROM nightly n
    LEFT JOIN bookings b ON b.room_type_id = n.room_id AND b.status IN ('pending','confirmed')
      AND b.check_in_date <= n.stay_date AND b.check_out_date > n.stay_date
    GROUP BY n.hotel_id, n.room_id, n.stay_date, n.price, n.available_rooms, n.is_closed
  ), available_rooms AS (
    SELECT an.hotel_id, an.room_id, avg(an.price) AS nightly_price
    FROM aggregated_nights an
    GROUP BY an.hotel_id, an.room_id
    HAVING count(*) = p_check_out - p_check_in
      AND bool_and(an.available_rooms IS NOT NULL AND an.is_closed IS NOT TRUE AND an.price >= 0
        AND an.available_rooms - an.reserved >= p_rooms)
  ), room_prices AS (
    SELECT fr.*, coalesce(ar.nightly_price, fr.base_price) AS unit_price
    FROM filtered_rooms fr
    LEFT JOIN available_rooms ar ON ar.hotel_id = fr.hotel_id AND ar.room_id = fr.room_id
    WHERE p_check_in IS NULL OR ar.room_id IS NOT NULL
  ), best_rooms AS (
    SELECT DISTINCT ON (rp.hotel_id) rp.*
    FROM room_prices rp
    ORDER BY rp.hotel_id, rp.unit_price, rp.room_id
  ), capacities AS (
    SELECT rp.hotel_id, max(rp.max_guests) AS max_guests
    FROM room_prices rp
    GROUP BY rp.hotel_id
  ), booking_counts AS (
    SELECT b.hotel_id, count(*) AS booking_count,
      count(*) FILTER (WHERE b.created_at > now() - interval '30 days') AS recent_bookings
    FROM bookings b
    GROUP BY b.hotel_id
  ), view_counts AS (
    SELECT hv.hotel_id, count(*) AS view_count, sum(hv.duration_seconds) AS total_duration,
      count(*) FILTER (WHERE hv.viewed_at > now() - interval '30 days') AS recent_views
    FROM hotel_views hv
    GROUP BY hv.hotel_id
  ), ranked AS (
    SELECT br.hotel_id, br.hotel_name, br.hotel_location, br.hotel_city, br.hotel_images,
      br.hotel_amenities, br.hotel_property_type, br.hotel_currency, c.max_guests,
      round(br.unit_price * (1 + coalesce(br.profit_margin_percentage, 0) / 100), 2) AS min_price,
      (coalesce(bc.recent_bookings, 0) * 10.0 + coalesce(bc.booking_count, 0) * 3.0
        + coalesce(vc.recent_views, 0) * 2.0 + coalesce(vc.view_count, 0) * 0.5
        + coalesce(vc.total_duration, 0) * 0.01)::numeric AS popularity_score,
      coalesce(bc.booking_count, 0)::bigint AS booking_count
    FROM best_rooms br
    JOIN capacities c ON c.hotel_id = br.hotel_id
    LEFT JOIN booking_counts bc ON bc.hotel_id = br.hotel_id
    LEFT JOIN view_counts vc ON vc.hotel_id = br.hotel_id
  )
  SELECT r.hotel_id, r.hotel_name, r.hotel_location, r.hotel_city, r.hotel_images,
    r.hotel_amenities, r.hotel_property_type, r.hotel_currency, r.min_price, r.max_guests,
    r.popularity_score, r.booking_count, count(*) OVER () AS total_count
  FROM ranked r
  ORDER BY
    CASE WHEN p_sort = 'popular' THEN r.popularity_score END DESC,
    CASE WHEN p_sort = 'most_booked' THEN r.booking_count END DESC,
    CASE WHEN p_sort = 'price_low' THEN r.min_price END ASC,
    CASE WHEN p_sort = 'price_high' THEN r.min_price END DESC,
    r.hotel_name, r.hotel_id
  LIMIT p_limit OFFSET p_offset;
END $$;

REVOKE ALL ON FUNCTION public.search_hotels(text,text,date,date,integer,integer,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_hotels(text,text,date,date,integer,integer,text,integer,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_quote(uuid,uuid,date,date,integer,integer) TO anon, authenticated;

COMMIT;
