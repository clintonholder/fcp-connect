import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { projectDivisions } from "@/lib/project-meta";
import { RequireAuth } from "@/components/RequireAuth";
import { useCompany } from "@/lib/company-context";
import { MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ProjectMap = lazy(() => import("@/components/ProjectMap"));

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Project Map — FCP Connect" },
      { name: "description", content: "See every FCP Services project on a map, filtered by phase, status, division, owner and customer." },
      { property: "og:title", content: "Project Map — FCP Connect" },
      { property: "og:description", content: "See every FCP Services project on a map, filtered by phase, status, division, owner and customer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><MapPage /></RequireAuth>,
});

const emptyFilters = { status: "", phase: "", division: "", owner: "", customer: "", since: "" };

function MapPage() {
  const [mounted, setMounted] = useState(false);
  const { company } = useCompany();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  useEffect(() => setMounted(true), []);

  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name, email").order("display_name");
      return data ?? [];
    },
  });
  const personName = (id: string | null) => {
    const p = (people ?? []).find((x) => x.id === id);
    return p?.display_name || p?.email || "Unassigned";
  };

  const { data: projects } = useQuery({
    queryKey: ["map-projects", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("id,name,address,customer,client,status,phase,division,divisions,owner_id,latitude,longitude,geocode_failed,archived_at,updated_at")
        .eq("company_id", company!.id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) => Array.from(new Set(vals.filter(Boolean) as string[])).sort();
    return {
      status: uniq((projects ?? []).map((p) => p.status)),
      phase: uniq((projects ?? []).map((p) => p.phase)),
      division: uniq((projects ?? []).flatMap((p) => projectDivisions(p))),
      owner: Array.from(new Set((projects ?? []).map((p) => p.owner_id).filter(Boolean) as string[])),
      customer: uniq((projects ?? []).map((p) => p.customer ?? p.client)),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects ?? []).filter((p) => {
      if (filters.status && p.status !== filters.status) return false;
      if (filters.phase && p.phase !== filters.phase) return false;
      if (filters.division && !projectDivisions(p).includes(filters.division)) return false;
      if (filters.owner && p.owner_id !== filters.owner) return false;
      if (filters.customer && (p.customer ?? p.client) !== filters.customer) return false;
      if (filters.since && new Date(p.updated_at) < new Date(filters.since)) return false;
      if (q && ![p.name, p.customer, p.client, p.address, ...projectDivisions(p), p.status, p.phase, personName(p.owner_id)]
        .filter(Boolean).some((x) => String(x).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [projects, filters, search, people]);

  const mappable = filtered.filter((p) => p.latitude != null && p.longitude != null);
  const unmappable = filtered.length - mappable.length;
  const sel = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <MapPin className="h-6 w-6 text-primary" />Project Map
        </h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} project{filtered.length === 1 ? "" : "s"} match your filters · {mappable.length} shown on the map
          {unmappable > 0 && ` · ${unmappable} without a usable address`}
        </p>
      </div>

      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <select className={sel} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
          <option value="">All statuses</option>{options.status.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={filters.phase} onChange={(e) => setFilters({ ...filters, phase: e.target.value })}>
          <option value="">All phases</option>{options.phase.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={filters.division} onChange={(e) => setFilters({ ...filters, division: e.target.value })}>
          <option value="">All divisions</option>{options.division.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={sel} value={filters.owner} onChange={(e) => setFilters({ ...filters, owner: e.target.value })}>
          <option value="">All owners</option>{options.owner.map((id) => <option key={id} value={id}>{personName(id)}</option>)}
        </select>
        <select className={sel} value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })}>
          <option value="">All customers</option>{options.customer.map((s) => <option key={s}>{s}</option>)}
        </select>
        <Input type="date" value={filters.since} onChange={(e) => setFilters({ ...filters, since: e.target.value })} title="Active since" />
        <Button variant="outline" onClick={() => { setFilters(emptyFilters); setSearch(""); }}>Reset filters</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-card)]" style={{ height: "70vh" }}>
          {mounted ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
              <ProjectMap
                projects={mappable.map((p) => ({
                  id: p.id, name: p.name, address: p.address, customer: p.customer ?? p.client,
                  status: p.status, phase: p.phase, division: projectDivisions(p).join(", ") || null,
                  latitude: p.latitude, longitude: p.longitude,
                }))}
                onOpen={(id) => navigate({ to: "/project/$projectId", params: { projectId: id } })}
              />
            </Suspense>
          ) : null}
        </div>
        <Card className="max-h-[70vh] overflow-y-auto">
          <CardContent className="space-y-2 p-3">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">No projects match these filters.</p>}
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate({ to: "/project/$projectId", params: { projectId: p.id } })}
                className="w-full rounded-md border p-2 text-left hover:bg-muted"
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">{p.customer ?? p.client ?? "—"}</div>
                <div className="truncate text-xs text-muted-foreground">{p.address ?? "No address on file"}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {p.status && <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>}
                  {p.phase && <Badge variant="outline" className="text-[10px]">{p.phase}</Badge>}
                  {p.latitude == null && <Badge variant="outline" className="text-[10px]">Not on map</Badge>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
