-- Auto-normalize common city name spelling variants on insert/update
CREATE OR REPLACE FUNCTION normalize_hotel_city()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.city ILIKE 'dohuk' THEN
    NEW.city := 'Duhok';
  ELSIF NEW.city ILIKE 'arbil' OR NEW.city ILIKE 'hewler' OR NEW.city ILIKE 'hewlêr' THEN
    NEW.city := 'Erbil';
  ELSIF NEW.city ILIKE 'slemani' OR NEW.city ILIKE 'slêmanî' OR NEW.city ILIKE 'suleimaniyah' THEN
    NEW.city := 'Sulaymaniyah';
  ELSIF NEW.city ILIKE 'zaxo' THEN
    NEW.city := 'Zakho';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_normalize_hotel_city
  BEFORE INSERT OR UPDATE ON hotels
  FOR EACH ROW
  EXECUTE FUNCTION normalize_hotel_city();
