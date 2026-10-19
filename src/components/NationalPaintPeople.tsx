import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProxy } from "@/lib/proxy-context";
import { NP_CREW_TYPES } from "@/lib/national-paint-import";
import { inUseMessage, type MemberRole } from "@/lib/national-paint-people";
import {
  createNpContractor,
  createNpCrew,
  createNpCrewMember,
  createNpPm,
  deleteNpContractor,
  deleteNpCrew,
  deleteNpCrewMember,
  deleteNpPm,
  updateNpContractor,
  updateNpCrew,
  updateNpCrewMember,
  updateNpPm,
} from "@/lib/national-paint.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
const QUERY_KEY = ["np-people"];

type Named = { id: string; name: string };
type Crew = {
  id: string;
  name: string;
  contractor_id: string | null;
  owner_name: string | null;
  crew_type: string | null;
  size: number | null;
  is_active: boolean;
};
type Member = { id: string; crew_id: string; name: string; role: string };
type ProjectRef = {
  id: string;
  pm_id: string | null;
  contractor_id: string | null;
  crew_id: string | null;
};

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function loadPeople() {
  const [pms, contractors, crews, members, projects] = await Promise.all([
    supabase.from("np_pms").select("id, name"),
    supabase.from("np_contractors").select("id, name"),
    supabase
      .from("np_crews")
      .select("id, name, contractor_id, owner_name, crew_type, size, is_active"),
    supabase.from("np_crew_members").select("id, crew_id, name, role"),
    supabase.from("np_projects").select("id, pm_id, contractor_id, crew_id"),
  ]);
  const failed = [pms, contractors, crews, members, projects].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    pms: (pms.data ?? []).sort(byName) as Named[],
    contractors: (contractors.data ?? []).sort(byName) as Named[],
    crews: (crews.data ?? []).sort(byName) as Crew[],
    members: (members.data ?? []).sort(byName) as Member[],
    projects: (projects.data ?? []) as ProjectRef[],
  };
}

type NameTarget = { kind: "pm" | "contractor"; record: Named | null };
type DeleteTarget = { kind: "pm" | "contractor" | "crew" | "member"; id: string; name: string };
type MemberTarget = { crewId: string; record: Member | null };

