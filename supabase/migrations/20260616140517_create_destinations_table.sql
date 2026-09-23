
CREATE TABLE destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

-- Public can read destinations
CREATE POLICY "destinations_public_select" ON destinations FOR SELECT
  USING (TRUE);

-- Admin can manage destinations
CREATE POLICY "destinations_admin_insert" ON destinations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "destinations_admin_update" ON destinations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "destinations_admin_delete" ON destinations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Seed initial destinations
INSERT INTO destinations (name) VALUES ('Erbil'), ('Duhok'), ('Zakho'), ('Sulaymaniyah');
