import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { NP_STATUSES } from "@/lib/national-paint-import";
import { isoToDay, todayIso } from "@/lib/national-paint-projects";
import {
  STATUS_COLORS,
  barSpan,
  timelineDays,
  timelineRows,
  type TimelineRow,
} from "@/lib/national-paint-timeline";
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

const ALL = "all";
const DAY_W = 22;
const NAME_W = "w-48";
const STRIPE = "bg-[#D9E2F3] dark:bg-slate-800";

type Named = { id: string; name: string };

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function loadTimeline() {
  const [projects, pms] = await Promise.all([
    supabase.from("np_projects").select("id, name, pm_id, status, est_start, est_end"),
    supabase.from("np_pms").select("id, name"),
  ]);
  const failed = [projects, pms].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    projects: (projects.data ?? []) as TimelineRow[],
    pms: ((pms.data ?? []) as Named[]).sort(byName),
  };
}

function isValidIso(v: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    new Date(isoToDay(v) * 86_400_000).toISOString().slice(0, 10) === v
  );
}

/** M/D from an ISO date. */
const shortDate = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

export function NationalPaintTimeline() {
  const today = todayIso();
  const [showCompleted, setShowCompleted] = useState(false);
  const [referenceInput, setReferenceInput] = useState(today);
  const [pmId, setPmId] = useState(ALL);
  const q = useQuery({ queryKey: ["np-timeline"], queryFn: loadTimeline });

  const reference = isValidIso(referenceInput) ? referenceInput : today;
  const days = useMemo(() => timelineDays(reference), [reference]);
  const todayIndex = days.findIndex((d) => d.iso === today);
  const data = q.data;
  const rows = useMemo(
    () => (data ? timelineRows(data.projects, { showCompleted, pmId }) : []),
    [data, showCompleted, pmId],
  );

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !data) return <p className="text-destructive">{errMsg(q.error)}</p>;

  const pmName = (id: string | null) => data.pms.find((p) => p.id === id)?.name;
  const range = (r: TimelineRow) =>
    `${r.est_start ?? "no start date"} - ${r.est_end ?? "no end date"}`;
  const gridW = days.length * DAY_W;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex h-9 items-center gap-2">
          <Switch id="np-tl-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
          <Label htmlFor="np-tl-completed">Show completed</Label>
        </div>
        <div className="space-y-1">
          <Label htmlFor="np-tl-ref">Reference date</Label>
          <Input
            id="np-tl-ref"
            type="date"
            className="w-40"
            value={referenceInput}
            onChange={(e) => setReferenceInput(e.target.value)}
          />
        </div>
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
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "project" : "projects"}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Dates are edited on the{" "}
        <Link to="/national-paint" className="underline">
          Projects page
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {NP_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-5 border border-black"
              style={{ backgroundColor: STATUS_COLORS[s].fill ?? "transparent" }}
            />
            {s}
          </span>
        ))}
      </div>
      {data.projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects yet.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects match.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <div style={{ width: `calc(12rem + ${gridW}px)` }}>
            <div className="flex border-b">
              <div className={`sticky left-0 z-20 shrink-0 bg-background ${NAME_W}`} />
              <div className="flex" style={{ width: gridW }}>
                {days.map((d) => (
                  <div
                    key={d.iso}
                    className={`shrink-0 text-center text-[10px] leading-4 ${
                      d.isMonthStart ? "border-l border-foreground/40" : ""
                    }`}
                    style={{ width: DAY_W }}
                  >
                    <div className="h-4 overflow-visible whitespace-nowrap text-left font-medium">
                      {d.isWeekStart ? shortDate(d.iso) : ""}
                    </div>
                    <div className="text-muted-foreground">{d.dayOfMonth}</div>
                  </div>
                ))}
              </div>
            </div>
            {rows.map((r, i) => {
              const span = barSpan(r.est_start, r.est_end, reference);
              const fill = STATUS_COLORS[r.status].fill;
              const bg = i % 2 === 0 ? STRIPE : "bg-background";
              return (
                <div key={r.id} className={`flex ${bg}`}>
                  <div className={`sticky left-0 z-10 shrink-0 px-2 py-1 ${NAME_W} ${bg}`}>
                    <div className="truncate text-sm font-medium" title={r.name}>
                      {r.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {[pmName(r.pm_id), range(r)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div className="relative" style={{ width: gridW }}>
                    {days.map((d, di) =>
                      d.isMonthStart ? (
                        <div
                          key={d.iso}
                          className="absolute inset-y-0 border-l border-foreground/20"
                          style={{ left: di * DAY_W }}
                        />
                      ) : null,
                    )}
                    {todayIndex >= 0 && (
                      <div
                        className="absolute inset-y-0 border-x"
                        style={{ left: todayIndex * DAY_W, width: DAY_W, borderColor: "#002060" }}
                      />
                    )}
                    {span && (
                      <div
                        className="absolute inset-y-2 border border-black"
                        style={{
                          left: span.startIndex * DAY_W,
                          width: (span.endIndex - span.startIndex + 1) * DAY_W,
                          backgroundColor: fill ?? "transparent",
                        }}
                        title={`${r.name} (${r.status}): ${range(r)}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
