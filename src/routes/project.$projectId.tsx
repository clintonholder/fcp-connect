import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
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
import {
  ArrowLeft, Camera, MapPin, Plus, Trash2, Building2, ImageOff, Tag, Share2, FileDown,
  Activity, Copy, Pencil, Archive, ArchiveRestore,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { PhotoDetailDialog, type PhotoDetail } from "@/components/PhotoDetailDialog";
import { generateJobPdf } from "@/lib/pdf-report";
import { formatDistanceToNow } from "date-fns";
import { geocodeAddress } from "@/lib/geocode";
import { ProjectForm, type ProjectFormValues } from "@/components/ProjectForm";

const ProjectPhotoMap = lazy(() => import("@/components/ProjectPhotoMap"));

export const Route = createFileRoute("/project/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — FCP Connect" },
      { name: "description", content: "Project details, areas, field photos and photo map for an FCP Services project." },
      { property: "og:title", content: "Project — FCP Connect" },
      { property: "og:description", content: "Project details, areas, field photos and photo map for an FCP Services project." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><ProjectDetail /></RequireAuth>,
});

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const { company } = useCompany();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState<PhotoDetail | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<ProjectFormValues | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [photoFilters, setPhotoFilters] = useState({ area: "", uploader: "", since: "" });
  useEffect(() => setMapReady(true), []);

  const { data: project } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", projectId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, email").order("display_name");
      return data ?? [];
    },
  });
  const personName = (id: string | null | undefined) => {
    const p = (people ?? []).find((x) => x.id === id);
    return p?.display_name || p?.email || "Unknown";
  };

  const { data: areas } = useQuery({
    queryKey: ["areas", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("*").eq("job_id", projectId).order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["photos", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select("*").eq("job_id", projectId).order("taken_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PhotoDetail[];
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["activity", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events")
        .select("*, profiles(display_name, email)")
        .eq("job_id", projectId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });

  const { data: shares } = useQuery({
    queryKey: ["shares", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("share_links").select("*").eq("job_id", projectId).order("created_at", { ascending: false });
      return data ?? [];
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

  const areaName_ = (id: string) => (areas ?? []).find((a) => a.id === id)?.name ?? null;

  const mapPhotos = useMemo(() => {
    return (photos ?? []).filter((p) => {
      if (photoFilters.area && p.area_id !== photoFilters.area) return false;
      if (photoFilters.uploader && p.user_id !== photoFilters.uploader) return false;
      if (photoFilters.since && new Date(p.taken_at) < new Date(photoFilters.since)) return false;
      return true;
    });
  }, [photos, photoFilters]);
  const geoPhotos = mapPhotos.filter((p) => p.latitude != null && p.longitude != null);
  const noGeoCount = mapPhotos.length - geoPhotos.length;

  const uploaders = useMemo(
    () => Array.from(new Set((photos ?? []).map((p) => p.user_id))),
    [photos],
  );

  const createArea = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No workspace loaded");
      const { error } = await supabase.from("areas").insert({
        job_id: projectId, name: areaName, user_id: user!.id, company_id: company.id,
      });
      if (error) throw error;
      await logActivity({ company_id: company.id, job_id: projectId, kind: "area_added", meta: { name: areaName } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["areas", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      setAreaName(""); setAreaOpen(false);
      toast.success("Area added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const createShare = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No workspace loaded");
      const { data, error } = await supabase.from("share_links").insert({
        job_id: projectId, company_id: company.id, created_by: user!.id,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (d) => {
      const url = `${window.location.origin}/share/${d.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Share link copied to clipboard");
      qc.invalidateQueries({ queryKey: ["shares", projectId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const openEdit = () => {
    if (!project) return;
    setEdit({
      name: project.name ?? "",
      customer: project.customer ?? project.client ?? "",
      address: project.address ?? "",
      division: project.division ?? "",
      owner_id: project.owner_id ?? "",
      status: project.status ?? "Active",
      phase: project.phase ?? "",
      cmic_number: project.cmic_number ?? "",
      notes: project.notes ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!edit || !project) return;
      if (!edit.name.trim()) throw new Error("Project name is required");
      if (!edit.customer.trim()) throw new Error("Customer name is required");
      const addressChanged = edit.address.trim() !== (project.address ?? "");
      const geo = addressChanged && edit.address.trim() ? await geocodeAddress(edit.address) : null;
      const { error } = await supabase.from("jobs").update({
        name: edit.name.trim(),
        customer: edit.customer.trim(),
        client: edit.customer.trim(),
        address: edit.address.trim() || null,
        division: edit.division || null,
        owner_id: edit.owner_id || null,
        status: edit.status,
        phase: edit.phase || null,
        cmic_number: edit.cmic_number.trim() || null,
        notes: edit.notes.trim() || null,
        ...(addressChanged
          ? { latitude: geo?.lat ?? null, longitude: geo?.lon ?? null, geocode_failed: !!edit.address.trim() && !geo }
          : {}),
      }).eq("id", projectId);
      if (error) throw error;
      await logActivity({ company_id: project.company_id, job_id: projectId, kind: "job_updated", meta: { name: edit.name } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      setEditOpen(false);
      toast.success("Project saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggleArchive = useMutation({
    mutationFn: async () => {
      if (!project) return;
      const archiving = !project.archived_at;
      const { error } = await supabase.from("jobs")
        .update({ archived_at: archiving ? new Date().toISOString() : null, ...(archiving ? { status: "Archived" } : {}) })
        .eq("id", projectId);
      if (error) throw error;
      await logActivity({
        company_id: project.company_id, job_id: projectId,
        kind: archiving ? "job_archived" : "job_restored", meta: { name: project.name },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success("Project updated");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const editDirty = !!edit && !!project && (
    edit.name !== (project.name ?? "") ||
    edit.customer !== (project.customer ?? project.client ?? "") ||
    edit.address !== (project.address ?? "") ||
    edit.division !== (project.division ?? "") ||
    edit.owner_id !== (project.owner_id ?? "") ||
    edit.status !== (project.status ?? "Active") ||
    edit.phase !== (project.phase ?? "") ||
    edit.cmic_number !== (project.cmic_number ?? "") ||
    edit.notes !== (project.notes ?? "")
  );

  useEffect(() => {
    if (!editOpen || !editDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editOpen, editDirty]);

  const closeEdit = () => {
    if (editDirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditOpen(false);
  };

  const handlePdf = async () => {
    if (!project || !areas || !photos) return;
    toast.info("Generating PDF…");
    try {
      await generateJobPdf({ job: project, areas, photos });
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />All projects
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2"><Building2 className="h-6 w-6 text-primary" /></div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold sm:text-3xl">{project?.name}</h1>
              {project?.archived_at && <Badge variant="outline">Archived</Badge>}
            </div>
            {project?.address && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" />{project.address}</p>}
            {(project?.customer || project?.client) && <p className="text-sm text-muted-foreground">Customer: {project.customer || project.client}</p>}
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              {project?.status && <Badge variant="secondary">{project.status}</Badge>}
              {project?.phase && <Badge variant="outline">{project.phase}</Badge>}
              {project?.division && <Badge variant="outline">{project.division}</Badge>}
              {project?.owner_id && <Badge variant="outline">PM: {personName(project.owner_id)}</Badge>}
              {project?.cmic_number && <Badge variant="outline">CMiC {project.cmic_number}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
          <Button size="sm" variant="outline" onClick={() => {
            const msg = project?.archived_at ? "Restore this project?" : "Archive this project? It stays available under 'Show archived'.";
            if (window.confirm(msg)) toggleArchive.mutate();
          }}>
            {project?.archived_at ? <><ArchiveRestore className="h-4 w-4 mr-1" />Restore</> : <><Archive className="h-4 w-4 mr-1" />Archive</>}
          </Button>
          <Button size="sm" variant="outline" onClick={handlePdf}><FileDown className="h-4 w-4 mr-1" />PDF Report</Button>
          <Dialog open={shareOpen} onOpenChange={setShareOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Share2 className="h-4 w-4 mr-1" />Share</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Share this project</DialogTitle></DialogHeader>
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
                        qc.invalidateQueries({ queryKey: ["shares", projectId] });
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

      <Dialog open={editOpen} onOpenChange={(o) => (o ? setEditOpen(true) : closeEdit())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          {edit && (
            <ProjectForm
              value={edit}
              onChange={setEdit}
              people={people ?? []}
              saving={saveEdit.isPending}
              onSave={() => saveEdit.mutate()}
              onCancel={closeEdit}
            />
          )}
        </DialogContent>
      </Dialog>

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
              projectId={projectId}
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
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MapPin className="h-4 w-4" />Photo Map</h2>
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={photoFilters.area} onChange={(e) => setPhotoFilters({ ...photoFilters, area: e.target.value })}>
                <option value="">All areas</option>
                {(areas ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={photoFilters.uploader} onChange={(e) => setPhotoFilters({ ...photoFilters, uploader: e.target.value })}>
                <option value="">All uploaders</option>
                {uploaders.map((u) => <option key={u} value={u}>{personName(u)}</option>)}
              </select>
              <Input type="date" value={photoFilters.since} onChange={(e) => setPhotoFilters({ ...photoFilters, since: e.target.value })} />
              <Button variant="outline" size="sm" onClick={() => setPhotoFilters({ area: "", uploader: "", since: "" })}>Reset filters</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {geoPhotos.length} geotagged photo{geoPhotos.length === 1 ? "" : "s"} shown
              {noGeoCount > 0 && ` · ${noGeoCount} photo${noGeoCount === 1 ? "" : "s"} have no GPS location and can't be mapped`}
            </p>
            <div className="overflow-hidden rounded-lg border" style={{ height: "50vh" }}>
              {geoPhotos.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  No geotagged photos for this project yet.
                </div>
              ) : mapReady ? (
                <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
                  <ProjectPhotoMap
                    photos={geoPhotos.map((p) => ({
                      id: p.id,
                      image_url: p.image_url,
                      annotated_image_url: p.annotated_image_url,
                      caption: p.caption,
                      latitude: p.latitude,
                      longitude: p.longitude,
                      taken_at: p.taken_at,
                      uploader: personName(p.user_id),
                      area_name: areaName_(p.area_id),
                      tags: p.tags,
                    }))}
                  />
                </Suspense>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity className="h-4 w-4" />Activity</h2>
        <Card><CardContent className="p-3">
          {(activity ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          <ul className="space-y-2">
            {(activity ?? []).map((e) => {
              const profile = e.profiles as unknown as { display_name?: string | null; email?: string | null } | null;
              const meta = e.meta as Record<string, unknown>;
              const label: Record<string, string> = {
                job_created: "created the project",
                job_updated: "updated the project",
                job_archived: "archived the project",
                job_restored: "restored the project",
                area_added: "added an area",
                photo_uploaded: "uploaded a photo",
                photo_annotated: "annotated a photo",
                photo_updated: "updated a photo",
                comment_added: "commented on a photo",
                photo_deleted: "deleted a photo",
              };
              return (
                <li key={e.id} className="flex justify-between gap-2 text-sm">
                  <span><span className="font-medium">{profile?.display_name || profile?.email || "Someone"}</span> {label[e.kind] || e.kind} {meta?.name ? <em className="text-muted-foreground">({String(meta.name)})</em> : null}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                </li>
              );
            })}
          </ul>
        </CardContent></Card>
      </div>

      <PhotoDetailDialog photo={activePhoto} open={!!activePhoto} onClose={() => setActivePhoto(null)} />
      {void navigate}
    </div>
  );
}

function AreaSection({ area, photos, projectId, userId, companyId, onOpenPhoto }: {
  area: { id: string; name: string };
  photos: PhotoDetail[];
  projectId: string; userId: string; companyId: string;
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
        const path = `${userId}/${projectId}/${area.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
        const { error: insErr } = await supabase.from("photos").insert({
          area_id: area.id, job_id: projectId, user_id: userId, company_id: companyId,
          storage_path: path, image_url: pub.publicUrl,
          latitude: coords?.coords.latitude ?? null,
          longitude: coords?.coords.longitude ?? null,
          accuracy: coords?.coords.accuracy ?? null,
        });
        if (insErr) throw insErr;
      }
      await logActivity({ company_id: companyId, job_id: projectId, area_id: area.id, kind: "photo_uploaded", meta: { count: files.length } });
      qc.invalidateQueries({ queryKey: ["photos", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
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
      const { data: row } = await supabase.from("photos").select("storage_path, caption").eq("id", p.id).single();
      const { error } = await supabase.from("photos").delete().eq("id", p.id);
      if (error) throw error;
      if (row?.storage_path) await supabase.storage.from("job-photos").remove([row.storage_path]);
      await logActivity({
        company_id: companyId, job_id: projectId, area_id: area.id, kind: "photo_deleted",
        meta: { photo_id: p.id, caption: row?.caption ?? null },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["photos", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success("Photo deleted");
    },
    onError: (e) => toast.error((e as Error).message),
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
              <div key={p.id} className="group relative cursor-pointer overflow-hidden rounded-md border bg-muted" onClick={() => onOpenPhoto(p)}>
                <img src={p.annotated_image_url ?? p.image_url} alt={p.caption ?? area.name} className="aspect-square w-full object-cover" loading="lazy" />
                {(p.tags ?? []).length > 0 && (
                  <div className="absolute left-1 top-1 flex flex-wrap gap-0.5">
                    {(p.tags ?? []).slice(0, 2).map((t) => (
                      <span key={t} className="rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">#{t}</span>
                    ))}
                  </div>
                )}
                {p.latitude && p.longitude && (
                  <div className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                    <MapPin className="h-2.5 w-2.5" />GPS
                  </div>
                )}
                <button
                  aria-label="Delete photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm("Delete this photo? This cannot be undone.")) deletePhoto.mutate(p);
                  }}
                  className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                >
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