export function NationalPaintPeople() {
  const { readOnly } = useProxy();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: QUERY_KEY, queryFn: loadPeople });

  const createPm = useServerFn(createNpPm);
  const updatePm = useServerFn(updateNpPm);
  const removePm = useServerFn(deleteNpPm);
  const createContractor = useServerFn(createNpContractor);
  const updateContractor = useServerFn(updateNpContractor);
  const removeContractor = useServerFn(deleteNpContractor);
  const createCrew = useServerFn(createNpCrew);
  const updateCrew = useServerFn(updateNpCrew);
  const removeCrew = useServerFn(deleteNpCrew);
  const createMember = useServerFn(createNpCrewMember);
  const updateMember = useServerFn(updateNpCrewMember);
  const removeMember = useServerFn(deleteNpCrewMember);

  const [busy, setBusy] = useState(false);
  const [nameTarget, setNameTarget] = useState<NameTarget | null>(null);
  const [nameValue, setNameValue] = useState("");
  const [crewOpen, setCrewOpen] = useState(false);
  const [crewEditing, setCrewEditing] = useState<Crew | null>(null);
  const [crewForm, setCrewForm] = useState({
    name: "",
    contractor_id: NONE,
    owner_name: "",
    crew_type: NONE,
    size: "",
    is_active: true,
  });
  const [memberTarget, setMemberTarget] = useState<MemberTarget | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState<MemberRole>("tech");
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const data = q.data;
  const counts = useMemo(() => {
    const projectsBy = (key: "pm_id" | "contractor_id" | "crew_id") => {
      const m = new Map<string, number>();
      for (const p of data?.projects ?? []) {
        const id = p[key];
        if (id) m.set(id, (m.get(id) ?? 0) + 1);
      }
      return m;
    };
    const crewsByContractor = new Map<string, number>();
    for (const c of data?.crews ?? []) {
      if (c.contractor_id) {
        crewsByContractor.set(c.contractor_id, (crewsByContractor.get(c.contractor_id) ?? 0) + 1);
      }
    }
    const membersByCrew = new Map<string, Member[]>();
    for (const m of data?.members ?? []) {
      membersByCrew.set(m.crew_id, [...(membersByCrew.get(m.crew_id) ?? []), m]);
    }
    return {
      pmProjects: projectsBy("pm_id"),
      contractorProjects: projectsBy("contractor_id"),
      crewProjects: projectsBy("crew_id"),
      crewsByContractor,
      membersByCrew,
    };
  }, [data]);

  const run = async (fn: () => Promise<unknown>, success: string, done: () => void) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(success);
      done();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const openName = (kind: NameTarget["kind"], record: Named | null) => {
    setNameTarget({ kind, record });
    setNameValue(record?.name ?? "");
  };

  const saveName = () => {
    if (!nameTarget) return;
    const { kind, record } = nameTarget;
    const label = kind === "pm" ? "PM" : "Contractor";
    const call = record
      ? () =>
          (kind === "pm" ? updatePm : updateContractor)({
            data: { id: record.id, name: nameValue },
          })
      : () => (kind === "pm" ? createPm : createContractor)({ data: { name: nameValue } });
    run(call, `${label} ${record ? "updated" : "added"}`, () => setNameTarget(null));
  };

  const openCrew = (crew: Crew | null) => {
    setCrewEditing(crew);
    setCrewForm({
      name: crew?.name ?? "",
      contractor_id: crew?.contractor_id ?? NONE,
      owner_name: crew?.owner_name ?? "",
      crew_type: crew?.crew_type ?? NONE,
      size: crew?.size === null || crew?.size === undefined ? "" : String(crew.size),
      is_active: crew?.is_active ?? true,
    });
    setCrewOpen(true);
  };

  const saveCrew = () => {
    const sizeText = crewForm.size.trim();
    const payload = {
      name: crewForm.name,
      contractor_id: crewForm.contractor_id === NONE ? null : crewForm.contractor_id,
      owner_name: crewForm.owner_name,
      crew_type: (crewForm.crew_type === NONE ? null : crewForm.crew_type) as
        (typeof NP_CREW_TYPES)[number] | null,
      size: sizeText === "" ? null : Number(sizeText),
      is_active: crewForm.is_active,
    };
    run(
      () =>
        crewEditing
          ? updateCrew({ data: { id: crewEditing.id, ...payload } })
          : createCrew({ data: payload }),
      `Crew ${crewEditing ? "updated" : "added"}`,
      () => setCrewOpen(false),
    );
  };

  const openMember = (crewId: string, record: Member | null) => {
    setMemberTarget({ crewId, record });
    setMemberName(record?.name ?? "");
    setMemberRole((record?.role as MemberRole) ?? "tech");
  };

  const saveMember = () => {
    if (!memberTarget) return;
    const { crewId, record } = memberTarget;
    run(
      () =>
        record
          ? updateMember({ data: { id: record.id, name: memberName, role: memberRole } })
          : createMember({ data: { crewId, name: memberName, role: memberRole } }),
      `Crew member ${record ? "updated" : "added"}`,
      () => setMemberTarget(null),
    );
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const { kind, id } = deleting;
    const fn = {
      pm: removePm,
      contractor: removeContractor,
      crew: removeCrew,
      member: removeMember,
    }[kind];
    run(
      () => fn({ data: { id } }),
      "Deleted",
      () => setDeleting(null),
    );
  };

  const deleteInfo = (() => {
    if (!deleting) return null;
    if (deleting.kind === "pm") {
      return { blocked: inUseMessage(counts.pmProjects.get(deleting.id) ?? 0), note: null };
    }
    if (deleting.kind === "contractor") {
      return {
        blocked: inUseMessage(
          counts.contractorProjects.get(deleting.id) ?? 0,
          counts.crewsByContractor.get(deleting.id) ?? 0,
        ),
        note: null,
      };
    }
    if (deleting.kind === "crew") {
      const members = counts.membersByCrew.get(deleting.id)?.length ?? 0;
      return {
        blocked: inUseMessage(counts.crewProjects.get(deleting.id) ?? 0),
        note: `This also deletes its ${members} crew ${members === 1 ? "member" : "members"}.`,
      };
    }
    return { blocked: null, note: null };
  })();

  const contractorName = (id: string | null) =>
    id ? (data?.contractors.find((c) => c.id === id)?.name ?? "None") : "None";

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !data) return <p className="text-destructive">{errMsg(q.error)}</p>;

  const nameList = (kind: "pm" | "contractor", rows: Named[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {kind === "contractor" && <TableHead className="text-right">Crews</TableHead>}
          <TableHead className="text-right">Projects</TableHead>
          {!readOnly && <TableHead className="w-24" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              None yet.
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>{r.name}</TableCell>
            {kind === "contractor" && (
              <TableCell className="text-right">
                {counts.crewsByContractor.get(r.id) ?? 0}
              </TableCell>
            )}
            <TableCell className="text-right">
              {(kind === "pm" ? counts.pmProjects : counts.contractorProjects).get(r.id) ?? 0}
            </TableCell>
            {!readOnly && (
              <TableCell className="text-right">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Rename ${r.name}`}
                  onClick={() => openName(kind, r)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${r.name}`}
                  onClick={() => setDeleting({ kind, id: r.id, name: r.name })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">PMs</CardTitle>
            {!readOnly && (
              <Button size="sm" onClick={() => openName("pm", null)}>
                <Plus className="mr-1 h-4 w-4" /> Add PM
              </Button>
            )}
          </CardHeader>
          <CardContent>{nameList("pm", data.pms)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-lg">Contractors</CardTitle>
            {!readOnly && (
              <Button size="sm" onClick={() => openName("contractor", null)}>
                <Plus className="mr-1 h-4 w-4" /> Add contractor
              </Button>
            )}
          </CardHeader>
          <CardContent>{nameList("contractor", data.contractors)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Crews</CardTitle>
          {!readOnly && (
            <Button size="sm" onClick={() => openCrew(null)}>
              <Plus className="mr-1 h-4 w-4" /> Add crew
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Contractor</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Projects</TableHead>
                {!readOnly && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.crews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
                    No crews yet.
                  </TableCell>
                </TableRow>
              )}
              {data.crews.map((c) => {
                const members = counts.membersByCrew.get(c.id) ?? [];
                const open = expanded.has(c.id);
                return (
                  <Fragment key={c.id}>
                    <TableRow>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`${open ? "Hide" : "Show"} members of ${c.name}`}
                          onClick={() => toggle(c.id)}
                        >
                          {open ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell>{contractorName(c.contractor_id)}</TableCell>
                      <TableCell>{c.owner_name ?? ""}</TableCell>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>{c.crew_type ?? ""}</TableCell>
                      <TableCell className="text-right">{c.size ?? ""}</TableCell>
                      <TableCell>
                        <Badge variant={c.is_active ? "default" : "secondary"}>
                          {c.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{members.length}</TableCell>
                      <TableCell className="text-right">
                        {counts.crewProjects.get(c.id) ?? 0}
                      </TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Edit ${c.name}`}
                            onClick={() => openCrew(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Delete ${c.name}`}
                            onClick={() => setDeleting({ kind: "crew", id: c.id, name: c.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                    {open && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={9}>
                          <div className="space-y-2 py-1">
                            <div className="text-sm font-medium">Members of {c.name}</div>
                            {members.length === 0 && (
                              <p className="text-sm text-muted-foreground">No members yet.</p>
                            )}
                            <ul className="space-y-1">
                              {members.map((m) => (
                                <li key={m.id} className="flex items-center gap-2 text-sm">
                                  <span className="flex-1">{m.name}</span>
                                  <Badge variant="outline">
                                    {m.role === "foreman" ? "Foreman" : "Tech"}
                                  </Badge>
                                  {!readOnly && (
                                    <>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Edit ${m.name}`}
                                        onClick={() => openMember(c.id, m)}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        aria-label={`Delete ${m.name}`}
                                        onClick={() =>
                                          setDeleting({ kind: "member", id: m.id, name: m.name })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                            {!readOnly && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMember(c.id, null)}
                              >
                                <Plus className="mr-1 h-4 w-4" /> Add member
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!readOnly && (
        <>
          <Dialog open={!!nameTarget} onOpenChange={(o) => !o && setNameTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {nameTarget?.record ? "Rename" : "Add"}{" "}
                  {nameTarget?.kind === "pm" ? "PM" : "contractor"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-1">
                <Label htmlFor="np-name">Name</Label>
                <Input
                  id="np-name"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNameTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={saveName} disabled={busy || !nameValue.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={crewOpen} onOpenChange={setCrewOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{crewEditing ? "Edit crew" : "Add crew"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Contractor</Label>
                  <Select
                    value={crewForm.contractor_id}
                    onValueChange={(v) => setCrewForm({ ...crewForm, contractor_id: v })}
                  >
                    <SelectTrigger aria-label="Contractor">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {data.contractors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-crew-owner">Owner</Label>
                  <Input
                    id="np-crew-owner"
                    value={crewForm.owner_name}
                    onChange={(e) => setCrewForm({ ...crewForm, owner_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-crew-name">Name</Label>
                  <Input
                    id="np-crew-name"
                    value={crewForm.name}
                    onChange={(e) => setCrewForm({ ...crewForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={crewForm.crew_type}
                    onValueChange={(v) => setCrewForm({ ...crewForm, crew_type: v })}
                  >
                    <SelectTrigger aria-label="Type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {NP_CREW_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="np-crew-size">Size</Label>
                  <Input
                    id="np-crew-size"
                    type="number"
                    min={0}
                    step={1}
                    value={crewForm.size}
                    onChange={(e) => setCrewForm({ ...crewForm, size: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="np-crew-active"
                    checked={crewForm.is_active}
                    onCheckedChange={(v) => setCrewForm({ ...crewForm, is_active: v })}
                  />
                  <Label htmlFor="np-crew-active">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCrewOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveCrew} disabled={busy || !crewForm.name.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!memberTarget} onOpenChange={(o) => !o && setMemberTarget(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{memberTarget?.record ? "Edit member" : "Add member"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="np-member-name">Name</Label>
                  <Input
                    id="np-member-name"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={memberRole} onValueChange={(v) => setMemberRole(v as MemberRole)}>
                    <SelectTrigger aria-label="Role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foreman">Foreman</SelectItem>
                      <SelectItem value="tech">Tech</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMemberTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={saveMember} disabled={busy || !memberName.trim()}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteInfo?.blocked ?? <>This cannot be undone. {deleteInfo?.note}</>}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy || !!deleteInfo?.blocked}
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
