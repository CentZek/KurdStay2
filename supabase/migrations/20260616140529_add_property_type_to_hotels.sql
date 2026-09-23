
ALTER TABLE hotels ADD COLUMN property_type TEXT NOT NULL DEFAULT 'hotel' 
  CHECK (property_type IN ('hotel', 'motel', 'apartment', 'villa', 'farm'));
