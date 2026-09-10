# Video capture for FCP Connect

Add short site videos alongside photos, using the same project, permissions, storage and viewer that photos already use.

## Verified current behaviour

- Capture lives on the project page: two hidden file inputs ("Take Photo" with camera capture, "Choose Photos"), both accepting images only.
- Uploads go to the private `job-photos` bucket at `<user id>/<project id>/<timestamp>-<random>.<ext>`, then a row is written to the `photos` table (project, company, uploader, storage path, phase, capture time, location).
- The gallery query reads every non-deleted row of `photos` for the project, ordered by capture time; nothing in that query or in the cards distinguishes media kinds today.
- Display links are short-lived signed links generated from the stored `storage_path` (four hours in the app, one hour on public share pages). Nothing about that path is image-specific, so videos will sign the same way.
- Storage rules: read is allowed to the uploader or anyone in the project's company, write to the person's own folder, update/delete to the uploader or a company owner/admin. They are based on folder and row ownership only — no file-type or extension restriction, so video files are already permitted.
- The bucket is private, has no allowed-type list and no per-file size limit (it inherits the project-wide limit).
- The `photos` table has no column saying whether a row is an image or a video.

## Database change (required)

One migration on the `photos` table:

- `media_type` — "image" or "video", not null, default "image", with a check constraint. Every existing row is backfilled as "image" by the default.
- `mime_type` — the real recorded type, e.g. `video/webm;codecs=vp9`.
- `file_size` — bytes.
- `duration_seconds` — video length; empty for images.

No new table, no new bucket, no policy change, bucket stays private. Storage limits stay as they are unless a real upload test fails on size.

The migration is applied first and the database types refreshed before any code changes, and existing rows are confirmed to read as "image" afterwards.

## What will be built

**Capture choice**
- A Photo / Video switch beside the existing capture buttons. Photo behaviour is untouched.

**Video recorder**
- Video opens a recorder dialog: live preview, Start, Stop, Retake, Playback, Upload, Cancel, and Retry after a failed upload.
- Camera and microphone permission requested on open, with plain messages when access is denied, no camera exists, or the browser can't record.
- The recording format is whatever the browser reports as supported (usually WebM, MP4 on Apple devices); the stored file and `mime_type` keep the real format and matching extension. Media kind always comes from `media_type`, never guessed from the filename.
- Hard 60-second cap with a visible countdown and automatic stop.
- Camera and microphone released when recording stops, the dialog closes, or the page unmounts; preview links revoked only after playback finishes.

**Upload**
- Same bucket, path pattern, project/company/uploader association and permission checks as photos.
- The storage client reports no measurable progress, so uploading shows an indeterminate "Uploading…" state — no invented percentages.
- Unique filenames; if the database insert fails, the just-uploaded file is deleted so nothing is orphaned. Retry keeps the recording in memory.

**Everything that touches media**
- Image uploads keep their exact current behaviour and additionally record media type "image", the real MIME type and byte size. Video uploads record media type "video", real MIME type, byte size and duration.
- Gallery cards, signed-link rendering, viewer, selection, delete (row + file), export/download, list refresh after changes and the public share page all branch on `media_type` — never on the filename.
- The photo map is left untouched: videos are filtered out of it, so every existing map behaviour stays exactly as it is.
- Cards show a video badge and play icon; the viewer renders a `<video>` with controls while captions, comments, delete, navigation and permissions keep working for both kinds.
- Export keeps the real extension. Videos carry no embedded location, so they use device location when granted and otherwise read "Location unavailable" — no invented pins.

## Technical notes

- New: `src/components/VideoRecorder.tsx` (getUserMedia + MediaRecorder, runtime `isTypeSupported` detection, track teardown on unmount).
- Edited: `src/routes/project.$projectId.tsx` (capture switch, video upload, card rendering, delete/export branches, videos excluded from map data), `src/components/PhotoViewer.tsx` (video playback), `src/lib/photo-export.ts` (extension from stored path/mime), `src/lib/share.functions.ts` / `src/routes/share.$token.tsx` (share page renders videos), plus the migration. `src/components/ProjectPhotoMap.tsx` is not modified.

## Verification

Type check, lint and production build, then a manual pass: existing photo capture still works; permission denial message; a 5-second recording; automatic stop at 60 seconds; upload and signed playback after refresh; forced database-insert failure leaves no orphan file; delete respects permissions; playback on a mobile browser.
