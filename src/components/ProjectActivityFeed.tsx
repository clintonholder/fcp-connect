import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/roles";
import { formatDistanceToNow, format } from "date-fns";
import {
  MessageSquare, Play, ImageOff, AlertTriangle, ClipboardList, Camera,
  Users, StickyNote, FolderCog, Activity as ActivityIcon, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PhotoDetail } from "@/components/PhotoViewer";

type Category = "comments" | "checklists" | "media" | "team" | "notes" | "project";

type Entry = {
  id: string;
  category: Category;
  createdAt: string;
  author: string;
  text: string;
  photoId?: string | null;
  commentId?: string | null;
  isComment: boolean;
};

const CATEGORY_META: Record<Category, { label: string; Icon: typeof MessageSquare; tone: string }> = {
  comments: { label: "Comment", Icon: MessageSquare, tone: "text-sky-600" },
  checklists: { label: "Checklist", Icon: ClipboardList, tone: "text-emerald-600" },
  media: { label: "Media", Icon: Camera, tone: "text-indigo-600" },
  team: { label: "Team", Icon: Users, tone: "text-violet-600" },
  notes: { label: "Note", Icon: StickyNote, tone: "text-amber-600" },
  project: { label: "Project", Icon: FolderCog, tone: "text-muted-foreground" },
};

const FILTERS: { value: Category | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "comments", label: "Comments" },
  { value: "checklists", label: "Checklists" },
  { value: "media", label: "Media" },
  { value: "team", label: "Team" },
  { value: "notes", label: "Notes" },
  { value: "project", label: "Project" },
];

const CATEGORY_OF: Record<string, Category> = {
  checklist_created: "checklists",
  checklist_updated: "checklists",
  checklist_deleted: "checklists",
  checklist_completed: "checklists",
  checklist_item_added: "checklists",
  checklist_item_completed: "checklists",
  checklist_item_reopened: "checklists",
  checklist_item_deleted: "checklists",
  checklist_assigned: "checklists",
  collaborator_added: "team",
  collaborator_removed: "team",
  note_added: "notes",
  note_deleted: "notes",
  photo_uploaded: "media",
  video_uploaded: "media",
  photo_deleted: "media",
  photo_updated: "media",
  photo_annotated: "media",
  photo_exported: "media",
  job_created: "project",
  job_updated: "project",
  job_archived: "project",
  job_restored: "project",
};

type Meta = Record<string, unknown>;
const s = (m: Meta, k: string) => (typeof m[k] === "string" ? (m[k] as string) : null);
const n = (m: Meta, k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);

function describe(kind: string, meta: Meta): string {
  const title = s(meta, "title");
  const name = s(meta, "name");
  const person = s(meta, "person");
  const phase = s(meta, "phase");
  const count = n(meta, "count");
  switch (kind) {
    case "checklist_created": return `created the checklist "${title ?? "Untitled"}"`;
    case "checklist_updated": return `updated the checklist "${title ?? "Untitled"}"`;
    case "checklist_deleted": return `deleted the checklist "${title ?? "Untitled"}"`;
    case "checklist_completed": return `finished the checklist "${title ?? "Untitled"}" — all tasks done`;
    case "checklist_assigned": return `assigned the checklist "${title ?? "Untitled"}"${person ? ` to ${person}` : ""}`;
    case "checklist_item_added": return `added the task "${title ?? "Untitled"}"`;
    case "checklist_item_completed": return `completed the task "${title ?? "Untitled"}"`;
    case "checklist_item_reopened": return `reopened the task "${title ?? "Untitled"}"`;
    case "checklist_item_deleted": return `deleted the task "${title ?? "Untitled"}"`;
    case "collaborator_added": return `added ${person ?? "someone"} to the project`;
    case "collaborator_removed": return `removed ${person ?? "someone"} from the project`;
    case "note_added": return `added a note${s(meta, "preview") ? `: "${s(meta, "preview")}"` : ""}`;
    case "note_deleted": return "deleted a note";
    case "photo_uploaded": return `uploaded ${count ?? 1} ${count === 1 ? "photo" : "photos"}${phase ? ` to ${phase}` : ""}`;
    case "video_uploaded": return `uploaded a video${phase ? ` to ${phase}` : ""}`;
    case "photo_deleted": return `deleted ${count ?? 1} media ${count === 1 ? "item" : "items"}`;
    case "photo_updated": return "updated media details";
    case "photo_annotated": return "marked up a photo";
    case "photo_exported": return "exported media";
    case "job_created": return `created the project${name ? ` "${name}"` : ""}`;
    case "job_updated": return "updated the project details";
    case "job_archived": return "archived the project";
    case "job_restored": return "restored the project";
    default: return kind.replace(/_/g, " ");
  }
}

