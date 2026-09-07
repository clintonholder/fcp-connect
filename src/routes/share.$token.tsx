import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, Building2, Camera } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  component: SharedJobPage,
});

type SharedData = {
  job: { id: string; name: string; address?: string | null; client?: string | null; notes?: string | null };
  areas: { id: string; name: string }[];
  photos: {
    id: string; area_id: string; image_url: string; annotated_image_url: string | null;
    caption: string | null; tags: string[] | null;
    latitude: number | null; longitude: number | null; taken_at: string;
  }[];
};

function SharedJobPage() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-job", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_shared_job", { _token: token });
      if (error) throw error;
      return data as unknown as SharedData | null;
    },
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  if (error || !data) return <div className="p-8 text-center text-muted-foreground">This share link is invalid or expired.</div>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 border-b pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-3 w-3" />Shared project report</div>
        <h1 className="text-2xl font-bold sm:text-3xl mt-1">{data.job.name}</h1>
        {data.job.client && <p className="text-sm text-muted-foreground">Customer: {data.job.client}</p>}
        {data.job.address && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" />{data.job.address}</p>}
        <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1"><Camera className="h-3 w-3" />{data.photos.length} photos</p>
      </header>

      <div className="space-y-6">
        {data.areas.map((a) => {
          const ph = data.photos.filter((p) => p.area_id === a.id);
          if (ph.length === 0) return null;
          return (
            <Card key={a.id}>
              <CardContent className="p-4">
                <h2 className="font-semibold mb-3">{a.name} <span className="text-xs text-muted-foreground">({ph.length})</span></h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {ph.map((p) => (
                    <a key={p.id} href={p.annotated_image_url ?? p.image_url} target="_blank" rel="noreferrer" className="block">
                      <img src={p.annotated_image_url ?? p.image_url} alt={p.caption ?? a.name}
                        className="aspect-square w-full object-cover rounded-md border" loading="lazy" />
                      {p.caption && <p className="text-xs mt-1 truncate">{p.caption}</p>}
                      {(p.tags?.length ?? 0) > 0 && <p className="text-[10px] text-muted-foreground truncate">#{p.tags!.join(" #")}</p>}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <footer className="mt-8 text-center text-xs text-muted-foreground">Powered by FCP Connect</footer>
    </div>
  );
}
