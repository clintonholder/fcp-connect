import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { adminDeleteProject } from "@/lib/projects.functions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useMyRoles } from "@/lib/roles";
import { projectDivisions, DIVISION_LOCK_MSG } from "@/lib/project-meta";
import { buildPhotoZip } from "@/lib/photo-export";
import { signPhotoUrls } from "@/lib/photo-urls";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  ArrowLeft, Camera, MapPin, Building2, ImageOff, Tag,
  Activity, Pencil, Archive, ArchiveRestore, Download, X, Trash2, Video, Play,
} from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activity";
import { PhotoViewer, type PhotoDetail } from "@/components/PhotoViewer";
import { ProjectActivityFeed } from "@/components/ProjectActivityFeed";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChecklistsTab } from "@/components/checklists/ChecklistsTab";
import { ProjectNotesTab } from "@/components/ProjectNotesTab";


import { formatDistanceToNow } from "date-fns";
import { geocodeAddress } from "@/lib/geocode";
import { ProjectForm, type ProjectFormValues } from "@/components/ProjectForm";
import { ProjectCollaborators } from "@/components/ProjectCollaborators";

import { PHOTO_PHASES, UNPHASED, phaseLabel, formatTakenAt } from "@/lib/photo-meta";
import { readPhotoExif } from "@/lib/exif";
const MAX_VIDEO_SECONDS = 60;

const ProjectPhotoMap = lazy(() => import("@/components/ProjectPhotoMap"));

