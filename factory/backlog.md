# Backlog

`/factory next` builds the first unchecked item and checks it off with its job id.
One feature per line, small and testable. Anything touching the database, auth or
roles is fine to queue; it will always come back to you for review.

- [x] Add a Vitest test runner (`npm test`) with unit tests for the pure helpers in src/lib (EXIF/GPS parsing, photo metadata, geocode formatting), and document the test command in CLAUDE.md → 001-vitest-test-runner
- [x] Make View As read-only: hide or disable every create/edit/delete control while viewing as another user, and audit-log the viewed-as user → 002-view-as-read-only
- [x] Lock down audit_log: remove the RLS policy that lets any signed-in user insert audit rows, so only server functions (service role) can write them (new migration in supabase/migrations) → 003-audit-log-lockdown
- [x] Enforce read-only View As in the database: adminStartProxy records an active proxy session for the admin (new table, auto-expires after 2 hours, closed by adminEndProxy), and every insert/update/delete RLS policy and storage write policy refuses writes from an admin with an active proxy session (new migration in supabase/migrations) → 004-view-as-db-enforcement
- [x] Build the View As visible-project list in one query instead of one database call per project (admin.functions.ts) → 005-view-as-single-query
- [x] Trim the public share link: get_shared_job returns only listed fields and no archived photos; links get a default expiry (migration file only, not applied) → 006-trim-share-link
- [x] Photo uploads: upload each file independently with retry, report per-file results, and delete the storage file if its database save fails → 007-photo-upload-retry
- [x] Photo location: never give a library photo without GPS the device's current location; record whether the location came from the photo or the device (migration file only) → 008-photo-location-source
- [ ] Add a required Owner field to projects, ranked above Customer (the Customer can be a general contractor and the Owner the building owner, e.g. Owner "Target", Customer "Crane Construction"): new `owner` column on jobs (migration file only; existing rows have no owner, so the column stays nullable in the database and the requirement is enforced in ProjectForm and the create/update server functions, with existing projects prompted to fill it in on their next edit), Owner shown and entered before Customer everywhere both appear, and added to every place Customer is searched, filtered, sorted or grouped (project list, map, exports) plus the project page, PDF report, photo export and share page via get_shared_job; Customer behaves exactly as before
