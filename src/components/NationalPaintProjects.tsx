import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProxy } from "@/lib/proxy-context";
import { NP_STATUSES, type NpStatus } from "@/lib/national-paint-import";
import {
  computePace,
  contractorOptions,
  crewOptions,
  filterProjects,
  formatPercent,
  progressFromInput,
  progressToInput,
  sortProjects,
  todayIso,
  type ProjectRow,
  type SortDirection,
  type SortKey,
} from "@/lib/national-paint-projects";
import {
  createNpProject,
  deleteNpProject,
  setNpProjectStatus,
  updateNpProject,
} from "@/lib/national-paint.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const NONE = "__none__";
const ALL = "all";
const QUERY_KEY = ["np-projects"];

type Named = { id: string; name: string };
type Crew = {
  id: string;
  name: string;
  contractor_id: string | null;
  is_active: boolean;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

async function loadProjects() {
  const [projects, pms, contractors, crews] = await Promise.all([
    supabase
      .from("np_projects")
      .select(
        "id, cmic_job_number, name, address, city, state, pm_id, contractor_id, crew_id, status, progress, est_start, est_end, deadline, est_revenue, notes, tag, exclude_revenue, bonus_eligible",
      ),
    supabase.from("np_pms").select("id, name"),
    supabase.from("np_contractors").select("id, name"),
    supabase.from("np_crews").select("id, name, contractor_id, is_active"),
  ]);
  const failed = [projects, pms, contractors, crews].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    projects: (projects.data ?? []) as ProjectRow[],
    pms: (pms.data ?? []).sort(byName) as Named[],
    contractors: (contractors.data ?? []).sort(byName) as Named[],
    crews: (crews.data ?? []).sort(byName) as Crew[],
  };
}

type FormState = {
  name: string;
  cmic_job_number: string;
  address: string;
  city: string;
  state: string;
  pm_id: string;
  contractor_id: string;
  crew_id: string;
  status: NpStatus;
  progress: string;
  est_start: string;
  est_end: string;
  deadline: string;
  est_revenue: string;
  notes: string;
  tag: string;
  exclude_revenue: boolean;
  bonus_eligible: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  cmic_job_number: "",
  address: "",
  city: "",
  state: "",
  pm_id: NONE,
  contractor_id: NONE,
  crew_id: NONE,
  status: "Potential",
  progress: "",
  est_start: "",
  est_end: "",
  deadline: "",
  est_revenue: "",
  notes: "",
  tag: "",
  exclude_revenue: false,
  bonus_eligible: false,
};

function toForm(p: ProjectRow): FormState {
  return {
    name: p.name,
    cmic_job_number: p.cmic_job_number ?? "",
    address: p.address ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    pm_id: p.pm_id ?? NONE,
    contractor_id: p.contractor_id ?? NONE,
    crew_id: p.crew_id ?? NONE,
    status: p.status,
    progress: progressToInput(p.progress),
    est_start: p.est_start ?? "",
    est_end: p.est_end ?? "",
    deadline: p.deadline ?? "",
    est_revenue: p.est_revenue === null ? "" : String(p.est_revenue),
    notes: p.notes ?? "",
    tag: p.tag ?? "",
    exclude_revenue: p.exclude_revenue,
    bonus_eligible: p.bonus_eligible,
  };
}

const orNull = (v: string) => (v === NONE ? null : v);

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: "cmic", label: "CMiC Job #" },
  { key: "name", label: "Project" },
  { key: "pm", label: "PM" },
  { key: "contractor", label: "Contractor" },
  { key: "crew", label: "Crew" },
  { key: "status", label: "Status" },
  { key: "progress", label: "Progress", className: "text-right" },
  { key: "pace", label: "Pace", className: "text-right" },
  { key: "est_start", label: "Est Start" },
  { key: "est_end", label: "Est End" },
  { key: "deadline", label: "Deadline" },
  { key: "est_revenue", label: "Est Revenue", className: "text-right" },
];

