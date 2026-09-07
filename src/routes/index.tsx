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
import { Plus, MapPin, Building2, Camera, Search, Archive } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
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

const emptyFilters = { status: "", division: "", phase: "", person: "" };

function ProjectsPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { can } = useMyRoles();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
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

  const phaseOptions = useMemo(
    () => Array.from(new Set((projects ?? []).map((p) => p.phase).filter(Boolean) as string[])).sort(),
    [projects],
  );

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
      const status = p.archived_at ? "Archived" : "Active";
      if (filters.status && filters.status !== status) return false;
      if (filters.division && p.division !== filters.division) return false;
      if (filters.phase && p.phase !== filters.phase) return false;
      if (filters.person) {
        const isCollab = (collaborators ?? []).some((c) => c.job_id === p.id && c.user_id === filters.person);
        if (p.owner_id !== filters.person && !isCollab) return false;
      }
      if (q && ![p.name, p.customer, p.client, p.address, p.division, p.status, p.phase, p.cmic_number, ownerName(p.owner_id)]
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
      const geo = form.address.trim() ? await geocodeAddress(form.address) : null;
      const { data, error } = await supabase.from("jobs").insert({
        name: form.name.trim(),
        customer: form.customer.trim(),
        client: form.customer.trim(),
        address: form.address.trim() || null,
        division: form.division || null,
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Projects</h1>
        </div>
        {can.can_add_projects && (
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />New Project</Button>
        )}
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
          placeholder="Search by name, customer, address, division, owner, status or phase…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{filtered.length} project{filtered.length === 1 ? "" : "s"}</span>
        <button className="text-muted-foreground underline hover:text-foreground" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? "Hide archived" : "Show archived"}
        </button>
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
                          {j.division && <Badge variant="outline">{j.division}</Badge>}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><Camera className="h-3 w-3" />{count} photos</span>
                          <span className="text-muted-foreground">{formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}</span>
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
          <p className="mt-2 font-medium">{search ? "No matches" : "No projects yet"}</p>
          <p className="text-sm text-muted-foreground">{search ? "Try another search." : "Create your first project to get started."}</p>
        </div>
      )}
    </div>
  );
}
