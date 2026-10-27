# Booking audit and deployment

For the current update, follow [the database setup steps below](#current-database-setup-steps).

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

### Public frontend check — https://www.kurdstay.com

The live site redirects both HTTP and `www` to `https://kurdstay.com/`, returns
HTTP 200 over valid HTTPS, and is hosted on Netlify. Home, search and registration
pages loaded in English, Arabic, Sorani and Bahdini without JavaScript errors or
horizontal overflow at 390 px. Desktop home also fits at 1440 px. Language
switching updates page direction. Direct SPA routes and service-worker assets
are reachable.

After publishing through Bolt, the live main asset is
`/assets/index-1PMQDd8o.js`. The deployed code includes session-token handling,
session headers, server-side quotes, atomic booking requests, and registration's
shared authentication headers. It uses the same secured Supabase project checked
above. The corrected Sorani, Bahdini and Arabic strings and Arabic guest plurals
are visible on the live pages. Bahdini declares `kmr-Arab-IQ`; all three languages
use RTL layouts with LTR email/phone fields. Anonymous admin navigation redirects
to login.

Live checkout for October 6–8, 2026 calls the quote RPC, displays the unavailable
dates message, and disables "Request booking". No booking was submitted. A
repeat inventory check still found no future open room stock, so configuring
accurate availability remains the booking-launch blocker. Real authenticated
bookings and WhatsApp delivery remain untested as described above.

Production publishing is through Bolt to Netlify. A GitHub push alone does not
confirm a production deployment; verify the published application after each
release.


## Reviewed reliability update (2026-10-27)

The frontend remains compatible with the currently deployed database. A public,
read-only `app_capabilities()` check enables the new server search, admin aggregates,
paginated lists and transactional import screens only after the complete migration
set is present. Missing capabilities or an unavailable check use the established
screens. Application resubmission links are also gated. No write is retried through
a different implementation after an uncertain response.

Apply the following pending migrations in order through the migration ledger:

1. `20260928100000_booking_search_reliability.sql`
2. `20260928101000_account_owner_reliability.sql`
3. `20260928102000_admin_reliability.sql`

Then deploy `whatsapp-notify` with the existing secrets. Its new `_v2` notification
functions coexist with the old function so existing edge deployments can continue
working during the transition. Reopen the app after migration to refresh capabilities.
The compatibility components can be removed after all environments are upgraded.

Imports use an admin-scoped request journal and transaction lock to recover a lost
response without creating another owner, hotel or set of rooms. The journal stores
no plaintext password. Retrying changed details under a completed request is rejected.

Notification retries are bounded and delayed. Partially delivered batches and
ambiguous network failures are not automatically replayed, which avoids duplicate
customer messages. Interrupted sends remain for operator reconciliation; there is
no background retry scheduler. Provider responses are acceptance results, not proof
that a message was delivered to the recipient.

The local review runs isolated SQL and mocked browser tests; it does not apply
production migrations or send live WhatsApp messages. GitHub publication is separate
from Supabase migration and Edge Function deployment.


## Current database setup steps

Target project: **`nqkspjqrahfccevvrnjf`** (Singapore). The app already points to
`https://nqkspjqrahfccevvrnjf.supabase.co`; no new project or frontend integration is needed.
Direct checks on 2026-10-27 confirmed that the configured anon key can read public
hotels and call `current_profile()`. `app_capabilities()` returned **PGRST202 / function
not found**, so the new reliability migration set is not yet fully installed. The
API-description endpoint rejects requests on this project; it is not a valid key
health check. The remote migration ledger still needs verification through the CLI.
GitHub publication does not apply migrations or deploy Edge Functions.

### 1. Confirm the frontend key

Open this project's Supabase API settings. Copy its current **anon / public** key
into `.env` in the app directory, using these variable names:

```dotenv
VITE_SUPABASE_URL=https://nqkspjqrahfccevvrnjf.supabase.co
VITE_SUPABASE_ANON_KEY=<current anon key from this same project>
```

Use the same variables in the frontend hosting configuration. Restart Vite after
editing `.env`; rebuild and redeploy a hosted or native app because Vite embeds
these variables at build time. Keep `.env` ignored. Never put a service-role key,
database password or personal access token in a `VITE_` variable.

### 2. Check migration history before applying changes

Back up the existing database, then open PowerShell in a **Git checkout of the
latest `main`**, in the folder containing `package.json` and `supabase/`. Your
original extracted app folder is not a Git checkout; the reviewed checkout on
this machine is `C:\Users\SERVER\Downloads\Kurdstay2\.github-publish`.

```powershell
npx.cmd supabase@latest login
npx.cmd supabase@latest link --project-ref nqkspjqrahfccevvrnjf
npx.cmd supabase@latest migration list --linked
npx.cmd supabase@latest db push --linked --dry-run
```

The CLI login uses your Supabase account's personal access token. A prompted
database password is the **Postgres database password**, not the app admin password.
Enter these through the CLI prompts; don't commit them.

This release adds these three migrations, in this order:

1. `20260928100000_booking_search_reliability.sql`
2. `20260928101000_account_owner_reliability.sql`
3. `20260928102000_admin_reliability.sql`

The last one also publishes `app_capabilities()`. Until it exists, the frontend
uses compatible search/admin screens and hides application resubmission links.

If the dry run lists unexpected old migrations, or local and remote history differ,
resolve that discrepancy first. This repository includes earlier reconciliation
migrations. Do not delete them or mark everything as applied. SQL run manually
in the dashboard may have changed the schema without updating the ledger.
`migration repair --status applied <timestamp>` is appropriate only after verifying
that the **complete corresponding migration** is already present; it changes the
ledger, not the schema. A recorded version also does not prove an edited local SQL
file matches what was deployed. Use a new forward migration for any deployed-version
corrections. Do not use `db reset --linked` on this existing project.

These commands follow the [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)
and [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push).

### 3. Apply pending migrations and update the function

After confirming the dry run contains the intended pending migrations:

```powershell
npx.cmd supabase@latest db push --linked
npx.cmd supabase@latest migration list --linked
npx.cmd supabase@latest functions deploy whatsapp-notify --project-ref nqkspjqrahfccevvrnjf
```

Every repository migration should now appear in both local and remote columns.
Deploy the function **after** the migrations because it uses the new `_v2` RPCs.
Old notification callers remain supported during the transition.

If earlier functions have never been deployed from this repository, deploy each
of `chatbot`, `import-hotel`, `id-card`, `phone-verification`, `property-images`,
and `property-videos` too, using the same `functions deploy <name> --project-ref ...`
command. `supabase/config.toml` sets the gateway JWT behavior for this app's custom
session authentication; retain the authorization checks inside the functions.

Confirm existing Edge Function secrets in the dashboard:

- `OPENROUTER_API_KEY` for AI chat/import; `CHATBOT_MODEL` is optional.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`.
- `TWILIO_TPL_VERIFICATION_CODE`, `TWILIO_TPL_BOOKING_PENDING`,
  `TWILIO_TPL_NEW_BOOKING_MANAGER`, `TWILIO_TPL_BOOKING_CONFIRMED`, using templates
  approved for your Twilio account.

Supabase supplies its own runtime URL and keys. Keep provider credentials in
[Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), never
in the frontend environment. Database migrations alone do not configure Twilio.

### 4. Run the read-only database check

In this project's SQL Editor, run the complete contents of
[`supabase/verify-setup.sql`](supabase/verify-setup.sql) as `postgres`. It checks
required function signatures, RLS, bucket visibility, password-column access,
the admin profile, and anonymous access denial. It makes no application-data changes.
Expect a `PASS` result with no exception. An exception identifies the missing or
incorrect part; resolve it rather than bypassing the check.

The required storage visibility is: `hotel-images` public, `property-videos`
public, `id-cards` private. Public media reads still require owner/admin checks
for writes; leave the migration-managed policies intact.

### 5. Verify the app and refresh clients

1. Rebuild the frontend (`npm.cmd run build`) with the correct public key and
   deploy it to your existing host. For native clients run `npx.cmd cap sync`
   after building, then rebuild/install the native app. Reopen the browser/app
   so the capability check runs again.
2. Sign in as `admin` with the password you set. This project authenticates
   against `public.profiles` through RPCs; Supabase Auth's Users list is not the
   source of the app admin credentials. The ignored local reset script is only
   needed if you deliberately want to reset that password again.
3. Open admin overview, bookings, chats and hotel editing. Check saving, tab
   readability, filters and pagination. Check that a customer account cannot
   access admin routes.
4. Verify each bookable room has a `room_availability` row for **every night** of
   the stay. `available_rooms` means total sellable stock; the quote subtracts
   pending and confirmed bookings. Search and checkout should agree on price,
   closures and availability. Check the resulting booking in the admin dashboard.
5. Test uploads and phone verification with your own test account. Check Edge
   Function logs for errors. Only perform real notification tests when you intend
   to send WhatsApp messages. These external-provider checks were not performed
   by the local automated tests.

A passing SQL check plus matching migration history confirms the checked schema
and access rules. The app smoke checks also verify API keys, deployment, storage
and external services; none of these alone establishes that every possible bug
is absent.
