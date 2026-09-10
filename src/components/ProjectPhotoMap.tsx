import { useEffect, useState } from "react";
import { MapContainer, Marker, Popup, useMap } from "react-leaflet";
import { BaseLayerToggle, BaseTileLayer, useBaseLayer } from "./MapBaseLayer";
import L from "leaflet";

export type MapPhoto = {
  id: string;
  image_url: string;
  annotated_image_url?: string | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  taken_at: string;
  uploader?: string | null;
  phase?: string | null;
  tags?: string[] | null;
  media_type?: string | null;
  mime_type?: string | null;
};

function isValid(p: MapPhoto) {
  return (
    typeof p.latitude === "number" && typeof p.longitude === "number" &&
    Number.isFinite(p.latitude) && Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 &&
    !(p.latitude === 0 && p.longitude === 0)
  );
}

function FitToPhotos({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 17);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 18 });
    }
    setTimeout(() => map.invalidateSize(), 150);
  }, [map, JSON.stringify(points)]);
  return null;
}

export default function ProjectPhotoMap({ photos }: { photos: MapPhoto[] }) {
  const [tileError, setTileError] = useState(false);
  const { layer, choose } = useBaseLayer("fcp.photoMap.layer");

  useEffect(() => {
    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const geo = photos.filter(isValid);
  const points = geo.map((p) => [p.latitude as number, p.longitude as number] as [number, number]);
  const center: [number, number] = points[0] ?? [39.8283, -98.5795];

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
      <MapContainer center={center} zoom={points.length ? 16 : 4} style={{ height: "100%", width: "100%" }}>
        <BaseTileLayer
          layer={layer}
          onError={() => setTileError(true)}
          onLoad={() => setTileError(false)}
        />
        <FitToPhotos points={points} />
        {geo.map((p) => (
          <Marker key={p.id} position={[p.latitude as number, p.longitude as number]}>
            <Popup>
              <div style={{ minWidth: 170 }}>
                <img src={p.annotated_image_url ?? p.image_url} alt={p.caption ?? ""} style={{ width: "100%", borderRadius: 4, marginBottom: 4 }} />
                {p.caption && <div style={{ fontWeight: 600 }}>{p.caption}</div>}
                {p.phase && <div style={{ fontSize: 12, color: "#555" }}>{p.phase}</div>}
                <div style={{ fontSize: 11, color: "#777" }}>{new Date(p.taken_at).toLocaleString()}</div>
                {p.uploader && <div style={{ fontSize: 11, color: "#777" }}>By {p.uploader}</div>}
                <div style={{ fontSize: 11, color: "#777" }}>
                  {(p.latitude as number).toFixed(5)}, {(p.longitude as number).toFixed(5)}
                </div>
                <a href={p.annotated_image_url ?? p.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#00338D" }}>
                  View full photo
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
