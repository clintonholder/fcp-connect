# Native camera video capture

Replace the in-app recorder window with the phone's own camera app, matching how photos already work.

## How it will work

- The Photo / Video switch stays. In Video mode there are two buttons:
  - **Record Video** — opens the device's built-in camera in video mode (same mechanism as the existing "Take Photo" button).
  - **Choose Video** — picks an existing video from the device.
- On a computer, "Record Video" opens the normal file chooser instead, since desktop browsers have no camera app. The in-app recorder window is removed entirely.
- After the clip is chosen, the app reads its real length and format, then uploads it exactly like today: same private storage, same project, phase, permissions, and location fallback.
- Clips longer than 60 seconds are rejected with a clear message ("Videos must be 60 seconds or less — this one is 1:24") and nothing is uploaded.
- Anything that isn't a video file is rejected with a clear message.
- Uploading shows an "Uploading…" state (no invented percentage). A failed save removes the just-uploaded file so nothing is left behind.

## What stays the same

- Photo capture, choose photos, EXIF date/location handling: untouched.
- Gallery cards, phase groups, full-screen playback, delete, export, share pages and the photo map all keep working off the stored media type — nothing changes there.
- Storage bucket stays private; no policy or size-limit changes.

## Technical notes

- `src/routes/project.$projectId.tsx`: add two hidden inputs, `accept="video/*" capture="environment"` and `accept="video/*"`; new `handleVideoFiles` handler that validates type, reads duration via a temporary `<video>` element with `loadedmetadata` (object URL revoked after read), enforces the 60s cap, then reuses the existing upload/insert path storing `media_type: "video"`, real `mime_type`, `file_size` and `duration_seconds`. Extension derived from the file name, falling back to the MIME subtype. Remove the `VideoRecorder` import, `recorderOpen` state and the dialog mount; keep `uploadRecording` logic, refactored to take a `File`.
- Delete `src/components/VideoRecorder.tsx`.
- No database or storage migration required — the `media_type` / `mime_type` / `file_size` / `duration_seconds` columns already exist.

## Verification

Type check, lint and production build, then a manual pass on a phone: record via the native camera and confirm it uploads, plays back and appears in the right phase group; pick an existing clip; confirm a clip over 60 seconds is refused; confirm photo capture is unchanged.
