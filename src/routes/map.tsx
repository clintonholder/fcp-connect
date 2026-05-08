import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { MapPin } from "lucide-react";

const PhotoMap = lazy(() => import("@/components/PhotoMap"));

export const Route = createFileRoute("/map")({
  component: () => <RequireAuth><MapPage /></RequireAuth>,
});

function MapPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data } = useQuery({
    queryKey: ["all-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("photos")
        .select("id,image_url,caption,latitude,longitude,taken_at,jobs(name),areas(name)")
        .not("latitude", "is", null);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <MapPin className="h-6 w-6 text-accent-foreground" />Photo Map
        </h1>
        <p className="text-sm text-muted-foreground">{data?.length ?? 0} geotagged photos</p>
      </div>
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-card)]" style={{ height: "70vh" }}>
        {mounted ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-muted-foreground">Loading map…</div>}>
            <PhotoMap photos={(data ?? []) as Parameters<typeof PhotoMap>[0]["photos"]} />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
}
