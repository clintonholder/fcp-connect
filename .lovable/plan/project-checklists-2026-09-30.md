# Project Checklists

Add a third **Checklists** tab next to Media and Activity on the project page. Media stays the default tab. Media and Activity keep working exactly as they do now.

## What users will see

**Checklist list**
- Each checklist appears as a card with its title, a progress bar and percentage, "X of Y done", and when it was last updated.
- A **Create checklist** button sits at the top.
- When a project has no checklists, a short message explains that checklists track inspection or job steps, with a Create checklist button.

**Checklist detail** (opens inside the tab)
- A "Back to checklists" link, a large title, a round progress ring, "X of Y done", and when it was last updated.
- An **Assign** picker that lists only people already on the project.
- Edit and delete controls for the checklist.
- A divider, then a **Hide completed** switch (off by default). It only hides finished items. Progress stays the same.

**Item cards**, stacked full-width:
- A round checkbox and a bold title, with the assignee's name if there is one.
- Instructions in smaller grey text.
- Each question shows **Yes / No / N/A** buttons, and the chosen answer is clearly highlighted.
- A "Photos required" badge when the item needs photos. Attached photos show as small thumbnails. Clicking one opens the usual media viewer.
- Action buttons on the right: edit, attach photo, and a "More" menu with move up/down and delete. On phones these all move into the "More" menu.
- If an item can't be completed yet, the checkbox is disabled and the reason is shown, e.g. "Answer all questions first" or "Attach at least one photo."

- An **Add task** button sits at the end of the list.
- Loading placeholders, a Retry button when loading fails, and "Saved" / error messages match the rest of the project page.

## Rules

- A project can have many separate checklists.
- A checklist can be assigned to one project member. Each item can also have its own assignee, which takes priority for that item. Assigning someone never gives them access to a project they aren't already on.
- An item can only be completed when:
  - every question has an answer (N/A counts as an answer), and
  - it has at least one photo attached, if photos are required.
- The app records who completed each item and when.
- Progress = completed items / total items, shown as a count and a percentage.
- **Photos:** you can attach existing project photos and videos. Nothing is copied. Removing a photo from an item, or deleting an item or checklist, never deletes the photo itself. New photos are added through the existing Media upload first, then attached.

## Who can do what

- **People with "Edit projects" permission who can edit this project:** create, rename and delete checklists; add, edit, reorder and delete items and questions; set assignees. This follows the same rule as editing the project itself, so collaborators count.
- **Anyone who can see the project:** answer questions, complete or reopen items, and attach or remove photos. Attaching also requires the "Add media" permission.
- **Archived projects:** checklists are read-only for everyone.
- The database enforces all of these rules, not just the screen.

## Technical details

New tables in one forward-only migration. Each has GRANTs for authenticated and service_role, RLS enabled, and indexes on its foreign keys.
- `checklists`: id, job_id → jobs (on delete cascade), company_id, title, description, assignee_id, template_id (nullable, reserved for templates later), position, created_by, created_at, updated_at.
- `checklist_items`: checklist_id (on delete cascade), job_id, title, instructions, assignee_id, photos_required (default false), position, completed_at, completed_by, updated_at.
- `checklist_questions`: item_id (on delete cascade), prompt, answer (check: yes/no/na, or null), position, answered_by, answered_at.
- `checklist_item_photos`: item_id (on delete cascade), photo_id → photos (on delete cascade, so only the link row goes), attached_by, unique (item_id, photo_id).

**Private helper functions** (SECURITY DEFINER in the `private` schema, same pattern as existing helpers):
- `can_edit_checklists(job)`: mirrors the jobs update rule. The user must see the job, have edit_projects, and be admin, creator, owner, a collaborator, or hold the project's divisions. The job must not be archived.
- `can_work_checklists(job)`: `can_see_job` and the job is not archived.

**Policies:**
- SELECT: `can_see_job`.
- Checklist / item / question structure writes: `can_edit_checklists`.
- Workers get a narrow path. A BEFORE UPDATE trigger on items and questions lets non-editors change only completion and answer fields. It stamps `completed_by`, `answered_by` and the timestamps from `auth.uid()`.
- Completion trigger: blocks setting `completed_at` if any question on the item has no answer, or if photos are required and no photo is linked.
- Photo-link insert: requires `can_work_checklists` and `has_perm('add_photos')`. The photo must belong to the same job.
- Assignee trigger: the assignee must be admin, the creator or owner, a collaborator, or a division director for the project's divisions. This uses the same logic as `can_see_job` for the assignee.
- Touch triggers keep `checklists.updated_at` current when items, questions or photo links change.

**Frontend:**
- `src/components/checklists/ChecklistsTab.tsx`: list view, detail view and create dialog.
- `ChecklistItemCard.tsx`, `ChecklistItemDialog.tsx`: item editor with questions.
- `AttachEvidenceDialog.tsx`: picks from the project's media.
- Uses React Query with keys `["checklists", jobId]` and `["checklist", id]`, direct client calls under RLS, and sonner toasts.
- `project.$projectId.tsx`: add the third tab trigger and panel. Pass in the edit permission, archived state and the project member list, reusing the Assign data from the collaborators query.

**Templates later:** add a `checklist_templates` table plus template items and questions, and a "create from template" action that copies them into these tables. Filling `template_id` keeps the link back to the template. No changes to the current tables are needed.

**Checks:** typecheck and build. In the browser: create a checklist, add an item with a question and required photos, try completing it (blocked), then answer, attach a photo and complete it. Also confirm a signed-in non-editor can answer but can't delete.
