import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
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
  area_name?: string | null;
  tags?: string[] | null;
};

export default function ProjectPhotoMap({ photos }: { photos: MapPhoto[] }) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const geo = photos.filter((p) => p.latitude != null && p.longitude != null);
  const center: [number, number] = geo.length
    ? [geo[0].latitude as number, geo[0].longitude as number]
    : [39.8283, -98.5795];

  return (
    <MapContainer center={center} zoom={geo.length ? 16 : 4} style={{ height: "100%", width: "100%" }}>
      <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {geo.map((p) => (
        <Marker key={p.id} position={[p.latitude as number, p.longitude as number]}>
          <Popup>
            <div style={{ minWidth: 170 }}>
              <img src={p.annotated_image_url ?? p.image_url} alt={p.caption ?? ""} style={{ width: "100%", borderRadius: 4, marginBottom: 4 }} />
              {p.caption && <div style={{ fontWeight: 600 }}>{p.caption}</div>}
              {p.area_name && <div style={{ fontSize: 12, color: "#555" }}>{p.area_name}</div>}
              <div style={{ fontSize: 11, color: "#777" }}>{new Date(p.taken_at).toLocaleString()}</div>
              {p.uploader && <div style={{ fontSize: 11, color: "#777" }}>By {p.uploader}</div>}
              <a href={p.annotated_image_url ?? p.image_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#00338D" }}>
                View full photo
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
