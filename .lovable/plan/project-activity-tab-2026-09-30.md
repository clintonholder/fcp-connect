# Project Activity tab

## What you'll see
- Below the project details, a tab bar: **Photos** (default) and **Activity**.
- **Photos** shows the gallery exactly as today.
- **Activity** shows every comment on this project's photos and videos, newest first. Each entry shows a small preview (a video badge for videos), the comment, who wrote it, when, and the phase if there is one.
- Clicking or pressing Enter on an entry opens that photo/video in the usual viewer. The viewer scrolls to that comment and briefly highlights it, so you can reply right there.
- There's a loading state, an error message with a Retry button, and an empty message: "Comments added to project media will appear here."
- Archived projects work as they do now: comments show in the list, and existing rules decide whether you can post.

## Findings
- Comments are flat (body, author, time, linked to one photo/video). There are no replies or mentions today, so the feed shows plain comments that look like the viewer's comments.
- Access is already enforced by the database: you only see comments on projects you're allowed to see. **No database changes needed.**

## Technical details
- `project.$projectId.tsx`: add a `tab` search param ("photos" | "activity") via `validateSearch`. Use shadcn `Tabs` (Radix handles role=tablist, arrow keys and focus rings). Wrap the existing Photos controls and gallery in the Photos tab. Leave the header and details outside the tabs.
- New `src/components/ProjectActivityFeed.tsx`: useQuery `["project-activity", jobId]` → `comments.select("*, profiles(display_name,email)").eq("job_id", jobId).order("created_at", desc)`. Match each comment to a photo/video already loaded on the page (thumbnail/signed URL, media_type, phase, archived). Comments on archived or filtered-out media still show. Opening one uses a one-item viewer list, so the Photos filters don't hide it.
- Selecting an entry: if the item is in `filteredPhotos`, open it at that position. Otherwise open the viewer with `[photo]`. Pass a new optional `focusCommentId` prop.
- `PhotoViewer.tsx`: optional `focusCommentId`. Once comments load, scroll that comment into view with a highlight ring and a tabindex so it takes focus. Comment posting stays the same, and the new comment is also added to the `project-activity` query so the feed updates.
- Each entry is a button with an aria-label ("Comment by X on photo/video, time"), a visible focus ring, and a layout that works on phones.
