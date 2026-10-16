# Backlog

`/factory next` builds the first unchecked item and checks it off with its job id.
One feature per line, small and testable. Anything touching the database, auth or
roles is fine to queue; it will always come back to you for review.

- [x] Add a Vitest test runner (`npm test`) with unit tests for the pure helpers in src/lib (EXIF/GPS parsing, photo metadata, geocode formatting), and document the test command in CLAUDE.md → 001-vitest-test-runner