export function NationalPaintProjects() {
  const { readOnly } = useProxy();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QUERY_KEY, queryFn: loadProjects });

  const create = useServerFn(createNpProject);
  const update = useServerFn(updateNpProject);
  const remove = useServerFn(deleteNpProject);
  const setStatus = useServerFn(setNpProjectStatus);

  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [pmId, setPmId] = useState(ALL);
  const [contractorId, setContractorId] = useState(ALL);
  const [crewId, setCrewId] = useState(ALL);
  const [status, setStatusFilter] = useState(ALL);
  const [sortKey, setSortKey] = useState<SortKey>("est_start");
  const [direction, setDirection] = useState<SortDirection>("asc");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<ProjectRow | null>(null);

  const data = q.data;
  const today = todayIso();

  const rows = useMemo(() => {
    if (!data) return [];
    const nameOf = (list: Named[]) => (id: string | null) =>
      id ? (list.find((x) => x.id === id)?.name ?? null) : null;
    const filtered = filterProjects(data.projects, {
      search,
      pmId,
      contractorId,
      crewId,
      status,
    });
    return sortProjects(filtered, sortKey, direction, today, {
      pm: nameOf(data.pms),
      contractor: nameOf(data.contractors),
      crew: nameOf(data.crews),
    });
  }, [data, search, pmId, contractorId, crewId, status, sortKey, direction, today]);

  const run = async (fn: () => Promise<unknown>, success: string, done?: () => void) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(success);
      done?.();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const openForm = (project: ProjectRow | null) => {
    setEditing(project);
    setForm(project ? toForm(project) : EMPTY_FORM);
    setFormOpen(true);
  };

  const save = () => {
    let payload;
    try {
      const revenue = form.est_revenue.trim();
      payload = {
        name: form.name,
        cmic_job_number: form.cmic_job_number,
        address: form.address,
        city: form.city,
        state: form.state,
        pm_id: orNull(form.pm_id),
        contractor_id: orNull(form.contractor_id),
        crew_id: orNull(form.crew_id),
        status: form.status,
        progress: progressFromInput(form.progress),
        est_start: form.est_start || null,
        est_end: form.est_end || null,
        deadline: form.deadline || null,
        est_revenue: revenue === "" ? null : Number(revenue),
        notes: form.notes,
        tag: form.tag,
        exclude_revenue: form.exclude_revenue,
        bonus_eligible: form.bonus_eligible,
      };
    } catch (e) {
      toast.error(errMsg(e));
      return;
    }
    run(
      () =>
        editing ? update({ data: { id: editing.id, ...payload } }) : create({ data: payload }),
      `Project ${editing ? "updated" : "added"}`,
      () => setFormOpen(false),
    );
  };

  const changeStatus = (p: ProjectRow, next: string) =>
    run(() => setStatus({ data: { id: p.id, status: next } }), `${p.name} set to ${next}`);

  const confirmDelete = () => {
    if (!deleting) return;
    const { id } = deleting;
    run(
      () => remove({ data: { id } }),
      "Project deleted",
      () => setDeleting(null),
    );
  };

  const sortBy = (key: SortKey) => {
    if (key === sortKey) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDirection("asc");
    }
  };

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !data) return <p className="text-destructive">{errMsg(q.error)}</p>;

  const nameOf = (list: Named[], id: string | null) =>
    id ? (list.find((x) => x.id === id)?.name ?? "") : "";
  const contractorByCrew = (c: Crew) => nameOf(data.contractors, c.contractor_id);
  const formContractorId = orNull(form.contractor_id);
  const formContractors = contractorOptions(data.contractors, data.crews, editing?.contractor_id);
  const formCrews = crewOptions(data.crews, formContractorId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder="Search projects"
          aria-label="Search projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={pmId} onValueChange={setPmId}>
          <SelectTrigger className="w-40" aria-label="Filter by PM">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All PMs</SelectItem>
            {data.pms.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={contractorId} onValueChange={setContractorId}>
          <SelectTrigger className="w-44" aria-label="Filter by contractor">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All contractors</SelectItem>
            {data.contractors.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={crewId} onValueChange={setCrewId}>
          <SelectTrigger className="w-52" aria-label="Filter by crew">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All crews</SelectItem>
            {data.crews.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
                {c.contractor_id ? ` (${contractorByCrew(c)})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {NP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-sm text-muted-foreground">
          {rows.length} of {data.projects.length} projects
        </span>
        {!readOnly && (
          <Button size="sm" onClick={() => openForm(null)}>
            <Plus className="mr-1 h-4 w-4" /> Add project
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => {
              const Icon =
                sortKey !== c.key ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
              return (
                <Fragment key={c.key}>
                  <TableHead className={c.className}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 font-medium"
                      onClick={() => sortBy(c.key)}
                    >
                      {c.label}
                      <Icon className="h-3 w-3" />
                    </button>
                  </TableHead>
                  {c.key === "name" && <TableHead>City/State</TableHead>}
                </Fragment>
              );
            })}
            {!readOnly && <TableHead className="w-24" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={14} className="text-muted-foreground">
                No projects yet.
              </TableCell>
            </TableRow>
          )}
          {data.projects.length > 0 && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={14} className="text-muted-foreground">
                No projects match your filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((p) => {
            const place = [p.city, p.state].filter(Boolean).join(", ");
            return (
              <TableRow key={p.id}>
                <TableCell>{p.cmic_job_number ?? ""}</TableCell>
                <TableCell>
                  <div className="font-medium">{p.name}</div>
                </TableCell>
                <TableCell>{place}</TableCell>
                <TableCell>{nameOf(data.pms, p.pm_id)}</TableCell>
                <TableCell>{nameOf(data.contractors, p.contractor_id)}</TableCell>
                <TableCell>{nameOf(data.crews, p.crew_id)}</TableCell>
                <TableCell>
                  {readOnly ? (
                    <Badge variant="secondary">{p.status}</Badge>
                  ) : (
                    <Select
                      value={p.status}
                      onValueChange={(v) => changeStatus(p, v)}
                      disabled={busy}
                    >
                      <SelectTrigger className="h-8 w-36" aria-label={`Status of ${p.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NP_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-right">{formatPercent(p.progress)}</TableCell>
                <TableCell className="text-right">
                  {formatPercent(computePace(p.est_start, p.est_end, today))}
                </TableCell>
                <TableCell>{p.est_start ?? ""}</TableCell>
                <TableCell>{p.est_end ?? ""}</TableCell>
                <TableCell>{p.deadline ?? ""}</TableCell>
                <TableCell className="text-right">
                  {p.est_revenue === null ? "" : money.format(p.est_revenue)}
                </TableCell>
                {!readOnly && (
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => openForm(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => setDeleting(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!readOnly && (
        <>
          <Dialog open={formOpen} onOpenChange={setFormOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editing ? "Edit project" : "Add project"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="np-p-name">Project name</Label>
                  <Input
                    id="np-p-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-cmic">CMiC Job #</Label>
                  <Input
                    id="np-p-cmic"
                    value={form.cmic_job_number}
                    onChange={(e) => setForm({ ...form, cmic_job_number: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-tag">Tag</Label>
                  <Input
                    id="np-p-tag"
                    value={form.tag}
                    onChange={(e) => setForm({ ...form, tag: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="np-p-address">Address</Label>
                  <Input
                    id="np-p-address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-city">City</Label>
                  <Input
                    id="np-p-city"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-state">State</Label>
                  <Input
                    id="np-p-state"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>PM</Label>
                  <Select value={form.pm_id} onValueChange={(v) => setForm({ ...form, pm_id: v })}>
                    <SelectTrigger aria-label="PM">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {data.pms.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as NpStatus })}
                  >
                    <SelectTrigger aria-label="Status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NP_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Contractor</Label>
                  <Select
                    value={form.contractor_id}
                    onValueChange={(v) => {
                      const keep = crewOptions(data.crews, orNull(v)).some(
                        (c) => c.id === form.crew_id,
                      );
                      setForm({ ...form, contractor_id: v, crew_id: keep ? form.crew_id : NONE });
                    }}
                  >
                    <SelectTrigger aria-label="Contractor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {formContractors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Crew</Label>
                  <Select
                    value={form.crew_id}
                    onValueChange={(v) => setForm({ ...form, crew_id: v })}
                    disabled={!formContractorId}
                  >
                    <SelectTrigger aria-label="Crew">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {formCrews.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.is_active ? "" : " (inactive)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!formContractorId && (
                    <p className="text-xs text-muted-foreground">Choose a contractor first</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-progress">Progress (%)</Label>
                  <Input
                    id="np-p-progress"
                    inputMode="decimal"
                    value={form.progress}
                    onChange={(e) => setForm({ ...form, progress: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-revenue">Est Revenue</Label>
                  <Input
                    id="np-p-revenue"
                    type="number"
                    step="0.01"
                    value={form.est_revenue}
                    onChange={(e) => setForm({ ...form, est_revenue: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-start">Est Start</Label>
                  <Input
                    id="np-p-start"
                    type="date"
                    value={form.est_start}
                    onChange={(e) => setForm({ ...form, est_start: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-end">Est End</Label>
                  <Input
                    id="np-p-end"
                    type="date"
                    value={form.est_end}
                    onChange={(e) => setForm({ ...form, est_end: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-p-deadline">Deadline</Label>
                  <Input
                    id="np-p-deadline"
                    type="date"
                    value={form.deadline}
                    onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="np-p-notes">Notes</Label>
                  <Textarea
                    id="np-p-notes"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="np-p-exclude"
                    checked={form.exclude_revenue}
                    onCheckedChange={(v) => setForm({ ...form, exclude_revenue: v })}
                  />
                  <Label htmlFor="np-p-exclude">Exclude revenue</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="np-p-bonus"
                    checked={form.bonus_eligible}
                    onCheckedChange={(v) => setForm({ ...form, bonus_eligible: v })}
                  />
                  <Label htmlFor="np-p-bonus">Bonus eligible</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={busy || !form.name.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmDelete();
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
