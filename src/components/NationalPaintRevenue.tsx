import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayIso } from "@/lib/national-paint-projects";
import {
  MONTH_NAMES,
  moneyWhole,
  distributedTotal,
  monthlyRevenue,
  pmRevenue,
  scheduledByMonth,
  type PmRevenueGroup,
  type RevenueProject,
} from "@/lib/national-paint-revenue";
import { NationalPaintYearSelect } from "@/components/NationalPaintYearSelect";

type ProjectRow = RevenueProject & { id: string; name: string };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function loadRevenue() {
  const [projects, pms] = await Promise.all([
    supabase
      .from("np_projects")
      .select("id, name, pm_id, status, est_start, est_end, est_revenue, exclude_revenue"),
    supabase.from("np_pms").select("id, name"),
  ]);
  const failed = [projects, pms].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    projects: (projects.data ?? []) as ProjectRow[],
    pms: pms.data ?? [],
  };
}

const th = "px-2 py-1.5 text-right font-medium whitespace-nowrap";
const td = "px-2 py-1 text-right whitespace-nowrap";
const stickyHead =
  "sticky left-0 z-10 bg-muted px-2 py-1.5 text-left font-medium whitespace-nowrap";

export function NationalPaintRevenue() {
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const q = useQuery({ queryKey: ["np-revenue-projects"], queryFn: loadRevenue });
  const data = q.data;

  const pivot = useMemo(
    () => (data ? pmRevenue(data.projects, data.pms, year) : null),
    [data, year],
  );
  const perProject = useMemo(() => {
    if (!data) return [];
    return data.projects
      .map((p) => ({ p, months: monthlyRevenue(p, year) }))
      .filter((r) => distributedTotal(r.months) !== 0)
      .sort((a, b) => a.p.name.toLowerCase().localeCompare(b.p.name.toLowerCase()));
  }, [data, year]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.error || !data || !pivot) return <p className="text-destructive">{errMsg(q.error)}</p>;

  const pmName = (id: string | null) => data.pms.find((p) => p.id === id)?.name ?? "No PM";
  const scheduled = scheduledByMonth(data.projects, year);

  return (
    <div className="space-y-8">
      <NationalPaintYearSelect
        id="np-rev-year"
        year={year}
        onChange={setYear}
        thisYear={thisYear}
      />

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">PM Revenue</h2>
        {pivot.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className={stickyHead}>PM / Status</th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className={th}>
                      {m}
                    </th>
                  ))}
                  <th className={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pivot.groups.map((g) => (
                  <PmGroup key={g.pmId ?? "none"} group={g} />
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="sticky left-0 z-10 bg-background px-2 py-1">Grand total</td>
                  {pivot.grand.months.map((v, i) => (
                    <td key={i} className={td}>
                      {moneyWhole.format(v)}
                    </td>
                  ))}
                  <td className={td}>{moneyWhole.format(pivot.grand.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Project revenue by month</h2>
        <p className="text-sm text-muted-foreground">
          Est Revenue is spread over calendar days from Est Start to Est End inclusive. Only Verbal
          Award, Upcoming, Scheduled, In Progress and Completed projects count; Exclude Revenue and
          projects missing a date or revenue count as 0. The share outside {year} is dropped.
        </p>
        {perProject.length === 0 ? (
          <p className="text-sm text-muted-foreground">No project revenue in {year}.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className={stickyHead}>Project</th>
                  <th className={`${th} text-left`}>PM</th>
                  <th className={`${th} text-left`}>Status</th>
                  <th className={th}>Est Revenue</th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className={th}>
                      {m}
                    </th>
                  ))}
                  <th className={th}>Distributed Total</th>
                </tr>
              </thead>
              <tbody>
                {perProject.map(({ p, months }) => (
                  <tr key={p.id} className="border-t">
                    <td className="sticky left-0 z-10 max-w-48 truncate bg-background px-2 py-1">
                      {p.name}
                    </td>
                    <td className={`${td} text-left`}>{pmName(p.pm_id)}</td>
                    <td className={`${td} text-left`}>{p.status}</td>
                    <td className={td}>
                      {p.est_revenue === null ? "" : moneyWhole.format(p.est_revenue)}
                    </td>
                    {months.map((v, i) => (
                      <td key={i} className={td}>
                        {moneyWhole.format(v)}
                      </td>
                    ))}
                    <td className={`${td} font-medium`}>
                      {moneyWhole.format(distributedTotal(months))}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="sticky left-0 z-10 bg-background px-2 py-1">Total</td>
                  <td />
                  <td />
                  <td />
                  {scheduled.map((v, i) => (
                    <td key={i} className={td}>
                      {moneyWhole.format(v)}
                    </td>
                  ))}
                  <td className={td}>{moneyWhole.format(distributedTotal(scheduled))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PmGroup({ group }: { group: PmRevenueGroup }) {
  return (
    <>
      <tr className="border-t bg-secondary/50 font-medium">
        <td className="sticky left-0 z-10 whitespace-nowrap bg-secondary px-2 py-1">
          {group.name}
        </td>
        {group.months.map((v, i) => (
          <td key={i} className={td}>
            {moneyWhole.format(v)}
          </td>
        ))}
        <td className={td}>{moneyWhole.format(group.total)}</td>
      </tr>
      {group.statuses.map((s) => (
        <tr key={s.status} className="border-t">
          <td className="sticky left-0 z-10 whitespace-nowrap bg-background py-1 pl-6 pr-2">
            {s.status}
          </td>
          {s.months.map((v, i) => (
            <td key={i} className={td}>
              {moneyWhole.format(v)}
            </td>
          ))}
          <td className={td}>{moneyWhole.format(s.total)}</td>
        </tr>
      ))}
    </>
  );
}
