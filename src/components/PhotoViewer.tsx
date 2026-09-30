import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { PHOTO_PHASES, normalizePhase, phaseLabel, formatTakenAt } from "@/lib/photo-meta";
import {
  MapPin, X, ChevronLeft, ChevronRight, Download, Trash2, Save, Pencil,
  MessageSquare, Send, ZoomIn, ZoomOut, Tag,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export type PhotoDetail = {
  id: string; image_url: string; annotated_image_url: string | null;
  caption: string | null; tags: string[] | null; phase: string | null;
  latitude: number | null; longitude: number | null; taken_at: string;
  area_id: string | null; job_id: string; company_id: string; user_id: string;
  storage_path: string; archived_at?: string | null;
  media_type?: string | null; mime_type?: string | null; duration_seconds?: number | string | null;
  annotations_data?: unknown; annotated_storage_path?: string | null;
};


export function PhotoViewer({
  photos, index, onIndexChange, onClose, uploaderName, canManage, canArchive, focusCommentId,
}: {
  photos: PhotoDetail[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  uploaderName: (id: string) => string;
  canManage: (p: PhotoDetail) => boolean;
  canArchive?: (p: PhotoDetail) => boolean;
  focusCommentId?: string | null;
}) {
  const photo = photos[index];
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState("");
  const [phase, setPhase] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [zoom, setZoom] = useState(false);
  const [comment, setComment] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    if (!photo) return;
    setCaption(photo.caption ?? "");
    setPhase(normalizePhase(photo.phase) ?? "");
    setTags(photo.tags ?? []);
    setEditing(false);
    setZoom(false);
  }, [photo?.id]);

  const prev = useCallback(() => onIndexChange((index - 1 + photos.length) % photos.length), [index, photos.length, onIndexChange]);
  const next = useCallback(() => onIndexChange((index + 1) % photos.length), [index, photos.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [prev, next, onClose]);

  const { data: comments } = useQuery({
    queryKey: ["comments", photo?.id],
    enabled: !!photo?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments").select("*")
        .eq("photo_id", photo!.id).order("created_at", { ascending: true });
      if (error) throw error;
      const ids = [...new Set((data ?? []).map((c) => c.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", ids)
        : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
      const pm = new Map((profs ?? []).map((p) => [p.id, p]));
      return (data ?? []).map((c) => ({ ...c, profiles: pm.get(c.user_id) ?? null }));
    },
  });

  useEffect(() => {
    if (!focusCommentId || !comments) return;
    const el = document.querySelector<HTMLElement>(`[data-comment-id="${focusCommentId}"]`);
    if (el) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); el.focus({ preventScroll: true }); }
  }, [focusCommentId, comments]);


  if (!photo || typeof document === "undefined") return null;
  const editable = canManage(photo);
  const isVideo = photo.media_type === "video";
  const displayUrl = isVideo ? photo.image_url : (photo.annotated_image_url ?? photo.image_url);

  const save = async () => {
    const { error } = await supabase.from("photos")
      .update({ caption: caption.trim() || null, phase: phase || null, tags })
      .eq("id", photo.id);
    if (error) { toast.error(error.message); return; }
    await logActivity({
      company_id: photo.company_id, job_id: photo.job_id, photo_id: photo.id,
      kind: "photo_updated", meta: { caption, phase, tags },
    });
    qc.invalidateQueries({ queryKey: ["photos", photo.job_id] });
    setEditing(false);
    toast.success("Media updated");
  };

  const removePhoto = async () => {
    if (!window.confirm("Delete this media? It is permanently removed from the project gallery and map.")) return;
    const { data, error } = await supabase.from("photos").delete().eq("id", photo.id).select("id");
    if (error) { toast.error(error.message); return; }
    if (!data?.length) { toast.error("You are not allowed to delete this media"); return; }
    if (photo.storage_path) await supabase.storage.from("job-photos").remove([photo.storage_path]);
    await logActivity({
      company_id: photo.company_id, job_id: photo.job_id,
      kind: "photo_deleted", meta: { photo_ids: [photo.id], result: "ok" },
    });
    qc.invalidateQueries({ queryKey: ["photos", photo.job_id] });
    toast.success("Media deleted");
    onClose();
  };

  const download = async () => {
    try {
      const res = await fetch(displayUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const ext = isVideo
        ? (photo.storage_path.split(".").pop() || (photo.mime_type?.split("/")[1] ?? "webm"))
        : "jpg";
      a.download = `${isVideo ? "video" : "photo"}-${photo.id}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
      await logActivity({
        company_id: photo.company_id, job_id: photo.job_id, photo_id: photo.id,
        kind: "photo_exported", meta: { photo_ids: [photo.id] },
      });
    } catch {
      toast.error("Could not download this media");
    }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    const { error } = await supabase.from("comments").insert({
      photo_id: photo.id, job_id: photo.job_id, company_id: photo.company_id,
      user_id: user!.id, body: comment.trim(),
    });
    if (error) { toast.error(error.message); return; }
    setComment("");
    qc.invalidateQueries({ queryKey: ["comments", photo.id] });
    qc.invalidateQueries({ queryKey: ["project-activity", photo.job_id] });
  };

  const refreshComments = () => {
    qc.invalidateQueries({ queryKey: ["comments", photo.id] });
    qc.invalidateQueries({ queryKey: ["project-activity", photo.job_id] });
  };
  const saveComment = async (id: string) => {
    const body = editBody.trim();
    if (!body) return;
    const { error } = await supabase.from("comments").update({ body }).eq("id", id).eq("user_id", user!.id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    toast.success("Comment updated");
    refreshComments();
  };
  const deleteComment = async (id: string) => {
    if (!window.confirm("Delete this comment? This can't be undone.")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id).eq("user_id", user!.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Comment deleted");
    refreshComments();
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]); setTagInput("");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-2 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
       aria-label="Media viewer"
    >
      <div
        className="relative flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-card shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 60) (dx > 0 ? prev() : next());
          touchX.current = null;
        }}
      >
        <button
          type="button"
           aria-label="Close media viewer"
           title="Close media viewer"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute right-3 top-3 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-black/80 text-white shadow-lg ring-2 ring-white/80 transition hover:bg-black focus:outline-none focus-visible:ring-4 focus-visible:ring-white sm:h-14 sm:w-14"
        >
          <X className="h-7 w-7" strokeWidth={2.5} />
        </button>

        {/* Image stage */}
        <div className="relative flex min-h-[40vh] flex-1 items-center justify-center bg-black">
          {isVideo ? (
            <video
              key={photo.id}
              src={displayUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-[45vh] w-full object-contain md:max-h-[95vh]"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={displayUrl}
              alt={photo.caption ?? "Project photo"}
              className={zoom ? "max-h-[60vh] w-full cursor-zoom-out object-cover md:max-h-[95vh]" : "max-h-[45vh] w-full cursor-zoom-in object-contain md:max-h-[95vh]"}
              onClick={() => setZoom((z) => !z)}
            />
          )}
          {photos.length > 1 && (
            <>
               <button aria-label="Previous media" onClick={prev}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
                <ChevronLeft className="h-5 w-5" />
              </button>
               <button aria-label="Next media" onClick={next}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            {index + 1} of {photos.length}
          </span>
          {!isVideo && <button aria-label={zoom ? "Fit image" : "Zoom image"} onClick={() => setZoom((z) => !z)}
            className="absolute bottom-2 right-2 rounded bg-black/60 p-1.5 text-white hover:bg-black/80">
            {zoom ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>}
        </div>

        {/* Details */}
        <div className="flex w-full flex-col gap-3 overflow-y-auto p-4 md:max-w-sm">
          <div className="flex items-start justify-between gap-2 pr-14 md:pr-0">
            <h3 className="text-sm font-semibold">{isVideo ? "Video details" : "Photo details"}</h3>
          </div>

          {!editing ? (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{formatTakenAt(photo.taken_at)}</p>
              {isVideo && photo.duration_seconds != null && (
                <p className="text-muted-foreground">Length: {Math.round(Number(photo.duration_seconds))}s</p>
              )}
              <div className="flex flex-wrap gap-1">
                <Badge variant="secondary">{phaseLabel(photo.phase)}</Badge>
                {(photo.tags ?? []).map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}
              </div>
              <p>{photo.caption || <span className="text-muted-foreground">No caption</span>}</p>
              <p className="text-muted-foreground">Uploaded by {uploaderName(photo.user_id)}</p>
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3 w-3" />
                {photo.latitude != null && photo.longitude != null
                  ? `${photo.latitude.toFixed(5)}, ${photo.longitude.toFixed(5)}`
                  : "Location unavailable"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium">Phase</label>
                <select className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={phase} onChange={(e) => setPhase(e.target.value)}>
                  <option value="">Unassigned</option>
                  {PHOTO_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Caption</label>
                <Textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} />
              </div>
              <div>
                <label className="flex items-center gap-1 text-xs font-medium"><Tag className="h-3 w-3" />Tags (area, trade…)</label>
                <div className="my-1 flex flex-wrap gap-1">
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1">
                      {t}<button aria-label={`Remove ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input value={tagInput} placeholder="e.g. lobby, roof" onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                  <Button type="button" variant="outline" onClick={addTag}>Add</Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={save}><Save className="h-4 w-4 mr-1" />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={download}><Download className="h-4 w-4 mr-1" />Download</Button>
            {editable && !editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
            )}
            {(canArchive ? canArchive(photo) : editable) && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={removePhoto}>
                 <Trash2 className="h-4 w-4 mr-1" />Delete media
              </Button>
            )}
          </div>

          <div className="border-t pt-3">
            <h4 className="mb-2 flex items-center gap-1 text-sm font-semibold"><MessageSquare className="h-4 w-4" />Comments</h4>
            <div className="mb-2 max-h-40 space-y-2 overflow-y-auto">
              {(comments ?? []).map((c) => {
                const profile = c.profiles as unknown as { display_name?: string | null; email?: string | null } | null;
                return (
                  <div key={c.id} data-comment-id={c.id}
                    tabIndex={c.id === focusCommentId ? -1 : undefined}
                    className={`rounded-md bg-muted/50 p-2 text-sm outline-none ${c.id === focusCommentId ? "ring-2 ring-primary" : ""}`}>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{profile?.display_name || profile?.email || "User"}</span>
                      {" · "}{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                      {c.user_id === user?.id && editingId !== c.id && (
                        <span className="ml-auto flex gap-1">
                          <button type="button" aria-label="Edit comment" className="rounded p-1 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
                            onClick={() => { setEditingId(c.id); setEditBody(c.body); }}><Pencil className="h-3 w-3" /></button>
                          <button type="button" aria-label="Delete comment" className="rounded p-1 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring outline-none"
                            onClick={() => deleteComment(c.id)}><Trash2 className="h-3 w-3" /></button>
                        </span>
                      )}
                    </div>
                    {editingId === c.id ? (
                      <div className="mt-1 space-y-1">
                        <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} aria-label="Edit comment text" />
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                          <Button size="sm" onClick={() => saveComment(c.id)} disabled={!editBody.trim()}>Save</Button>
                        </div>
                      </div>
                    ) : <p>{c.body}</p>}
                  </div>
                );
              })}
              {comments?.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComment(); } }} />
              <Button onClick={addComment} disabled={!comment.trim()}><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
