import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_PHASES, PROJECT_STATUSES, DIVISIONS } from "@/lib/project-meta";

export type ProjectFormValues = {
  name: string;
  customer: string;
  address: string;
  division: string;
  owner_id: string;
  status: string;
  phase: string;
  cmic_number: string;
  notes: string;
};

export const emptyProject: ProjectFormValues = {
  name: "", customer: "", address: "", division: "", owner_id: "",
  status: "Active", phase: "", cmic_number: "", notes: "",
};

type Person = { id: string; display_name: string | null; email: string | null };

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectForm({
  value, onChange, people, saving, onSave, onCancel,
}: {
  value: ProjectFormValues;
  onChange: (v: ProjectFormValues) => void;
  people: Person[];
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<ProjectFormValues>) => onChange({ ...value, ...patch });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <div>
        <Label htmlFor="p-name">Project name *</Label>
        <Input id="p-name" required value={value.name} onChange={(e) => set({ name: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="p-customer">Customer name *</Label>
        <Input id="p-customer" required value={value.customer} onChange={(e) => set({ customer: e.target.value })} />
      </div>
      <div>
        <Label htmlFor="p-address">Project address</Label>
        <Input id="p-address" value={value.address} onChange={(e) => set({ address: e.target.value })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="p-division">Division</Label>
          <select id="p-division" className={selectClass} value={value.division} onChange={(e) => set({ division: e.target.value })}>
            <option value="">—</option>
            {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="p-owner">Project manager / owner</Label>
          <select id="p-owner" className={selectClass} value={value.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
            <option value="">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.display_name || p.email}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="p-status">Status *</Label>
          <select id="p-status" className={selectClass} value={value.status} onChange={(e) => set({ status: e.target.value })}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="p-phase">Current phase</Label>
          <select id="p-phase" className={selectClass} value={value.phase} onChange={(e) => set({ phase: e.target.value })}>
            <option value="">—</option>
            {PROJECT_PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="p-cmic">CMiC project number (optional)</Label>
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
