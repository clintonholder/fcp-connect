import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Pencil, Trash2, MoreVertical, Camera, ArrowUp, ArrowDown,
  Check, ClipboardList, X, UserRound, Loader2, ImagePlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PhotoDetail } from "@/components/PhotoViewer";
import { readPhotoExif } from "@/lib/exif";

/** Photos taken straight from a checklist task land in this project media phase. */
const CHECKLIST_PHASE = "Checklists";


type Member = { id: string; name: string };
type Question = { id: string; item_id: string; prompt: string; answer: string | null; position: number };
type Evidence = { id: string; item_id: string; photo_id: string };
type Item = {
  id: string; checklist_id: string; title: string; instructions: string | null; assignee_id: string | null;
  photos_required: boolean; position: number; completed_at: string | null; completed_by: string | null;
};
type Checklist = {
  id: string; job_id: string; title: string; description: string | null; assignee_id: string | null; updated_at: string;
};

const ANSWERS = [{ v: "yes", l: "Yes" }, { v: "no", l: "No" }, { v: "na", l: "N/A" }] as const;
const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Something went wrong";

export function blockReason(item: Item, qs: Question[], ev: Evidence[]): string | null {
  if (qs.some((q) => !q.answer)) return "Answer all questions first";
  if (item.photos_required && ev.length === 0) return "Attach at least one photo first";
  return null;
}

