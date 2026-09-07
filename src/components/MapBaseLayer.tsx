import { useEffect, useState } from "react";
import { TileLayer } from "react-leaflet";

export type BaseLayer = "map" | "satellite";

export function useBaseLayer(storageKey: string) {
  const [layer, setLayer] = useState<BaseLayer>("map");
  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "satellite" || saved === "map") setLayer(saved);
  }, [storageKey]);
  const choose = (v: BaseLayer) => {
    setLayer(v);
    try { window.localStorage.setItem(storageKey, v); } catch { /* ignore */ }
  };
  return { layer, choose };
}

export function BaseLayerToggle({
  layer, onChange,
}: {
  layer: BaseLayer;
  onChange: (v: BaseLayer) => void;
}) {
  const base =
    "px-3 py-1.5 text-xs font-medium transition min-w-[64px] sm:min-w-[72px]";
  return (
    <div
      className="absolute right-2 top-2 z-[600] flex overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-card)]"
      role="group"
      aria-label="Map layer"
    >
      <button
        type="button"
        aria-pressed={layer === "map"}
        onClick={() => onChange("map")}
        className={`${base} ${layer === "map" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
      >
        Map
      </button>
      <button
        type="button"
        aria-pressed={layer === "satellite"}
        onClick={() => onChange("satellite")}
        className={`${base} border-l ${layer === "satellite" ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"}`}
      >
        Satellite
      </button>
    </div>
  );
}

export function BaseTileLayer({
  layer, onError, onLoad,
}: {
  layer: BaseLayer;
  onError?: () => void;
  onLoad?: () => void;
}) {
  const handlers = {
    tileerror: () => onError?.(),
    tileload: () => onLoad?.(),
  };

  if (layer === "satellite") {
    return (
      <TileLayer
        key="satellite"
        attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics"
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
        eventHandlers={handlers}
      />
    );
  }

  return (
    <TileLayer
      key="map"
      attribution="&copy; OpenStreetMap contributors"
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      maxZoom={19}
      eventHandlers={handlers}
    />
  );
}
