import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { MessageSquare, Play, ImageOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { PhotoDetail } from "@/components/PhotoViewer";

export function ProjectActivityFeed({
  projectId, photos, onOpen,
}: {
  projectId: string;
  photos: PhotoDetail[];
  onOpen: (photo: PhotoDetail, commentId: string) => void;
}) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["project-activity", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments").select("*")
        .eq("job_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((c) => c.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", ids)
        : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
      const pm = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((c) => ({ ...c, profiles: pm.get(c.user_id) ?? null }));
    },
  });

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
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        <MessageSquare className="h-6 w-6" />
        <p>No activity yet. Comments added to project media will appear here.</p>
      </div>
    );
  }

  const byId = new Map(photos.map((p) => [p.id, p]));

  return (
    <ul className="space-y-2" aria-label="Project activity">
      {data.map((c) => {
        const profile = c.profiles as unknown as { display_name?: string | null; email?: string | null } | null;
        const author = profile?.display_name || profile?.email || "User";
        const photo = byId.get(c.photo_id);
        const isVideo = photo?.media_type === "video";
        const when = new Date(c.created_at);
        const body = (
          <>
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
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{author}</span>
                <time dateTime={c.created_at} title={format(when, "PPpp")}>{formatDistanceToNow(when, { addSuffix: true })}</time>
                {photo?.phase && <Badge variant="secondary" className="text-[10px]">{photo.phase}</Badge>}
                {isVideo && <Badge variant="outline" className="text-[10px]">Video</Badge>}
                {!photo && <span className="italic">Media archived or unavailable</span>}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </div>
          </>
        );
        return (
          <li key={c.id}>
            {photo ? (
              <button type="button" onClick={() => onOpen(photo, c.id)}
                aria-label={`Comment by ${author} on ${isVideo ? "video" : "photo"}, ${formatDistanceToNow(when, { addSuffix: true })}: ${c.body}`}
                className="flex w-full gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {body}
              </button>
            ) : (
              <div className="flex w-full gap-3 rounded-lg border bg-card p-3 opacity-70">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
