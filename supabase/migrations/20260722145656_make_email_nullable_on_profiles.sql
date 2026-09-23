/*
# Make email column nullable on profiles table

1. Modified Tables
   - `profiles` - remove NOT NULL constraint from `email` column

2. Purpose
   - Hotel manager accounts are created with username + phone only
   - Email is not required for hotel owners/managers
   - The register_user function no longer sets email, causing NOT NULL violations
*/

ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL;
