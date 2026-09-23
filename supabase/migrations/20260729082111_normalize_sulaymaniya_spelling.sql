-- Update trigger to normalize all Sulaymaniya variants to a single spelling
CREATE OR REPLACE FUNCTION normalize_hotel_city()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.city ILIKE 'dohuk' THEN
    NEW.city := 'Duhok';
  ELSIF NEW.city ILIKE 'arbil' OR NEW.city ILIKE 'hewler' OR NEW.city ILIKE 'hewlêr' THEN
    NEW.city := 'Erbil';
  ELSIF NEW.city ILIKE 'slemani'
     OR NEW.city ILIKE 'slêmanî'
     OR NEW.city ILIKE 'suleimaniyah'
     OR NEW.city ILIKE 'sulaymaniyah'
     OR NEW.city ILIKE 'sulaimaniyya'
     OR NEW.city ILIKE 'sulaimaniya'
     OR NEW.city ILIKE 'sulaymaniyya' THEN
    NEW.city := 'Sulaymaniya';
  ELSIF NEW.city ILIKE 'zaxo' THEN
    NEW.city := 'Zakho';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill hotels
UPDATE hotels SET city = 'Sulaymaniya'
WHERE city ILIKE 'sulaimaniyya'
   OR city ILIKE 'sulaymaniyah'
   OR city ILIKE 'suleimaniyah'
   OR city ILIKE 'sulaimaniya'
   OR city ILIKE 'sulaymaniyya';

-- Merge destination entries: delete outdated variants
DELETE FROM destinations
WHERE name ILIKE 'sulaimaniyya'
   OR name ILIKE 'sulaymaniyah'
   OR name ILIKE 'suleimaniyah';

-- Insert canonical spelling if missing
INSERT INTO destinations (name)
SELECT 'Sulaymaniya'
WHERE NOT EXISTS (SELECT 1 FROM destinations WHERE name = 'Sulaymaniya');
