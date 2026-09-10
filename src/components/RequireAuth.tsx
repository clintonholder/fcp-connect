import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) {
      const { pathname, search } = window.location;
      const target = pathname + (search ? `?${search.slice(1)}` : "");
      navigate({ to: "/login", search: { redirect: target } });
    }
  }, [user, loading, navigate]);
  if (loading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}
