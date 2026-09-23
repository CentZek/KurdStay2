/*
# Add latitude and longitude to hotels table

1. Modified Tables
  - `hotels`
    - `latitude` (DOUBLE PRECISION, nullable) - GPS latitude for map navigation
    - `longitude` (DOUBLE PRECISION, nullable) - GPS longitude for map navigation

2. Important Notes
  - These coordinates enable "Get Directions" links that open native maps on mobile.
  - Both fields are nullable since not all hotels may have coordinates initially.
*/

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
