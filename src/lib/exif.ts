/** Reads capture date/time and GPS from a photo file's own metadata (EXIF). */
export type PhotoExif = {
  takenAt: string | null;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY: PhotoExif = { takenAt: null, latitude: null, longitude: null };

function validDate(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3"));
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 1990 || d.getTime() > Date.now() + 24 * 3600 * 1000) return null;
  return d.toISOString();
}

function validCoord(v: unknown, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v === 0) return null;
  if (Math.abs(v) > max) return null;
  return v;
}

export async function readPhotoExif(file: File): Promise<PhotoExif> {
  if (typeof window === "undefined") return EMPTY;
  try {
    const exifr = (await import("exifr")).default;
    const data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate", "latitude", "longitude", "GPSLatitude", "GPSLongitude"],
    });
    if (!data) return EMPTY;
    return {
      takenAt: validDate(data.DateTimeOriginal) ?? validDate(data.CreateDate) ?? null,
      latitude: validCoord(data.latitude, 90),
      longitude: validCoord(data.longitude, 180),
    };
  } catch {
    return EMPTY;
  }
}
