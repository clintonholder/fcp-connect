import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useMyRoles } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, Camera, MapPin, Building2, ImageOff, Tag,
  Activity, Pencil, Archive, ArchiveRestore, Download, X,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { PhotoViewer, type PhotoDetail } from "@/components/PhotoViewer";

import { formatDistanceToNow } from "date-fns";
import { geocodeAddress } from "@/lib/geocode";
import { ProjectForm, type ProjectFormValues } from "@/components/ProjectForm";
import { PHOTO_PHASES, UNPHASED, phaseLabel, formatTakenAt } from "@/lib/photo-meta";

const ProjectPhotoMap = lazy(() => import("@/components/ProjectPhotoMap"));

export const Route = createFileRoute("/project/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — FCP Connect" },
      { name: "description", content: "Project details, field photos by phase and photo map for an FCP Services project." },
      { property: "og:title", content: "Project — FCP Connect" },
      { property: "og:description", content: "Project details, field photos by phase and photo map for an FCP Services project." },
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
  const { isAdmin, can } = useMyRoles();
  const qc = useQueryClient();
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<ProjectFormValues | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string>("Progress");
  const [mapFilters, setMapFilters] = useState({ phase: "", uploader: "", since: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
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

  const { data: photos, isLoading: photosLoading, isError: photosError } = useQuery({
    queryKey: ["photos", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select("*")
        .eq("job_id", projectId).is("archived_at", null)
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data as unknown as PhotoDetail[];
    },
  });

  const { data: activity } = useQuery({
    queryKey: ["activity", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_events").select("*")
        .eq("job_id", projectId).order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return data;
    },
  });


  const allTags = useMemo(() => {
    const s = new Set<string>();
    (photos ?? []).forEach((p) => (p.tags ?? []).forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [photos]);

  const phaseCounts = useMemo(() => {
    const m = new Map<string, number>();
    (photos ?? []).forEach((p) => {
      const k = phaseLabel(p.phase);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [photos]);

  const filteredPhotos = useMemo(() => {
    return (photos ?? []).filter((p) => {
      if (phaseFilter && phaseLabel(p.phase) !== phaseFilter) return false;
      if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false;
      return true;
    });
  }, [photos, phaseFilter, tagFilter]);

  const groupedPhotos = useMemo(() => {
    const order = [...PHOTO_PHASES, UNPHASED];
    return order
      .map((name) => ({ name, items: filteredPhotos.filter((p) => phaseLabel(p.phase) === name) }))
      .filter((g) => g.items.length > 0);
  }, [filteredPhotos]);

  const mapPhotos = useMemo(() => {
    return (photos ?? []).filter((p) => {
      if (mapFilters.phase && phaseLabel(p.phase) !== mapFilters.phase) return false;
      if (mapFilters.uploader && p.user_id !== mapFilters.uploader) return false;
      if (mapFilters.since && new Date(p.taken_at) < new Date(mapFilters.since)) return false;
      return true;
    });
  }, [photos, mapFilters]);
  const geoPhotos = mapPhotos.filter((p) => p.latitude != null && p.longitude != null);
  const noGeoCount = mapPhotos.length - geoPhotos.length;

  const uploaders = useMemo(() => Array.from(new Set((photos ?? []).map((p) => p.user_id))), [photos]);

  const isOwnerOrAdmin = (p: PhotoDetail) => isAdmin || p.user_id === user?.id;
  const canEditPhoto = (p: PhotoDetail) => isOwnerOrAdmin(p) && can.can_edit_photos;
  const canArchivePhoto = (p: PhotoDetail) => isOwnerOrAdmin(p) && can.can_delete_photos;

  // ---- Upload -------------------------------------------------------------
  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length || !company) return;
    setUploading(true);
    const coords = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
    });
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user!.id}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
        const { error: insErr } = await supabase.from("photos").insert({
          job_id: projectId, user_id: user!.id, company_id: company.id,
          storage_path: path, image_url: pub.publicUrl, phase: uploadPhase || null,
          latitude: coords?.coords.latitude ?? null,
          longitude: coords?.coords.longitude ?? null,
          accuracy: coords?.coords.accuracy ?? null,
        });
        if (insErr) throw insErr;
      }
      await logActivity({ company_id: company.id, job_id: projectId, kind: "photo_uploaded", meta: { count: files.length, phase: uploadPhase } });
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

  // ---- Batch actions ------------------------------------------------------
  const selectedPhotos = filteredPhotos.filter((p) => selected.includes(p.id));
  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allVisibleSelected = filteredPhotos.length > 0 && filteredPhotos.every((p) => selected.includes(p.id));
  const setGroupSelected = (ids: string[], on: boolean) =>
    setSelected((s) => (on ? Array.from(new Set([...s, ...ids])) : s.filter((x) => !ids.includes(x))));

  const batchArchive = async () => {
    const allowed = selectedPhotos.filter(canArchivePhoto);
    const blocked = selectedPhotos.length - allowed.length;
    if (!allowed.length) { toast.error("You are not allowed to archive the selected photos"); return; }
    if (!window.confirm(`Archive ${allowed.length} photo${allowed.length === 1 ? "" : "s"}? They are removed from the gallery, counts and photo map.`)) return;
    const { data, error } = await supabase.from("photos")
      .update({ archived_at: new Date().toISOString() })
      .in("id", allowed.map((p) => p.id)).select("id");
    if (error) { toast.error(error.message); return; }
    const done = (data ?? []).map((d) => d.id);
    const failed = allowed.filter((p) => !done.includes(p.id)).map((p) => p.id);
    await logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_archived",
      meta: { photo_ids: done, failed_photo_ids: failed, count: done.length, result: failed.length ? "partial" : "ok" },
    });
    qc.invalidateQueries({ queryKey: ["photos", projectId] });
    qc.invalidateQueries({ queryKey: ["activity", projectId] });
    setSelected([]);
    if (failed.length || blocked) toast.warning(`${done.length} archived · ${failed.length + blocked} could not be archived`);
    else toast.success(`${done.length} photo${done.length === 1 ? "" : "s"} archived`);
  };

  const batchExport = async () => {
    let ok = 0; const failed: string[] = [];
    for (const p of selectedPhotos) {
      try {
        const res = await fetch(p.annotated_image_url ?? p.image_url);
        const blob = await res.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `photo-${p.id}.jpg`;
        a.click();
        URL.revokeObjectURL(a.href);
        ok++;
      } catch { failed.push(p.id); }
    }
    await logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_exported",
      meta: { photo_ids: selectedPhotos.map((p) => p.id), failed_photo_ids: failed, count: ok, result: failed.length ? "partial" : "ok" },
    });
    if (failed.length) toast.warning(`${ok} downloaded · ${failed.length} failed`);
    else toast.success(`${ok} photo${ok === 1 ? "" : "s"} downloaded`);
  };

  const batchApplyPhase = async (value: string) => {
    const allowed = selectedPhotos.filter(canEditPhoto);
    if (!allowed.length) { toast.error("You are not allowed to edit the selected photos"); return; }
    const { error } = await supabase.from("photos").update({ phase: value || null }).in("id", allowed.map((p) => p.id));
    if (error) { toast.error(error.message); return; }
    await logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_updated",
      meta: { photo_ids: allowed.map((p) => p.id), phase: value, count: allowed.length },
    });
    qc.invalidateQueries({ queryKey: ["photos", projectId] });
    setSelected([]);
    toast.success(`Phase applied to ${allowed.length} photo${allowed.length === 1 ? "" : "s"}`);
  };

  const batchApplyTag = async () => {
    const raw = window.prompt("Tag to apply to the selected photos");
    const tag = raw?.trim().toLowerCase();
    if (!tag) return;
    const allowed = selectedPhotos.filter(canEditPhoto);
    if (!allowed.length) { toast.error("You are not allowed to edit the selected photos"); return; }
    const failed: string[] = [];
    for (const p of allowed) {
      const tags = Array.from(new Set([...(p.tags ?? []), tag]));
      const { error } = await supabase.from("photos").update({ tags }).eq("id", p.id);
      if (error) failed.push(p.id);
    }
    await logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_updated",
      meta: { photo_ids: allowed.map((p) => p.id), tag, failed_photo_ids: failed, result: failed.length ? "partial" : "ok" },
    });
    qc.invalidateQueries({ queryKey: ["photos", projectId] });
    setSelected([]);
    if (failed.length) toast.warning(`Tag applied · ${failed.length} failed`);
    else toast.success("Tag applied");
  };

  // ---- Project editing ----------------------------------------------------
  const openEdit = () => {
    if (!project) return;
    setEdit({
      name: project.name ?? "",
      customer: project.customer ?? project.client ?? "",
      address: project.address ?? "",
      division: project.division ?? "",
      owner_id: project.owner_id ?? "",
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
        .update({ archived_at: archiving ? new Date().toISOString() : null, status: archiving ? "Archived" : "Active" })
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


  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />All projects
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2"><Building2 className="h-6 w-6 text-primary" /></div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap gap-2">
          {can.can_edit_projects && (
            <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
          )}
          {(project?.archived_at ? can.can_edit_projects : can.can_delete_projects) && (
            <Button size="sm" variant="outline" onClick={() => {
              const msg = project?.archived_at ? "Restore this project?" : "Archive this project? It stays available under 'Show archived'.";
              if (window.confirm(msg)) toggleArchive.mutate();
            }}>
              {project?.archived_at ? <><ArchiveRestore className="mr-1 h-4 w-4" />Restore</> : <><Archive className="mr-1 h-4 w-4" />Archive</>}
            </Button>
          )}
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

      {/* Photos */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Photos <span className="text-sm font-normal text-muted-foreground">({filteredPhotos.length})</span></h2>
        {can.can_add_photos && (
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={uploadPhase} onChange={(e) => setUploadPhase(e.target.value)} aria-label="Phase for new photos">
              {PHOTO_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />
            <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : "Take Photo"}
            </Button>
          </div>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant={phaseFilter === "" ? "default" : "outline"} className="cursor-pointer" onClick={() => { setPhaseFilter(""); setSelected([]); }}>
          All Phases ({photos?.length ?? 0})
        </Badge>
        {[...PHOTO_PHASES, UNPHASED].map((p) => (
          <Badge key={p} variant={phaseFilter === p ? "default" : "outline"} className="cursor-pointer"
            onClick={() => { setPhaseFilter(p); setSelected([]); }}>
            {p} ({phaseCounts.get(p) ?? 0})
          </Badge>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <Badge variant={tagFilter === null ? "default" : "outline"} className="cursor-pointer" onClick={() => setTagFilter(null)}>All tags</Badge>
          {allTags.map((t) => (
            <Badge key={t} variant={tagFilter === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setTagFilter(t)}>{t}</Badge>
          ))}
        </div>
      )}

      {filteredPhotos.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 p-2 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <Checkbox checked={allVisibleSelected} aria-label="Select all photos"
              onCheckedChange={(v) => setSelected(v ? filteredPhotos.map((p) => p.id) : [])} />
            Select all ({filteredPhotos.length})
          </label>
          <span className="text-muted-foreground">{selected.length} of {filteredPhotos.length} selected</span>
          {selected.length > 0 && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}><X className="mr-1 h-3 w-3" />Clear</Button>
              <Button size="sm" variant="outline" onClick={batchExport}><Download className="mr-1 h-4 w-4" />Export</Button>
              {can.can_edit_photos && (
                <>
                  <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" defaultValue=""
                    aria-label="Apply phase to selected photos"
                    onChange={(e) => { if (e.target.value) { batchApplyPhase(e.target.value); e.target.value = ""; } }}>
                    <option value="">Apply phase…</option>
                    {PHOTO_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={batchApplyTag}><Tag className="mr-1 h-4 w-4" />Apply tag</Button>
                </>
              )}
              {can.can_delete_photos && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={batchArchive}>
                  <Archive className="mr-1 h-4 w-4" />Archive
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {photosLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-md bg-muted" />)}
        </div>
      ) : photosError ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center text-sm text-destructive">
          Photos could not be loaded. Please refresh.
        </div>
      ) : groupedPhotos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed p-10 text-center">
          <ImageOff className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No photos here yet. Use Take Photo to add the first one.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedPhotos.map((group) => (
            <Card key={group.name}>
              <CardContent className="p-4">
                {(() => {
                  const ids = group.items.map((p) => p.id);
                  const groupSelectedCount = ids.filter((id) => selected.includes(id)).length;
                  const allGroupSelected = groupSelectedCount === ids.length;
                  return (
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2">
                        <Checkbox
                          aria-label={`Select all ${group.name} photos`}
                          checked={allGroupSelected ? true : groupSelectedCount > 0 ? "indeterminate" : false}
                          onCheckedChange={() => setGroupSelected(ids, !allGroupSelected)}
                        />
                        <h3 className="font-semibold">
                          {group.name} <span className="text-xs font-normal text-muted-foreground">({group.items.length})</span>
                        </h3>
                      </label>
                      {groupSelectedCount > 0 && (
                        <span className="text-xs text-muted-foreground">{groupSelectedCount} selected in this group</span>
                      )}
                    </div>
                  );
                })()}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {group.items.map((p) => {
                    const idx = filteredPhotos.findIndex((x) => x.id === p.id);
                    return (
                      <div key={p.id} className="group relative overflow-hidden rounded-md border bg-muted">
                        <button
                          className="block w-full cursor-pointer"
                          onClick={() => setViewerIndex(idx)}
                          aria-label={`Open photo ${idx + 1}`}
                        >
                          <img
                            src={p.annotated_image_url ?? p.image_url}
                            alt={p.caption ?? `${group.name} photo`}
                            className="aspect-square w-full object-cover"
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                          />
                        </button>
                        <span
                          className="absolute left-1 top-1 rounded bg-background/90 p-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            aria-label="Select photo"
                            checked={selected.includes(p.id)}
                            onCheckedChange={() => toggleSelect(p.id)}
                          />
                        </span>
                        {p.latitude && p.longitude && (
                          <span className="pointer-events-none absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                            <MapPin className="h-2.5 w-2.5" />GPS
                          </span>
                        )}
                        <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                          {formatTakenAt(p.taken_at).split(",")[0]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Photo map */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MapPin className="h-4 w-4" />Photo Map</h2>
        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={mapFilters.phase} onChange={(e) => setMapFilters({ ...mapFilters, phase: e.target.value })}>
                <option value="">All phases</option>
                {[...PHOTO_PHASES, UNPHASED].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                value={mapFilters.uploader} onChange={(e) => setMapFilters({ ...mapFilters, uploader: e.target.value })}>
                <option value="">All uploaders</option>
                {uploaders.map((u) => <option key={u} value={u}>{personName(u)}</option>)}
              </select>
              <Input type="date" value={mapFilters.since} onChange={(e) => setMapFilters({ ...mapFilters, since: e.target.value })} />
              <Button variant="outline" size="sm" onClick={() => setMapFilters({ phase: "", uploader: "", since: "" })}>Reset filters</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {geoPhotos.length} geotagged photo{geoPhotos.length === 1 ? "" : "s"} shown
              {noGeoCount > 0 && ` · ${noGeoCount} photo${noGeoCount === 1 ? "" : "s"} have no GPS location and can't be mapped`}
            </p>
            <div className="relative z-0 isolate overflow-hidden rounded-lg border" style={{ height: "50vh" }}>
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
                      phase: phaseLabel(p.phase),
                      tags: p.tags,
                    }))}
                  />
                </Suspense>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Activity className="h-4 w-4" />Activity</h2>
        <Card><CardContent className="p-3">
          {(activity ?? []).length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          <ul className="space-y-2">
            {(activity ?? []).map((e) => {
              const meta = e.meta as Record<string, unknown>;
              const label: Record<string, string> = {
                job_created: "created the project",
                job_updated: "updated the project",
                job_archived: "archived the project",
                job_restored: "restored the project",
                area_added: "added an area",
                photo_uploaded: "uploaded a photo",
                photo_annotated: "annotated a photo",
                photo_updated: "updated photo details",
                comment_added: "commented on a photo",
                photo_deleted: "deleted a photo",
                photo_archived: "archived photos",
                photo_exported: "exported photos",
              };
              return (
                <li key={e.id} className="flex justify-between gap-2 text-sm">
                  <span><span className="font-medium">{personName(e.user_id)}</span> {label[e.kind] || e.kind} {meta?.name ? <em className="text-muted-foreground">({String(meta.name)})</em> : null}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                </li>
              );
            })}
          </ul>
        </CardContent></Card>
      </div>

      {viewerIndex !== null && filteredPhotos[viewerIndex] && (
        <PhotoViewer
          photos={filteredPhotos}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          uploaderName={personName}
          canManage={canEditPhoto}
          canArchive={canArchivePhoto}
        />
      )}
    </div>
  );
}
