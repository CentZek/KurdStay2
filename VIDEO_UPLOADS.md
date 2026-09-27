# Property video release

Hosts can upload one MP4 or WebM video (maximum 50 MiB) on the Photos & video
step of a property application. A decoded frame becomes the cover when no photos
are supplied. Owners manage videos from Photos & video on their dashboard;
admins can preview application videos and edit listing videos. Approval copies
the video and cover to the property atomically.

The public gallery has a Watch video action, video thumbnail, inline controls,
sound, seeking and browser fullscreen. It does not download the video until a
guest chooses it. Switching to photos unmounts the player and stops playback.
Portrait videos retain their aspect ratio. New controls and errors are translated
into English, Arabic, Sorani and Bahdini.

## Deploy before publishing the frontend

1. Apply `supabase/migrations/20260927170000_property_videos.sql` through the
   existing Supabase migration workflow. This adds nullable video fields, the
   `property-videos` bucket, upload reservations and the owner/approval RPCs.
   Existing photo-only properties and reservations are preserved.
2. Deploy `supabase/functions/property-videos/index.ts`, including
   `supabase/functions/_shared/session.ts`. `supabase/config.toml` disables JWT
   verification for this function because it validates the application's opaque
   session itself. The function uses the existing server-only Supabase service
   key; never put that key in Vite variables.
3. Confirm the project's global Storage file-size limit is at least 50 MiB.
   The migration separately enforces a 50 MiB limit on the new bucket.
4. Publish the matching frontend through Bolt. In staging, upload a short video
   from a phone, submit a video-only application, approve it, and check public
   playback and owner replacement/removal. Validate MP4 playback in Safari/iOS
   as well as Chrome/Android before announcing device-wide support.

For a CLI already linked and authenticated to the correct project:

```sh
supabase db push
supabase functions deploy property-videos
```

The development workspace contains only the public Supabase URL/key, so the
backend migration and function require deployment through an authenticated
Supabase/Bolt environment. A GitHub push alone does not deploy them.

## Upload behavior and boundaries

- Transfers use the [Supabase signed resumable upload flow](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
  Interrupted transfers retry automatically; Retry continues the same upload in
  the open form. Reloading/closing the form does not restore an unfinished draft.
- Uploads are limited to ten reservations per user per rolling 24 hours,
  serialized in the database. Each token permits a unique object path and cannot
  overwrite the currently published video. The server checks stored size, MIME,
  ownership and MP4/WebM/JPEG signatures before marking an upload ready.
- Owners cannot attach another user's upload or edit an unmanaged property.
  Admins can attach reviewed videos. There are no public Storage write/delete
  policies and upload records are inaccessible to the browser.
- Videos and generated covers are public media, as with property photos. A
  pending application is not publicly listed, but anyone given a media URL can
  view the file. Upload only material intended for a public listing.
- There is no transcoding service in this release. Unsupported files/codecs are
  rejected by the browser preview with an actionable message. MP4 with H.264 is
  the suggested export format; MOV/HEVC conversion is not provided.
- Removal detaches a video from the property. It retains cover photos and stored
  files so existing applications and shared references are not damaged. Monitor
  storage/egress; periodically clean old unattached uploads with a trusted job
  after checking both hotels and applications. No automatic deletion is added.

## Validation

`npm test` exercises ownership, incomplete/forged attachments, upload quotas,
video-only approval, file validation, translations and the existing database
flows. `npm run test:ui` includes a generated 12 KB WebM fixture, real browser
decoding and poster generation, mocked signed/TUS transfers, failed finalization
and save recovery, cancellation, owner removal, and guest playback in all four
languages. It makes no production bookings or uploads. Edge Function type checks
and the production build are required separately.
