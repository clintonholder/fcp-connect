import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";


import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { projectDivisions } from "@/lib/project-meta";
import { RequireAuth } from "@/components/RequireAuth";
import { useShowArchived } from "@/lib/show-archived";
import { useProxy } from "@/lib/proxy-context";
import { useCompany } from "@/lib/company-context";
import { useAuth } from "@/lib/auth-context";
import { MapPin, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ProjectMap = lazy(() => import("@/components/ProjectMap"));

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "Project Map — FCP Connect" },
      { name: "description", content: "See every FCP Services project on a map, filtered by status, division, project tags and your own involvement." },
      { property: "og:title", content: "Project Map — FCP Connect" },
      { property: "og:description", content: "See every FCP Services project on a map, filtered by status, division, project tags and your own involvement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><MapPage /></RequireAuth>,
});

const emptyFilters = { division: "", tag: "", scope: "all" };

function MapPage() {
  const [mounted, setMounted] = useState(false);
  const { company } = useCompany();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [showArchived, setShowArchived] = useShowArchived();
  useEffect(() => setMounted(true), []);

  const { data: memberships } = useQuery({
    queryKey: ["my-project-memberships", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("project_collaborators").select("job_id, user_id")
        .eq("company_id", company!.id);
      return data ?? [];
    },
  });

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
        .select("id,name,address,customer,client,status,phase,division,divisions,tags,user_id,owner_id,latitude,longitude,geocode_failed,archived_at,updated_at")
        .eq("company_id", company!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const options = useMemo(() => {
    const uniq = (vals: (string | null)[]) => Array.from(new Set(vals.filter(Boolean) as string[])).sort();
    return {
      division: uniq((projects ?? []).flatMap((p) => projectDivisions(p))),
      tag: uniq((projects ?? []).flatMap((p) => p.tags ?? [])),
    };
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = proxy ? new Set(proxy.visibleJobIds) : null;
    return (projects ?? []).filter((p) => {
      if (visible && !visible.has(p.id)) return false;
      if (!showArchived && p.archived_at) return false;
      if (filters.division && !projectDivisions(p).includes(filters.division)) return false;
      if (filters.tag && !(p.tags ?? []).includes(filters.tag)) return false;
      if (filters.scope === "mine") {
        const attached =
          p.owner_id === user?.id ||
          p.user_id === user?.id ||
          (memberships ?? []).some((m) => m.job_id === p.id && m.user_id === user?.id);
        if (!attached) return false;
      }
      if (q && ![p.name, p.customer, p.client, p.address, ...projectDivisions(p), ...(p.tags ?? []), p.status, personName(p.owner_id)]
        .filter(Boolean).some((x) => String(x).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [projects, filters, search, people, memberships, user, showArchived]);

  const mappable = filtered.filter((p) => p.latitude != null && p.longitude != null);
  const unmappable = filtered.length - mappable.length;
  const activeFilterCount =
    (filters.division ? 1 : 0) + (filters.tag ? 1 : 0) + (filters.scope !== "all" ? 1 : 0);
  const sel = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <MapPin className="h-6 w-6 text-primary" />Project Map
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} project{filtered.length === 1 ? "" : "s"} match your filters · {mappable.length} shown on the map
            {unmappable > 0 && ` · ${unmappable} without a usable address`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="map-show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="map-show-archived" className="cursor-pointer text-sm">
            Show archived
            <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${showArchived ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {showArchived ? "ON" : "OFF"}
            </span>
          </Label>
        </div>
      </div>


      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search projects…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="mb-4 rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4 text-primary" />Filters
          {activeFilterCount > 0 && <Badge variant="secondary">{activeFilterCount} active</Badge>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <select className={sel} value={filters.division} onChange={(e) => setFilters({ ...filters, division: e.target.value })}>
            <option value="">All divisions</option>{options.division.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className={sel} value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
            <option value="">All project tags</option>{options.tag.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select className={sel} value={filters.scope} onChange={(e) => setFilters({ ...filters, scope: e.target.value })}>
            <option value="all">All authorized projects</option>
            <option value="mine">Included on project</option>
          </select>
          <Button variant="outline" onClick={() => { setFilters(emptyFilters); setSearch(""); }} disabled={activeFilterCount === 0 && !search}>
            Clear filters
          </Button>
        </div>
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
                  {p.archived_at && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                  {(p.tags ?? []).map((t: string) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
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
