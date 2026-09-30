# Admin screen: role management and collapsible sections

## What changes
1. **New role starts blank** — every permission is off when you click Add role. Editing a role still shows its saved settings.
2. **"Division Director"** capitalized everywhere on the Admin page: heading, badge, empty message ("No Division Director roles."), role dialog checkbox.
3. **Media labels** — in the permission matrix and role dialog, "Add/Edit/Delete photos" become "Add media", "Edit media", "Delete media" (covers photos and videos). Screen-reader names and save messages follow. Project screens are not changed.
4. **Delete role** — a trash-can button next to Edit and Deactivate/Reactivate. You confirm first, with the role name and what deleting it means. If anyone still has the role, or someone was invited with it, deletion is blocked with a message telling you to unassign or deactivate it. Admin roles can't be deleted. Audit history is kept, and the deletion itself is recorded there.
5. **Collapsible sections** — Manage Roles, Permission Matrix, Users and Audit History each open and close separately. The heading button works from the keyboard and shows a visible focus outline. Closing a section doesn't lose anything. Roles and Users start open, and Permission Matrix and Audit History start closed. What you open or close is remembered while the browser tab stays open.

## Technical details
- `src/lib/roles.ts`: add an Admin-only `adminLabel` ("Add media" etc.) to PERMISSIONS. The keys stay the same and nothing in the database changes.
- `src/lib/admin.functions.ts`: new `adminDeleteRole({ roleId })`. It uses `assertAdmin`, refuses when `is_admin` is set, and counts `user_roles` and `invitations` that use the role (plus `project_collaborators.role_id`). If any exist it throws a clear error. Otherwise it deletes the `app_roles` row and writes a `role_deleted` audit entry. There's no cascade.
- `src/routes/admin.tsx`: `emptyPerms` defaults to false. Update the labels and add the delete mutation with a confirm dialog and toasts, then refresh. Add a small `CollapsibleSection` built on the Radix Collapsible with `aria-expanded`. Its open state is kept in `sessionStorage` and read after the page loads.
- Verification: typecheck/build, then check in the browser as an admin: open and close sections, check the new role defaults, try deleting an assigned role (blocked), and delete an unused test role.
