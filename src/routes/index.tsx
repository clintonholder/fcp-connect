import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useMyRoles } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, MapPin, Building2, Camera, Search, Archive, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DIVISIONS, projectDivisions } from "@/lib/project-meta";
import { toast } from "sonner";
const mdFmt = new Intl.DateTimeFormat(undefined, { month: "2-digit", day: "2-digit" });
function photoRangeLabel(r?: { min: number; max: number }) {
  if (!r) return "No photos";
  const a = mdFmt.format(new Date(r.min));
  const b = mdFmt.format(new Date(r.max));
  return a === b ? a : `${a}–${b}`;
}

import { logActivity } from "@/lib/activity";
import { geocodeAddress } from "@/lib/geocode";
import { ProjectForm, type ProjectFormValues, emptyProject } from "@/components/ProjectForm";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Projects — FCP Connect" },
      { name: "description", content: "Browse and search FCP Services projects, customers, divisions and field photo documentation." },
      { property: "og:title", content: "Projects — FCP Connect" },
      { property: "og:description", content: "Browse and search FCP Services projects, customers, divisions and field photo documentation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><ProjectsPage /></RequireAuth>,
});

const emptyFilters = { division: "", tag: "", person: "", scope: "all" };
const sel = "rounded-md border border-input bg-background px-2 py-2 text-sm";

function ProjectsPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { can } = useMyRoles();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useShowArchived();
  const [filters, setFilters] = useState(emptyFilters);

  const [form, setForm] = useState<ProjectFormValues>(emptyProject);

  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, email").order("display_name");
      return data ?? [];
    },
  });

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs").select("*, photos(count)")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: photoDates } = useQuery({
    queryKey: ["photo-date-ranges", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("photos").select("job_id, taken_at, created_at")
        .eq("company_id", company!.id);
      return data ?? [];
    },
  });

  const ranges = useMemo(() => {
    const m = new Map<string, { min: number; max: number }>();
    for (const p of photoDates ?? []) {
      const t = new Date(p.taken_at ?? p.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      const cur = m.get(p.job_id);
      if (!cur) m.set(p.job_id, { min: t, max: t });
      else { cur.min = Math.min(cur.min, t); cur.max = Math.max(cur.max, t); }
    }
    return m;
  }, [photoDates]);

  const { data: collaborators } = useQuery({

    queryKey: ["all-collaborators", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_collaborators").select("job_id, user_id")
        .eq("company_id", company!.id);
      return data ?? [];
    },
  });

  const ownerName = (id: string | null) => {
    const p = (people ?? []).find((x) => x.id === id);
    return p?.display_name || p?.email || "";
  };

  const peopleOptions = useMemo(() => {
    const ids = new Set<string>();
    (projects ?? []).forEach((p) => p.owner_id && ids.add(p.owner_id));
    (collaborators ?? []).forEach((c) => ids.add(c.user_id));
    return Array.from(ids).map((id) => ({ id, name: ownerName(id) || "Unknown user" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, collaborators, people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects ?? []).filter((p) => {
      if (!showArchived && p.archived_at) return false;
      if (filters.division && !projectDivisions(p).includes(filters.division)) return false;
      if (filters.person) {
        const isCollab = (collaborators ?? []).some((c) => c.job_id === p.id && c.user_id === filters.person);
        if (p.owner_id !== filters.person && !isCollab) return false;
      }
      if (q && ![p.name, p.customer, p.client, p.address, ...projectDivisions(p), ...(p.tags ?? []), p.status, p.phase, p.cmic_number, ownerName(p.owner_id)]
        .filter(Boolean).some((x) => String(x).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [projects, search, showArchived, people, filters, collaborators]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const create = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No workspace loaded yet");
      if (!form.name.trim()) throw new Error("Project name is required");
      if (!form.customer.trim()) throw new Error("Customer name is required");
      if (form.divisions.length === 0) throw new Error("Select at least one division");
      const geo = form.address.trim() ? await geocodeAddress(form.address) : null;
      const { data, error } = await supabase.from("jobs").insert({
        name: form.name.trim(),
        customer: form.customer.trim(),
        client: form.customer.trim(),
        address: form.address.trim() || null,
        division: form.divisions[0] ?? null,
        divisions: form.divisions,
        tags: form.tags,
        owner_id: form.owner_id || user!.id,
        status: "Active",
        cmic_number: form.cmic_number.trim() || null,
        notes: form.notes.trim() || null,
        latitude: geo?.lat ?? null,
        longitude: geo?.lon ?? null,
        geocode_failed: !!form.address.trim() && !geo,
        user_id: user!.id,
        company_id: company.id,
      }).select().single();
      if (error) throw error;
      await logActivity({ company_id: company.id, job_id: data.id, kind: "job_created", meta: { name: data.name } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", company?.id] });
      setForm(emptyProject);
      setOpen(false);
      toast.success("Project created");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const dirty = JSON.stringify(form) !== JSON.stringify(emptyProject);
  const closeCreate = () => {
    if (dirty && !window.confirm("Discard this new project? Your changes will be lost.")) return;
    setForm(emptyProject);
    setOpen(false);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Projects</h1>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived" className="cursor-pointer text-sm">
              Show archived
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${showArchived ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                {showArchived ? "ON" : "OFF"}
              </span>
            </Label>
          </div>
          {can.can_add_projects && (
            <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New Project</Button>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeCreate())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
          <ProjectForm
            value={form}
            onChange={setForm}
            people={people ?? []}
            saving={create.isPending}
            onSave={() => create.mutate()}
            onCancel={closeCreate}
          />
        </DialogContent>
      </Dialog>

      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, customer, address, division or owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mb-3 rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4 text-primary" />Filters
          {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount} active</Badge>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <select className={sel} value={filters.division} onChange={(e) => setFilters({ ...filters, division: e.target.value })}>
            <option value="">All divisions</option>
            {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={sel} value={filters.person} onChange={(e) => setFilters({ ...filters, person: e.target.value })}>
            <option value="">Anyone assigned</option>
            {peopleOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button variant="outline" onClick={() => setFilters(emptyFilters)} disabled={activeFilterCount === 0}>
            Clear filters
          </Button>
        </div>
      </div>

      <div className="mb-4 text-sm text-muted-foreground">
        {filtered.length} project{filtered.length === 1 ? "" : "s"} match{filtered.length === 1 ? "es" : ""}
        {showArchived ? " (including archived)" : ""}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : filtered.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((j) => {
            const count = (j.photos as unknown as { count: number }[])?.[0]?.count ?? 0;
            return (
              <Link key={j.id} to="/project/$projectId" params={{ projectId: j.id }} className="block">
                <Card className="h-full transition hover:shadow-[var(--shadow-elegant)] hover:-translate-y-0.5">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-primary/10 p-2"><Building2 className="h-5 w-5 text-primary" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold">{j.name}</h3>
                          {j.archived_at && <Badge variant="outline" className="gap-1"><Archive className="h-3 w-3" />Archived</Badge>}
                        </div>
                        {(j.customer || j.client) && <p className="text-xs text-muted-foreground truncate">{j.customer || j.client}</p>}
                        {j.address && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground truncate"><MapPin className="h-3 w-3" />{j.address}</p>}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {j.status && <Badge variant="secondary">{j.status}</Badge>}
                          {j.phase && <Badge variant="outline">{j.phase}</Badge>}
                          {projectDivisions(j).map((d) => <Badge key={d} variant="outline">{d}</Badge>)}
                          {(j.tags ?? []).map((t: string) => <Badge key={t} variant="secondary">{t}</Badge>)}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><Camera className="h-3 w-3" />{count} photos</span>
                          <span className="whitespace-nowrap text-muted-foreground">{photoRangeLabel(ranges.get(j.id))}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed p-12 text-center">
          <Building2 className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-2 font-medium">{search || activeFilterCount ? "No projects match" : "No projects yet"}</p>
          <p className="text-sm text-muted-foreground">
            {search || activeFilterCount
              ? "Try another search, change the filters, or turn on Show archived."
              : "Create your first project to get started."}
          </p>
          {activeFilterCount > 0 && (
            <Button variant="outline" className="mt-3" onClick={() => setFilters(emptyFilters)}>Clear filters</Button>
          )}
        </div>
      )}
    </div>
  );
}
