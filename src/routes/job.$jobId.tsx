import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Camera, MapPin, Plus, Trash2, Building2, ImageOff, Tag, MessageSquare, Share2, FileDown, Activity, Copy } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { PhotoDetailDialog, type PhotoDetail } from "@/components/PhotoDetailDialog";
import { generateJobPdf } from "@/lib/pdf-report";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/job/$jobId")({
  component: () => <RequireAuth><JobDetail /></RequireAuth>,
});

function JobDetail() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const { company } = useCompany();
  const qc = useQueryClient();
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<PhotoDetail | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const { data: job } = useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", jobId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: areas } = useQuery({
    queryKey: ["areas", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").eq("job_id", jobId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["photos", jobId],
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select("*").eq("job_id", jobId).order("taken_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PhotoDetail[];
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["activity", jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("*, profiles(display_name, email)")
        .eq("job_id", jobId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });

  const allTags = useMemo(() => {
    const s = new Set<string>();
    (photos ?? []).forEach((p) => (p.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    if (!tagFilter) return photos ?? [];
    return (photos ?? []).filter((p) => (p.tags ?? []).includes(tagFilter));
  }, [photos, tagFilter]);

  const createArea = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No company");
      const { error } = await supabase.from("areas").insert({
        job_id: jobId, name: areaName, user_id: user!.id, company_id: company.id,
      });
      if (error) throw error;
      await logActivity({ company_id: company.id, job_id: jobId, kind: "area_added", meta: { name: areaName } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["areas", jobId] });
      qc.invalidateQueries({ queryKey: ["activity", jobId] });
      setAreaName(""); setAreaOpen(false);
      toast.success("Area added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const createShare = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No company");
      const { data, error } = await supabase.from("share_links").insert({
        job_id: jobId, company_id: company.id, created_by: user!.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      const url = `${window.location.origin}/share/${d.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Share link copied to clipboard");
      qc.invalidateQueries({ queryKey: ["shares", jobId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const { data: shares } = useQuery({
    queryKey: ["shares", jobId],
    queryFn: async () => {
      const { data } = await supabase.from("share_links").select("*").eq("job_id", jobId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const handlePdf = async () => {
    if (!job || !areas || !photos) return;
    toast.info("Generating PDF…");
    try {
      await generateJobPdf({ job, areas, photos });
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />All jobs
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-accent/20 p-2"><Building2 className="h-6 w-6 text-accent-foreground" /></div>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{job?.name}</h1>
            {job?.address && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" />{job.address}</p>}
            {job?.client && <p className="text-sm text-muted-foreground">Client: {job.client}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handlePdf}><FileDown className="h-4 w-4 mr-1" />PDF Report</Button>
          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Share2 className="h-4 w-4 mr-1" />Share</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Share this job</DialogTitle></DialogHeader>
              <p className="text-sm text-muted-foreground">Anyone with the link can view all photos read-only.</p>
              <Button onClick={() => createShare.mutate()} disabled={createShare.isPending}>
                <Plus className="h-4 w-4 mr-1" />Create new share link
              </Button>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(shares ?? []).map((s) => {
                  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/share/${s.token}`;
                  return (
                    <div key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                      <code className="flex-1 truncate">{url}</code>
                      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await supabase.from("share_links").delete().eq("id", s.id);
                        qc.invalidateQueries({ queryKey: ["shares", jobId] });
                      }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  );
                })}
                {shares?.length === 0 && <p className="text-xs text-muted-foreground">No share links yet.</p>}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {allTags.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <Badge variant={tagFilter === null ? "default" : "outline"} className="cursor-pointer" onClick={() => setTagFilter(null)}>All</Badge>
          {allTags.map((t) => (
            <Badge key={t} variant={tagFilter === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setTagFilter(t)}>{t}</Badge>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Areas</h2>
        <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Add Area</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Area</DialogTitle></DialogHeader>
            <form onSubmit={(e) => { e.preventDefault(); createArea.mutate(); }} className="space-y-3">
              <div><Label>Area name (e.g. "Lobby", "Roof")</Label><Input required value={areaName} onChange={(e) => setAreaName(e.target.value)} /></div>
              <Button type="submit" className="w-full" disabled={createArea.isPending}>Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {areas && areas.length > 0 ? (
        <div className="space-y-6">
          {areas.map((a) => (
            <AreaSection
              key={a.id}
              area={a}
              photos={filteredPhotos.filter((p) => p.area_id === a.id)}
              jobId={jobId}
              userId={user!.id}
              companyId={company?.id ?? ""}
              onOpenPhoto={setActivePhoto}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">Add an area to start capturing photos.</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Activity className="h-4 w-4" />Activity</h2>
        <Card><CardContent className="p-3">
          {(activity ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          <ul className="space-y-2">
            {(activity ?? []).map((e) => {
              const profile = e.profiles as unknown as { display_name?: string | null; email?: string | null } | null;
              const meta = e.meta as Record<string, unknown>;
              const label: Record<string, string> = {
                job_created: "created the job",
                area_added: "added an area",
                photo_uploaded: "uploaded a photo",
                photo_annotated: "annotated a photo",
                photo_updated: "updated a photo",
                comment_added: "commented on a photo",
                photo_deleted: "deleted a photo",
              };
              return (
                <li key={e.id} className="text-sm flex justify-between gap-2">
                  <span><span className="font-medium">{profile?.display_name || profile?.email || "Someone"}</span> {label[e.kind] || e.kind} {meta?.name ? <em className="text-muted-foreground">({String(meta.name)})</em> : null}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                </li>
              );
            })}
          </ul>
        </CardContent></Card>
      </div>

      <PhotoDetailDialog photo={activePhoto} open={!!activePhoto} onClose={() => setActivePhoto(null)} />
    </div>
  );
}

function AreaSection({ area, photos, jobId, userId, companyId, onOpenPhoto }: {
  area: { id: string; name: string };
  photos: PhotoDetail[];
  jobId: string; userId: string; companyId: string;
  onOpenPhoto: (p: PhotoDetail) => void;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length || !companyId) return;
    setUploading(true);
    const coords = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
    });

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${jobId}/${area.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
        const { error: insErr } = await supabase.from("photos").insert({
          area_id: area.id, job_id: jobId, user_id: userId, company_id: companyId,
          storage_path: path, image_url: pub.publicUrl,
          latitude: coords?.coords.latitude ?? null,
          longitude: coords?.coords.longitude ?? null,
          accuracy: coords?.coords.accuracy ?? null,
        });
        if (insErr) throw insErr;
      }
      await logActivity({ company_id: companyId, job_id: jobId, area_id: area.id, kind: "photo_uploaded", meta: { count: files.length } });
      qc.invalidateQueries({ queryKey: ["photos", jobId] });
      qc.invalidateQueries({ queryKey: ["activity", jobId] });
      toast.success(coords ? "Photos uploaded with GPS" : "Photos uploaded (no GPS)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deletePhoto = useMutation({
    mutationFn: async (p: PhotoDetail) => {
      const { data: row } = await supabase.from("photos").select("storage_path").eq("id", p.id).single();
      if (row?.storage_path) await supabase.storage.from("job-photos").remove([row.storage_path]);
      const { error } = await supabase.from("photos").delete().eq("id", p.id);
      if (error) throw error;
      await logActivity({ company_id: companyId, job_id: jobId, area_id: area.id, kind: "photo_deleted" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos", jobId] });
      qc.invalidateQueries({ queryKey: ["activity", jobId] });
    },
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">{area.name} <span className="text-xs text-muted-foreground">({photos.length})</span></h3>
          <div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />
            <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4 mr-1" />{uploading ? "Uploading…" : "Take Photo"}
            </Button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="rounded-md bg-muted/50 p-6 text-center text-sm text-muted-foreground">
            <ImageOff className="mx-auto mb-1 h-5 w-5" />No photos
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="group relative overflow-hidden rounded-md border bg-muted cursor-pointer" onClick={() => onOpenPhoto(p)}>
                <img src={p.annotated_image_url ?? p.image_url} alt={p.caption ?? area.name} className="aspect-square w-full object-cover" loading="lazy" />
                {(p.tags ?? []).length > 0 && (
                  <div className="absolute top-1 left-1 flex flex-wrap gap-0.5">
                    {(p.tags ?? []).slice(0, 2).map((t) => (
                      <span key={t} className="rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">#{t}</span>
                    ))}
                  </div>
                )}
                {p.latitude && p.longitude && (
                  <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />GPS
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); deletePhoto.mutate(p); }}
                  className="absolute top-1 right-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

void MessageSquare;
