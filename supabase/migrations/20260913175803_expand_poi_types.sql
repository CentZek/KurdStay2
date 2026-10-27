/*
# Expand points_of_interest type constraint

1. Modified Tables
  - `points_of_interest`
    - `type` column: add 'nature' and 'activity' to allowed values

2. Notes
  - Covers four categories from the Kurdistan travel guide:
    Food/restaurants, historic sights, natural wonders, modern activities
*/

ALTER TABLE points_of_interest DROP CONSTRAINT IF EXISTS points_of_interest_type_check;

ALTER TABLE points_of_interest ADD CONSTRAINT points_of_interest_type_check
  CHECK (type IN ('sight', 'restaurant', 'nature', 'activity'));
