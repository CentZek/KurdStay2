/*
# Chat stay matching and rate limiting

Adds the smart property search used by the chatbot assistant, a per-visitor
rate limiter for chat turns, and a "request staff help" feature.

1. New Functions
   - chat_stay_catalog(): returns active cities and amenities as JSON for the AI system prompt
   - find_chat_stays(city, check_in, check_out, guests, rooms, property_type, max_total,
     currency, amenities): searches available properties checking real stock, reservations,
     capacity, amenities, and budget. Returns up to 3 best-priced results per currency.
   - claim_chat_turn(session_uuid): rate-limits chat to 60 turns/hour per visitor
   - request_chat_agent(session_uuid): marks a chat session as needing staff help

2. Modified Tables
   - chat_sessions: adds needs_agent boolean column (default false)

3. New Tables
   - private.chat_rate_limits: visitor_hash, window_start, requests count

4. Security
   - chat_stay_catalog, find_chat_stays granted to anon, authenticated
   - claim_chat_turn, request_chat_agent granted to anon, authenticated
   - All functions are SECURITY DEFINER with search_path locked
   - Rate limit table in private schema, inaccessible to API clients
*/

CREATE OR REPLACE FUNCTION public.chat_stay_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('cities', coalesce((SELECT jsonb_agg(city ORDER BY city) FROM (SELECT DISTINCT city FROM hotels WHERE status='active') c),'[]'),
    'amenities', coalesce((SELECT jsonb_agg(a ORDER BY a) FROM (
      SELECT unnest(amenities) a FROM hotels WHERE status='active'
      UNION SELECT unnest(r.amenities) a FROM room_types r JOIN hotels h ON h.id=r.hotel_id WHERE h.status='active'
    ) m WHERE a IS NOT NULL),'[]'));
$$;

CREATE OR REPLACE FUNCTION public.find_chat_stays(p_city text, p_check_in date, p_check_out date, p_guests integer, p_rooms integer DEFAULT 1,
  p_property_type text DEFAULT NULL, p_max_total numeric DEFAULT NULL, p_currency text DEFAULT NULL, p_amenities text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE candidate record; quote jsonb; options jsonb := '[]';
BEGIN
  IF p_check_in IS NULL OR p_check_out IS NULL OR p_check_in < (now() AT TIME ZONE 'Asia/Baghdad')::date
    OR p_check_out <= p_check_in OR p_check_out-p_check_in > 365 THEN RAISE EXCEPTION 'INVALID_DATES'; END IF;
  IF p_guests IS NULL OR p_guests NOT BETWEEN 1 AND 100 OR p_rooms IS NULL OR p_rooms NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'INVALID_CAPACITY'; END IF;
  IF p_city IS NULL OR length(trim(p_city)) NOT BETWEEN 1 AND 100 OR cardinality(p_amenities)>10
    OR (p_max_total IS NOT NULL AND (p_max_total<=0 OR p_currency IS NULL OR p_currency NOT IN ('USD','IQD')))
    OR (p_property_type IS NOT NULL AND p_property_type NOT IN ('hotel','farm','motel','apartment','villa')) THEN RAISE EXCEPTION 'INVALID_FILTERS'; END IF;
  FOR candidate IN
    SELECT h.id,h.name,h.city,h.property_type,h.images,h.currency,h.amenities,r.id room_id,r.name room_name
    FROM hotels h JOIN room_types r ON r.hotel_id=h.id
    WHERE h.status='active' AND (p_city='*' OR lower(trim(h.city))=lower(trim(p_city)))
      AND (p_property_type IS NULL OR h.property_type=p_property_type)
      AND (p_max_total IS NULL OR h.currency=p_currency)
      AND r.max_guests*p_rooms >= p_guests
      AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p_amenities,'{}')) wanted
        WHERE NOT EXISTS (SELECT 1 FROM unnest(coalesce(h.amenities,'{}') || coalesce(r.amenities,'{}')) actual WHERE lower(trim(actual))=lower(trim(wanted))))
      AND (SELECT count(*) FROM room_availability a WHERE a.room_type_id=r.id AND a.date>=p_check_in AND a.date<p_check_out
        AND a.is_closed IS NOT TRUE AND a.available_rooms>=p_rooms)=p_check_out-p_check_in
  LOOP
    BEGIN
      quote := public.booking_quote(candidate.id,candidate.room_id,p_check_in,p_check_out,p_guests,p_rooms);
      IF p_max_total IS NULL OR (quote->>'finalPriceTotal')::numeric <= p_max_total THEN
        options := options || jsonb_build_array(jsonb_build_object('id',candidate.id,'name',candidate.name,'city',candidate.city,
          'propertyType',candidate.property_type,'image',candidate.images[1],'currency',candidate.currency,'roomId',candidate.room_id,
          'roomName',candidate.room_name,'amenities',candidate.amenities,'total',(quote->>'finalPriceTotal')::numeric,
          'nights',p_check_out-p_check_in,'guests',p_guests,'rooms',p_rooms,'checkIn',p_check_in,'checkOut',p_check_out));
      END IF;
    EXCEPTION WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM NOT IN ('ROOM_UNAVAILABLE','PROPERTY_UNAVAILABLE','INVALID_CAPACITY') THEN RAISE; END IF;
    END;
  END LOOP;
  RETURN (WITH unique_stays AS (
    SELECT DISTINCT ON (item->>'id') item FROM jsonb_array_elements(options) item ORDER BY item->>'id',(item->>'total')::numeric
  ), ranked AS (
    SELECT item, row_number() OVER (PARTITION BY item->>'currency' ORDER BY (item->>'total')::numeric,item->>'id') price_rank FROM unique_stays
  ), best AS (SELECT item FROM ranked ORDER BY price_rank,item->>'name',item->>'id' LIMIT 3)
  SELECT coalesce(jsonb_agg(item),'[]') FROM best);