export const Route = createFileRoute("/project/$projectId")({
  head: () => ({
    meta: [
      { title: "Project — FCP Connect" },
      { name: "description", content: "Project details, field media by phase and media map for an FCP Services project." },
      { property: "og:title", content: "Project — FCP Connect" },
      { property: "og:description", content: "Project details, field media by phase and media map for an FCP Services project." },
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
  const { isAdmin, can, myDivisions, loading: rolesLoading } = useMyRoles();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [phaseFilter, setPhaseFilter] = useState<string>("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [soloPhoto, setSoloPhoto] = useState<PhotoDetail | null>(null);
  const [focusCommentId, setFocusCommentId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<ProjectFormValues | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [uploadPhase, setUploadPhase] = useState<string>("Progress");
  const [mapFilters, setMapFilters] = useState({ phase: "", uploader: "", since: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const videoCaptureRef = useRef<HTMLInputElement>(null);
  const videoPickRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [captureMode, setCaptureMode] = useState<"photo" | "video">("photo");
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [exportReady, setExportReady] = useState<{
    url: string;
    fileName: string;
    photoIds: string[];
    failedPhotoIds: string[];
    count: number;
  } | null>(null);
  useEffect(() => setMapReady(true), []);

  const { data: project, isLoading: projectLoading, isError: projectError } = useQuery({
    retry: false,
    queryKey: ["project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("jobs").select("*").eq("id", projectId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: myCollab } = useQuery({
    enabled: !!user?.id,
    queryKey: ["my-collab", projectId, user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("project_collaborators")
        .select("id")
        .eq("job_id", projectId)
        .eq("user_id", user!.id)
        .maybeSingle();
      return !!data;
    },
  });

  const isProjectOwner =
    !!project && !!user && (project.owner_id === user.id || project.user_id === user.id);
  // Only the project manager, creator or an admin may change the divisions,
  // and non-admins can only pick divisions assigned to them.
  const canEditDivisions =
    isAdmin ||
    (isProjectOwner && !!project && projectDivisions(project).every((d) => myDivisions.includes(d)));


  const divisionLocked = !!project && !isAdmin && !rolesLoading && !isProjectOwner && !myCollab && (() => {
    const ds = projectDivisions(project);
    return ds.length === 0 || ds.some((d) => !myDivisions.includes(d));
  })();


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

  const { data: collabIds } = useQuery({
    queryKey: ["collab-ids", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("project_collaborators").select("user_id").eq("job_id", projectId);
      return (data ?? []).map((r) => r.user_id);
    },
  });
  const checklistMembers = Array.from(new Set([...(project?.owner_id ? [project.owner_id] : []), ...(collabIds ?? [])]))
    .map((id) => ({ id, name: personName(id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: photos, isLoading: photosLoading, isError: photosError } = useQuery({
    queryKey: ["photos", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("photos").select("*")
        .eq("job_id", projectId).is("archived_at", null)
        .order("taken_at", { ascending: true }).order("created_at", { ascending: true });
      if (error) throw error;
      return (await signPhotoUrls((data ?? []) as unknown as PhotoDetail[])) as PhotoDetail[];
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
    // Photos and videos are both mapped when they carry a location.
    return (photos ?? []).filter((p) => {
      if (mapFilters.phase && phaseLabel(p.phase) !== mapFilters.phase) return false;
      if (mapFilters.uploader && p.user_id !== mapFilters.uploader) return false;
      if (mapFilters.since && new Date(p.taken_at) < new Date(mapFilters.since)) return false;
      return true;
    });
  }, [photos, mapFilters]);
  const geoPhotos = mapPhotos.filter(
    (p) =>
      typeof p.latitude === "number" && typeof p.longitude === "number" &&
      Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
      Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 &&
      !(p.latitude === 0 && p.longitude === 0),
  );
  const noGeoCount = mapPhotos.length - geoPhotos.length;

  const uploaders = useMemo(() => Array.from(new Set((photos ?? []).map((p) => p.user_id))), [photos]);

  const isOwnerOrAdmin = (p: PhotoDetail) => isAdmin || p.user_id === user?.id;
  const canEditPhoto = (p: PhotoDetail) => isOwnerOrAdmin(p) && can.can_edit_photos;
  const canArchivePhoto = (p: PhotoDetail) => isOwnerOrAdmin(p) && can.can_delete_photos;

  // ---- Upload -------------------------------------------------------------
  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    if (!user) { toast.error("Please sign in again to add photos"); return; }
    if (!company) { toast.error("Workspace still loading — try again in a moment"); return; }
    const list = Array.from(files);
    setUploading(true);
    const progress = toast.loading(`Adding ${list.length} photo${list.length === 1 ? "" : "s"}…`);
    // Device location is a fallback only — never block the upload on it.
    const coords = await new Promise<GeolocationPosition | null>((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      let done = false;
      const finish = (v: GeolocationPosition | null) => { if (!done) { done = true; resolve(v); } };
      setTimeout(() => finish(null), 6000);
      try {
        navigator.geolocation.getCurrentPosition((p) => finish(p), () => finish(null), { enableHighAccuracy: true, timeout: 6000 });
      } catch { finish(null); }
    });
    try {
      let withGps = 0;
      for (const file of list) {
        let exif = { takenAt: null as string | null, latitude: null as number | null, longitude: null as number | null };
        try { exif = await readPhotoExif(file); } catch { /* metadata is optional */ }
        const nameExt = (file.name.split(".").pop() || "").toLowerCase();
        const ext = /^[a-z0-9]{2,5}$/.test(nameExt) ? nameExt : (file.type.split("/")[1] || "jpg");
        const path = `${user.id}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("job-photos")
          .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
        const hasExifGps = exif.latitude != null && exif.longitude != null;
        const lat = hasExifGps ? exif.latitude : (coords?.coords.latitude ?? null);
        const lng = hasExifGps ? exif.longitude : (coords?.coords.longitude ?? null);
        if (lat != null && lng != null) withGps++;
        const { error: insErr } = await supabase.from("photos").insert({
          job_id: projectId, user_id: user.id, company_id: company.id,
          storage_path: path, image_url: pub.publicUrl, phase: uploadPhase || null,
          media_type: "image", mime_type: file.type || null, file_size: file.size,
          taken_at: exif.takenAt ?? new Date().toISOString(),
          latitude: lat,
          longitude: lng,
          accuracy: hasExifGps ? null : (coords?.coords.accuracy ?? null),
        });
        if (insErr) throw insErr;
      }
      try {
        await logActivity({ company_id: company.id, job_id: projectId, kind: "photo_uploaded", meta: { count: list.length, phase: uploadPhase } });
      } catch { /* history entry is not critical */ }
      await qc.invalidateQueries({ queryKey: ["photos", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success(
        withGps === list.length ? "Photos uploaded with location" : withGps ? `Photos uploaded (${withGps} of ${list.length} with location)` : "Photos uploaded (no location data)",
        { id: progress },
      );
    } catch (e) {
      console.error("[photo upload]", e);
      toast.error(`Upload failed: ${(e as Error).message || "unknown error"}`, { id: progress });
    } finally {
      
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (pickRef.current) pickRef.current.value = "";
    }
  };


  // ---- Video upload -------------------------------------------------------
  const readVideoDuration = (file: File) =>
    new Promise<number | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const el = document.createElement("video");
      el.preload = "metadata";
      const done = (v: number | null) => { URL.revokeObjectURL(url); resolve(v); };
      el.onloadedmetadata = () => {
        const d = el.duration;
        done(Number.isFinite(d) && d > 0 ? d : null);
      };
      el.onerror = () => done(null);
      setTimeout(() => done(null), 8000);
      el.src = url;
    });

  const handleVideoFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    if (!user) { toast.error("Please sign in again to add videos"); return; }
    if (!company) { toast.error("Workspace still loading — try again in a moment"); return; }
    if (!file.type.startsWith("video/")) { toast.error("That file isn't a video — pick a video clip."); return; }

    setUploading(true);
    try {
      const duration = await readVideoDuration(file);
      if (duration !== null && duration > MAX_VIDEO_SECONDS + 0.5) {
        const mins = Math.floor(duration / 60);
        const secs = Math.round(duration % 60);
        toast.error(`Videos must be 60 seconds or less — this one is ${mins}:${String(secs).padStart(2, "0")}`);
        return;
      }

      const coords = await new Promise<GeolocationPosition | null>((resolve) => {
        if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
        let done = false;
        const finish = (v: GeolocationPosition | null) => { if (!done) { done = true; resolve(v); } };
        setTimeout(() => finish(null), 6000);
        try {
          navigator.geolocation.getCurrentPosition((p) => finish(p), () => finish(null), { enableHighAccuracy: true, timeout: 6000 });
        } catch { finish(null); }
      });

      const nameExt = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
      const extension = nameExt || (file.type.split("/")[1] || "mp4").split(";")[0];
      const path = `${user.id}/${projectId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
      const { error: upErr } = await supabase.storage.from("job-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
      const { error: insErr } = await supabase.from("photos").insert({
        job_id: projectId, user_id: user.id, company_id: company.id,
        storage_path: path, image_url: pub.publicUrl, phase: uploadPhase || null,
        media_type: "video", mime_type: file.type, file_size: file.size,
        duration_seconds: duration,
        taken_at: new Date(file.lastModified || Date.now()).toISOString(),
        latitude: coords?.coords.latitude ?? null,
        longitude: coords?.coords.longitude ?? null,
        accuracy: coords?.coords.accuracy ?? null,
      });
      if (insErr) {
        // Never leave an orphaned file behind when the record could not be saved.
        await supabase.storage.from("job-photos").remove([path]);
        throw new Error(insErr.message);
      }
      try {
        await logActivity({ company_id: company.id, job_id: projectId, kind: "video_uploaded", meta: { phase: uploadPhase, duration_seconds: duration } });
      } catch { /* history entry is not critical */ }
      await qc.invalidateQueries({ queryKey: ["photos", projectId] });
      qc.invalidateQueries({ queryKey: ["activity", projectId] });
      toast.success("Video uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Video upload failed");
    } finally {
      setUploading(false);
      if (videoCaptureRef.current) videoCaptureRef.current.value = "";
      if (videoPickRef.current) videoPickRef.current.value = "";
    }
  };

  // ---- Batch actions ------------------------------------------------------
  const selectedPhotos = filteredPhotos.filter((p) => selected.includes(p.id));
  const toggleSelect = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allVisibleSelected = filteredPhotos.length > 0 && filteredPhotos.every((p) => selected.includes(p.id));
  const setGroupSelected = (ids: string[], on: boolean) =>
    setSelected((s) => (on ? Array.from(new Set([...s, ...ids])) : s.filter((x) => !ids.includes(x))));

  const batchDelete = async () => {
    const allowed = selectedPhotos.filter(canArchivePhoto);
    const blocked = selectedPhotos.length - allowed.length;
    if (!allowed.length) { toast.error("You are not allowed to delete the selected media"); return; }
    if (!window.confirm(`Delete ${allowed.length === 1 ? "this media item" : `these ${allowed.length} media items`}? ${allowed.length === 1 ? "It is" : "They are"} permanently removed from the project gallery, counts and map.`)) return;
    const { data, error } = await supabase.from("photos")
      .delete().in("id", allowed.map((p) => p.id)).select("id");
    if (error) { toast.error(error.message); return; }
    const done = (data ?? []).map((d) => d.id);
    const failed = allowed.filter((p) => !done.includes(p.id)).map((p) => p.id);
    const paths = allowed.filter((p) => done.includes(p.id)).map((p) => p.storage_path).filter(Boolean);
    if (paths.length) await supabase.storage.from("job-photos").remove(paths);
    await logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_deleted",
      meta: { photo_ids: done, failed_photo_ids: failed, count: done.length, result: failed.length ? "partial" : "ok" },
    });
    qc.invalidateQueries({ queryKey: ["photos", projectId] });
    qc.invalidateQueries({ queryKey: ["activity", projectId] });
    setSelected([]);
    if (failed.length || blocked) toast.warning(`${done.length} deleted · ${failed.length + blocked} could not be deleted`);
    else toast.success(`${done.length} media item${done.length === 1 ? "" : "s"} deleted`);
  };

  const batchExport = async () => {
    if (!selectedPhotos.length) { toast.error("Select at least one media item to export"); return; }
    setExportReady(null);
    setExporting({ done: 0, total: selectedPhotos.length });
    try {
      const { ok, failed, blob, fileName } = await buildPhotoZip(
        selectedPhotos,
        project as never,
        (done, total) => setExporting({ done, total }),
      );
      if (!blob) { toast.error("No media could be exported"); return; }
      setExportReady((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return {
        url: URL.createObjectURL(blob),
        fileName,
        photoIds: selectedPhotos.map((p) => p.id),
        failedPhotoIds: failed,
        count: ok,
        };
      });
      if (failed.length) toast.warning(`${ok} media item${ok === 1 ? "" : "s"} ready · ${failed.length} failed. Click Download ZIP.`);
      else toast.success(`${fileName} is ready. Click Download ZIP.`);
    } catch (e) {
      toast.error((e as Error).message || "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const downloadExport = () => {
    if (!exportReady) return;
    const completedExport = exportReady;
    toast.success(`Download started: ${completedExport.fileName}`);
    // Let the browser grab the blob first, then restore the Export button.
    window.setTimeout(() => {
      setExportReady((current) => current?.url === completedExport.url ? null : current);
    }, 2000);
    window.setTimeout(() => URL.revokeObjectURL(completedExport.url), 60000);
    void logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_exported",
      meta: {
        photo_ids: completedExport.photoIds,
        failed_photo_ids: completedExport.failedPhotoIds,
        count: completedExport.count,
        file: completedExport.fileName,
        result: completedExport.failedPhotoIds.length ? "partial" : "ok",
      },
    }).catch(() => {
      // A failed audit write must not prevent the already-started download.
    });
  };

  const batchApplyPhase = async (value: string) => {
    const allowed = selectedPhotos.filter(canEditPhoto);
    if (!allowed.length) { toast.error("You are not allowed to edit the selected media"); return; }
    const { error } = await supabase.from("photos").update({ phase: value || null }).in("id", allowed.map((p) => p.id));
    if (error) { toast.error(error.message); return; }
    await logActivity({
      company_id: company!.id, job_id: projectId, kind: "photo_updated",
      meta: { photo_ids: allowed.map((p) => p.id), phase: value, count: allowed.length },
    });
    qc.invalidateQueries({ queryKey: ["photos", projectId] });
    setSelected([]);
    toast.success(`Phase applied to ${allowed.length} media item${allowed.length === 1 ? "" : "s"}`);
  };

  const batchApplyTag = async () => {
    const raw = window.prompt("Tag to apply to the selected media");
    const tag = raw?.trim().toLowerCase();
    if (!tag) return;
    const allowed = selectedPhotos.filter(canEditPhoto);
    if (!allowed.length) { toast.error("You are not allowed to edit the selected media"); return; }
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
      tags: project.tags ?? [],
      divisions: (project.divisions?.length ? project.divisions : project.division ? [project.division] : []),
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
      if (canEditDivisions && edit.divisions.length === 0) throw new Error("Select at least one division");
      if (canEditDivisions && !isAdmin && edit.divisions.some((d) => !myDivisions.includes(d))) throw new Error(DIVISION_LOCK_MSG);
      const addressChanged = edit.address.trim() !== (project.address ?? "");
      const geo = addressChanged && edit.address.trim() ? await geocodeAddress(edit.address) : null;
      const { error } = await supabase.from("jobs").update({
        name: edit.name.trim(),
        customer: edit.customer.trim(),
        client: edit.customer.trim(),
        address: edit.address.trim() || null,
        ...(canEditDivisions ? { division: edit.divisions[0] ?? null, divisions: edit.divisions } : {}),

        tags: edit.tags,
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

  const deleteProject = useMutation({
    mutationFn: async () => {
      await adminDeleteProject({ data: { projectId } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project permanently deleted");
      navigate({ to: "/" });
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const editDirty = !!edit && !!project && (
    edit.name !== (project.name ?? "") ||
    edit.customer !== (project.customer ?? project.client ?? "") ||
    edit.address !== (project.address ?? "") ||
    edit.divisions.join("|") !== projectDivisions(project).join("|") ||
    edit.tags.join("|") !== (project.tags ?? []).join("|") ||
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


  // Someone who isn't on this project (and isn't an admin or a matching director)
  // cannot read the row at all, so tell them plainly instead of showing a blank page.
  if (projectError || (!projectLoading && !project)) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h1 className="mt-3 text-xl font-semibold">Project not available</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This project doesn't exist, or you're not assigned to it. Ask an administrator if you need access.
        </p>
        <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">Back to all projects</Link>
      </div>
    );
  }

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
              {project && projectDivisions(project).map((d) => <Badge key={d} variant="outline">{d}</Badge>)}
              {(project?.tags ?? []).map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
              {project?.owner_id && <Badge variant="outline">PM: {personName(project.owner_id)}</Badge>}
              {project?.cmic_number && <Badge variant="outline">CMiC {project.cmic_number}</Badge>}
            </div>
          </div>
        </div>
        {divisionLocked && (can.can_edit_projects || can.can_delete_projects) && (
          <p className="w-full rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
            {DIVISION_LOCK_MSG}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {can.can_edit_projects && (
            <Button size="sm" variant="outline" disabled={divisionLocked} onClick={openEdit}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
          )}
          {(project?.archived_at ? can.can_edit_projects : can.can_delete_projects) && (
            <Button size="sm" variant="outline" disabled={divisionLocked} onClick={() => {
              const msg = project?.archived_at ? "Restore this project?" : "Archive this project? It stays available under 'Show archived'.";
              if (window.confirm(msg)) toggleArchive.mutate();
            }}>
              {project?.archived_at ? <><ArchiveRestore className="mr-1 h-4 w-4" />Restore</> : <><Archive className="mr-1 h-4 w-4" />Archive</>}
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteProject.isPending}
              onClick={() => {
                if (!window.confirm(
                  `Permanently delete "${project?.name}"?\n\nThis cannot be undone. Every media item, location, comment, collaborator and history record for this project is destroyed.\n\nUse Archive instead if you only want to hide it.`,
                )) return;
                const typed = window.prompt('Type DELETE to permanently remove this project.');
                if (typed?.trim().toUpperCase() !== "DELETE") { toast.info("Deletion cancelled"); return; }
                deleteProject.mutate();
              }}
            >
              <Trash2 className="mr-1 h-4 w-4" />{deleteProject.isPending ? "Deleting…" : "Delete Project"}
            </Button>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={(o) => (o ? setEditOpen(true) : closeEdit())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          {edit && (
            <>
              <ProjectForm
                value={edit}
                onChange={setEdit}
                people={people ?? []}
                saving={saveEdit.isPending}
                onSave={() => saveEdit.mutate()}
                onCancel={closeEdit}
                canEditDivisions={canEditDivisions}
              />

              <ProjectCollaborators
                projectId={projectId}
                companyId={project?.company_id}
                people={people ?? []}
                canEdit={can.can_edit_projects}
              />
            </>
          )}

        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab} className="mb-2">
        <TabsList className="mb-4" aria-label="Project content">
          <TabsTrigger value="photos" className="focus-visible:ring-2 focus-visible:ring-ring">Media</TabsTrigger>
          <TabsTrigger value="checklists" className="focus-visible:ring-2 focus-visible:ring-ring">Checklists</TabsTrigger>
          <TabsTrigger value="notes" className="focus-visible:ring-2 focus-visible:ring-ring">Notes</TabsTrigger>
          <TabsTrigger value="activity" className="focus-visible:ring-2 focus-visible:ring-ring">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="photos" className="mt-0">
      {/* Photos */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Media <span className="text-sm font-normal text-muted-foreground">({filteredPhotos.length})</span></h2>
        {can.can_add_photos && (
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
              value={uploadPhase} onChange={(e) => setUploadPhase(e.target.value)} aria-label="Phase for new photos">
              {PHOTO_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />
            <input ref={pickRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />
            <input ref={videoCaptureRef} type="file" accept="video/*" capture="environment" className="hidden"
              onChange={(e) => handleVideoFiles(e.target.files)} />
            <input ref={videoPickRef} type="file" accept="video/*" className="hidden"
              onChange={(e) => handleVideoFiles(e.target.files)} />
            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Capture type">
              <button type="button" aria-pressed={captureMode === "photo"}
                className={`rounded px-2 py-1 text-sm ${captureMode === "photo" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setCaptureMode("photo")}>
                <Camera className="mr-1 inline h-4 w-4" />Photo
              </button>
              <button type="button" aria-pressed={captureMode === "video"}
                className={`rounded px-2 py-1 text-sm ${captureMode === "video" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                onClick={() => setCaptureMode("video")}>
                <Video className="mr-1 inline h-4 w-4" />Video
              </button>
            </div>
            {captureMode === "photo" ? (
              <>
                <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Camera className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : "Take Photo"}
                </Button>
                <Button size="sm" variant="outline" disabled={uploading} onClick={() => pickRef.current?.click()}>
                  Choose Photos
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={uploading} onClick={() => videoCaptureRef.current?.click()}>
                  <Video className="mr-1 h-4 w-4" />{uploading ? "Uploading…" : "Record Video"}
                </Button>
                <Button size="sm" variant="outline" disabled={uploading} onClick={() => videoPickRef.current?.click()}>
                  Choose Video
                </Button>
              </>
            )}

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
            <Checkbox checked={allVisibleSelected} aria-label="Select all media"
              onCheckedChange={(v) => setSelected(v ? filteredPhotos.map((p) => p.id) : [])} />
            Select all ({filteredPhotos.length})
          </label>
          <span className="text-muted-foreground">{selected.length} of {filteredPhotos.length} selected</span>
          {selected.length > 0 && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}><X className="mr-1 h-3 w-3" />Clear</Button>
              {exportReady ? (
                <Button size="sm" variant="default" asChild>
                  <a href={exportReady.url} download={exportReady.fileName} onClick={downloadExport}>
                    <Download className="mr-1 h-4 w-4" />Download ZIP
                  </a>
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={batchExport} disabled={!!exporting}>
                  <Download className="mr-1 h-4 w-4" />
                  {exporting ? `Exporting ${exporting.done}/${exporting.total}…` : "Export"}
                </Button>
              )}
              {can.can_edit_photos && (
                <>
                  <select className="rounded-md border border-input bg-background px-2 py-1 text-sm" defaultValue=""
                    aria-label="Apply phase to selected media"
                    onChange={(e) => { if (e.target.value) { batchApplyPhase(e.target.value); e.target.value = ""; } }}>
                    <option value="">Apply phase…</option>
                    {PHOTO_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <Button size="sm" variant="outline" onClick={batchApplyTag}><Tag className="mr-1 h-4 w-4" />Apply tag</Button>
                </>
              )}
              {can.can_delete_photos && (
                <Button size="sm" variant="outline" className="text-destructive" onClick={batchDelete}>
                  <Trash2 className="mr-1 h-4 w-4" />Delete media
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
                          aria-label={`Select all ${group.name} media`}
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
                          aria-label={`Open ${p.media_type === "video" ? "video" : "photo"} ${idx + 1}`}
                        >
                          {p.media_type === "video" ? (
                            <div className="relative flex aspect-square w-full items-center justify-center bg-black/80">
                              <Play className="h-8 w-8 text-white" />
                              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white">
                                {p.duration_seconds ? `${Math.round(Number(p.duration_seconds))}s` : "Video"}
                              </span>
                            </div>
                          ) : (
                            <img
                              src={p.annotated_image_url ?? p.image_url}
                              alt={p.caption ?? `${group.name} photo`}
                              className="aspect-square w-full object-cover"
                              loading="lazy"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                            />
                          )}
                        </button>
                        <span
                          className="absolute left-1 top-1 rounded bg-background/90 p-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            aria-label={p.media_type === "video" ? "Select video" : "Select photo"}
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
        </TabsContent>
        <TabsContent value="activity" className="mt-0">
          <ProjectActivityFeed
            projectId={projectId}
            photos={photos ?? []}
            onOpen={(photo, commentId) => {
              setFocusCommentId(commentId);
              const idx = filteredPhotos.findIndex((x) => x.id === photo.id);
              if (idx >= 0) setViewerIndex(idx);
              else setSoloPhoto(photo);
            }}
          />
        </TabsContent>
        <TabsContent value="checklists" className="mt-0">
          {project && (
            <ChecklistsTab
              projectId={projectId}
              companyId={project.company_id}
              canEdit={can.can_edit_projects && !divisionLocked}
              canAttach={can.can_add_photos}
              readOnly={!!project.archived_at}
              members={checklistMembers}
              photos={photos ?? []}
              onOpenPhoto={(photo) => {
                setFocusCommentId(null);
                const idx = filteredPhotos.findIndex((x) => x.id === photo.id);
                if (idx >= 0) setViewerIndex(idx);
                else setSoloPhoto(photo);
              }}
            />
          )}
        </TabsContent>
        <TabsContent value="notes" className="mt-0">
          {project && (
            <ProjectNotesTab
              projectId={projectId}
              companyId={project.company_id}
              readOnly={!!project.archived_at}
            />
          )}
        </TabsContent>

      </Tabs>

      {/* Photo map */}
      <div className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><MapPin className="h-4 w-4" />Media Map</h2>
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
              {geoPhotos.length} geotagged item{geoPhotos.length === 1 ? "" : "s"} shown
              {noGeoCount > 0 && ` · ${noGeoCount} item${noGeoCount === 1 ? "" : "s"} have no GPS location and can't be mapped`}
            </p>
            <div className="relative z-0 isolate overflow-hidden rounded-lg border" style={{ height: "50vh" }}>
              {geoPhotos.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
                  No geotagged photos or videos for this project yet.
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
                      media_type: p.media_type,
                      mime_type: p.mime_type,
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
                photo_deleted: "deleted media",
                photo_archived: "archived media",
                photo_exported: "exported media",
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
          onIndexChange={(i) => { setFocusCommentId(null); setViewerIndex(i); }}
          onClose={() => { setFocusCommentId(null); setViewerIndex(null); }}
          uploaderName={personName}
          canManage={canEditPhoto}
          canArchive={canArchivePhoto}
          focusCommentId={focusCommentId}
        />
      )}
      {soloPhoto && (
        <PhotoViewer
          photos={[soloPhoto]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => { setFocusCommentId(null); setSoloPhoto(null); }}
          uploaderName={personName}
          canManage={canEditPhoto}
          canArchive={canArchivePhoto}
          focusCommentId={focusCommentId}
        />
      )}
    </div>
  );
}
