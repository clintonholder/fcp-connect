import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { MapPin } from "lucide-react";

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
        <h1 className="text-2xl font-bold sm:text-3xl flex items-center gap-2">
          <MapPin className="h-6 w-6 text-accent-foreground" />Photo Map
        </h1>
        <p className="text-sm text-muted-foreground">{data?.length ?? 0} geotagged photos</p>
      </div>
      <div className="overflow-hidden rounded-xl border shadow-[var(--shadow-card)]" style={{ height: "70vh" }}>
        {mounted && <MapInner photos={data ?? []} />}
      </div>
    </div>
  );
}

function MapInner({ photos }: { photos: Array<{ id: string; image_url: string; latitude: number | null; longitude: number | null; jobs: { name: string } | null; areas: { name: string } | null; taken_at: string }> }) {
  // dynamic-ish import-safe; leaflet only renders client-side via mounted gate
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RL = require("react-leaflet");
  const L = require("leaflet");
  // Fix default icon
  delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  });

  const center: [number, number] = photos.length
    ? [photos[0].latitude!, photos[0].longitude!]
    : [39.8283, -98.5795];

  return (
    <RL.MapContainer center={center} zoom={photos.length ? 13 : 4} style={{ height: "100%", width: "100%" }}>
      <RL.TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {photos.map((p) => (
        <RL.Marker key={p.id} position={[p.latitude!, p.longitude!]}>
          <RL.Popup>
            <div className="space-y-1" style={{ minWidth: 160 }}>
              <img src={p.image_url} alt="" style={{ width: "100%", borderRadius: 4 }} />
              <div style={{ fontWeight: 600 }}>{p.jobs?.name}</div>
              <div style={{ fontSize: 12, color: "#666" }}>{p.areas?.name}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{new Date(p.taken_at).toLocaleString()}</div>
            </div>
          </RL.Popup>
        </RL.Marker>
      ))}
    </RL.MapContainer>
  );
}