END $$;

REVOKE ALL ON FUNCTION public.find_chat_stays(text,date,date,integer,integer,text,numeric,text,text[]), public.chat_stay_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_chat_stays(text,date,date,integer,integer,text,numeric,text,text[]), public.chat_stay_catalog() TO anon,authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_sessions' AND column_name='needs_agent') THEN
    ALTER TABLE chat_sessions ADD COLUMN needs_agent boolean NOT NULL DEFAULT false;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS private.chat_rate_limits(visitor_hash text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), requests integer NOT NULL DEFAULT 1);

CREATE OR REPLACE FUNCTION public.claim_chat_turn(p_session uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE visitor text := public.request_token_hash('x-stay-visitor'); used integer;
BEGIN
  IF visitor IS NULL OR NOT EXISTS (SELECT 1 FROM chat_sessions WHERE id=p_session AND visitor_hash=visitor AND status='open') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  INSERT INTO private.chat_rate_limits(visitor_hash) VALUES(visitor) ON CONFLICT(visitor_hash) DO UPDATE
    SET requests=CASE WHEN private.chat_rate_limits.window_start < now()-interval '1 hour' THEN 1 ELSE private.chat_rate_limits.requests+1 END,
      window_start=CASE WHEN private.chat_rate_limits.window_start < now()-interval '1 hour' THEN now() ELSE private.chat_rate_limits.window_start END
    RETURNING requests INTO used;
  RETURN used<=60;
END $$;

CREATE OR REPLACE FUNCTION public.request_chat_agent(p_session uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE chat_sessions SET needs_agent=true, updated_at=now() WHERE id=p_session AND status='open'
    AND visitor_hash=public.request_token_hash('x-stay-visitor');
  IF NOT FOUND THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.claim_chat_turn(uuid),public.request_chat_agent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_chat_turn(uuid),public.request_chat_agent(uuid) TO anon,authenticated;