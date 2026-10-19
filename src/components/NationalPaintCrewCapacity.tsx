import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { NP_STATUSES } from "@/lib/national-paint-import";
import {
  CAPACITY_DAYS,
  coversDay,
  crewDayStates,
  groupRuns,
  orderCrews,
  overlapDays,
  percentBusy,
  type CapacityCrew,
  type CapacityProject,
} from "@/lib/national-paint-capacity";
import { formatPercent, isoToDay, todayIso } from "@/lib/national-paint-projects";
import { STATUS_COLORS, addDays, timelineDays } from "@/lib/national-paint-timeline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAY_W = 22;
const NAME_W = "w-48";
const STRIPE = "bg-[#D9E2F3] dark:bg-slate-800";
const UNAVAILABLE = "#A6A6A6";
const OVERLAP = "#C00000";

type Named = { id: string; name: string };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function loadCapacity() {
  const [crews, contractors, projects] = await Promise.all([
    supabase
      .from("np_crews")
      .select("id, name, contractor_id, owner_name, crew_type, size, is_active"),
    supabase.from("np_contractors").select("id, name"),
    supabase.from("np_projects").select("id, name, crew_id, status, est_start, est_end"),
  ]);
  const failed = [crews, contractors, projects].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    crews: (crews.data ?? []) as CapacityCrew[],
    contractors: (contractors.data ?? []) as Named[],
    projects: (projects.data ?? []) as CapacityProject[],
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

export function NationalPaintCrewCapacity() {
  const today = todayIso();
  const [referenceInput, setReferenceInput] = useState(today);
  const [throughInput, setThroughInput] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["np-capacity"], queryFn: loadCapacity });

  const reference = isValidIso(referenceInput) ? referenceInput : today;
  const defaultThrough = addDays(reference, CAPACITY_DAYS - 1);
  const through = throughInput !== null && isValidIso(throughInput) ? throughInput : defaultThrough;
  const days = useMemo(() => timelineDays(reference, CAPACITY_DAYS), [reference]);
  const todayIndex = days.findIndex((d) => d.iso === today);
  const data = q.data;

  const rows = useMemo(() => {
    if (!data) return [];
    const contractorName = (id: string | null) => data.contractors.find((c) => c.id === id)?.name;
    return orderCrews(data.crews, contractorName).map((crew) => {
      const own = data.projects.filter((p) => p.crew_id === crew.id);
      return {
        crew,
        contractor: contractorName(crew.contractor_id),
        own,
        states: crewDayStates(crew, own, reference),
        busy: percentBusy(crew, own, reference, through),
        overlaps: overlapDays(crew, own, reference, through),
      };
    });
  }, [data, reference, through]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !data) return <p className="text-destructive">{errMsg(q.error)}</p>;

  const overlapCrews = rows.filter((r) => r.overlaps > 0).length;
  const gridW = days.length * DAY_W;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="np-cap-ref">Reference date</Label>
          <Input
            id="np-cap-ref"
            type="date"
            className="w-40"
            value={referenceInput}
            onChange={(e) => setReferenceInput(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="np-cap-through">Through</Label>
          <Input
            id="np-cap-through"
            type="date"
            className="w-40"
            value={throughInput ?? defaultThrough}
            onChange={(e) => setThroughInput(e.target.value)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {overlapCrews} {overlapCrews === 1 ? "crew has" : "crews have"} overlapping work
        </p>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {NP_STATUSES.filter((s) => s !== "Completed").map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-5 border border-black"
              style={{ backgroundColor: STATUS_COLORS[s].fill ?? "transparent" }}
            />
            {s}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-5 border border-black"
            style={{ backgroundColor: UNAVAILABLE }}
          />
          Unavailable
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-5 border-2 bg-background"
            style={{ borderColor: OVERLAP }}
          />
          Overlap
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Busy = Scheduled or In Progress. % Busy and overlaps cover the reference date through the
        Through date.
      </p>
      {data.crews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No crews yet.{" "}
          <Link to="/national-paint/people" className="underline">
            Add crews on the People page
          </Link>
          .
        </p>
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
            {rows.map(({ crew, contractor, own, states, busy, overlaps }, i) => {
              const bg = i % 2 === 0 ? STRIPE : "bg-background";
              const inactive = !crew.is_active;
              const detail = [
                crew.crew_type,
                contractor,
                crew.owner_name,
                crew.size !== null ? `Size ${crew.size}` : null,
                inactive ? "Inactive" : "Active",
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <div key={crew.id} className={`flex ${bg}`}>
                  <div
                    className={`sticky left-0 z-10 shrink-0 px-2 py-1 ${NAME_W} ${
                      inactive ? "bg-[#D9D9D9] text-[#7F7F7F]" : bg
                    }`}
                  >
                    <div
                      className="truncate text-sm font-medium"
                      title={`${crew.name} ${formatPercent(busy)}`}
                    >
                      {crew.name} · {formatPercent(busy)}
                    </div>
                    <div
                      className={`truncate text-xs ${inactive ? "" : "text-muted-foreground"}`}
                      title={detail}
                    >
                      {detail}
                    </div>
                    {overlaps > 0 && (
                      <div className="truncate text-xs text-destructive">
                        {overlaps} overlap {overlaps === 1 ? "day" : "days"}
                      </div>
                    )}
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
                    {groupRuns(states).map((run) => {
                      const names = own
                        .filter(
                          (p) =>
                            p.status !== "Completed" &&
                            days
                              .slice(run.startIndex, run.endIndex + 1)
                              .some((d) => coversDay(p, d.iso)),
                        )
                        .map((p) => p.name);
                      const title =
                        run.status === "Unavailable"
                          ? "Unavailable"
                          : `${run.status}: ${names.join(", ")}`;
                      return (
                        <div
                          key={run.startIndex}
                          className="absolute inset-y-2 border border-black"
                          style={{
                            left: run.startIndex * DAY_W,
                            width: (run.endIndex - run.startIndex + 1) * DAY_W,
                            backgroundColor:
                              run.status === "Unavailable"
                                ? UNAVAILABLE
                                : (STATUS_COLORS[run.status].fill ?? "transparent"),
                          }}
                          title={title}
                        />
                      );
                    })}
                    {states.map((s, di) =>
                      s.overlap ? (
                        <div
                          key={di}
                          className="pointer-events-none absolute inset-y-2.5 border-2"
                          style={{ left: di * DAY_W, width: DAY_W, borderColor: OVERLAP }}
                        />
                      ) : null,
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
