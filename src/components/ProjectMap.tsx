import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import { BaseLayerToggle, BaseTileLayer, useBaseLayer } from "./MapBaseLayer";
import L from "leaflet";

export type MapProject = {
  id: string;
  name: string;
  address: string | null;
  owner: string | null;
  customer: string | null;
  status: string;
  phase: string | null;
  division: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function ProjectMap({
  projects,
  onOpen,
}: {
  projects: MapProject[];
  onOpen: (id: string) => void;
}) {
  const [tileError, setTileError] = useState(false);
  const { layer, choose } = useBaseLayer("fcp.projectsMap.layer");

  useEffect(() => {
    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const pinned = projects.filter((p) => p.latitude != null && p.longitude != null);
  const center: [number, number] = pinned.length
    ? [pinned[0].latitude as number, pinned[0].longitude as number]
    : [39.8283, -98.5795];

  return (
    <div className="relative h-full w-full">
      {tileError && (
        <div className="absolute inset-x-0 top-0 z-[500] bg-destructive px-3 py-2 text-center text-xs text-destructive-foreground">
          {layer === "satellite"
            ? "Satellite imagery could not be loaded. Switch back to Map to keep working."
            : "Map images could not be loaded. Check your internet connection and try again."}
        </div>
      )}
      <BaseLayerToggle layer={layer} onChange={(v) => { setTileError(false); choose(v); }} />
      <MapContainer center={center} zoom={pinned.length ? 10 : 4} style={{ height: "100%", width: "100%" }}>
      <BaseTileLayer layer={layer} onError={() => setTileError(true)} onLoad={() => setTileError(false)} />
      {pinned.map((p) => (
        <Marker key={p.id} position={[p.latitude as number, p.longitude as number]}>
          <Popup>
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              {p.customer && <div style={{ fontSize: 12, color: "#555" }}>{p.customer}</div>}
              {p.owner && <div style={{ fontSize: 12, color: "#555" }}>{p.owner}</div>}
              {p.address && <div style={{ fontSize: 11, color: "#777" }}>{p.address}</div>}
              <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
                {[p.status, p.phase, p.division].filter(Boolean).join(" · ")}
              </div>
              <button
                onClick={() => onOpen(p.id)}
                style={{ marginTop: 6, background: "#00338D", color: "#fff", border: 0, borderRadius: 4, padding: "4px 8px", cursor: "pointer" }}
              >
                Open project
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
      </MapContainer>
    </div>
  );
}
