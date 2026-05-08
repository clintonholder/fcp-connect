import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Camera, MapPin, Plus, Trash2, Building2, ImageOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/job/$jobId")({
  component: () => <RequireAuth><JobDetail /></RequireAuth>,
});

type Photo = {
  id: string; image_url: string; caption: string | null;
  latitude: number | null; longitude: number | null; taken_at: string; area_id: string;
};

function JobDetail() {
  const { jobId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaName, setAreaName] = useState("");

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
      return data as Photo[];
    },
  });

  const createArea = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("areas").insert({ job_id: jobId, name: areaName, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["areas", jobId] });
      setAreaName(""); setAreaOpen(false);
      toast.success("Area added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />All jobs
      </Link>
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-accent/20 p-2"><Building2 className="h-6 w-6 text-accent-foreground" /></div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold sm:text-3xl">{job?.name}</h1>
            {job?.address && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" />{job.address}</p>}
            {job?.client && <p className="text-sm text-muted-foreground">Client: {job.client}</p>}
          </div>
        </div>
      </div>

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
            <AreaSection key={a.id} area={a} photos={(photos ?? []).filter((p) => p.area_id === a.id)} jobId={jobId} userId={user!.id} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-10 text-center">
          <p className="text-sm text-muted-foreground">Add an area to start capturing photos.</p>
        </div>
      )}
    </div>
  );
}

function AreaSection({ area, photos, jobId, userId }: {
  area: { id: string; name: string }; photos: Photo[]; jobId: string; userId: string;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setUploading(true);
    const coords = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${jobId}/${area.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("job-photos").upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
        const { error: insErr } = await supabase.from("photos").insert({
          area_id: area.id, job_id: jobId, user_id: userId,
          storage_path: path, image_url: pub.publicUrl,
          latitude: coords?.coords.latitude ?? null,
          longitude: coords?.coords.longitude ?? null,
          accuracy: coords?.coords.accuracy ?? null,
        });
        if (insErr) throw insErr;
      }
      qc.invalidateQueries({ queryKey: ["photos", jobId] });
      toast.success(coords ? "Photos uploaded with GPS" : "Photos uploaded (no GPS)");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deletePhoto = useMutation({
    mutationFn: async (p: Photo & { storage_path?: string }) => {
      const { data: row } = await supabase.from("photos").select("storage_path").eq("id", p.id).single();
      if (row?.storage_path) await supabase.storage.from("job-photos").remove([row.storage_path]);
      const { error } = await supabase.from("photos").delete().eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", jobId] }),
  });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="font-semibold">{area.name} <span className="text-xs text-muted-foreground">({photos.length})</span></h3>
          <div>
            <input
              ref={fileRef} type="file" accept="image/*" capture="environment"
              multiple className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4 mr-1" />{uploading ? "Uploading…" : "Take Photo"}
            </Button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="rounded-md bg-muted/50 p-6 text-center text-sm text-muted-foreground">
            <ImageOff className="mx-auto mb-1 h-5 w-5" />No photos yet
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <div key={p.id} className="group relative overflow-hidden rounded-md border bg-muted">
                <img src={p.image_url} alt={p.caption ?? area.name} className="aspect-square w-full object-cover" loading="lazy" />
                {p.latitude && p.longitude && (
                  <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}
                  </div>
                )}
                <button onClick={() => deletePhoto.mutate(p)}
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

void Select; void SelectContent; void SelectItem; void SelectTrigger; void SelectValue;