export function ProjectActivityFeed({
  projectId, photos, onOpen, onOpenChecklists,
}: {
  projectId: string;
  photos: PhotoDetail[];
  onOpen: (photo: PhotoDetail, commentId: string) => void;
  onOpenChecklists?: () => void;
}) {
  const [filter, setFilter] = useState<Category | "all">("all");

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["project-activity", projectId],
    queryFn: async (): Promise<Entry[]> => {
      const [c, e] = await Promise.all([
        supabase.from("comments").select("*").eq("job_id", projectId).order("created_at", { ascending: false }),
        supabase.from("activity_events").select("*").eq("job_id", projectId).order("created_at", { ascending: false }).limit(300),
      ]);
      if (c.error) throw c.error;
      if (e.error) throw e.error;
      const comments = c.data ?? [];
      const events = e.data ?? [];
      const ids = [...new Set([
        ...comments.map((x) => x.user_id),
        ...events.map((x) => x.user_id).filter((x): x is string => !!x),
      ])];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", ids)
        : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
      const pm = new Map((profs ?? []).map((p) => [p.id, p.display_name || p.email || "Someone"]));

      const fromComments: Entry[] = comments.map((x) => ({
        id: `c-${x.id}`,
        category: "comments",
        createdAt: x.created_at,
        author: pm.get(x.user_id) ?? "Someone",
        text: x.body,
        photoId: x.photo_id,
        commentId: x.id,
        isComment: true,
      }));
      const fromEvents: Entry[] = events.map((x) => ({
        id: `e-${x.id}`,
        category: CATEGORY_OF[x.kind] ?? "project",
        createdAt: x.created_at,
        author: (x.user_id && pm.get(x.user_id)) || "Someone",
        text: describe(x.kind, (x.meta ?? {}) as Meta),
        photoId: x.photo_id,
        commentId: null,
        isComment: false,
      }));
      return [...fromComments, ...fromEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const { isAdmin } = useMyRoles();
  const qc = useQueryClient();
  const removeEntry = async (entry: Entry) => {
    const msg = entry.isComment
      ? "Delete this comment? It will also be removed from the photo."
      : "Delete this activity item?";
    if (!window.confirm(msg)) return;
    const raw = entry.id.slice(2);
    const { data: del, error } = entry.isComment
      ? await supabase.from("comments").delete().eq("id", raw).select("id")
      : await supabase.from("activity_events").delete().eq("id", raw).select("id");
    if (error || !del?.length) { toast.error(error?.message ?? "Could not delete this item"); return; }
    toast.success("Activity item deleted");
    qc.invalidateQueries({ queryKey: ["project-activity", projectId] });
    if (entry.isComment) qc.invalidateQueries({ queryKey: ["comments"] });
  };
  const entries = useMemo(
    () => (data ?? []).filter((x) => filter === "all" || x.category === filter),
    [data, filter],
  );

  const pills = (
    <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter activity">
      {FILTERS.map((f) => (
        <Badge
          key={f.value}
          variant={filter === f.value ? "default" : "outline"}
          tabIndex={0}
          role="button"
          aria-pressed={filter === f.value}
          className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setFilter(f.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setFilter(f.value); } }}
        >
          {f.label}
        </Badge>
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading activity">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}
      </div>
    );
  }
  if (isError) {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center text-sm">
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <p>Activity could not be loaded.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      {pills}
      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          <ActivityIcon className="h-6 w-6" />
          <p>
            {filter === "all"
              ? "No activity yet. Comments, checklist progress, notes and uploads will appear here."
              : "Nothing to show for this filter yet."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Project activity">
          {entries.map((entry) => {
            const meta = CATEGORY_META[entry.category];
            const photo = entry.photoId ? byId.get(entry.photoId) : undefined;
            const showThumb = entry.isComment || !!photo;
            const isVideo = photo?.media_type === "video";
            const when = new Date(entry.createdAt);
            const clickable = !!photo || (entry.category === "checklists" && !!onOpenChecklists);
            const open = () => {
              if (photo) onOpen(photo, entry.commentId ?? "");
              else if (entry.category === "checklists") onOpenChecklists?.();
            };
            const body = (
              <>
                {showThumb ? (
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {photo ? (
                      isVideo ? (
                        <>
                          <video src={photo.image_url} muted preload="metadata" playsInline className="h-full w-full object-cover" />
                          <span className="absolute inset-0 flex items-center justify-center bg-background/30"><Play className="h-5 w-5" /></span>
                        </>
                      ) : (
                        <img src={photo.annotated_image_url || photo.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <span className="flex h-full w-full items-center justify-center"><ImageOff className="h-5 w-5 text-muted-foreground" /></span>
                    )}
                  </div>
                ) : (
                  <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted ${meta.tone}`} aria-hidden>
                    <meta.Icon className="h-4 w-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{entry.author}</span>
                    <time dateTime={entry.createdAt} title={format(when, "PPpp")}>{formatDistanceToNow(when, { addSuffix: true })}</time>
                    <Badge variant="secondary" className="text-[10px]">{meta.label}</Badge>
                    {showThumb && photo?.phase && <Badge variant="outline" className="text-[10px]">{photo.phase}</Badge>}
                    {showThumb && isVideo && <Badge variant="outline" className="text-[10px]">Video</Badge>}
                    {entry.isComment && !photo && <span className="italic">Media archived or unavailable</span>}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{entry.text}</p>
                </div>
              </>
            );
            return (
              <li key={entry.id} className="flex items-start gap-1">
                {clickable ? (
                  <button type="button" onClick={open}
                    aria-label={`${entry.author} ${entry.isComment ? "commented" : ""} ${formatDistanceToNow(when, { addSuffix: true })}: ${entry.text}`}
                    className="flex w-full gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {body}
                  </button>
                ) : (
                  <div className="flex w-full gap-3 rounded-lg border bg-card p-3">{body}</div>
                )}
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="shrink-0" aria-label="Delete activity item"
                    onClick={() => void removeEntry(entry)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
