import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { DIVISIONS } from "@/lib/project-meta";

export function DivisionSelect({
  value, onChange, id = "p-divisions", allowed,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  id?: string;
  /** Divisions this person may choose. Omit for no restriction. */
  allowed?: string[];
}) {
  const toggle = (d: string) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d]);

  const options = (allowed ?? (DIVISIONS as readonly string[])).filter((d) =>
    (DIVISIONS as readonly string[]).includes(d),
  );

  return (
    <div>
      <Label htmlFor={id}>Divisions *</Label>
      <div id={id} className="rounded-md border border-input bg-background p-2">
        {options.length === 0 && (
          <p className="px-2 py-1 text-sm text-muted-foreground">
            No divisions are assigned to you yet — ask an administrator to assign one.
          </p>
        )}
        <div className="grid gap-1 sm:grid-cols-2">
          {options.map((d) => (
            <label
              key={d}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={value.includes(d)}
                onChange={() => toggle(d)}
              />
              <span>{d}</span>
            </label>
          ))}
        </div>
        {value.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t pt-2">
            {value.map((d) => (
              <Badge key={d} variant="secondary" className="gap-1">
                {d}
                <button
                  type="button"
                  aria-label={`Remove ${d}`}
                  onClick={() => toggle(d)}
                  className="rounded-full p-0.5 hover:bg-background"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      {value.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Select at least one division.</p>
      )}
    </div>
  );
}
