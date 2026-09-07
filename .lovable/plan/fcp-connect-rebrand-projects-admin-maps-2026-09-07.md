# FCP Connect — rebrand, Projects, Admin, Maps

## What I found in the app today

- Sign-in is already real (email + password against the live account system), with a working forgot-password page. There is no mock login and no role picker — but there **is** a "Need an account? Sign up" link that must go.
- Data already exists for job sites, areas, photos, comments, share links and activity history. Nothing will be deleted or rebuilt.
- There is a multi-company feature (company switcher in the header, Team page with "New company"). The company link is baked into every table and every access rule, so it stays in the database but disappears from the screen.
- Photos already carry GPS when the phone provides it; the Map tab currently plots photos.

## What I'll build

### 1. Branding
- FCP Services logo replaces the hard-hat mark next to the name; name becomes **FCP Connect**. Logo keeps its proportions, full lockup on desktop, compact on mobile.
- Palette switched to blue #00338D, gray #565A5C, red #782327, white. Favicon set from the logo.

### 2. "Job" becomes "Project"
Every visible label, heading, button, form field, search box, card, toast and PDF wording. The database keeps its current table names (renaming them would risk the existing photos and history), and the address `/job/<id>` becomes `/project/<id>` with the old link redirecting.

### 3. Company feature removed from view
Header switcher, company picker and company management gone. Each person is silently attached to the single FCP company as today, so existing projects and photos stay visible.

### 4. Projects
- Projects dashboard stays the first screen after signing in; cards are clickable.
- New Project and Edit Project forms with: name, customer, address, division, project manager/owner, status, current phase, optional CMiC number. Required fields validated, Save and Cancel, a warning before leaving unsaved edits.
- Search covers name, customer, address, division, owner, status and phase.
- Delete becomes Archive (soft delete) — archived projects hidden by default, data preserved.

### 5. Admin replaces Team
- Admin tab visible only to admins, and the page itself refuses non-admins even when the address is typed directly (checked on the server, not just hidden).
- Admin can see all users, invite a user by name + email, assign roles, and disable/reactivate/resend invitations.
- Roles list starts as Project Manager, Estimator, Foreman Contractor, Admin; admins can add, rename, deactivate and reactivate roles.
- Removing the last active admin is blocked with a warning.
- Every user/role/invite action is written to audit history.
- Passwords are never shown or stored in Admin — the invited person sets their own via the email link.

### 6. Login
- Create Account link removed; no role selector. Clear messages for wrong password, unverified, and disabled accounts. Forgot Password stays wired to the real reset page. Sign out verified.

### 7. Maps
- **Main Map**: project pins only, from project addresses (geocoded once and stored) or stored coordinates. Marker click shows a project summary and a link into the project. Side list of projects, count of visible projects, combined filters (phase, status, division, owner, customer, recent activity) and Reset Filters. Projects with no usable address are listed separately instead of pinned.
- **Project Photo Map**: new section inside each project showing only that project's geotagged photos, with filters (phase, date, uploader, tag) and a clear list of photos without GPS. Marker click shows thumbnail, date, uploader, phase, caption and a link to the full photo.

### 8. Photos
- Edit caption/tags/phase, and delete with a confirmation. Deleted photos disappear from feed, gallery, counts and the project photo map, and the deletion is recorded in audit history.

## Things I need from you

- **Invitation emails**: sending branded invites needs an email sending domain set up for the app (a short DNS step on your side). Until that's done invites can still be created, but I will not claim the email works — I'll tell you exactly what's untested. Say the word and I'll open the email setup step.
- **Geocoding addresses to map pins**: maps themselves are free (OpenStreetMap, already in use). Turning a street address into coordinates needs a geocoding service. Default plan: free OpenStreetMap Nominatim, adequate at this volume; if you prefer Mapbox/Google accuracy, that needs an API key.
- Nothing is published to the live site without your say-so.

## Technical notes

- Migrations (additive only, no drops): new project columns (`customer`, `division`, `owner_id`, `status`, `phase`, `cmic_number`, `latitude`, `longitude`, `archived_at`); `app_roles` + `user_roles` tables with a `has_role()` security-definer function; `invitations` table; `audit_log` table. GRANTs + RLS on every new table.
- Admin actions run through authenticated server functions with a server-side role check (`createServerFn` + `requireSupabaseAuth`), using the service key only after the caller is verified as an admin. Service key never reaches the browser.
- Route files: `/project/$projectId` (replaces `/job/$jobId`, old path redirects), `/admin` (replaces `/team`), map rewritten.
- Existing tables `jobs`, `areas`, `photos`, `companies`, `company_members`, share links and activity stay as-is; the UI simply stops exposing company concepts.
- Verification pass at the end with a scripted browser run through: sign-in rejection, dashboard, search, create/edit project, admin gating by URL, photo delete, both maps, back navigation, sign out — plus a build and console-error check. Anything I can't verify (invite email delivery) will be reported as untested rather than claimed working.
