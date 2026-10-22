import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { useMyRoles } from "@/lib/roles";
import { nationalPaintPageLabel } from "@/lib/header-menu";

export const Route = createFileRoute("/national-paint")({
  head: () => ({
    meta: [
      { title: "National Paint — FCP Connect" },
      { property: "og:title", content: "National Paint — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <NationalPaintLayout />
    </RequireAuth>
  ),
});

const linkClass =
  "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const activeProps = { className: "bg-secondary text-primary font-medium" };

function NationalPaintLayout() {
  const { can, isAdmin, loading } = useMyRoles();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">Loading…</div>;
  }
  if (!can.can_manage_national_paint) {
    return (
      <main className="mx-auto max-w-6xl px-3 py-6">
        <p className="text-muted-foreground">You don't have access to National Paint.</p>
      </main>
    );
  }
  const pageLabel = nationalPaintPageLabel(pathname);
  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <h1 className={`text-2xl font-semibold md:mb-4 ${pageLabel ? "" : "mb-4"}`}>
        National Paint
      </h1>
      {pageLabel && (
        <p className="mb-4 mt-0.5 text-sm text-muted-foreground md:hidden">{pageLabel}</p>
      )}
      <nav
        aria-label="National Paint"
        className="mb-6 hidden flex-wrap gap-1 border-b pb-2 md:flex"
      >
        <Link
          to="/national-paint"
          className={linkClass}
          activeOptions={{ exact: true }}
          activeProps={activeProps}
        >
          Projects
        </Link>
        <Link to="/national-paint/people" className={linkClass} activeProps={activeProps}>
          People and crews
        </Link>
        <Link to="/national-paint/timeline" className={linkClass} activeProps={activeProps}>
          Project Timeline
        </Link>
        <Link to="/national-paint/capacity" className={linkClass} activeProps={activeProps}>
          Crew Capacity
        </Link>
        <Link to="/national-paint/revenue" className={linkClass} activeProps={activeProps}>
          Revenue
        </Link>
        <Link to="/national-paint/dashboard" className={linkClass} activeProps={activeProps}>
          Dashboard
        </Link>
        <Link to="/national-paint/finance" className={linkClass} activeProps={activeProps}>
          Finance
        </Link>
        <Link
          to="/national-paint/analysis"
          search={{ job: undefined }}
          className={linkClass}
          activeProps={activeProps}
        >
          Project Analysis
        </Link>
        <Link to="/national-paint/cmic" className={linkClass} activeProps={activeProps}>
          CMiC
        </Link>
        {isAdmin && (
          <Link to="/national-paint/import" className={linkClass} activeProps={activeProps}>
            Import
          </Link>
        )}
      </nav>
      <Outlet />
    </main>
  );
}
