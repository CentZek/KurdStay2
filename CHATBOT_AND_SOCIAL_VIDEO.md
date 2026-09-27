# Social video links and the stay finder

Hosts can choose an uploaded video or a YouTube, Instagram or Facebook video
link in property applications and owner/admin media editors. External videos
remain on the original platform; KurdStay stores the URL, not another video
file. Uploaded MP4/WebM support remains available.

Supported links include YouTube watch/shorts/live/short links, Instagram
posts/reels, and Facebook watch/reel/video/share links. Tracking parameters are
removed. Recognized embeddable URLs play in a click-to-load iframe; short
Facebook share links open the original post. Every embed also offers an
original-post link because privacy, embedding permissions, login requirements
and provider restrictions can prevent inline playback. Photos are optional;
adding a cover photo is recommended for Instagram/Facebook listings.

The assistant asks brief follow-up questions for destination, dates, guests and
preferences. Its instructions follow the conversation language, with explicit
Sorani and Bahdini guidance. Interface controls support English, Arabic, Sorani
and Bahdini. A date form provides a direct search path without the AI provider.

The model extracts requirements; PostgreSQL supplies recommendations. Search
checks each night's stock, pending/confirmed reservations, capacity, property
type, required hotel/room amenities and a total-stay budget in its stated
currency. Prices use the booking quote function, including nightly overrides
and margin. Results contain up to three distinct properties, choosing the
lowest-priced qualifying room per property. Prices are ranked within their
currency rather than treating IQD and USD as equivalent. Missing stock is
unavailable. Fewer than three matches produces fewer cards; filters are never
automatically relaxed to fill three places.

View & book opens the listing with dates, guests, rooms and suggested room.
Checkout retains room count and rechecks price/stock. No AI response creates a
booking. Staff requests enter the existing private chat queue; the admin inbox
marks requests needing help, and AI replies stop when a staff reply arrives.

## Deployment order

1. Pull this GitHub revision into Bolt. Apply the pending database migrations
   in timestamp order before publishing the frontend:
   - `20260927170000_property_videos.sql` reconciles the earlier video schema
     with Bolt's `20260927135620_property_videos.sql` without deleting data.
   - `20260927200000_social_video_links.sql` adds external URLs, validation and
     owner/approval handling.
   - `20260927201000_chat_stay_matching.sql` adds availability searches, the
     private chat quota and staff-request status.
2. Deploy `supabase/functions/chatbot/index.ts` with `chatbot/search.ts` and
   `_shared/session.ts`. Keep the server-only `OPENROUTER_API_KEY` configured.
   `CHATBOT_MODEL` is optional and defaults to the existing
   `moonshotai/kimi-k2` model. Use a model supporting JSON responses if changing
   it. No AI key belongs in a `VITE_` variable. The existing function config
   disables JWT verification because the app validates opaque visitor/session
   tokens itself; every AI turn verifies ownership and a 60-turn/hour quota.
3. If not already deployed, finish the upload setup in [VIDEO_UPLOADS.md](VIDEO_UPLOADS.md),
   including the `property-videos` function and Storage size setting.
4. Publish the matching frontend through Bolt, then reload the installed PWA
   or browser so its service worker adopts the new build.

For an authenticated CLI linked to the correct project:

```sh
supabase db push
supabase functions deploy chatbot
# If the previous upload function is not deployed yet:
supabase functions deploy property-videos
```

Only public Supabase credentials are available in the development workspace.
GitHub pushes do not apply database migrations or deploy Edge Functions.

## Verification and release smoke check

- `npm test`: SQL migrations, isolation/ownership, pricing/stock/filtering,
  model-response validation, mocked Edge Function requests, link validation,
  translation parity and existing booking/security checks.
- `npm run test:ui -- --workers=1`: browser flows for follow-up questions,
  three/fewer/zero results, retry/reset/handoff, direct search and phone layouts
  in four interface languages, plus social-video and existing upload/checkout
  regressions. External players and the AI provider are mocked in these tests.
- `npm run build` and the Deno type check for `chatbot/index.ts`.

After deploying, use a staging listing with known future room inventory to test
a conversation in each supported interface language and another language, an
ambiguous date, a changed budget, and a sold-out night. Confirm the correct
three cards (or fewer), totals and checkout dates/room count. Test an actual
public post from each video provider on desktop and mobile and try the original
post fallback. Check a real staff reply in the admin chat inbox.

No paid/live model call or real third-party embed was validated by the automated
tests. Broad language support comes from the configured model; linguistic
quality, especially dialect handling, still needs live review. Recommendations
also require owners to populate future inventory; absent inventory correctly
produces no bookable matches.
