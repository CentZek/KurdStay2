
CREATE TABLE room_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  available_rooms INTEGER NOT NULL DEFAULT 0,
  base_price_override NUMERIC(10,2),
  is_closed BOOLEAN DEFAULT FALSE,
  UNIQUE(room_type_id, date)
);

ALTER TABLE room_availability ENABLE ROW LEVEL SECURITY;

-- Public can view availability
CREATE POLICY "availability_public_select" ON room_availability FOR SELECT
  USING (TRUE);

-- Admin can manage availability
CREATE POLICY "availability_admin_insert" ON room_availability FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "availability_admin_update" ON room_availability FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "availability_admin_delete" ON room_availability FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Hotel owners can manage availability for their hotel room types
CREATE POLICY "availability_owner_insert" ON room_availability FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM room_types
      JOIN hotels ON hotels.id = room_types.hotel_id
      WHERE room_types.id = room_availability.room_type_id AND hotels.owner_id = auth.uid()
    )
  );

CREATE POLICY "availability_owner_update" ON room_availability FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM room_types
      JOIN hotels ON hotels.id = room_types.hotel_id
      WHERE room_types.id = room_availability.room_type_id AND hotels.owner_id = auth.uid()
    )
  );

CREATE POLICY "availability_owner_delete" ON room_availability FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM room_types
      JOIN hotels ON hotels.id = room_types.hotel_id
      WHERE room_types.id = room_availability.room_type_id AND hotels.owner_id = auth.uid()
    )
  );
