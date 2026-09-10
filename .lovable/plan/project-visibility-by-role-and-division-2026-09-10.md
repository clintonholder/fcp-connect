# Project visibility by role and division

Today every signed-in person can see every project in the workspace. This changes that.

## Who sees what

- **Admin** — sees, creates and edits every project, in any division.
- **Director** (a role with the new "Division director" checkbox) — sees every project that carries one of the divisions assigned to them, plus any project they own or are a collaborator on.
- **Everyone else** — sees only projects they own (project manager) or are a collaborator on. Nothing else, including projects they created but were removed from.
- **No role assigned** — sees no projects until an admin gives them a role.

## Division assignments

- Admins can assign one or more divisions to any user from the Admin page (a division checklist on each user row, saved immediately). Only admins can change these.
- When creating or editing a project, a non-admin can only pick from their own assigned divisions. Admins can pick any division.
- A user with no divisions and no director flag is unaffected for viewing (they still see their own projects) but cannot create a project until an admin assigns at least one division.

## Roles page

- Each role gets a "Division director" checkbox next to the existing administrator marker, editable by admins only.

## Where the rules apply

Project lists, the Projects map, project detail pages, photos, comments, areas, activity and share-link creation all follow the same visibility rule, enforced in the database — typing a project address directly will not reveal a project the person cannot see.

## Technical notes

- Migration:
  - `app_roles.is_director boolean not null default false`.
  - New table `public.user_divisions (id, user_id, division text, created_at)` with unique `(user_id, division)`, GRANTs, RLS: users read their own rows and co-workers' rows; only admins insert/update/delete.
  - Private helpers: `private.user_divisions(_user_id) -> text[]`, `private.is_director(_user_id)`, and `private.can_see_job(_job_id, _user_id)` returning true for admin, owner (`jobs.owner_id`), collaborator (`project_collaborators`), or director whose divisions intersect `jobs.divisions`/`jobs.division`. Public `SECURITY DEFINER` wrappers only where RLS needs them, matching the existing `private.*` pattern.
  - Replace the `company view jobs` SELECT policy with `is_company_member(...) AND public.can_see_job(id, auth.uid())`; tighten update/delete the same way.
  - `photos`, `comments`, `areas`, `activity_events`, `share_links`, `project_collaborators` SELECT/INSERT policies gain `public.can_see_job(job_id, auth.uid())`.
  - Insert policy on `jobs` additionally requires the chosen divisions to be a subset of the creator's assigned divisions unless they are an admin.
  - Index on `project_collaborators(user_id, job_id)` and `user_divisions(user_id)`.
- Client: `src/lib/roles.ts` exposes `isDirector` and `myDivisions`; `useMyRoles` no longer grants full permissions to users with no role. `src/components/ProjectForm.tsx` / `DivisionSelect` limit options to the caller's divisions. `src/routes/admin.tsx` gains the division checklist per user and the director checkbox per role, both written through `src/lib/admin.functions.ts` with a server-side admin check and an `audit_log` entry.
- Client project/map queries stay as-is; the database filters rows, so lists shrink automatically.
- Verification: sign in as a non-collaborator and confirm the projects list, map and a direct project link all deny access; confirm a director sees only their divisions; confirm admin still sees everything.
