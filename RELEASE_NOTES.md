# Booking audit and deployment

Git pushes do not themselves confirm a frontend or database deployment. The
security migrations and matching Edge Functions must be deployed together with
the frontend. See the final release check below for the observed backend state.

## Fixed

- Anonymous access to private profiles, reservations, chats and applications;
  anonymous edits to properties, prices, inventory and manager assignments.
- Forged browser roles, public privileged registration, unauthorized password
  changes, readable password storage, and known seeded demo passwords.
- ID-card impersonation via `x-user-id`, phone verification against someone
  else's profile, unrestricted hotel imports, and chatbot booking lookups that
  previously used service-role access with only a supplied phone number.
- Browser-supplied booking totals, ignored nightly prices/closures/inventory,
  duplicate retries, multi-room capacity validation and historical status updates.
- Repeated notification triggers, unlimited verification attempts, and partial
  property approval that could create duplicate properties on retry.
- Private REST responses and signed ID images cached by the service worker.
- Vulnerable dependencies. Overrides align the asset generator with the app's
  Capacitor CLI and patched Sharp/UUID releases. The asset smoke test exercises
  icon loading, resizing and Xcode ID generation.

Checkout now checks availability before enabling submission, explains failures,
preserves input on retry, displays server totals and actual reservation status,
and provides a route back to the property. Feedback is translated into all four
languages. Listing prices include the platform margin. Date-only formatting no
longer shifts the stay day in time zones west of UTC.

## Coordinated deployment

1. Back up the database and test this release against a staging copy. Rotate any
   accounts still using the shipped `admin123` or `hotel123` passwords through a
   trusted SQL connection. The migration disables these exact seeded credentials;
   it retains accounts and any passwords already changed. Existing passwords may
   have been exposed by the old public profiles policy and should be rotated.
2. Inspect room inventory before release. Every occupied night must have a
   `room_availability` row with sufficient `available_rooms`. This field is the
   total sellable stock; pending and confirmed reservations are subtracted
   automatically. Checkout day is excluded. Unconfigured or closed nights cannot
   be booked. Existing reservations are retained.
3. During a coordinated maintenance window, apply pending migrations in filename
   order using the database's migration ledger. The security migrations exist
   under both `20260926160549`–`20260926160716` and
   `20260926170000`–`20260926173000`; the later copies now safely reconcile
   existing objects. Keep the recorded migration versions; do not delete or
   rename deployed migrations. Deploy `id-card`, `phone-verification`, `whatsapp-notify`,
   `chatbot`, `import-hotel`, and the new `property-images` Edge Function, including
   `_shared/session.ts`. Preserve existing service and messaging secrets. Deploy
   the frontend build and rebuild/sync native clients with the same frontend.
   Older clients intentionally fail closed; they cannot perform legacy anonymous
   writes. Do not ship only the frontend or only the database changes.
4. Sign in again and verify admin, manager, customer and anonymous guest flows.
   Sessions expire after seven days and logout revokes the server token. Legacy
   `stayhub_user` localStorage profiles are discarded. Managers retain room,
   inventory and image management for assigned properties.
5. Verify simultaneous requests for the last room on staging, plus real storage,
   CORS, WhatsApp delivery, and native builds. Automated browser tests use mocked
   APIs; database tests execute the full migration history in isolated PGlite.
   They do not contact or modify production data or send messages.

Guest confirmations are private to the originating browser secret or the account
that created them. Historical bookings lack that ownership information and remain
accessible to authorized staff, rather than being matched to unverified emails.
Clearing browser storage loses anonymous confirmation access; staff can locate the
full booking reference. Private live chat uses authenticated HTTP polling because
the previous anonymous Realtime connection cannot convey the new session headers.

Notification claims guarantee at most one delivery attempt per booking/event.
If the messaging provider fails after the claim, staff must inspect delivery logs
and explicitly retry through trusted operations. Booking success does not depend
on messaging delivery. The public chatbot still needs deployment-level rate limits
appropriate to its AI usage budget.

## Verification

```text
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run build
npm audit
```

Edge type checking (Deno):

```text
deno check --node-modules-dir=none --no-lock supabase/functions/*/index.ts
```

Do not restore permissive policies as a rollback. Keep the security migration in
place and roll forward with matching clients. Session headers are validated
against hashed, expiring server records using [PostgREST request headers](https://postgrest.org/en/latest/references/transactions.html).
Access is enforced with [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
and restricted function/column privileges.

## Integration with the latest main branch

The duplicate registration migration now uses `CREATE OR REPLACE` so the full
migration history can run on a fresh database. The security migrations run after
that migration. Thirteen PNG/APK files truncated to exactly 512 KiB in the icon
commit were restored from their byte-identical, complete predecessors; PNG CRCs
and APK ZIP integrity were checked. The restored APK is the existing release,
not a new native build containing these changes.

## Final release check — 2026-09-26

Integrated upstream commit `1b73291`, which adds the earlier copies of the four
security migrations and Edge Function JWT configuration. This exposed a fresh
database failure (`app_sessions already exists`). The later migrations now use
idempotent table/column/index creation, function replacement, and transactional
trigger/constraint replacement. The full migration history passes, including a
replay test that preserves existing profiles, sessions, bookings, inventory,
verification records and notification claims. Access restrictions remain tested.

Registration now supplies its new session token when sending or verifying a
phone code. The browser regression test rejects missing session headers, matching
the deployed function's authentication boundary.

Sorani, Bahdini and Arabic wording, Arabic plural categories, RTL contact fields,
and Arabic/Kurdish keyboard digits were corrected. Unsupported Kurdish date
locales fall back to numeric day/month/year instead of another language.

Validation: clean `npm ci`, production build, 22 automated tests, 15 browser
tests (including targeted registration reruns after the session fix), and all
six Edge Function Deno type checks. Dependency audit reports zero vulnerabilities.

Read-only checks against the configured hosted backend confirmed:

- An anonymous session resolves to no profile, and private profiles, bookings,
  chats, messages and accommodation applications expose no rows anonymously.
- The booking quote RPC exists and rejects an unknown property.
- All six Edge Functions respond with the required session/visitor CORS headers
  and reject empty or unauthenticated requests as expected.
- Public catalog reads succeed: 403 active properties and 848 visible room types
  belonging to those properties. No future open inventory with positive room
  quantities was found. **Booking launch remains blocked until managers enter
  accurate nightly stock and prices.** No inventory values were invented or
  changed during verification.

A successful real booking, WhatsApp delivery, authenticated production staff
flows, and native release builds have not been exercised by these checks. No
messages were sent and no production reservations or accounts were created.
The public frontend URL has not yet been provided, so its deployment is not
verified by this report.
