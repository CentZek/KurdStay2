/*
# Add booking date validation constraints

1. Database Changes
   - Add CHECK constraint ensuring check_in_date is not in the past.
   - Add CHECK constraint ensuring check_out_date is after check_in_date.

2. Important Notes
   - These are server-side guards that prevent past-date bookings even
     if client-side validation is bypassed.
   - Existing bookings with past dates are not affected (constraints only
     apply to new inserts and updates).
   - Uses NOT VALID so existing rows are not checked retroactively.
*/

ALTER TABLE bookings
  ADD CONSTRAINT bookings_checkin_not_past
    CHECK (check_in_date >= CURRENT_DATE)
    NOT VALID;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_checkout_after_checkin
    CHECK (check_out_date > check_in_date)
    NOT VALID;
