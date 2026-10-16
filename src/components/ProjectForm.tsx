import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DivisionSelect } from "@/components/DivisionSelect";
import { TagInput } from "@/components/TagInput";
import { useMyRoles } from "@/lib/roles";
import { DIVISIONS, DIVISION_LOCK_MSG } from "@/lib/project-meta";

export type ProjectFormValues = {
  name: string;
  owner: string;
  customer: string;
  address: string;
  divisions: string[];
  tags: string[];
  owner_id: string;
  cmic_number: string;
  notes: string;
};

export const emptyProject: ProjectFormValues = {
  name: "", owner: "", customer: "", address: "", divisions: [], tags: [], owner_id: "",
  cmic_number: "", notes: "",
};

type Person = { id: string; display_name: string | null; email: string | null };

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectForm({
  value, onChange, people, saving, onSave, onCancel, canEditDivisions = true,
}: {
  value: ProjectFormValues;
  onChange: (v: ProjectFormValues) => void;
  people: Person[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** Only the project manager, creator or an admin may change divisions. */
  canEditDivisions?: boolean;
}) {
  const set = (patch: Partial<ProjectFormValues>) => onChange({ ...value, ...patch });
  const { isAdmin, myDivisions } = useMyRoles();
  // Admins work in any division; everyone else only in the ones assigned to them.
  const allowed = isAdmin ? (DIVISIONS as readonly string[]).slice() : myDivisions;
  const outOfScope = canEditDivisions && !isAdmin && value.divisions.some((d) => !myDivisions.includes(d));

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!outOfScope) onSave(); }}>
      {outOfScope && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
          {DIVISION_LOCK_MSG}
        </p>
      )}
      <div>
        <Label htmlFor="p-name">Project name *</Label>
        <Input id="p-name" required value={value.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="p-owner-name">Owner *</Label>
        <Input id="p-owner-name" required value={value.owner} onChange={(e) => set({ owner: e.target.value })} />
        <p className="mt-1 text-xs text-muted-foreground">The building owner, e.g. Target. Required.</p>
      </div>
      <div>
        <Label htmlFor="p-customer">Customer name *</Label>
        <Input id="p-customer" required value={value.customer} onChange={(e) => set({ customer: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="p-address">Project address</Label>
        <Input id="p-address" value={value.address} onChange={(e) => set({ address: e.target.value })} />
      </div>
      {canEditDivisions ? (
        <DivisionSelect value={value.divisions} allowed={allowed} onChange={(divisions) => set({ divisions })} />
      ) : (
        <div>
          <Label>Divisions</Label>
          <div className="rounded-md border border-input bg-muted/40 p-2">
            <div className="flex flex-wrap gap-1">
              {value.divisions.length === 0
                ? <span className="text-sm text-muted-foreground">None</span>
                : value.divisions.map((d) => <Badge key={d} variant="secondary">{d}</Badge>)}
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Only the project manager, the project creator or an administrator can change divisions.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-owner">Project manager</Label>
          <select id="p-owner" className={selectClass} value={value.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
            <option value="">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.display_name || p.email}</option>)}
          </select>
        </div>
      </div>
      <TagInput value={value.tags} onChange={(tags) => set({ tags })} />
      <div>
        <Label htmlFor="p-cmic">CMiC project number</Label>
        <Input id="p-cmic" value={value.cmic_number} onChange={(e) => set({ cmic_number: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="p-notes">Notes</Label>
        <Textarea id="p-notes" value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
