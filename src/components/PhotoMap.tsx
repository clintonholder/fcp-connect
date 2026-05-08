import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";

type Photo = {
  id: string; image_url: string; latitude: number | null; longitude: number | null;
  jobs: { name: string } | null; areas: { name: string } | null; taken_at: string;
};

export default function PhotoMap({ photos }: { photos: Photo[] }) {
  useEffect(() => {
    delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);

  const center: [number, number] = photos.length && photos[0].latitude && photos[0].longitude
    ? [photos[0].latitude, photos[0].longitude]
    : [39.8283, -98.5795];

  return (
    <MapContainer center={center} zoom={photos.length ? 13 : 4} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {photos.map((p) =>
        p.latitude && p.longitude ? (
          <Marker key={p.id} position={[p.latitude, p.longitude]}>
            <Popup>
              <div style={{ minWidth: 160 }}>
                <img src={p.image_url} alt="" style={{ width: "100%", borderRadius: 4, marginBottom: 4 }} />
                <div style={{ fontWeight: 600 }}>{p.jobs?.name}</div>
                <div style={{ fontSize: 12, color: "#666" }}>{p.areas?.name}</div>
                <div style={{ fontSize: 11, color: "#888" }}>{new Date(p.taken_at).toLocaleString()}</div>
              </div>
            </Popup>
          </Marker>
        ) : null
      )}
    </MapContainer>
  );
}
