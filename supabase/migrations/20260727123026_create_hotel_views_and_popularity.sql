/*
# Create hotel_views table and popularity scoring

## Purpose
Track hotel page views with duration to power:
- "Explore Destinations" images (most-viewed hotel per city)
- Default hotel sort order (popularity score)
- "Most Booked" filter support

## New Tables
- `hotel_views`
  - `id` (uuid, primary key)
  - `hotel_id` (uuid, FK to hotels)
  - `duration_seconds` (integer, time spent viewing)
  - `viewed_at` (timestamptz, when the view happened)

## New Functions
- `get_hotel_popularity_scores()` - returns hotels sorted by composite popularity
- `get_city_featured_hotel(city_name text)` - returns the most-viewed hotel image for a city

## Security
- RLS enabled on hotel_views
- Anyone (anon + authenticated) can insert views (tracking is anonymous)
- Only service role can read raw view data
*/

-- Hotel views tracking table
CREATE TABLE IF NOT EXISTS hotel_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  duration_seconds integer NOT NULL DEFAULT 0,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_views_hotel_id ON hotel_views(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_views_viewed_at ON hotel_views(viewed_at);

ALTER TABLE hotel_views ENABLE ROW LEVEL SECURITY;

-- Anyone can log a view (anonymous tracking)
DROP POLICY IF EXISTS "anyone_can_insert_views" ON hotel_views;
CREATE POLICY "anyone_can_insert_views" ON hotel_views FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- No one can read/update/delete views from client (admin only via service role)
DROP POLICY IF EXISTS "no_client_select_views" ON hotel_views;
CREATE POLICY "no_client_select_views" ON hotel_views FOR SELECT
  TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "no_client_update_views" ON hotel_views;
CREATE POLICY "no_client_update_views" ON hotel_views FOR UPDATE
  TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "no_client_delete_views" ON hotel_views;
CREATE POLICY "no_client_delete_views" ON hotel_views FOR DELETE
  TO anon, authenticated USING (false);

-- Function: Get featured hotel image per city (most total view-seconds in last 90 days)
CREATE OR REPLACE FUNCTION get_city_featured_hotels()
RETURNS TABLE (
  city text,
  hotel_id uuid,
  hotel_name text,
  featured_image text,
  total_view_seconds bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH view_scores AS (
    SELECT
      h.city,
      h.id AS hotel_id,
      h.name AS hotel_name,
      h.images[1] AS featured_image,
      COALESCE(SUM(hv.duration_seconds), 0) AS total_view_seconds,
      ROW_NUMBER() OVER (PARTITION BY h.city ORDER BY COALESCE(SUM(hv.duration_seconds), 0) DESC, COUNT(hv.id) DESC, h.created_at DESC) AS rn
    FROM hotels h
    LEFT JOIN hotel_views hv ON hv.hotel_id = h.id AND hv.viewed_at > NOW() - INTERVAL '90 days'
    WHERE h.status = 'active'
    GROUP BY h.city, h.id, h.name, h.images
  )
  SELECT vs.city, vs.hotel_id, vs.hotel_name, vs.featured_image, vs.total_view_seconds
  FROM view_scores vs
  WHERE vs.rn = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get hotels with popularity scores for sorting
CREATE OR REPLACE FUNCTION get_hotels_with_popularity(
  filter_city text DEFAULT NULL,
  filter_property_type text DEFAULT NULL
)
RETURNS TABLE (
  hotel_id uuid,
  popularity_score numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH booking_counts AS (
    SELECT
      b.hotel_id,
      COUNT(*) AS total_bookings,
      COUNT(*) FILTER (WHERE b.created_at > NOW() - INTERVAL '30 days') AS recent_bookings
    FROM bookings b
    GROUP BY b.hotel_id
  ),
  view_counts AS (
    SELECT
      hv.hotel_id,
      COUNT(*) AS total_views,
      SUM(hv.duration_seconds) AS total_duration,
      COUNT(*) FILTER (WHERE hv.viewed_at > NOW() - INTERVAL '30 days') AS recent_views
    FROM hotel_views hv
    GROUP BY hv.hotel_id
  )
  SELECT
    h.id AS hotel_id,
    (
      COALESCE(bc.recent_bookings, 0) * 10.0 +
      COALESCE(bc.total_bookings, 0) * 3.0 +
      COALESCE(vc.recent_views, 0) * 2.0 +
      COALESCE(vc.total_views, 0) * 0.5 +
      COALESCE(vc.total_duration, 0) * 0.01
    )::numeric AS popularity_score
  FROM hotels h
  LEFT JOIN booking_counts bc ON bc.hotel_id = h.id
  LEFT JOIN view_counts vc ON vc.hotel_id = h.id
  WHERE h.status = 'active'
    AND (filter_city IS NULL OR h.city ILIKE filter_city)
    AND (filter_property_type IS NULL OR h.property_type = filter_property_type)
  ORDER BY popularity_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get booking count per hotel (for "Most Booked" sort)
CREATE OR REPLACE FUNCTION get_hotel_booking_counts()
RETURNS TABLE (
  hotel_id uuid,
  booking_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT b.hotel_id, COUNT(*) AS booking_count
  FROM bookings b
  GROUP BY b.hotel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