export function ChecklistsTab({
  projectId, companyId, canEdit, canAttach, readOnly, members, photos, onOpenPhoto,
}: {
  projectId: string; companyId: string; canEdit: boolean; canAttach: boolean; readOnly: boolean;
  members: Member[]; photos: PhotoDetail[]; onOpenPhoto: (p: PhotoDetail) => void;
}) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const q = useQuery({
    queryKey: ["checklists", projectId],
    queryFn: async () => {
      const [c, i] = await Promise.all([
        supabase.from("checklists").select("*").eq("job_id", projectId).order("position").order("created_at"),
        supabase.from("checklist_items").select("id, checklist_id, completed_at").eq("job_id", projectId),
      ]);
      if (c.error) throw c.error;
      if (i.error) throw i.error;
      return { lists: (c.data ?? []) as Checklist[], items: i.data ?? [] };
    },
  });

  const edit = canEdit && !readOnly;

  if (openId) {
    const cl = q.data?.lists.find((l) => l.id === openId);
    if (cl) return (
      <ChecklistDetail checklist={cl} companyId={companyId} canEdit={edit} canWork={!readOnly} canAttach={canAttach && !readOnly}
        members={members} photos={photos} onOpenPhoto={onOpenPhoto} onBack={() => setOpenId(null)} />

    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Checklists</h2>
        {edit && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />Create checklist</Button>}
      </div>
      {readOnly && <p className="mb-3 text-sm text-muted-foreground">This project is archived, so checklists are read-only.</p>}
      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((k) => <Skeleton key={k} className="h-20 w-full" />)}</div>
      ) : q.isError ? (
        <div className="rounded-md border p-6 text-center text-sm">
          <p className="mb-2 text-muted-foreground">Checklists could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : q.data!.lists.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <ClipboardList className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="mb-4 text-sm text-muted-foreground">A checklist helps you track inspection or job steps for this project.</p>
          {edit && <Button onClick={() => setCreateOpen(true)}><Plus className="mr-1 h-4 w-4" />Create checklist</Button>}
        </div>
      ) : (
        <ul className="space-y-2">
          {q.data!.lists.map((l) => {
            const its = q.data!.items.filter((i) => i.checklist_id === l.id);
            const done = its.filter((i) => i.completed_at).length;
            const pct = its.length ? Math.round((done / its.length) * 100) : 0;
            return (
              <li key={l.id}>
                <button type="button" onClick={() => setOpenId(l.id)}
                  className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{l.title}</span>
                    <span className="text-sm font-medium">{pct}%</span>
                  </div>
                  <Progress value={pct} className="my-2 h-2" aria-label={`${pct}% complete`} />
                  <div className="text-xs text-muted-foreground">
                    {done} of {its.length} done · updated {formatDistanceToNow(new Date(l.updated_at), { addSuffix: true })}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ChecklistDialog open={createOpen} onOpenChange={setCreateOpen} members={members}
        onSave={async (v) => {
          const { data, error } = await supabase.from("checklists")
            .insert({ job_id: projectId, company_id: companyId, title: v.title, description: v.description, assignee_id: v.assignee_id })
            .select("id").single();
          if (error) throw error;
          toast.success("Checklist created");
          await qc.invalidateQueries({ queryKey: ["checklists", projectId] });
          setOpenId(data.id);
        }} />
    </div>
  );
}

function MemberSelect({ id, value, onChange, members }: { id: string; value: string | null; onChange: (v: string | null) => void; members: Member[] }) {
  return (
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <option value="">Unassigned</option>
      {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}

function ChecklistDialog({ open, onOpenChange, initial, members, onSave }: {
  open: boolean; onOpenChange: (o: boolean) => void; members: Member[];
  initial?: { title: string; description: string | null; assignee_id: string | null };
  onSave: (v: { title: string; description: string | null; assignee_id: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [asg, setAsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reset = () => { setTitle(initial?.title ?? ""); setDesc(initial?.description ?? ""); setAsg(initial?.assignee_id ?? null); };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) reset(); onOpenChange(o); }}>
      <DialogContent onOpenAutoFocus={() => reset()}>
        <DialogHeader><DialogTitle>{initial ? "Edit checklist" : "Create checklist"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="cl-title">Title</Label><Input id="cl-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label htmlFor="cl-desc">Description (optional)</Label><Textarea id="cl-desc" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div><Label htmlFor="cl-asg">Assign to (optional)</Label><MemberSelect id="cl-asg" value={asg} onChange={setAsg} members={members} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim() || busy} onClick={async () => {
            setBusy(true);
            try { await onSave({ title: title.trim(), description: desc.trim() || null, assignee_id: asg }); onOpenChange(false); }
            catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
          }}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`${pct}% complete`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
          className="stroke-primary transition-all" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{pct}%</span>
    </div>
  );
}

function ChecklistDetail({ checklist, companyId, canEdit, canWork, canAttach, members, photos, onOpenPhoto, onBack }: {
  checklist: Checklist; companyId: string; canEdit: boolean; canWork: boolean; canAttach: boolean; members: Member[];
  photos: PhotoDetail[]; onOpenPhoto: (p: PhotoDetail) => void; onBack: () => void;
}) {
  const qc = useQueryClient();
  const [hideDone, setHideDone] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [itemDialog, setItemDialog] = useState<{ item?: Item } | null>(null);
  const [attachFor, setAttachFor] = useState<Item | null>(null);
  const [capturingFor, setCapturingFor] = useState<string | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);
  const captureItem = useRef<Item | null>(null);

  const key = ["checklist", checklist.id];
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? (id ? "Former member" : null);

  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const it = await supabase.from("checklist_items").select("*").eq("checklist_id", checklist.id).order("position").order("created_at");
      if (it.error) throw it.error;
      const ids = (it.data ?? []).map((i) => i.id);
      const [qs, ev] = ids.length ? await Promise.all([
        supabase.from("checklist_questions").select("*").in("item_id", ids).order("position"),
        supabase.from("checklist_item_photos").select("id, item_id, photo_id").in("item_id", ids).order("created_at"),
      ]) : [{ data: [], error: null }, { data: [], error: null }];
      if (qs.error) throw qs.error;
      if (ev.error) throw ev.error;
      return { items: (it.data ?? []) as Item[], questions: (qs.data ?? []) as Question[], evidence: (ev.data ?? []) as Evidence[] };
    },
  });

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: key }),
    qc.invalidateQueries({ queryKey: ["checklists", checklist.job_id] }),
  ]);
  const run = async (p: PromiseLike<{ error: unknown }>, ok?: string) => {
    const { error } = await p;
    if (error) { toast.error(errMsg(error)); return false; }
    if (ok) toast.success(ok);
    await refresh();
    return true;
  };

  /** Opens the device camera for a task; the shot is filed under the Checklists phase and attached. */
  const startCapture = (item: Item) => {
    captureItem.current = item;
    captureRef.current?.click();
  };

  const handleCapturedFile = async (files: FileList | null) => {
    const file = files?.[0];
    const item = captureItem.current;
    captureItem.current = null;
    if (captureRef.current) captureRef.current.value = "";
    if (!file || !item) return;
    setCapturingFor(item.id);
    const progress = toast.loading("Adding photo…");
    try {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) throw new Error("Please sign in again to add photos");

      let exif = { takenAt: null as string | null, latitude: null as number | null, longitude: null as number | null };
      try { exif = await readPhotoExif(file); } catch { /* metadata is optional */ }
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

      const nameExt = (file.name.split(".").pop() || "").toLowerCase();
      const ext = /^[a-z0-9]{2,5}$/.test(nameExt) ? nameExt : (file.type.split("/")[1] || "jpg");
      const path = `${userId}/${checklist.job_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("job-photos")
        .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("job-photos").getPublicUrl(path);
      const hasExifGps = exif.latitude != null && exif.longitude != null;

      const { data: photo, error: insErr } = await supabase.from("photos").insert({
        job_id: checklist.job_id, user_id: userId, company_id: companyId,
        storage_path: path, image_url: pub.publicUrl, phase: CHECKLIST_PHASE,
        media_type: "image", mime_type: file.type || null, file_size: file.size,
        taken_at: exif.takenAt ?? new Date().toISOString(),
        latitude: hasExifGps ? exif.latitude : (coords?.coords.latitude ?? null),
        longitude: hasExifGps ? exif.longitude : (coords?.coords.longitude ?? null),
        accuracy: hasExifGps ? null : (coords?.coords.accuracy ?? null),
      }).select("id").single();
      if (insErr) throw insErr;

      const { error: linkErr } = await supabase.from("checklist_item_photos")
        .insert({ item_id: item.id, photo_id: photo.id, job_id: checklist.job_id, attached_by: userId });
      if (linkErr) throw linkErr;

      toast.success("Photo added to the task and the project's Checklists media", { id: progress });
      await qc.invalidateQueries({ queryKey: ["photos", checklist.job_id] });
      await refresh();
    } catch (e) {
      toast.error(errMsg(e), { id: progress });
    } finally {
      setCapturingFor(null);
    }
  };



  const items = q.data?.items ?? [];
  const done = items.filter((i) => i.completed_at).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const visible = hideDone ? items.filter((i) => !i.completed_at) : items;

  const move = async (item: Item, dir: -1 | 1) => {
    const idx = items.findIndex((i) => i.id === item.id);
    const other = items[idx + dir];
    if (!other) return;
    const a = idx, b = idx + dir;
    await Promise.all([
      supabase.from("checklist_items").update({ position: b }).eq("id", item.id),
      supabase.from("checklist_items").update({ position: a }).eq("id", other.id),
    ]).then((rs) => { const e = rs.find((r) => r.error)?.error; if (e) toast.error(e.message); else toast.success("Order saved"); });
    await refresh();
  };

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Back to checklists</Button>
      <div className="flex flex-wrap items-start gap-4">
        <ProgressRing pct={pct} />
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-tight">{checklist.title}</h2>
          {checklist.description && <p className="mt-1 text-sm text-muted-foreground">{checklist.description}</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            {done} of {items.length} done · updated {formatDistanceToNow(new Date(checklist.updated_at), { addSuffix: true })}
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
            {canEdit ? (
              <div className="w-56">
                <label htmlFor="cl-assign" className="sr-only">Assign checklist</label>
                <MemberSelect id="cl-assign" value={checklist.assignee_id} members={members}
                  onChange={(v) => run(supabase.from("checklists").update({ assignee_id: v }).eq("id", checklist.id), "Assignment saved")} />
              </div>
            ) : <span>{nameOf(checklist.assignee_id) ?? "Unassigned"}</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
            <Button variant="outline" size="sm" aria-label="Delete checklist" onClick={async () => {
              if (!window.confirm(`Delete "${checklist.title}" and all its items? Attached media stays in the project.`)) return;
              if (await run(supabase.from("checklists").delete().eq("id", checklist.id), "Checklist deleted")) onBack();
            }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      <Separator className="my-4" />
      <div className="mb-3 flex items-center gap-2">
        <Switch id="hide-done" checked={hideDone} onCheckedChange={setHideDone} />
        <Label htmlFor="hide-done">Hide completed</Label>
      </div>

      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((k) => <Skeleton key={k} className="h-24 w-full" />)}</div>
      ) : q.isError ? (
        <div className="rounded-md border p-6 text-center text-sm">
          <p className="mb-2 text-muted-foreground">Items could not be loaded.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
          {items.length > 0 && visible.length === 0 && <p className="text-sm text-muted-foreground">All tasks are completed.</p>}
          {visible.map((item) => {
            const idx = items.findIndex((i) => i.id === item.id);
            const qs = q.data!.questions.filter((x) => x.item_id === item.id);
            const ev = q.data!.evidence.filter((x) => x.item_id === item.id);
            const reason = blockReason(item, qs, ev);
            const completed = !!item.completed_at;
            const toggleDisabled = !canWork || (!completed && !!reason);
            const assignee = nameOf(item.assignee_id ?? checklist.assignee_id);
            const actions = (
              <>
                {canEdit && <DropdownMenuItem onSelect={() => setItemDialog({ item })}><Pencil className="mr-2 h-4 w-4" />Edit task</DropdownMenuItem>}
                {canAttach && <DropdownMenuItem disabled={capturingFor === item.id} onSelect={() => startCapture(item)}><Camera className="mr-2 h-4 w-4" />Take photo</DropdownMenuItem>}
                {canAttach && <DropdownMenuItem onSelect={() => setAttachFor(item)}><ImagePlus className="mr-2 h-4 w-4" />Attach photo</DropdownMenuItem>}

                {canEdit && <>
                  <DropdownMenuItem disabled={idx === 0} onSelect={() => move(item, -1)}><ArrowUp className="mr-2 h-4 w-4" />Move up</DropdownMenuItem>
                  <DropdownMenuItem disabled={idx === items.length - 1} onSelect={() => move(item, 1)}><ArrowDown className="mr-2 h-4 w-4" />Move down</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => {
                    if (window.confirm(`Delete task "${item.title}"? Attached media stays in the project.`))
                      run(supabase.from("checklist_items").delete().eq("id", item.id), "Task deleted");
                  }}><Trash2 className="mr-2 h-4 w-4" />Delete task</DropdownMenuItem>
                </>}
              </>
            );
            return (
              <div key={item.id} className={`rounded-lg border bg-card p-4 ${completed ? "opacity-80" : ""}`}>
                <div className="flex items-start gap-3">
                  <button type="button" role="checkbox" aria-checked={completed} disabled={toggleDisabled}
                    aria-label={`${completed ? "Reopen" : "Complete"} ${item.title}${!completed && reason ? ` — ${reason}` : ""}`}
                    title={!completed && reason ? reason : undefined}
                    onClick={() => run(supabase.from("checklist_items").update({ completed_at: completed ? null : new Date().toISOString() }).eq("id", item.id), completed ? "Task reopened" : "Task completed")}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${completed ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/50 hover:border-primary"}`}>
                    {completed && <Check className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{item.title}</span>
                      {assignee && <span className="text-xs text-muted-foreground">· {assignee}</span>}
                      {item.photos_required && <Badge variant="outline" className="text-xs"><Camera className="mr-1 h-3 w-3" />Photos required</Badge>}
                    </div>
                    {item.instructions && <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{item.instructions}</p>}
                    {qs.map((qq) => (
                      <div key={qq.id} className="mt-3">
                        <p className="mb-1 text-sm">{qq.prompt}</p>
                        <div className="flex gap-1" role="radiogroup" aria-label={qq.prompt}>
                          {ANSWERS.map((a) => {
                            const sel = qq.answer === a.v;
                            return (
                              <button key={a.v} type="button" role="radio" aria-checked={sel} disabled={!canWork}
                                onClick={() => run(supabase.from("checklist_questions").update({ answer: sel ? null : a.v }).eq("id", qq.id), "Answer saved")}
                                className={`min-w-14 rounded-md border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${sel ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
                                {sel && <Check className="mr-1 inline h-3 w-3" />}{a.l}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {ev.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ev.map((e) => {
                          const p = photos.find((x) => x.id === e.photo_id);
                          return (
                            <div key={e.id} className="group relative">
                              <button type="button" disabled={!p} onClick={() => p && onOpenPhoto(p)} aria-label="Open attached media"
                                className="h-14 w-14 overflow-hidden rounded-md border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                {p ? (p.media_type === "video"
                                  ? <video src={p.image_url} muted preload="metadata" className="h-full w-full object-cover" />
                                  : <img src={p.annotated_image_url || p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />)
                                  : <span className="text-[10px] text-muted-foreground">Unavailable</span>}
                              </button>
                              {canAttach && (
                                <button type="button" aria-label="Remove attached media"
                                  onClick={() => run(supabase.from("checklist_item_photos").delete().eq("id", e.id), "Media removed from task")}
                                  className="absolute -right-1.5 -top-1.5 rounded-full border bg-background p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!completed && reason && canWork && <p className="mt-2 text-xs text-muted-foreground">{reason} to complete this task.</p>}
                  </div>
                  {(canEdit || canAttach) && (
                    <div className="flex shrink-0 items-center gap-1">
                      {canEdit && <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={`Edit ${item.title}`} onClick={() => setItemDialog({ item })}><Pencil className="h-4 w-4" /></Button>}
                      {canAttach && <Button variant="ghost" size="icon" className="hidden sm:inline-flex" disabled={capturingFor === item.id} aria-label={`Take photo for ${item.title}`} onClick={() => startCapture(item)}>{capturingFor === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}</Button>}
                      {canAttach && <Button variant="ghost" size="icon" className="hidden sm:inline-flex" aria-label={`Attach photo to ${item.title}`} onClick={() => setAttachFor(item)}><ImagePlus className="h-4 w-4" /></Button>}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`More options for ${item.title}`}><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">{actions}</DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {canEdit && (
            <Button variant="outline" className="w-full border-dashed" onClick={() => setItemDialog({})}>
              <Plus className="mr-1 h-4 w-4" />Add task
            </Button>
          )}
        </div>
      )}

      <ChecklistDialog open={editOpen} onOpenChange={setEditOpen} members={members} initial={checklist}
        onSave={async (v) => {
          const { error } = await supabase.from("checklists").update(v).eq("id", checklist.id);
          if (error) throw error;
          toast.success("Checklist saved");
          await refresh();
        }} />
      {itemDialog && (
        <ItemDialog item={itemDialog.item} members={members} onClose={() => setItemDialog(null)}
          questions={itemDialog.item ? (q.data?.questions ?? []).filter((x) => x.item_id === itemDialog.item!.id) : []}
          onSave={async (v) => {
            const jobId = checklist.job_id;
            let itemId = itemDialog.item?.id;
            const base = { title: v.title, instructions: v.instructions, assignee_id: v.assignee_id, photos_required: v.photos_required };
            if (itemId) {
              const { error } = await supabase.from("checklist_items").update(base).eq("id", itemId);
              if (error) throw error;
            } else {
              const { data, error } = await supabase.from("checklist_items")
                .insert({ ...base, checklist_id: checklist.id, job_id: jobId, position: items.length }).select("id").single();
              if (error) throw error;
              itemId = data.id;
            }
            const existing = itemDialog.item ? (q.data?.questions ?? []).filter((x) => x.item_id === itemId) : [];
            const keep = new Set(v.questions.filter((x) => x.id).map((x) => x.id));
            const removed = existing.filter((x) => !keep.has(x.id)).map((x) => x.id);
            if (removed.length) { const { error } = await supabase.from("checklist_questions").delete().in("id", removed); if (error) throw error; }
            for (const [i, qq] of v.questions.entries()) {
              if (qq.id) {
                const { error } = await supabase.from("checklist_questions").update({ prompt: qq.prompt, position: i }).eq("id", qq.id);
                if (error) throw error;
              } else {
                const { error } = await supabase.from("checklist_questions").insert({ item_id: itemId!, job_id: jobId, prompt: qq.prompt, position: i });
                if (error) throw error;
              }
            }
            toast.success(itemDialog.item ? "Task saved" : "Task added");
            await refresh();
          }} />
      )}
      {attachFor && (
        <AttachDialog item={attachFor} photos={photos} attached={(q.data?.evidence ?? []).filter((e) => e.item_id === attachFor.id).map((e) => e.photo_id)}
          onClose={() => setAttachFor(null)}
          onAttach={async (ids) => {
            const { data: u } = await supabase.auth.getUser();
            const { error } = await supabase.from("checklist_item_photos").insert(
              ids.map((photo_id) => ({ item_id: attachFor.id, photo_id, job_id: checklist.job_id, attached_by: u.user!.id })));
            if (error) throw error;
            toast.success(ids.length === 1 ? "Media attached" : `${ids.length} media attached`);
            await refresh();
          }} />
      )}
    </div>
  );
}

function ItemDialog({ item, questions, members, onClose, onSave }: {
  item?: Item; questions: Question[]; members: Member[]; onClose: () => void;
  onSave: (v: { title: string; instructions: string | null; assignee_id: string | null; photos_required: boolean; questions: { id?: string; prompt: string }[] }) => Promise<void>;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [instr, setInstr] = useState(item?.instructions ?? "");
  const [asg, setAsg] = useState<string | null>(item?.assignee_id ?? null);
  const [req, setReq] = useState(item?.photos_required ?? false);
  const [qs, setQs] = useState<{ id?: string; prompt: string }[]>(questions.map((q) => ({ id: q.id, prompt: q.prompt })));
  const [busy, setBusy] = useState(false);
  const valid = title.trim() && qs.every((q) => q.prompt.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? "Edit task" : "Add task"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label htmlFor="it-title">Title</Label><Input id="it-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label htmlFor="it-instr">Notes or instructions (optional)</Label><Textarea id="it-instr" rows={2} value={instr} onChange={(e) => setInstr(e.target.value)} /></div>
          <div><Label htmlFor="it-asg">Assign to (optional)</Label><MemberSelect id="it-asg" value={asg} onChange={setAsg} members={members} />
            <p className="mt-1 text-xs text-muted-foreground">Overrides the checklist's assignee for this task.</p></div>
          <div className="flex items-center gap-2"><Switch id="it-req" checked={req} onCheckedChange={setReq} /><Label htmlFor="it-req">Photos required</Label></div>
          <div>
            <Label>Yes / No / N/A questions (optional)</Label>
            <div className="mt-1 space-y-2">
              {qs.map((q, i) => (
                <div key={q.id ?? `new-${i}`} className="flex gap-2">
                  <Input aria-label={`Question ${i + 1}`} value={q.prompt} placeholder="e.g. Is the area clean?"
                    onChange={(e) => setQs(qs.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" aria-label={`Remove question ${i + 1}`} onClick={() => setQs(qs.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setQs([...qs, { prompt: "" }])}><Plus className="mr-1 h-4 w-4" />Add question</Button>
            </div>
            {item && qs.some((q) => q.id) && <p className="mt-1 text-xs text-muted-foreground">Removing a question deletes its answer.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || busy} onClick={async () => {
            setBusy(true);
            try {
              await onSave({ title: title.trim(), instructions: instr.trim() || null, assignee_id: asg, photos_required: req, questions: qs.map((q) => ({ ...q, prompt: q.prompt.trim() })) });
              onClose();
            } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
          }}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttachDialog({ item, photos, attached, onClose, onAttach }: {
  item: Item; photos: PhotoDetail[]; attached: string[]; onClose: () => void; onAttach: (ids: string[]) => Promise<void>;
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const avail = useMemo(() => [...photos].reverse().filter((p) => !attached.includes(p.id)), [photos, attached]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Attach media to "{item.title}"</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Choose from this project's media. To add new photos, upload them on the Media tab first.</p>
        {avail.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No other project media to attach.</p> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {avail.map((p) => {
              const on = sel.includes(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={on} aria-label={`${on ? "Deselect" : "Select"} ${p.media_type === "video" ? "video" : "photo"}${p.caption ? ` ${p.caption}` : ""}`}
                  onClick={() => setSel(on ? sel.filter((x) => x !== p.id) : [...sel, p.id])}
                  className={`relative aspect-square overflow-hidden rounded-md border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${on ? "border-primary" : "border-transparent"}`}>
                  {p.media_type === "video"
                    ? <video src={p.image_url} muted preload="metadata" className="h-full w-full object-cover" />
                    : <img src={p.annotated_image_url || p.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                  {on && <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground"><Check className="h-3 w-3" /></span>}
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!sel.length || busy} onClick={async () => {
            setBusy(true);
            try { await onAttach(sel); onClose(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
          }}>Attach{sel.length ? ` (${sel.length})` : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
