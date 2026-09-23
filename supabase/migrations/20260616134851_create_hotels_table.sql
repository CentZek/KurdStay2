
CREATE TABLE hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT,
  address TEXT,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'Iraq',
  images TEXT[] DEFAULT '{}',
  amenities TEXT[] DEFAULT '{}',
  profit_margin_percentage NUMERIC(5,2) DEFAULT 10.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;

-- Public can view active hotels
CREATE POLICY "hotels_public_select" ON hotels FOR SELECT
  USING (status = 'active');

-- Admin can view all hotels
CREATE POLICY "hotels_admin_select" ON hotels FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin can insert hotels
CREATE POLICY "hotels_admin_insert" ON hotels FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin can update hotels
CREATE POLICY "hotels_admin_update" ON hotels FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Hotel owners can view their own hotels
CREATE POLICY "hotels_owner_select" ON hotels FOR SELECT
  TO authenticated USING (owner_id = auth.uid());

-- Hotel owners can update their own hotels (limited fields handled by app logic)
CREATE POLICY "hotels_owner_update" ON hotels FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
