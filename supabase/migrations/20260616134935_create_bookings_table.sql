
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id),
  room_type_id UUID NOT NULL REFERENCES room_types(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  guests INTEGER NOT NULL DEFAULT 1,
  rooms INTEGER NOT NULL DEFAULT 1,
  base_price_total NUMERIC(10,2) NOT NULL,
  margin_percentage NUMERIC(5,2) NOT NULL,
  margin_amount NUMERIC(10,2) NOT NULL,
  final_price_total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a booking (public booking form)
CREATE POLICY "bookings_public_insert" ON bookings FOR INSERT
  WITH CHECK (TRUE);

-- Admin can view all bookings
CREATE POLICY "bookings_admin_select" ON bookings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin can update bookings (confirm/cancel)
CREATE POLICY "bookings_admin_update" ON bookings FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Hotel owners can view bookings for their hotels
CREATE POLICY "bookings_owner_select" ON bookings FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM hotels WHERE hotels.id = bookings.hotel_id AND hotels.owner_id = auth.uid())
  );

-- Customers can view their own bookings by email (handled via app logic with service role if needed)
CREATE POLICY "bookings_public_select" ON bookings FOR SELECT
  USING (TRUE);
