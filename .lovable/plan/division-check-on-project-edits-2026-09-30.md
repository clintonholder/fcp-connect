# Division check on project edits

Today anyone who can edit a project can save it with any divisions — the division limit only applies when creating. This closes that gap. Admins stay unrestricted.

## What changes for people

- Non-admins can save a project only if every division on it is one of their assigned divisions (at least one required).
- The New/Edit Project form lists only the divisions the person may use (admins: all).
- If an existing project carries a division the person is no longer assigned (or has no divisions at all), Edit and Archive/Restore are disabled with a message: "This project includes divisions you are not assigned to. An administrator must restore your division assignment or update the project's divisions."
- Collaborator management is unchanged: anyone with Edit projects who can access the project can add/remove collaborators, even on such projects (collaborators are stored separately from the project row).
- Visibility is unchanged for admins, directors, owners and collaborators.

## Technical details

- New forward-only migration (existing ones untouched): drop and recreate the `company update jobs` policy.
  - USING (unchanged): `is_company_member(company_id) AND can_see_job(id) AND has_perm('edit_projects')`.
  - WITH CHECK (new): same three checks, plus `private.is_admin(auth.uid()) OR (coalesce(array_length(divisions,1),0) > 0 AND divisions <@ private.user_divisions(auth.uid()))`.
  - Insert policy left intact.
- Update paths reviewed:
  - `project.$projectId.tsx` saveEdit — covered by policy; client pre-check added.
  - `project.$projectId.tsx` toggleArchive — also covered by policy (WITH CHECK validates the whole row); button disabled with the same message when out of scope.
  - `admin.functions.ts` user deletion reassignment and `projects.functions.ts` delete — server-side, admin-verified, bypass RLS by design; unchanged.
- `ProjectForm.tsx`: non-admin options = assigned divisions only (stop merging in the project's existing divisions); block submit with the message if the loaded project has divisions outside the assignment.
- Verification (browser + SQL as representative users): admin edits any division; non-admin saves within assigned divisions; direct API update to an unassigned division rejected; project manager adds/removes a collaborator; director still sees division projects; existing visibility counts unchanged.

## Edge cases needing a product decision

- Legacy projects with empty divisions: non-admins cannot edit or archive them until an admin adds a division.
- Multi-division projects where the editor holds only some divisions: blocked entirely (strict subset rule), including archive/restore. Alternative would be allowing archive regardless.
- Directors follow the same edit rule as everyone else (oversight divisions = assigned divisions).
