# Video capture for FCP Connect

Add short site videos alongside photos, using the same project, permissions, storage and viewer that photos already use.

## What exists today (verified)

- Capture lives on the project page: two hidden file inputs ("Take Photo" with camera capture, "Choose Photos"), both `accept="image/*"`.
- Uploads go to the private `job-photos` bucket at `<user id>/<project id>/<timestamp>-<random>.<ext>`, then a row is written to the `photos` table (project, company, uploader, storage path, phase, capture time, location).
- Files are shown through short-lived signed links; the gallery groups by phase, supports selection, delete, export and the full-screen viewer with captions, comments and permissions.
- The `photos` table has no field that says whether a row is an image or a video, and there is no separate media table or video bucket.

## What will be built

**Capture choice**
- A Photo / Video switch next to the existing capture buttons. Photo behaviour stays exactly as it is today.

**Video recorder**
- Choosing Video opens a recorder dialog: live camera preview, Start, Stop, Retake, Playback, Upload, Cancel, and Retry after a failed upload.
- Camera and microphone permission requested on open, with plain-language messages when blocked, unavailable, or unsupported by the browser.
- Recording format is whatever the browser actually supports (usually WebM, MP4 on Apple devices); the stored file keeps its real format and extension.
- Hard 60-second limit with a visible countdown and automatic stop.
- Camera and microphone are released when recording stops, the dialog closes, or the page changes; preview links are cleaned up only after playback is done.

**Upload**
- Same bucket, same path pattern, same project/company/uploader association, same permission checks as photos.
- Progress indicator, unique filenames, and on a database failure the just-uploaded file is removed so nothing is orphaned. Clear success and error states, Retry keeps the recording.

**Viewing**
- Gallery cards show a video badge and play icon; the existing viewer plays videos with normal controls, while captions, comments, delete, navigation and permissions keep working for both photos and videos.
- Videos count in phase groups and selection; ZIP export includes them with their real extension. Videos have no location metadata of their own, so they use the device location when granted, and otherwise read "Location unavailable" — no invented pins.

## Database and storage changes

Videos cannot be told apart from photos in the current schema, so one small migration is needed on the `photos` table:

- `media_type` — "photo" or "video", defaulting to "photo" so every existing row stays a photo.
- `duration_seconds` — optional length of a video.

No new table, no new bucket, no policy loosening: existing rules already cover these rows. The `job-photos` bucket stays private. If the bucket's per-file size limit is below roughly 100 MB, it will be raised for 60-second clips; that is a bucket setting, not a policy change.

## Technical notes

- New: `src/components/VideoRecorder.tsx` (getUserMedia + MediaRecorder, runtime `isTypeSupported` detection, track teardown on unmount).
- Edited: `src/routes/project.$projectId.tsx` (capture mode switch, video upload path reusing `handleFiles` logic), `src/components/PhotoViewer.tsx` (render `<video>` when `media_type === 'video'`), `src/lib/photo-export.ts` (extension already derived from storage path — verify only), `src/components/ProjectPhotoMap.tsx` (thumbnail fallback for video pins).
- One migration adding the two columns above.

## Verification

Type check, lint and production build, then a manual pass in the preview: record and upload a clip, confirm it appears in the right phase group, plays in the viewer, survives refresh, can be deleted (removing both row and file), retry after a forced failure, and permission denial messages when camera access is refused.
