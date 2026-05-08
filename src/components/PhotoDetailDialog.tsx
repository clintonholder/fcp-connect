import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { MapPin, Tag, X, Pencil, Save, MessageSquare, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export type PhotoDetail = {
  id: string; image_url: string; annotated_image_url: string | null;
  caption: string | null; tags: string[] | null;
  latitude: number | null; longitude: number | null; taken_at: string;
  area_id: string; job_id: string; company_id: string; user_id: string;
  storage_path: string;
};

export function PhotoDetailDialog({ photo, open, onClose }: {
  photo: PhotoDetail | null; open: boolean; onClose: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [caption, setCaption] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [comment, setComment] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    if (photo) {
      setCaption(photo.caption ?? "");
      setTags(photo.tags ?? []);
      setDrawing(false);
    }
  }, [photo?.id]);

  const { data: comments } = useQuery({
    queryKey: ["comments", photo?.id],
    enabled: !!photo?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*, profiles(display_name, email)")
        .eq("photo_id", photo!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const saveMeta = useMutation({
    mutationFn: async () => {
      if (!photo) return;
      const { error } = await supabase.from("photos")
        .update({ caption, tags }).eq("id", photo.id);
      if (error) throw error;
      await logActivity({ company_id: photo.company_id, job_id: photo.job_id, photo_id: photo.id, kind: "photo_updated" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addComment = useMutation({
    mutationFn: async () => {
      if (!photo || !comment.trim()) return;
      const { error } = await supabase.from("comments").insert({
        photo_id: photo.id, job_id: photo.job_id, company_id: photo.company_id,
        user_id: user!.id, body: comment.trim(),
      });
      if (error) throw error;
      await logActivity({ company_id: photo.company_id, job_id: photo.job_id, photo_id: photo.id, kind: "comment_added" });
    },
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["comments", photo?.id] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Annotation drawing
  const startDraw = () => {
    if (!photo || !imgRef.current) return;
    setDrawing(true);
    setTimeout(() => {
      const c = canvasRef.current; const img = imgRef.current;
      if (!c || !img) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      ctx.strokeStyle = "#ef4444"; ctx.lineWidth = Math.max(4, c.width / 200); ctx.lineCap = "round";
    }, 50);
  };

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>, type: "down" | "move" | "up") => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * c.width;
    const y = ((e.clientY - rect.top) / rect.height) * c.height;
    const ctx = c.getContext("2d"); if (!ctx) return;
    if (type === "down") { drawingRef.current = true; ctx.beginPath(); ctx.moveTo(x, y); }
    else if (type === "move" && drawingRef.current) { ctx.lineTo(x, y); ctx.stroke(); }
    else { drawingRef.current = false; }
  };

  const saveAnnotation = async () => {
    if (!photo || !canvasRef.current) return;
    const c = canvasRef.current;
    const blob: Blob | null = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return;
    const path = `${photo.user_id}/${photo.job_id}/${photo.area_id}/annotated-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("job-photos").upload(path, blob, { contentType: "image/jpeg" });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
    const { error } = await supabase.from("photos").update({ annotated_image_url: pub.publicUrl }).eq("id", photo.id);
    if (error) { toast.error(error.message); return; }
    await logActivity({ company_id: photo.company_id, job_id: photo.job_id, photo_id: photo.id, kind: "photo_annotated" });
    qc.invalidateQueries({ queryKey: ["photos"] });
    setDrawing(false);
    toast.success("Annotation saved");
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]); setTagInput("");
  };

  if (!photo) return null;
  const displayUrl = photo.annotated_image_url ?? photo.image_url;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Photo details</DialogTitle></DialogHeader>

        <div className="relative bg-black rounded-md overflow-hidden">
          {drawing ? (
            <>
              <img ref={imgRef} src={photo.image_url} alt="" className="hidden" crossOrigin="anonymous" />
              <canvas
                ref={canvasRef}
                className="w-full touch-none"
                onPointerDown={(e) => onPointer(e, "down")}
                onPointerMove={(e) => onPointer(e, "move")}
                onPointerUp={(e) => onPointer(e, "up")}
                onPointerLeave={(e) => onPointer(e, "up")}
              />
            </>
          ) : (
            <img src={displayUrl} alt={caption ?? ""} className="w-full max-h-[50vh] object-contain" />
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!drawing ? (
            <Button size="sm" variant="outline" onClick={startDraw}><Pencil className="h-4 w-4 mr-1" />Annotate</Button>
          ) : (
            <>
              <Button size="sm" onClick={saveAnnotation}><Save className="h-4 w-4 mr-1" />Save markup</Button>
              <Button size="sm" variant="ghost" onClick={() => setDrawing(false)}>Cancel</Button>
            </>
          )}
          {photo.latitude && photo.longitude && (
            <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" />{photo.latitude.toFixed(4)}, {photo.longitude.toFixed(4)}</Badge>
          )}
        </div>

        <div>
          <label className="text-sm font-medium">Caption</label>
          <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={2} />
        </div>

        <div>
          <label className="text-sm font-medium flex items-center gap-1"><Tag className="h-3 w-3" />Tags</label>
          <div className="flex flex-wrap gap-1 my-2">
            {tags.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1">
                {t}
                <button onClick={() => setTags(tags.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. roof, damage, before"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            />
            <Button type="button" variant="outline" onClick={addTag}>Add</Button>
          </div>
        </div>

        <Button onClick={() => saveMeta.mutate()} disabled={saveMeta.isPending}>Save caption & tags</Button>

        <div className="border-t pt-3">
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1"><MessageSquare className="h-4 w-4" />Comments</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto mb-2">
            {(comments ?? []).map((c) => {
              const profile = c.profiles as unknown as { display_name?: string | null; email?: string | null } | null;
              return (
                <div key={c.id} className="rounded-md bg-muted/50 p-2 text-sm">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{profile?.display_name || profile?.email || "User"}</span>
                    {" · "}{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </div>
                  <p>{c.body}</p>
                </div>
              );
            })}
            {comments?.length === 0 && <p className="text-xs text-muted-foreground">No comments yet.</p>}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComment.mutate(); } }} />
            <Button onClick={() => addComment.mutate()} disabled={!comment.trim() || addComment.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
