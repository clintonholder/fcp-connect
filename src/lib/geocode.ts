/**
 * Turns a street address into coordinates using OpenStreetMap Nominatim.
 * No API key required. Results are stored on the project so we only look up once.
 */
export async function geocodeAddress(
  address: string,
): Promise<{ lat: number; lon: number } | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!json.length) return null;
    const lat = Number(json[0].lat);
    const lon = Number(json[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}
