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
- Gallery cards, phase groups, full-screen playback, delete, export and share pages keep working off the stored media type.
- Storage bucket stays private; no policy or size-limit changes.

## Videos on the project map

- Videos with a location now appear as pins on the project's photo map alongside photos, using the same pin style.
- A video pin's popup plays the clip inline (with controls, not auto-playing) and shows the same caption, phase, date, uploader and coordinates as a photo pin, plus a "Play full video" link.
- A clip's location comes from the device's location at capture time, since phone videos carry no embedded location. Clips recorded with location turned off get no pin — exactly like a photo with no location — and zoom-to-fit only counts items that have one.
- Photo pins keep their current appearance and behaviour.

## Technical notes

- `src/routes/project.$projectId.tsx`: add two hidden inputs, `accept="video/*" capture="environment"` and `accept="video/*"`; new `handleVideoFiles` handler that validates type, reads duration via a temporary `<video>` element with `loadedmetadata` (object URL revoked after read), enforces the 60s cap, then reuses the existing upload/insert path storing `media_type: "video"`, real `mime_type`, `file_size` and `duration_seconds`. Extension from the file name, falling back to the MIME subtype. Remove the `VideoRecorder` import, `recorderOpen` state and the dialog mount; keep the `uploadRecording` logic, refactored to take a `File`.
- Delete `src/components/VideoRecorder.tsx`.
- Map data: drop the `media_type !== "video"` filter feeding `ProjectPhotoMap` (line 162) and pass `media_type` through. `src/components/ProjectPhotoMap.tsx`: extend `MapPhoto` with `media_type` and render `<video controls preload="metadata">` instead of `<img>` in the popup for video rows. `isValid` and the fit-to-bounds logic stay as they are.
- No database or storage migration required — the `media_type` / `mime_type` / `file_size` / `duration_seconds` columns already exist.

## Verification

Type check, lint and production build, then a manual pass on a phone: record via the native camera and confirm it uploads, plays back and lands in the right phase group; confirm the clip shows as a pin on the project map and plays from the popup; pick an existing clip; confirm a clip over 60 seconds is refused; confirm photo capture and existing photo pins are unchanged.
