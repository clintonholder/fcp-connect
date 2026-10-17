import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProxy } from "@/lib/proxy-context";
import { adminEndProxy } from "@/lib/admin.functions";
import { workerTypeLabel } from "@/lib/worker-type";

/** Sticky reminder that an administrator is seeing the site through someone else's account. */
export function ViewAsBanner() {
  const { proxy, setProxy, readOnly } = useProxy();
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!proxy) return null;

  const roleLabel = proxy.roles.map((r) => r.name).join(", ") || "No role";
  const divLabel = proxy.divisions.length ? ` · ${proxy.divisions.join(", ")}` : "";
  // Sessions started before worker types existed have no workerType stored.
  const workerLabel = proxy.workerType
    ? ` · ${workerTypeLabel({ workerType: proxy.workerType, subcontractorName: proxy.subcontractorName ?? null })}`
    : "";

  return (
    <div className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-500/15 text-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <Eye className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            Viewing as <span className="font-semibold">{proxy.name}</span>{" "}
            <span className="text-muted-foreground">
              ({roleLabel}
              {divLabel}
              {workerLabel})
            </span>
            {readOnly && <span className="font-semibold"> · Read-only</span>}
          </span>
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try { await adminEndProxy({ data: { userId: proxy.userId } }); } catch { /* still exit */ }
            setProxy(null);
            qc.invalidateQueries();
            navigate({ to: "/admin" });
          }}
        >
          Exit view
        </Button>
      </div>
    </div>
  );
}
