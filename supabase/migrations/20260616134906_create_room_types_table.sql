
CREATE TABLE room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_guests INTEGER NOT NULL DEFAULT 2,
  base_price NUMERIC(10,2) NOT NULL,
  images TEXT[] DEFAULT '{}',
  amenities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;

-- Public can view room types for active hotels
CREATE POLICY "room_types_public_select" ON room_types FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM hotels WHERE hotels.id = room_types.hotel_id AND hotels.status = 'active')
  );

-- Admin can manage all room types
CREATE POLICY "room_types_admin_select" ON room_types FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "room_types_admin_insert" ON room_types FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "room_types_admin_update" ON room_types FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "room_types_admin_delete" ON room_types FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Hotel owners can manage room types for their hotels
CREATE POLICY "room_types_owner_select" ON room_types FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM hotels WHERE hotels.id = room_types.hotel_id AND hotels.owner_id = auth.uid())
  );

CREATE POLICY "room_types_owner_insert" ON room_types FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM hotels WHERE hotels.id = room_types.hotel_id AND hotels.owner_id = auth.uid())
  );

CREATE POLICY "room_types_owner_update" ON room_types FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM hotels WHERE hotels.id = room_types.hotel_id AND hotels.owner_id = auth.uid())
  );

CREATE POLICY "room_types_owner_delete" ON room_types FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM hotels WHERE hotels.id = room_types.hotel_id AND hotels.owner_id = auth.uid())
  );
